// Client des Demandes de Valeurs Foncières (DVF) — le fichier des ventes
// immobilières publié par la DGFiP et géocodé par Etalab.
// https://files.data.gouv.fr/geo-dvf/ (licence ouverte)
//
// Le millésime « latest » est distribué en CSV : un fichier par commune, un
// par département. On prend systématiquement le département, gzippé : celui
// de la Meuse pèse 380 ko pour une année entière là où le seul CSV de Nancy
// en fait 1,1 Mo. Un seul téléchargement couvre alors n'importe quel rayon de
// recherche — élargir la zone ne coûte plus une requête de plus.
//
// UNE ABSENCE DE DONNÉES N'EST PAS UNE PANNE, et tout ce module tient sur
// cette distinction. Deux situations que l'appelant doit pouvoir séparer :
//
//   • le millésime n'est pas publié, ou le département n'est pas couvert
//     (Alsace-Moselle, Mayotte) : HTTP 404. C'est une réponse. Elle se met en
//     cache, elle rend un tableau vide, et l'estimation continue.
//
//   • le réseau flanche, le serveur rend une 5xx, la décompression échoue :
//     c'est une panne. Elle est réessayée, puis **levée** — jamais rendue
//     sous la forme d'un tableau vide, et jamais mise en cache.
//
// Cette frontière n'existait pas. Toute panne rendait `[]`, indiscernable d'un
// département sans ventes, et le moteur enchaînait silencieusement sur sa
// médiane départementale : c'est ce qui faisait tomber l'estimation d'une
// maison marseillaise de 489 000 € (médiane du quartier) à 403 000 €
// (médiane des Bouches-du-Rhône) sans qu'aucune trace ne le signale.
//
// Ce module porte **toute la récupération des ventes**, et elle seule : le
// fichier, le cache, les réessais, la tolérance d'un millésime manquant et le
// débordement sur les départements voisins. Le calcul, lui, vit entièrement
// dans `moteur.js`, qui ne connaît ni le réseau ni l'horloge — c'est ce qui
// permet au banc de test (`scripts/backtest.mjs`) de faire tourner le moteur de
// production sur des ventes lues depuis le disque.

import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'
import { departementsAround } from './geo.js'
import { CHARGEMENT, FENETRE_ANNEES, QUALITE } from './estimationConfig.js'

const gunzipAsync = promisify(gunzip)

const BASE_URL = 'https://files.data.gouv.fr/geo-dvf/latest/csv'

/**
 * Panne technique d'une source DVF, après épuisement des réessais.
 *
 * Porte de quoi la journaliser utilement : le millésime concerné et le nombre
 * de tentatives consommées. L'appelant décide ce qu'il en fait — le
 * département du bien est essentiel et fait échouer l'estimation, un
 * département voisin sondé par débordement ne l'est pas.
 */
export class DvfIndisponible extends Error {
  constructor(key, tentatives, cause) {
    super(`DVF ${key} indisponible après ${tentatives} tentative(s) — ${cause?.message ?? cause}`)
    this.name = 'DvfIndisponible'
    this.key = key
    this.tentatives = tentatives
    this.cause = cause
  }
}

/**
 * Colonnes exploitées, repérées par leur nom dans l'en-tête plutôt que par
 * leur position : le schéma DVF a déjà gagné des colonnes d'un millésime à
 * l'autre, un index en dur finirait par désigner la mauvaise.
 */
