// Fonction serverless Vercel — prix indicatif au m² d'un secteur.
//
// Sert le seul aperçu de la fenêtre « Votre surface habitable » : l'utilisateur
// y déplace un curseur de surface et voit le montant réagir. Ce montant n'est
// pas l'estimation — il n'en est que l'ordre de grandeur, calculé côté client
// par une multiplication, et remplacé par le résultat complet de
// `/api/estimation.js` dès que le curseur est validé.
//
// D'où un moteur volontairement bridé, là où l'estimation finale déroule tout :
// un seul rayon, deux millésimes, aucun élargissement, aucun département
// voisin. La fenêtre est à l'écran pendant que la requête court — elle doit
// répondre en une seconde ou deux, pas en dix. À défaut, le prix de référence
// prend le relais : mieux vaut un ordre de grandeur tout de suite qu'une
// médiane juste une fois la fenêtre refermée.
//
// Effet de bord utile : les millésimes chargés ici restent en cache pour
// l'estimation qui suit, sur la même instance (voir `_lib/dvf.js`).

import { comparableKinds, median } from './_lib/comparables.js'
import { candidateYears, loadDepartementYear } from './_lib/dvf.js'
import { communeAtPoint, departementFromInsee, distanceM } from './_lib/geo.js'
import { estHorsCouvertureDvf, prixReference } from './_lib/reference.js'

/**
 * Budget total. Court à dessein : l'aperçu accompagne la lecture de la
 * fenêtre, il ne doit pas la faire attendre. Passé ce délai, la référence.
 */
const BUDGET_MS = 3500

/**
 * Voisinage sondé, en mètres. Plus large que le premier palier de l'estimation
 * finale (1 km) : sans élargissement possible, un rayon serré reviendrait trop
 * souvent bredouille — et un aperçu absent est pire qu'un aperçu approximatif.
 */
const APERCU_RADIUS_M = 3000

/** Millésimes chargés. Deux suffisent à un ordre de grandeur ; chacun coûte un téléchargement. */
const APERCU_YEARS = 2

/** En deçà, une vente atypique pèserait trop lourd sur la médiane. */
const MIN_SAMPLE = 5

/**
 * Médiane du voisinage, puis du département entier sur les mêmes millésimes —
 * ce second niveau ne coûte rien de plus, les fichiers sont déjà lus.
 *
 * Ne lève pas : une absence de réponse est traitée par l'appelant, qui a son
 * propre repli.
 */
async function apercuDvf({ lat, lon, type, departement }, { signal }) {
  const kinds = new Set(comparableKinds(type))

  // Une année de plus que demandé : le millésime de l'année en cours n'est
  // publié qu'avec plusieurs mois de retard, et reviendrait vide.
  const years = candidateYears(APERCU_YEARS + 1)
  const batches = await Promise.all(
    years.map((year) => loadDepartementYear(departement, year, { signal }).catch(() => [])),
  )

  const sales = batches.flat().filter((sale) => kinds.has(sale.kind))

  const proches = sales
    .filter((sale) => distanceM(lat, lon, sale.lat, sale.lon) <= APERCU_RADIUS_M)
    .map((sale) => sale.pricePerM2)

  if (proches.length >= MIN_SAMPLE) {
    return { pricePerM2: median(proches), source: 'dvf-apercu' }
  }

  const departemental = sales.map((sale) => sale.pricePerM2)
  if (departemental.length >= MIN_SAMPLE) {
    return { pricePerM2: median(departemental), source: 'dvf-departement' }
  }

  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Méthode non autorisée.' })
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const lat = Number(body.lat)
  const lon = Number(body.lon)

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ ok: false, error: 'Coordonnées manquantes.' })
  }

  // Le type peut manquer : la détection tourne encore quand la fenêtre s'ouvre.
  // `comparableKinds` et `prixReference` savent tous deux s'en passer — ils
  // retombent alors sur le résidentiel dans son ensemble.
  const type = typeof body.type === 'string' ? body.type : null

  const controller = new AbortController()
  const budget = setTimeout(() => controller.abort(), BUDGET_MS)
  const signal = controller.signal

  try {
    // Le front transmet le code commune dès que le cadastre a répondu : c'est
    // une requête de moins sur un budget qui en compte peu.
    const codeInsee =
      (typeof body.codeInsee === 'string' ? body.codeInsee : null) ??
      (await communeAtPoint(lat, lon, { signal }).catch(() => null))

    const departement = departementFromInsee(codeInsee)

    const dvf =
      departement && !estHorsCouvertureDvf(departement)
        ? await apercuDvf({ lat, lon, type, departement }, { signal }).catch(() => null)
        : null

    const { pricePerM2, source } = dvf ?? prixReference({ codeInsee, departement, type })

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ok: true, pricePerM2: Math.round(pricePerM2), source })
  } catch (error) {
    // Aucun repli n'a pu aboutir — la référence nationale reste préférable à
    // une fenêtre sans aperçu.
    console.error('[prix-m2] Aperçu abandonné —', error?.message ?? error)
    const { pricePerM2, source } = prixReference({ codeInsee: null, departement: null, type })
    return res.status(200).json({ ok: true, pricePerM2, source })
  } finally {
    clearTimeout(budget)
  }
}
