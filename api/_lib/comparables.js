// Étape B — recherche des ventes comparables, et étape C — prix médian au m².

import { candidateYears, loadDepartementYear } from './dvf.js'
import { departementsAround, distanceM } from './geo.js'

/**
 * Paliers d'élargissement, du plus resserré au plus large.
 *
 * On part du voisinage immédiat sur les trois derniers millésimes, et on
 * n'élargit qu'à défaut d'échantillon suffisant. Rien de tout cela n'est dit à
 * l'utilisateur : le parcours est identique qu'il s'agisse d'un centre-ville
 * couvert par cent ventes ou d'un hameau qu'il a fallu chercher à quinze
 * kilomètres.
 */
const LADDER = [
  { radiusM: 1000, years: 3 },
  { radiusM: 2000, years: 4 },
  { radiusM: 5000, years: 5 },
  { radiusM: 15000, years: 5 },
]

/** En deçà, une vente atypique pèserait trop lourd sur la médiane. */
const MIN_SAMPLE = 5

/**
 * À partir de ce rayon, la zone de recherche peut déborder sur un département
 * voisin — et les fichiers DVF sont rangés par département.
 */
const CROSS_BORDER_FROM_M = 2000

/**
 * Nombre de millésimes téléchargés de front.
 *
 * Sans plafond, un palier large lance une douzaine de fichiers à la fois : sur
 * une liaison ordinaire, ils se partagent la bande passante et finissent par
 * dépasser, tous ensemble, le délai au-delà duquel on les abandonne — de sorte
 * qu'élargir la recherche revenait à tout perdre. Par lots, chacun arrive vite.
 */
const CONCURRENCY = 4

/** Exécute des tâches par lots, sans jamais en lancer plus de `CONCURRENCY`. */
async function inBatches(items, run) {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(run))
  }
}

/**
 * Une année de plus que demandé est toujours réclamée : le millésime de
 * l'année en cours n'est publié qu'avec plusieurs mois de retard, et la
 * requête qui revient vide ne doit pas amputer la profondeur d'historique.
 */
const YEAR_SLACK = 1

/**
 * Types DVF comparables à un type détecté sur la carte.
 *
 * Un type indéterminé — détection en échec, bâtiment inconnu des bases — est
 * rapproché de l'ensemble du résidentiel plutôt que d'être abandonné : mieux
 * vaut une médiane tous logements confondus que pas d'estimation du tout. Il
 * en va de même d'un local professionnel, dont les surfaces DVF sont trop
 * hétérogènes pour former un échantillon exploitable.
 */
export function comparableKinds(type) {
  if (type === 'maison') return ['maison']
  if (type === 'appartement') return ['appartement']
  if (type === 'terrain') return ['terrain']
  return ['maison', 'appartement']
}

/**
 * Médiane d'une série de nombres. Retenue plutôt que la moyenne : sur un
 * échantillon de quelques ventes, une seule transaction hors norme — un bien
 * d'exception, une vente entre proches — déplacerait la moyenne de plusieurs
 * dizaines de pour cent.
 */
export function median(values) {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/**
 * Recherche les ventes comparables autour d'un point, en élargissant les
 * critères tant que l'échantillon reste insuffisant.
 *
 * Le chargement se fait par département et par année, et les fichiers déjà
 * lus restent en mémoire : élargir le rayon ne coûte alors plus aucune requête
 * — seul un palier qui ajoute une année, ou un département voisin, en déclenche
 * de nouvelles. C'est ce qui permet à l'élargissement complet de tenir dans le
 * budget de l'écran de chargement.
 *
 * Ne lève jamais en dehors d'une annulation explicite : un échantillon vide
 * est une réponse, que l'appelant traite par son propre repli.
 */
export async function findComparables({ lat, lon, type, departement }, { signal } = {}) {
  const kinds = new Set(comparableKinds(type))
  const departements = new Set([departement].filter(Boolean))
  const loaded = new Map()
  let probed = null

  /** Charge les années manquantes de tous les départements retenus. */
  const ensureLoaded = async (yearCount) => {
    const years = candidateYears(yearCount + YEAR_SLACK)
    const missing = []

    for (const dep of departements) {
      for (const year of years) {
        const key = `${dep}:${year}`
        if (!loaded.has(key)) missing.push({ key, dep, year })
      }
    }

    await inBatches(missing, async ({ key, dep, year }) => {
      loaded.set(key, await loadDepartementYear(dep, year, { signal }))
    })
  }

  let sample = []
  let used = LADDER[0]

  for (const rung of LADDER) {
    used = rung

    // Le pourtour est sondé au rayon du palier en cours, et non au rayon
    // maximal : sonder large ferait entrer dès le deuxième palier des
    // départements dont on n'a pas encore besoin, et chacun coûte le
    // téléchargement de tous ses millésimes.
    if (rung.radiusM >= CROSS_BORDER_FROM_M && probed !== rung.radiusM) {
      probed = rung.radiusM
      // Une panne du service de découpage administratif laisse simplement la
      // recherche cantonnée au département de départ, ce qui reste exploitable.
      const around = await departementsAround(lat, lon, rung.radiusM, { signal }).catch(() => [])
      for (const dep of around) departements.add(dep)
    }

    await ensureLoaded(rung.years)

    sample = []
    for (const sales of loaded.values()) {
      for (const sale of sales) {
        if (!kinds.has(sale.kind)) continue
        if (distanceM(lat, lon, sale.lat, sale.lon) > rung.radiusM) continue
        sample.push(sale)
      }
    }

    if (sample.length >= MIN_SAMPLE) break
  }

  return {
    sales: sample,
    pricePerM2: median(sample.map((sale) => sale.pricePerM2)),
    radiusM: used.radiusM,
    years: used.years,
    departements: [...departements],
  }
}

/**
 * Repli départemental — le prix médian au m² sur tout le département, toutes
 * années confondues.
 *
 * Sert quand l'élargissement géographique n'a rien donné : moins précis qu'un
 * voisinage, mais toujours mieux qu'un ordre de grandeur national.
 */
export async function departementPricePerM2(departement, type, { signal } = {}) {
  const kinds = new Set(comparableKinds(type))
  const years = candidateYears(LADDER[LADDER.length - 1].years + YEAR_SLACK)

  const batches = []
  await inBatches(years, async (year) => {
    batches.push(await loadDepartementYear(departement, year, { signal }))
  })

  const prices = batches
    .flat()
    .filter((sale) => kinds.has(sale.kind))
    .map((sale) => sale.pricePerM2)

  return { pricePerM2: median(prices), count: prices.length }
}