const COLUMNS = [
  'id_mutation',
  'date_mutation',
  'nature_mutation',
  'valeur_fonciere',
  'adresse_numero',
  'adresse_suffixe',
  'adresse_nom_voie',
  'code_postal',
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

/**
 * Ventes d'un département sur une année, déjà réduites et filtrées, avec
 * l'information qui dit si le millésime **existe** (`publie`).
 * Conservées en mémoire : sur Vercel, l'instance est réutilisée d'un appel à
 * l'autre, et deux estimations dans le même secteur ne retéléchargent rien.
 *
 * `publie` est mémorisé au même titre que les ventes : c'est lui qui permet à
 * l'appelant de distinguer « ce millésime n'est pas encore paru » de « ce
 * millésime est paru mais je n'ai pas pu le lire », et donc de savoir si le
 * millésime tombé en panne était le plus récent publié (voir
 * `CHARGEMENT.echecsToleres`). Sans cette distinction, la tolérance d'un
 * millésime manquant ne serait pas décidable.
 *
 * **Seuls des résultats obtenus y entrent.** Un échec technique n'est jamais
 * mémorisé : la tentative suivante doit repartir sur le réseau, sans quoi une
 * panne de quelques secondes empoisonnerait le cache pour six heures.
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

/**
 * Semestre d'une mutation, sous forme d'entier ordonnable : `année × 2` pour
 * un premier semestre, `+ 1` pour un second. Sert de clé à l'indice de prix
 * (voir `indice.js`) ; un entier plutôt qu'une chaîne parce qu'il faut
 * pouvoir compter les semestres d'écart entre deux ventes.
 */
export function semestreDe(date) {
  if (typeof date !== 'string' || date.length < 7) return null
  const annee = Number(date.slice(0, 4))
  const mois = Number(date.slice(5, 7))
  if (!Number.isFinite(annee) || !Number.isFinite(mois)) return null
  return annee * 2 + (mois > 6 ? 1 : 0)
}

/** Libellé lisible d'un semestre — pour le journal, jamais pour le calcul. */
export const semestreLabel = (semestre) =>
  semestre == null ? null : `${Math.floor(semestre / 2)}S${(semestre % 2) + 1}`

function withinLimits(kind, surface, pricePerM2) {
  const surfaces = QUALITE.bornesSurface[kind]
  const prix = QUALITE.bornesPrixM2[kind]
  if (!surfaces || !prix) return false

  return (
    surface >= surfaces[0] &&
    surface <= surfaces[1] &&
    pricePerM2 >= prix[0] &&
    pricePerM2 <= prix[1]
  )
}

/**
 * Surface de terrain d'une mutation, en m², ou `null` si DVF ne la renseigne
 * pas.
 *
 * Une même parcelle peut revenir sur plusieurs lignes : sommer sans
 * dédoublonner gonflerait la surface. Un total nul est rendu `null` et non
 * `0` — dans DVF, une `surface_terrain` vide ne veut pas dire « pas de
 * terrain » mais « non renseigné », et la nuance change tout pour le filtre de
 * similarité comme pour la régression de terrain : 10 des 40 comparables du
 * cas marseillais étaient dans ce cas.
 */
function surfaceTerrainDe(rows) {
  const seen = new Set()
  let total = 0

  for (const row of rows) {
    if (seen.has(row.id_parcelle)) continue
    seen.add(row.id_parcelle)
    total += readNumber(row.surface_terrain) ?? 0
  }

  return total > 0 ? total : null
}

/** Adresse lisible d'une mutation — pour l'explicabilité du calcul, jamais pour le calcul. */
function adresseDe(rows) {
  const row = rows.find((r) => r.adresse_nom_voie) ?? rows[0]
  return [row.adresse_numero, row.adresse_suffixe, row.adresse_nom_voie, row.code_postal]
    .filter(Boolean)
    .join(' ')
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
 *
 * **Le prix est lu une seule fois** (`rows[0].valeur_fonciere`) et la surface
 * n'est jamais une somme de lignes : il n'y a donc ni double comptage du prix,
 * ni surface gonflée. Reste une asymétrie assumée, dont `terrain.js` tire
 * précisément parti : le numérateur porte le prix de *toute* la mutation —
 * maison, dépendance et terrain compris — quand le dénominateur ne porte que
 * la surface de plancher du logement. Le €/m² produit est donc un prix du m²
 * bâti terrain compris, et c'est pour cela qu'il ne faut jamais y rajouter la
 * valeur du terrain du bien estimé.
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
    surface = surfaceTerrainDe(rows)
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

  const semestre = semestreDe(first.date_mutation)
  if (semestre === null) return null

  // Parcelle porteuse du logement — celle du lot d'habitation, à défaut la
  // première ligne (cas d'un terrain nu). Le moteur ne s'en sert pas : elle est
  // là pour le banc de test, qui y rattache la contenance cadastrale.
  const porteuse = dwellings[0] ?? first

  return {
    id: first.id_mutation,
    idParcelle: porteuse.id_parcelle,
    kind,
    lat,
    lon,
    price,
    surface,
    // Pour un terrain nu, la contenance *est* la surface : la répéter ici
    // évite à l'appelant d'avoir à connaître cette exception.
    surfaceTerrain: kind === 'terrain' ? surface : surfaceTerrainDe(rows),
    pricePerM2,
    date: first.date_mutation,
    semestre,
    commune: first.code_commune,
    adresse: adresseDe(rows),
    dependance: rows.some((row) => row.type_local === 'Dépendance'),
  }
}

/**
 * Parse un CSV DVF départemental et le réduit à la liste des ventes
 * comparables exploitables.
 *
 * Exporté pour le banc de test, qui lit les mêmes fichiers depuis un cache
 * disque : les filtres de qualité et la réduction des mutations doivent être
 * rigoureusement les mêmes qu'en production, sans quoi le banc mesurerait un
 * autre moteur que celui qui tourne.
 *
 * Les lignes d'une même mutation se suivent toujours dans le fichier ; on les
 * accumule au fil de la lecture et on referme le groupe au changement
 * d'identifiant, plutôt que de bâtir une table de toutes les mutations du
 * département — sur un gros département, cela ferait plusieurs centaines de
 * milliers d'objets vivants en même temps.
 */
export function parseDvfCsv(text) {
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
  return entry
}

function cacheSet(key, sales, publie) {
  cache.set(key, { at: Date.now(), sales, publie })
  while (cache.size > CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value)
  }
}

