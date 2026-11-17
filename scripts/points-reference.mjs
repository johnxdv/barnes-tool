// Construit `api/_data/points-reference.js` — le pool de points de référence
// qui sert les estimations hors couverture DVF (57, 67, 68, 976).
//
//   npm run points:reference             -- reconstruit le pool
//   npm run points:reference -- --essai  -- affiche le résultat sans rien écrire
//
// ANNULE ET REMPLACE, comme l'import Modelo : le fichier produit est reconstruit
// intégralement à chaque passage, à partir des deux seules sources ci-dessous.
// Rien n'est jamais édité à la main dans `api/_data/points-reference.js`.
//
// DEUX SOURCES, TOUTES DEUX PROPRES À L'AGENCE
//
//   1. `scripts/_data/points-agence.json` — ce que l'agence sait de son marché.
//      Saisie manuelle, conservée, prioritaire.
//   2. `src/data/properties.json` — ses propres ventes. Un bien vendu porte
//      prix, surface et coordonnées : c'est une transaction réelle, dans le
//      secteur, et c'est la meilleure donnée disponible sur un territoire où le
//      Livre foncier ne publie rien.
//
// Le choix de ces deux sources plutôt que d'une source tierce est motivé dans
// `api/_lib/reference.js`, section « SUR LES SOURCES TIERCES ». À lire avant
// d'en ajouter une troisième.
//
// Seules les coordonnées des communes sont allées chercher dehors, chez
// `geo.api.gouv.fr` — service public ouvert, sans clé, sans restriction
// d'usage automatisé.

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const RACINE = path.resolve(import.meta.dirname, '..')
const SAISIE = path.join(RACINE, 'scripts', '_data', 'points-agence.json')
const VENTES = path.join(RACINE, 'src', 'data', 'properties.json')
const SORTIE = path.join(RACINE, 'api', '_data', 'points-reference.js')

const essai = process.argv.includes('--essai') || process.argv.includes('--dry-run')

/** Départements hors DVF — les seuls pour lesquels un point de référence sert à quelque chose. */
const HORS_COUVERTURE = new Set(['57', '67', '68', '976'])

const departementDe = (codeInsee) => {
  const code = String(codeInsee ?? '').trim().toUpperCase()
  if (code.length < 4) return null
  return code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2)
}

/**
 * Nombre de ventes minimum pour qu'une commune tienne son propre point.
 *
 * Une vente unique ne fait pas un prix de marché : c'est un bien particulier,
 * qui peut être la belle maison du bourg comme la ruine à retaper. Deux ne
 * valent guère mieux, mais la médiane commence à amortir l'écart — et sur un
 * territoire sans aucune donnée publique, exiger davantage reviendrait à
 * n'avoir jamais de point du tout.
 */
const VENTES_MIN = 2

/** Garde-fous, repris de ceux de DVF (`api/_lib/dvf.js`). */
const BORNES = {
  maison: { surface: [15, 1000], prixM2: [200, 30000] },
  appartement: { surface: [8, 500], prixM2: [200, 40000] },
  terrain: { surface: [50, 20000], prixM2: [2, 3000] },
}

const median = (values) => {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/** Coordonnées et nom d'une commune, depuis le référentiel public. */
async function communeInfo(codeInsee) {
  const url = `https://geo.api.gouv.fr/communes/${codeInsee}?fields=nom,centre,codeDepartement`

  try {
    const reponse = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!reponse.ok) return null
    const data = await reponse.json()
    const [lon, lat] = data?.centre?.coordinates ?? []
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    return { nom: data.nom, lat, lon }
  } catch (error) {
    console.warn(`  ! ${codeInsee} — coordonnées introuvables (${error?.message ?? error})`)
    return null
  }
}

/** Slug comparable — accents et casse écartés. */
const slug = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Nombre de prix renseignés — sert à départager deux entrées du même lieu. */
const completude = (point) =>
  ['maison', 'appartement', 'terrain'].filter((k) => Number(point.prix?.[k]) > 0).length

