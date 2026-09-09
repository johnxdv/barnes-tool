// Client des Demandes de Valeurs Foncières (DVF) — le fichier des ventes
// immobilières publié par la DGFiP et géocodé par Etalab.
// https://files.data.gouv.fr/geo-dvf/ (licence ouverte)
//
// Le millésime « latest » est distribué en CSV : un fichier par commune, un
// par département. On prend systématiquement le département, gzippé : celui
// de la Meuse pèse 380 ko pour une année entière là où le seul CSV de Nancy
// en fait 1,1 Mo. Un seul téléchargement couvre alors n'importe quel rayon de
// recherche — élargir la zone ne coûte plus une requête de plus, ce qui est
// exactement ce dont l'élargissement automatique a besoin pour tenir dans son
// budget de temps.

import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'

const gunzipAsync = promisify(gunzip)

const BASE_URL = 'https://files.data.gouv.fr/geo-dvf/latest/csv'

/**
 * Au-delà, le téléchargement d'une année coûterait plus qu'il ne rapporte : les
 * autres millésimes portent déjà l'estimation, et le budget de l'analyse est
 * mieux employé ailleurs. Le millésime abandonné n'est pas mis en cache — la
 * prochaine estimation dans le secteur retentera sa chance.
 */
const FETCH_TIMEOUT_MS = 4000

/**
 * Colonnes exploitées, repérées par leur nom dans l'en-tête plutôt que par
 * leur position : le schéma DVF a déjà gagné des colonnes d'un millésime à
 * l'autre, un index en dur finirait par désigner la mauvaise.
 */
const COLUMNS = [
  'id_mutation',
  'nature_mutation',
  'valeur_fonciere',
  'code_commune',
  'id_parcelle',
  'type_local',
  'surface_reelle_bati',
  'surface_terrain',
  'code_nature_culture',
  'longitude',
  'latitude',
]

/** Seule nature de mutation retenue : une adjudication ou un échange ne fait pas un prix de marché. */
const SALE = 'Vente'

/** Types de locaux d'habitation, tels qu'orthographiés par la DGFiP. */
const DWELLING = { Maison: 'maison', Appartement: 'appartement' }

/**
 * Natures de culture retenues pour un terrain : `S` (sols) et `AB` (terrains à
 * bâtir). Le filtre n'a rien d'accessoire — dans la Meuse, les terres
 * agricoles se vendent autour d'1 €/m² contre 15 €/m² pour du sol
 * constructible. Les mélanger diviserait l'estimation d'un terrain par dix.
 */
const BUILDABLE_CULTURES = new Set(['S', 'AB'])

/** Garde-fous : au-delà, la ligne relève de l'erreur de saisie plus que du marché. */
const LIMITS = {
  maison: { surface: [15, 1000], pricePerM2: [200, 30000] },
  appartement: { surface: [8, 500], pricePerM2: [200, 40000] },
  terrain: { surface: [50, 20000], pricePerM2: [2, 3000] },
}

/**
 * Ventes d'un département sur une année, déjà réduites et filtrées.
 * Conservées en mémoire : sur Vercel, l'instance est réutilisée d'un appel à
 * l'autre, et deux estimations dans le même secteur ne retéléchargent rien.
 */
const cache = new Map()

/** Durée de validité d'une entrée : le millésime DVF ne bouge qu'une fois par semestre. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** Plafond du cache, en nombre d'entrées (≈ quelques Mo) — la plus ancienne saute. */
const CACHE_MAX_ENTRIES = 24

/**
 * Années candidates, de la plus récente à la plus ancienne.
 *
 * L'année en cours n'est publiée qu'avec plusieurs mois de retard : on la
 * demande quand même, une année absente revenant simplement en 404 — plutôt
 * que de figer ici une liste qu'il faudrait penser à mettre à jour.
 */
export function candidateYears(count) {
  const current = new Date().getUTCFullYear()
  return Array.from({ length: count }, (_, i) => current - i)
}

/** Découpe une ligne CSV DVF. Le fichier ne contient aucun champ échappé — vérifié sur plusieurs départements. */
const splitLine = (line) => line.split(',')