const attendre = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (ms <= 0) return resolve()
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason ?? new Error('Attente interrompue'))
    }, { once: true })
  })

/**
 * Panne simulée, pour voir à l'écran ce que voit l'utilisateur quand la source
 * lâche — l'écran d'indisponibilité ne se déclenche autrement qu'en coupant
 * réellement data.gouv.fr.
 *
 *   MODE=panne              npm run dev   → tous les millésimes échouent (503)
 *   MODE=panne:2022         npm run dev   → seul 2022 échoue (toléré, 200)
 *   MODE=panne:2021,2022    npm run dev   → deux millésimes échouent (503)
 *
 * **Inerte en production** : la variable n'est lue qu'une fois, au chargement
 * du module, et le commutateur exige `NODE_ENV !== 'production'`. Sur Vercel,
 * `NODE_ENV` vaut toujours `production` à l'exécution d'une fonction — un
 * `MODE` égaré dans les variables d'environnement du projet ne pourrait donc
 * pas couper le moteur.
 */
const PANNE = (() => {
  const mode = process.env.MODE ?? ''
  if (process.env.NODE_ENV === 'production' || !mode.startsWith('panne')) return null

  const liste = mode.slice('panne'.length).replace(/^:/, '').split(',').filter(Boolean)
  console.warn(
    `[dvf] PANNE SIMULÉE (MODE=${mode}) — ${liste.length ? `millésime(s) ${liste.join(', ')}` : 'tous les millésimes'} en échec. Développement uniquement.`,
  )
  return { millesimes: liste.length > 0 ? new Set(liste) : null }
})()

/** Ce millésime doit-il échouer ? Toujours `false` hors développement. */
const panneSimulee = (key) =>
  PANNE !== null && (PANNE.millesimes === null || PANNE.millesimes.has(key.split(':')[1]))

/**
 * Un essai de téléchargement. Rend `{ publie: false }` sur 404 — une réponse,
 * pas une panne — et lève sur tout le reste.
 */