/**
 * Écarte les entrées qui décrivent deux fois le même endroit.
 *
 * Deux cas, tranchés par le marqueur `quartier` et non par le nom :
 *
 * 1. **Une ville et ses quartiers.** Le registre peut porter « Metz » (moyenne
 *    de la ville) à côté de « Metz — Sablon », « Metz — Borny »… sous le même
 *    code INSEE. Le quartier est plus précis : la moyenne de ville est écartée,
 *    sans quoi elle tirerait vers elle toutes les estimations du centre.
 *    **Tous les quartiers sont conservés** — ils partagent un code commune mais
 *    sont des points distincts par leurs coordonnées, c'est tout l'intérêt.
 *
 * 2. **Un doublon simple**, entre entrées non marquées : deux fois la même
 *    commune, deux sources. On garde la plus complète — celle qui renseigne le
 *    plus de types de biens — et, à égalité, la première rencontrée (la saisie
 *    de l'agence passe avant le registre, voir l'ordre dans `main`).
 *
 * Le marqueur est posé à l'import, jamais déduit. Une version antérieure
 * reconnaissait une « ville » au fait que son nom soit le début du nom d'une
 * autre entrée du même code : « Forbach - Centre » était alors avalé par
 * « Forbach - Centre-La Petite Foret », et « Forbach - Wiesberg » par
 * « Forbach - Wiesberg-Hommel ». Deux quartiers réels supprimés en silence,
 * pour une ressemblance de libellé. Un nom de quartier n'est pas une donnée
 * structurée : il ne doit rien décider.
 */
function dedoublonne(points) {
  const parCode = new Map()
  const sansCode = []

  for (const point of points) {
    if (!point.codeInsee) {
      sansCode.push(point)
      continue
    }
    const bucket = parCode.get(point.codeInsee)
    if (bucket) bucket.push(point)
    else parCode.set(point.codeInsee, [point])
  }

  const retenus = []

  for (const [code, groupe] of parCode) {
    if (groupe.length === 1) {
      retenus.push(groupe[0])
      continue
    }

    const quartiers = groupe.filter((p) => p.quartier === true)
    const villes = groupe.filter((p) => p.quartier !== true)

    // Cas 1 — des quartiers sont là : ils passent tous, la ville saute.
    if (quartiers.length > 0) {
      if (villes.length > 0) {
        console.log(
          `  ~ ${code} — ${villes.length} moyenne(s) de ville écartée(s) au profit de ` +
            `${quartiers.length} quartier(s) : ${villes.map((p) => p.nom).join(', ')}`,
        )
      }
      retenus.push(...quartiers)
      continue
    }

    // Cas 2 — doublon simple, la plus complète gagne.
    const meilleur = groupe.reduce((best, p) => (completude(p) > completude(best) ? p : best))
    const ecartes = groupe.filter((p) => p !== meilleur)
    console.log(
      `  ~ ${code} — doublon sur « ${meilleur.nom} », ${ecartes.length} entrée(s) moins ` +
        `complète(s) écartée(s)`,
    )
    retenus.push(meilleur)
  }

  return [...retenus, ...sansCode]
}

/** Fiabilité déduite de la note du registre — conservée jusque dans le pool. */
function fiabilite(note) {
  const n = slug(note)
  if (!n || n === 'non trouve') return null
  if (n.includes('une seule source')) return 'source-unique'
  if (n.includes('a verifier') || n.includes('inhabituel')) return 'a-verifier'
  if (n.includes('multi sources')) return 'multi-sources'
  return 'autre'
}

/**
 * Points saisis — saisie de l'agence et registre importé, même fichier.
 *
 * Deux formes d'entrée sont acceptées, parce que le registre importé n'a pas la
 * forme de la saisie d'origine et qu'il n'y avait aucune raison de le réécrire :
 *
 *   { codeInsee, nom,     prix: { maison, appartement, terrain }, lat?, lon? }
 *   { codeInsee, commune, maison, appartement, lat, lon, note }
 *
 * `lat`/`lon` fournies dispensent d'interroger `geo.api.gouv.fr` — ce qui, sur
 * un registre de plusieurs centaines de communes, fait la différence entre un
 * script qui tourne en une seconde et un script qui martèle un service public
 * pendant plusieurs minutes.
 */