function readNumber(value) {
  if (!value) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function withinLimits(kind, surface, pricePerM2) {
  const limits = LIMITS[kind]
  if (!limits) return false

  const [minSurface, maxSurface] = limits.surface
  const [minPrice, maxPrice] = limits.pricePerM2

  return (
    surface >= minSurface &&
    surface <= maxSurface &&
    pricePerM2 >= minPrice &&
    pricePerM2 <= maxPrice
  )
}

/**
 * Réduit une mutation (plusieurs lignes CSV) à une vente comparable, ou `null`
 * si elle ne peut pas en faire une.
 *
 * DVF publie une ligne par couple (lot, parcelle) : la vente d'un appartement
 * apparaît typiquement en trois lignes — la parcelle de l'immeuble, le lot
 * d'habitation, la cave. Le prix, lui, est porté à l'identique par chacune.
 * Diviser un prix par la surface d'une seule ligne sans ce regroupement est
 * l'erreur classique sur cette base : elle donne des prix au m² fantaisistes,
 * d'un facteur dix vers le haut comme vers le bas.
 *
 * Ne sont retenues que les mutations parfaitement lisibles : un seul logement
 * vendu, aucun local professionnel dans le lot. Une vente groupée (immeuble de
 * rapport, maison + commerce) n'a pas de prix au m² interprétable.
 */
function reduceMutation(rows) {
  const first = rows[0]
  if (first.nature_mutation !== SALE) return null

  const price = readNumber(first.valeur_fonciere)
  if (!price || price <= 0) return null

  const dwellings = rows.filter((row) => DWELLING[row.type_local])
  const hasProfessional = rows.some((row) => row.type_local?.startsWith('Local '))
  if (hasProfessional) return null

  let kind = null
  let surface = null

  if (dwellings.length === 1) {
    kind = DWELLING[dwellings[0].type_local]
    surface = readNumber(dwellings[0].surface_reelle_bati)
  } else if (dwellings.length === 0) {
    // Aucun local bâti : terrain. Une dépendance vendue seule (garage, cave)
    // porterait elle aussi un `type_local`, elle est donc déjà écartée — sans
    // quoi son prix viendrait polluer les comparables de terrain.
    if (rows.some((row) => row.type_local)) return null
    if (!rows.every((row) => BUILDABLE_CULTURES.has(row.code_nature_culture))) return null

    kind = 'terrain'
    // Une même parcelle peut revenir sur plusieurs lignes : sommer sans
    // dédoublonner gonflerait la surface, donc écraserait le prix au m².
    const seen = new Set()
    surface = rows.reduce((total, row) => {
      if (seen.has(row.id_parcelle)) return total
      seen.add(row.id_parcelle)
      return total + (readNumber(row.surface_terrain) ?? 0)
    }, 0)
  } else {
    return null
  }

  if (!surface || surface <= 0) return null

  const pricePerM2 = price / surface
  if (!withinLimits(kind, surface, pricePerM2)) return null

  const located = rows.find((row) => row.longitude && row.latitude) ?? null
  const lat = readNumber(located?.latitude)
  const lon = readNumber(located?.longitude)
  if (lat === null || lon === null) return null

  return { kind, lat, lon, pricePerM2, price, surface, commune: first.code_commune }
}

/**
 * Parse un CSV DVF départemental et le réduit à la liste des ventes
 * comparables exploitables.
 *
 * Les lignes d'une même mutation se suivent toujours dans le fichier ; on les
 * accumule au fil de la lecture et on referme le groupe au changement
 * d'identifiant, plutôt que de bâtir une table de toutes les mutations du
 * département — sur un gros département, cela ferait plusieurs centaines de
 * milliers d'objets vivants en même temps.
 */
function parseDvfCsv(text) {
  const lines = text.split('\n')
  const header = splitLine(lines[0] ?? '')
  const index = Object.fromEntries(COLUMNS.map((name) => [name, header.indexOf(name)]))

  if (Object.values(index).some((position) => position < 0)) {
    throw new Error('DVF — colonnes attendues absentes de l’en-tête')
  }

  const sales = []
  let currentId = null
  let group = []

  const flush = () => {
    if (group.length === 0) return
    const sale = reduceMutation(group)
    if (sale) sales.push(sale)
    group = []
  }

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line) continue

    const fields = splitLine(line)
    if (fields.length !== header.length) continue

    const row = {}
    for (const name of COLUMNS) row[name] = fields[index[name]]

    if (row.id_mutation !== currentId) {
      flush()
      currentId = row.id_mutation
    }
    group.push(row)
  }

  flush()

  return sales
}

function cacheGet(key) {
  const entry = cache.get(key)
  if (!entry) return undefined
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key)
    return undefined
  }
  // Remise en tête : l'entrée la plus anciennement utilisée est celle qui saute.
  cache.delete(key)
  cache.set(key, entry)
  return entry.sales
}

function cacheSet(key, sales) {
  cache.set(key, { at: Date.now(), sales })
  while (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value)
  }
}

/**
 * Ventes d'un département pour une année donnée.
 *
 * Renvoie un tableau vide — jamais une erreur — quand l'année n'est pas
 * publiée, que le département n'est pas couvert (Alsace-Moselle, voir
 * `reference.js`) ou que le réseau flanche : une année manquante ne doit
 * jamais faire échouer l'estimation, les autres suffisent à la porter.
 */
export async function loadDepartementYear(departement, year, { signal } = {}) {
  const key = `${departement}:${year}`
  const cached = cacheGet(key)
  if (cached) return cached

  const url = `${BASE_URL}/${year}/departements/${departement}.csv.gz`
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout

  try {
    const response = await fetch(url, { signal: composed })
    if (!response.ok) {
      // 404 = millésime non publié ou département hors couverture DVF.
      cacheSet(key, [])
      return []
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    const csv = (await gunzipAsync(buffer)).toString('utf8')
    const sales = parseDvfCsv(csv)

    cacheSet(key, sales)
    return sales
  } catch (error) {
    if (signal?.aborted) throw error
    // Réseau, décompression, en-tête inattendu : on repart sans cette année.
    console.error(`[estimation] DVF ${key} indisponible —`, error?.message ?? error)
    return []
  }
}