async function essaie(url, timeoutMs, signal) {
  const timeout = AbortSignal.timeout(timeoutMs)
  const composed = signal ? AbortSignal.any([signal, timeout]) : timeout

  const response = await fetch(url, { signal: composed })

  if (response.status === 404) return { publie: false, sales: [] }
  if (!response.ok) throw new Error(`réponse HTTP ${response.status}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  const csv = (await gunzipAsync(buffer)).toString('utf8')

  return { publie: true, sales: parseDvfCsv(csv), octets: buffer.length }
}

/**
 * Ventes d'un département pour une année donnée, et publication du millésime.
 *
 * Rend `{ sales: [], publie: false }` quand l'année n'est pas publiée ou que le
 * département n'est pas couvert par DVF (Alsace-Moselle, Mayotte — voir
 * `reference.js`). `publie` est ce qui permet à l'appelant de savoir jusqu'où
 * va réellement l'historique disponible, donc si un millésime tombé en panne
 * était ou non le plus récent — sans quoi la tolérance d'un millésime manquant
 * ne pourrait pas se décider (voir `chargeDepartement`, plus bas).
 *
 * **Lève `DvfIndisponible`** quand la source est en panne, après épuisement
 * des réessais de `CHARGEMENT`. C'est à l'appelant de trancher : le
 * département du bien est essentiel, un département voisin ne l'est pas.
 *
 * `journal`, s'il est fourni, reçoit une ligne par fichier : de quoi mesurer à
 * l'usage la fréquence réelle des pannes, qui n'était jusqu'ici visible nulle
 * part.
 */
export async function loadDepartementYear(departement, year, { signal, journal } = {}) {
  const key = `${departement}:${year}`
  const cached = cacheGet(key)
  if (cached) {
    journal?.push({
      fichier: key,
      issue: 'cache',
      tentatives: 0,
      ms: 0,
      ventes: cached.sales.length,
    })
    return { sales: cached.sales, publie: cached.publie }
  }

  const url = `${BASE_URL}/${year}/departements/${departement}.csv.gz`
  const debut = Date.now()
  let derniere = null
  // Comptées et non déduites : le budget global peut interrompre la boucle
  // avant son terme, et le journal doit dire ce qui a réellement été tenté —
  // c'est toute la valeur de cette mesure.
  let consommees = 0

  for (let tentative = 1; tentative <= CHARGEMENT.tentatives; tentative += 1) {
    // Le signal de l'appelant porte le budget global de l'étape : une fois
    // épuisé, il n'y a plus rien à réessayer, et s'entêter mangerait le temps
    // qui reste aux étapes suivantes.
    if (signal?.aborted) break

    try {
      await attendre(CHARGEMENT.delaisMs[tentative - 1] ?? 0, signal)
      consommees = tentative

      const timeoutMs =
        CHARGEMENT.timeoutsMs[tentative - 1] ??
        CHARGEMENT.timeoutsMs[CHARGEMENT.timeoutsMs.length - 1]

      // Développement seulement — voir `PANNE`. Placée dans la boucle pour que
      // les réessais se déroulent comme sur une vraie panne.
      if (panneSimulee(key)) throw new Error('panne simulée (MODE=panne)')

      const { publie, sales, octets } = await essaie(url, timeoutMs, signal)

      // Un 404 se met en cache : ni le millésime manquant ni le département
      // hors couverture ne réapparaîtront dans les six heures qui viennent.
      cacheSet(key, sales, publie)
      journal?.push({
        fichier: key,
        issue: publie ? 'ok' : 'non-publie',
        tentatives: tentative,
        ms: Date.now() - debut,
        ventes: sales.length,
        ...(octets ? { octets } : {}),
      })
      return { sales, publie }
    } catch (error) {
      derniere = error
      if (signal?.aborted) break
    }
  }

  journal?.push({
    fichier: key,
    issue: 'echec',
    tentatives: consommees,
    ms: Date.now() - debut,
    // Distinguer une source en panne d'un budget épuisé : la première demande
    // de regarder data.gouv, la seconde de regarder le réglage.
    motif: signal?.aborted ? 'budget épuisé' : (derniere?.message ?? String(derniere)),
  })

  // Surtout, aucun `cacheSet` ici : une panne passagère ne doit pas se figer
  // en « ce département n'a pas de ventes » pour les six prochaines heures.
  throw new DvfIndisponible(key, consommees, derniere)
}

/**
 * Une année de plus que demandé est toujours réclamée : le millésime de
 * l'année en cours n'est publié qu'avec plusieurs mois de retard, et la
 * requête qui revient vide ne doit pas amputer la profondeur d'historique.
 */
const YEAR_SLACK = 1

/** Exécute des tâches par lots, sans jamais en lancer plus de `CHARGEMENT.concurrence`. */
async function inBatches(items, run) {
  const resultats = []
  for (let i = 0; i < items.length; i += CHARGEMENT.concurrence) {
    resultats.push(...(await Promise.all(items.slice(i, i + CHARGEMENT.concurrence).map(run))))
  }
  return resultats
}

/**
 * Charge tous les millésimes utiles d'un département.
 *
 * TOLÈRE L'ÉCHEC D'UN SEUL MILLÉSIME, et seulement s'il est plus ancien qu'un
 * millésime effectivement chargé et publié. Perdre 2022 sur six fichiers retire
 * quelques ventes d'un échantillon qui en compte cinq à huit, et l'indice
 * temporel ramène de toute façon tout au dernier semestre ; perdre le millésime
 * le plus récent, c'est estimer sur un marché dépassé sans pouvoir le savoir.
 *
 * D'où le rôle de `publie`, que `loadDepartementYear` rend maintenant : une
 * année absente (404 — l'année en cours l'est presque toujours) n'est pas un
 * échec, mais elle ne prouve pas non plus qu'un millésime plus récent existe.
 * La tolérance exige donc un millésime **strictement plus récent, publié et
 * lu**. Sans lui — parce que c'est justement le plus récent qui a lâché — il n'y
 * a aucun moyen de savoir ce qu'on manque, et l'estimation s'arrête.
 *
 * Lève `DvfIndisponible` (celui du millésime le plus récent tombé) dès que la
 * tolérance est dépassée. Rend les ventes et la liste des millésimes tolérés,
 * qui remonte jusque dans `meta.chargement`.
 */
export async function chargeDepartement(dep, { signal, journal } = {}) {
  const issues = await inBatches(candidateYears(FENETRE_ANNEES + YEAR_SLACK), async (annee) => {
    try {
      const { sales, publie } = await loadDepartementYear(dep, annee, { signal, journal })
      return { annee, sales, publie, echec: null }
    } catch (error) {
      if (error instanceof DvfIndisponible) return { annee, sales: [], publie: false, echec: error }
      throw error
    }
  })

  const echecs = issues.filter((i) => i.echec).sort((a, b) => b.annee - a.annee)

  if (echecs.length > 0) {
    const dernierPublie = issues
      .filter((i) => i.publie)
      .reduce((max, i) => Math.max(max, i.annee), -Infinity)

    const tolerable =
      echecs.length <= CHARGEMENT.echecsToleres && echecs.every((i) => i.annee < dernierPublie)

    if (!tolerable) throw echecs[0].echec
  }

  return {
    ventes: issues.flatMap((i) => i.sales),
    millesimesEnEchec: echecs.map((i) => i.echec.key),
  }
}

/**
 * Ventes des départements traversés par un disque de rayon donné, hors ceux
 * déjà chargés.
 *
 * Leur indisponibilité n'est **jamais** bloquante, contrairement à celle du
 * département du bien : ils ne sont qu'un complément, et une estimation sans
 * eux reste une estimation. D'où le `try` qui avale `DvfIndisponible` et se
 * contente de le signaler.
 *
 * Sonder coûte seize requêtes de découpage administratif, et chaque
 * département retenu jusqu'à six téléchargements : c'est pour cela que l'appel
 * n'a lieu que lorsque le moteur a dit en avoir besoin (`rayonsASonderM`), et
 * jamais d'emblée.
 */
export async function chargeVoisins(lat, lon, rayonM, { exclure = [], signal, journal } = {}) {
  const voisins = (await departementsAround(lat, lon, rayonM, { signal }).catch(() => [])).filter(
    (dep) => !exclure.includes(dep),
  )

  if (voisins.length === 0) return { departements: [], ventes: [], echecs: [] }

  const departements = []
  const echecs = []

  const lots = await inBatches(voisins, async (dep) => {
    try {
      const voisin = await chargeDepartement(dep, { signal, journal })
      departements.push(dep)
      echecs.push(...voisin.millesimesEnEchec)
      return voisin.ventes
    } catch (error) {
      if (error instanceof DvfIndisponible) {
        echecs.push(error.key)
        return []
      }
      throw error
    }
  })

  return { departements, ventes: lots.flat(), echecs }
}