async function pointsSaisis() {
  let saisie
  try {
    saisie = JSON.parse(await readFile(SAISIE, 'utf8'))
  } catch {
    console.warn('Aucune saisie manuelle lisible — on continue avec les seules ventes.')
    return []
  }

  const communes = Array.isArray(saisie.communes) ? saisie.communes : []
  const points = []
  let sansPrix = 0
  let horsSecteur = 0
  let sansCoordonnees = 0

  for (const entree of communes) {
    const codeInsee = String(entree.codeInsee ?? '').trim()
    if (!codeInsee) {
      console.warn('  ! entrée sans code INSEE — ignorée')
      continue
    }

    const departement = departementDe(codeInsee)
    if (!HORS_COUVERTURE.has(departement)) {
      horsSecteur += 1
      continue
    }

    // Les deux formes de prix. `Number(x) || null` ramène 0, NaN et null à null
    // — un prix au m² nul n'existe pas, c'est une donnée absente.
    const prix = {
      maison: Number(entree.prix?.maison ?? entree.maison) || null,
      appartement: Number(entree.prix?.appartement ?? entree.appartement) || null,
      terrain: Number(entree.prix?.terrain ?? entree.terrain) || null,
    }

    // Une entrée sans aucun prix ne sert à rien dans le pool : elle occuperait
    // une position sans jamais rien renseigner. Le registre en contient une part
    // notable (`note: "non_trouve"`), et c'est ici qu'elles sont écartées.
    if (!prix.maison && !prix.appartement && !prix.terrain) {
      sansPrix += 1
      continue
    }

    // Coordonnées fournies, ou résolues auprès du référentiel public.
    let lat = Number(entree.lat)
    let lon = Number(entree.lon)
    let nom = entree.nom ?? entree.commune

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const info = await communeInfo(codeInsee)
      if (!info) {
        sansCoordonnees += 1
        continue
      }
      lat = info.lat
      lon = info.lon
      nom = nom ?? info.nom
    }

    points.push({
      codeInsee,
      nom,
      lat,
      lon,
      prix,
      // Provenance réelle, jamais maquillée : le journal affiche ce champ, et
      // un prix de registre ne vaut pas un prix qu'un négociateur a posé.
      source: entree.source ?? 'registre',
      fiabilite: entree.fiabilite ?? fiabilite(entree.note),
      releve: entree.releve ?? null,
      // Marqueur posé à l'import : dit que ce point décrit un quartier et non
      // la commune entière. Plusieurs quartiers partagent alors un même code
      // INSEE, ce qui est voulu — seul le dédoublonnage a besoin de le savoir.
      ...(entree.quartier === true ? { quartier: true } : {}),
    })
  }

  console.log(
    `  ${points.length} point(s) retenu(s) de la saisie — ` +
      `${sansPrix} sans prix, ${horsSecteur} hors 57/67/68/976, ` +
      `${sansCoordonnees} sans coordonnées.`,
  )

  return points
}

/**
 * Points déduits des ventes de l'agence.
 *
 * Seuls les biens vendus comptent : un bien en vente porte un prix affiché,
 * qui est une demande, pas une transaction. Le prix au m² est pris en médiane
 * par commune et par type, comme pour DVF.
 */
async function pointsVentes() {
  let biens
  try {
    biens = JSON.parse(await readFile(VENTES, 'utf8'))
  } catch {
    console.warn('`properties.json` illisible — aucune vente exploitée.')
    return []
  }
  if (!Array.isArray(biens)) return []

  // Regroupement par commune, puis par type.
  const parCommune = new Map()

  for (const bien of biens) {
    if (bien.statut !== 'vendu') continue

    const type = bien.typeBien?.toLowerCase().includes('appartement')
      ? 'appartement'
      : bien.typeBien?.toLowerCase().includes('terrain')
        ? 'terrain'
        : 'maison'

    const prix = Number(bien.prixVente ?? bien.prix)
    const surface = Number(bien.surface)
    const lat = Number(bien.latitude)
    const lon = Number(bien.longitude)

    if (!Number.isFinite(prix) || !Number.isFinite(surface) || surface <= 0) continue
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue

    const prixM2 = prix / surface
    const bornes = BORNES[type]
    if (surface < bornes.surface[0] || surface > bornes.surface[1]) continue
    if (prixM2 < bornes.prixM2[0] || prixM2 > bornes.prixM2[1]) continue

    // La commune n'est identifiée que par son nom et son code postal dans le
    // flux Modelo ; les coordonnées du bien font office de position.
    const cle = `${bien.ville ?? '?'}|${bien.codePostal ?? '?'}`
    const groupe = parCommune.get(cle) ?? { ville: bien.ville, lat, lon, types: new Map() }
    const serie = groupe.types.get(type) ?? []
    serie.push(prixM2)
    groupe.types.set(type, serie)
    parCommune.set(cle, groupe)
  }

  const points = []
  const aujourdhui = new Date().toISOString().slice(0, 7)

  for (const [cle, groupe] of parCommune) {
    const prix = { maison: null, appartement: null, terrain: null }
    let retenu = false

    for (const [type, serie] of groupe.types) {
      if (serie.length < VENTES_MIN) {
        console.log(`  – ${groupe.ville} / ${type} — ${serie.length} vente(s), sous le seuil de ${VENTES_MIN}`)
        continue
      }
      prix[type] = Math.round(median(serie))
      retenu = true
    }

    if (!retenu) continue

    points.push({
      // Pas de code INSEE : le flux Modelo ne le transmet pas. Ce point ne peut
      // donc jouer que sur la proximité, jamais sur la correspondance exacte —
      // ce qui est sans conséquence, la commune exacte étant de toute façon
      // couverte par la saisie manuelle quand elle existe.
      codeInsee: null,
      nom: groupe.ville,
      lat: groupe.lat,
      lon: groupe.lon,
      prix,
      source: 'ventes-agence',
      releve: aujourdhui,
    })
    console.log(`  + ${groupe.ville} — ventes de l'agence (${cle})`)
  }

  return points
}

const ENTETE = `// ⚠️ FICHIER GÉNÉRÉ — ne pas éditer à la main.
//
// Produit par \`npm run points:reference\` à partir de :
//   • scripts/_data/points-agence.json  (saisie de l'agence)
//   • src/data/properties.json          (ventes de l'agence)
//
// Toute modification directe ici sera perdue au prochain passage du script.
// Pour ajouter ou corriger une commune, éditez la saisie manuelle.
//
// Le rôle de ce pool, la cascade qui l'emploie et la raison pour laquelle il
// n'est pas alimenté depuis un site tiers sont documentés dans
// \`../_lib/reference.js\`.
`

async function main() {
  console.log('Construction du pool de points de référence…\n')

  const saisis = await pointsSaisis()
  const ventes = await pointsVentes()

  // La saisie de l'agence l'emporte sur ses ventes pour une même commune : un
  // prix qu'un négociateur a posé vaut mieux qu'une médiane sur deux ventes.
  const villesSaisies = new Set(saisis.map((p) => slug(p.nom)))
  const fusion = [...saisis, ...ventes.filter((p) => !villesSaisies.has(slug(p.nom)))]

  // Dédoublonnage en dernier : il voit alors l'ensemble, saisie et ventes
  // confondues, et l'ordre de concaténation ci-dessus lui sert de départage.
  const retenus = dedoublonne(fusion)

  const ecartes = fusion.length - retenus.length
  console.log(
    `\n${retenus.length} point(s) au pool — ${saisis.length} de saisie, ` +
      `${fusion.length - saisis.length} déduit(s) des ventes` +
      `${ecartes > 0 ? `, ${ecartes} écarté(s) en doublon` : ''}.`,
  )

  if (retenus.length === 0) {
    console.log(
      '\nPool vide. Le moteur retombera sur la valeur départementale, comme avant —\n' +
        'rien ne casse, mais rien ne s’améliore non plus. Renseignez\n' +
        '`scripts/_data/points-agence.json` pour que cet étage serve à quelque chose.',
    )
  }

  const contenu = `${ENTETE}\nexport const POINTS_REFERENCE = ${JSON.stringify(retenus, null, 2)}\n`

  if (essai) {
    console.log('\n--essai : aucun fichier écrit.\n')
    console.log(contenu)
    return
  }

  await writeFile(SORTIE, contenu, 'utf8')
  console.log(`\n${path.relative(RACINE, SORTIE)} réécrit.`)
}

try {
  await main()
} catch (error) {
  console.error(`\nConstruction du pool interrompue : ${error?.message ?? error}`)
  process.exit(1)
}
