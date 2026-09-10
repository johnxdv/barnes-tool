// Statistiques de marché du secteur — les pages « chiffres » du rapport.
//
// Tout vient de la même source que l'estimation elle-même : les Demandes de
// Valeurs Foncières, chargées par département et par millésime (`dvf.js`),
// puis restreintes à une zone. Rien n'est demandé de plus au réseau : les
// millésimes déjà téléchargés pour le calcul du prix portent aussi bien les
// typologies, les périodes et les années — il ne s'agit que de les compter
// autrement.
//
//   1. Zone retenue                → `ventesSecteur`
//   2. Prix médian et évolution    → `marcheSecteur`      (page « statistiques »)
//   3. Budgets par typologie       → `budgetsParTypologie` (page « budgets »)
//   4. Historique annuel           → `historiqueAnnuel`    (page « historique »)
//
// Aucune de ces fonctions ne lève ni ne demande quoi que ce soit : elles
// prennent une liste de ventes et rendent des nombres, `null` compris. Un
// secteur sans données produit un rapport aux pages vides, jamais une erreur.

import { candidateYears, loadDepartementYear } from './dvf.js'
import { distanceM } from './geo.js'
import { comparableKinds, median } from './comparables.js'
import { mensualite, revenuRequis, HYPOTHESES } from './credit.js'

/**
 * Millésimes demandés. Le millésime « latest » de DVF couvre cinq années
 * pleines ; on en demande une de plus pour attraper l'année en cours dès sa
 * publication — une année absente revient en 404 et coûte une requête vide.
 */
const ANNEES = 6

/**
 * Nombre de millésimes chargés de front. Deux, là où la recherche de
 * comparables en lance quatre — et l'écart est délibéré.
 *
 * Le gain de la parallélisation est ici presque nul : le temps se passe pour
 * moitié à décompresser et analyser le CSV, ce qui occupe le fil d'exécution et
 * ne se recouvre donc pas d'un fichier à l'autre. Six millésimes chargés deux
 * par deux mettent le même temps que quatre par quatre.
 *
 * Le risque, lui, n'est pas le même. Chaque téléchargement est abandonné au
 * bout de quatre secondes ; à quatre de front sur une liaison ordinaire, les
 * derniers s'en approchent — et un millésime perdu, ici, n'est pas un
 * échantillon un peu réduit comme pour l'estimation : c'est une ligne
 * manquante dans l'historique par année, et une page qui affirme que 2024
 * n'existe pas.
 */
const CONCURRENCY = 2

/** En deçà, la commune ne fait pas un échantillon : on élargit au rayon. */
const MIN_COMMUNE = 25

/** Paliers d'élargissement quand la commune ne suffit pas. */
const RAYONS = [3000, 10000]

/** Ventes de logements — les terrains n'ont pas leur place dans ces pages. */
const LOGEMENTS = new Set(['maison', 'appartement'])

/** Exécute des tâches par lots, sans jamais en lancer plus de `CONCURRENCY`. */
async function inBatches(items, run) {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(run))
  }
}

const moyenne = (values) =>
  values.length === 0 ? null : values.reduce((total, v) => total + v, 0) / values.length

/** Évolution en pourcentage entre deux valeurs, ou `null` si l'une manque. */
function evolutionPct(avant, apres) {
  if (avant == null || apres == null || avant <= 0) return null
  return Math.round(((apres - avant) / avant) * 1000) / 10
}

/**
 * Ventes de logements du secteur, et description de la zone retenue.
 *
 * La commune passe d'abord : c'est l'échelle que l'agent connaît, celle qu'il
 * cite, et celle qui parle au vendeur. On ne s'en écarte que faute
 * d'échantillon — un village de trente ventes en cinq ans ne dit rien de
 * fiable — et l'on élargit alors par rayon autour du bien, jamais par
 * agrégation de communes voisines : à quinze kilomètres d'un littoral, la
 * commune d'à côté peut être deux fois moins chère.
 *
 * La zone retenue voyage avec les ventes, et se retrouve telle quelle en tête
 * de chaque page chiffrée du rapport : « Cassis » ou « rayon de 3 km », jamais
 * un « secteur » qui ne dirait pas ce qu'il recouvre.
 *
 * `departementales` porte l'ensemble des ventes de logements du département,
 * déjà en mémoire : la page des ventes comparables s'en sert pour chercher les
 * plus proches sans se laisser arrêter par une limite communale — un bien à
 * trois cents mètres de l'autre côté de la ligne reste un comparable.
 */
export async function ventesSecteur({ lat, lon, departement, codeInsee, commune }, { signal } = {}) {
  const vide = {
    sales: [],
    departementales: [],
    zone: { niveau: 'aucun', label: null, radiusM: null, codeInsee },
  }
  if (!departement) return vide

  // `.catch(() => [])` sur chaque millésime, et non sur l'ensemble : une année
  // interrompue — budget global épuisé, réseau capricieux — laisse les autres
  // en place au lieu de vider toutes les pages chiffrées d'un coup.
  // `loadDepartementYear` avale déjà ses propres pannes, mais relaie
  // l'annulation ; c'est elle qu'on absorbe ici.
  const millesimes = []
  await inBatches(candidateYears(ANNEES), async (year) => {
    millesimes.push(await loadDepartementYear(departement, year, { signal }).catch(() => []))
  })

  const logements = millesimes.flat().filter((sale) => LOGEMENTS.has(sale.kind))
  if (logements.length === 0) return vide

  if (codeInsee) {
    const communales = logements.filter((sale) => sale.commune === codeInsee)
    if (communales.length >= MIN_COMMUNE) {
      return {
        sales: communales,
        departementales: logements,
        zone: { niveau: 'commune', label: commune ?? null, radiusM: null, codeInsee },
      }
    }
  }

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    for (const radiusM of RAYONS) {
      const proches = logements.filter((sale) => distanceM(lat, lon, sale.lat, sale.lon) <= radiusM)
      // Le dernier palier est retenu quoi qu'il rapporte : une page à cinq
      // ventes reste plus utile qu'une page vide, et le nombre de références
      // est affiché à côté des chiffres.
      if (proches.length >= MIN_COMMUNE || radiusM === RAYONS[RAYONS.length - 1]) {
        return {
          sales: proches,
          departementales: logements,
          zone: {
            niveau: 'rayon',
            label: `${radiusM / 1000} km autour du bien`,
            radiusM,
            codeInsee,
          },
        }
      }
    }
  }

  return vide
}

/** Date de vente la plus récente de l'échantillon (`AAAA-MM-JJ`), ou `null`. */
function dateMax(sales) {
  let max = null
  for (const sale of sales) {
    if (sale.date && (max === null || sale.date > max)) max = sale.date
  }
  return max
}

/** Date décalée de `mois` mois en arrière, au format `AAAA-MM-JJ`. */
function reculeMois(iso, mois) {
  const [annee, m, j] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(annee, m - 1 - mois, j))
  return date.toISOString().slice(0, 10)
}

/**
 * Prix médian au m² du secteur et son évolution — page « statistiques marché ».
 *
 * Les deux périodes comparées sont ancrées sur la vente la plus récente de
 * l'échantillon, et non sur la date du jour. DVF publie ses millésimes avec
 * plusieurs mois de retard : compter « les douze derniers mois » depuis
 * aujourd'hui donnerait une période à moitié vide, comparée à une période
 * pleine — une baisse de 40 % qui ne serait qu'un artefact de publication.
 *
 * La médiane est préférée à la moyenne pour la même raison que dans le moteur
 * d'estimation : sur quelques dizaines de ventes, un bien d'exception déplace
 * une moyenne de plusieurs dizaines de pour cent.
 */
export function marcheSecteur(sales) {
  const reference = dateMax(sales)
  if (!reference) {
    return { prixM2Median: null, evolutionPct: null, references: 0, periodes: null, parType: {} }
  }

  const debutRecente = reculeMois(reference, 12)
  const debutPrecedente = reculeMois(reference, 24)

  const recentes = sales.filter((sale) => sale.date > debutRecente)
  const precedentes = sales.filter(
    (sale) => sale.date > debutPrecedente && sale.date <= debutRecente,
  )

  const medianeM2 = (echantillon) => {
    const valeur = median(echantillon.map((sale) => sale.pricePerM2))
    return valeur === null ? null : Math.round(valeur)
  }

  // Médiane du type de bien : la même page porte le chiffre tous logements
  // confondus et son détail. Un secteur peut afficher 6 000 €/m² en moyenne et
  // 4 500 en maison, l'écart tenant à la seule composition des ventes.
  const parType = {}
  for (const kind of LOGEMENTS) {
    const duType = sales.filter((sale) => sale.kind === kind)
    parType[kind] = { prixM2Median: medianeM2(duType), references: duType.length }
  }

  return {
    prixM2Median: medianeM2(sales),
    prixM2MedianRecent: medianeM2(recentes),
    prixM2MedianPrecedent: medianeM2(precedentes),
    evolutionPct: evolutionPct(medianeM2(precedentes), medianeM2(recentes)),
    references: sales.length,
    periodes: {
      // Bornes réellement employées, restituées pour que la page puisse écrire
      // « sept. 2024 – sept. 2025 » plutôt qu'un « sur un an » invérifiable.
      recente: { debut: debutRecente, fin: reference, ventes: recentes.length },
      precedente: {
        debut: debutPrecedente,
        fin: debutRecente,
        ventes: precedentes.length,
      },
    },
    parType,
  }
}

/**
 * Typologies retenues, du T2 au T6 et plus.
 *
 * Le studio est laissé de côté : DVF le confond largement avec le T2 — la
 * colonne `nombre_pieces_principales` y est vide plus souvent qu'ailleurs — et
 * un « budget moyen » de studio calculé sur une poignée de ventes mal
 * renseignées induirait en erreur plus qu'il n'informerait.
 */
const TYPOLOGIES = [
  { id: 'T2', label: 'T2', pieces: 2 },
  { id: 'T3', label: 'T3', pieces: 3 },
  { id: 'T4', label: 'T4', pieces: 4 },
  { id: 'T5', label: 'T5', pieces: 5 },
  { id: 'T6', label: 'T6 et +', pieces: 6, ouvert: true },
]

/**
 * Budgets moyens du secteur par typologie — page « budgets ».
 *
 * Pour chaque taille de logement : ce qui se vend (surface et prix moyens), le
 * poids de la typologie dans le marché local, et ce qu'il faut gagner pour
 * l'acheter à crédit. Ce dernier chiffre est ce qui donne son sens à la page :
 * un prix moyen ne dit rien à un vendeur, un revenu requis lui dit qui peut
 * acheter chez lui.
 *
 * La moyenne, ici, plutôt que la médiane : la page annonce un budget, c'est-à-
 * dire une somme à réunir, et les typologies sont déjà des tranches homogènes.
 */
export function budgetsParTypologie(sales, { taux, hypotheses = HYPOTHESES } = {}) {
  const avecPieces = sales.filter((sale) => sale.rooms != null)

  const groupes = TYPOLOGIES.map((typologie) => {
    const lot = avecPieces.filter((sale) =>
      typologie.ouvert ? sale.rooms >= typologie.pieces : sale.rooms === typologie.pieces,
    )

    const prixMoyen = moyenne(lot.map((sale) => sale.price))
    const echeance = taux == null ? null : mensualite(prixMoyen, taux, hypotheses.dureeAnnees)

    return {
      ...typologie,
      ventes: lot.length,
      surfaceMoyenne: lot.length === 0 ? null : Math.round(moyenne(lot.map((s) => s.surface))),
      prixMoyen: prixMoyen === null ? null : Math.round(prixMoyen / 1000) * 1000,
      prixM2Moyen: lot.length === 0 ? null : Math.round(moyenne(lot.map((s) => s.pricePerM2))),
      mensualite: echeance,
      revenuMensuelRequis: revenuRequis(echeance, hypotheses.tauxEffortMax),
    }
  })

  // La part se calcule sur le total des typologies retenues, et non sur toutes
  // les ventes du secteur : sans quoi les parts affichées ne feraient jamais
  // 100 %, les studios et les ventes sans pièces renseignées manquant à
  // l'appel sans que la page puisse le dire.
  const total = groupes.reduce((somme, groupe) => somme + groupe.ventes, 0)

  return {
    typologies: groupes.map((groupe) => ({
      ...groupe,
      partPct: total === 0 ? null : Math.round((groupe.ventes / total) * 1000) / 10,
    })),
    ventesClassees: total,
    // Ventes du secteur qu'aucune typologie ne recouvre : studios, et surtout
    // mutations dont DVF ne renseigne pas le nombre de pièces.
    ventesNonClassees: sales.length - total,
    taux,
    hypotheses,
  }
}

/**
 * Historique des ventes par année — page « historique ».
 *
 * Nombre de ventes, prix moyen au m² et évolution d'une année sur l'autre, sur
 * la profondeur que publie DVF (cinq millésimes pleins).
 *
 * L'année en cours est écartée dès lors qu'elle est manifestement incomplète :
 * un millésime publié à mi-parcours afficherait une chute de moitié du nombre
 * de ventes, qui n'est qu'un décompte partiel. Le seuil est délibérément
 * grossier — la moitié du volume de l'année précédente — parce qu'il ne s'agit
 * pas de dater la publication mais d'éviter une ligne trompeuse.
 */
export function historiqueAnnuel(sales) {
  /** @type {Map<number, object[]>} */
  const parAnnee = new Map()
  for (const sale of sales) {
    if (!sale.date) continue
    const annee = Number(sale.date.slice(0, 4))
    if (!Number.isFinite(annee)) continue
    if (!parAnnee.has(annee)) parAnnee.set(annee, [])
    parAnnee.get(annee).push(sale)
  }

  const annees = [...parAnnee.entries()]
    .map(([annee, lot]) => ({
      annee,
      ventes: lot.length,
      prixM2Moyen: Math.round(moyenne(lot.map((sale) => sale.pricePerM2))),
      prixMoyen: Math.round(moyenne(lot.map((sale) => sale.price)) / 1000) * 1000,
    }))
    .sort((a, b) => a.annee - b.annee)

  // Millésime en cours de publication : écarté plutôt qu'affiché à moitié.
  if (annees.length >= 2) {
    const derniere = annees[annees.length - 1]
    const avant = annees[annees.length - 2]
    if (derniere.ventes < avant.ventes / 2) annees.pop()
  }

  const avecEvolution = annees.map((ligne, index) => ({
    ...ligne,
    evolutionPct: index === 0 ? null : evolutionPct(annees[index - 1].prixM2Moyen, ligne.prixM2Moyen),
  }))

  const evolutions = avecEvolution.map((l) => l.evolutionPct).filter((v) => v != null)
  const premiere = avecEvolution[0]
  const derniere = avecEvolution[avecEvolution.length - 1]

  return {
    annees: avecEvolution,
    synthese: {
      ventesTotal: avecEvolution.reduce((somme, l) => somme + l.ventes, 0),
      ventesMoyenne:
        avecEvolution.length === 0
          ? null
          : Math.round(moyenne(avecEvolution.map((l) => l.ventes))),
      prixM2Moyen:
        avecEvolution.length === 0
          ? null
          : Math.round(moyenne(avecEvolution.map((l) => l.prixM2Moyen))),
      evolutionMoyennePct:
        evolutions.length === 0 ? null : Math.round(moyenne(evolutions) * 10) / 10,
      // Évolution d'un bout à l'autre de la période — celle qui compte pour un
      // vendeur, là où la moyenne des variations annuelles lisse les à-coups.
      evolutionPeriodePct:
        avecEvolution.length < 2 ? null : evolutionPct(premiere.prixM2Moyen, derniere.prixM2Moyen),
      premiereAnnee: premiere?.annee ?? null,
      derniereAnnee: derniere?.annee ?? null,
    },
  }
}

/** Rayons successifs de la recherche de comparables, en mètres. */
const RAYONS_COMPARABLES = [500, 1000, 2000, 5000]

/**
 * Ventes comparables les plus proches du bien — page « ventes comparables ».
 *
 * Mêmes ventes et mêmes règles de rapprochement que le moteur d'estimation :
 * `comparableKinds` décide ici comme là de ce qui est comparable à quoi, et
 * les lignes viennent des millésimes déjà chargés. La page et le prix ne
 * peuvent donc pas raconter deux histoires différentes.
 *
 * La différence tient à ce qui est cherché : le moteur veut un échantillon
 * assez large pour une médiane stable, cette page veut les quelques ventes
 * qu'un vendeur reconnaîtra — d'où un rayon de départ bien plus court, et un
 * élargissement qui s'arrête dès qu'il y a de quoi remplir la page.
 */
export function comparablesProches({ lat, lon, type }, sales, { max = 8 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return []

  const kinds = new Set(comparableKinds(type))
  const candidates = sales
    .filter((sale) => kinds.has(sale.kind))
    .map((sale) => ({ ...sale, distanceM: Math.round(distanceM(lat, lon, sale.lat, sale.lon)) }))

  for (const rayon of RAYONS_COMPARABLES) {
    const proches = candidates.filter((sale) => sale.distanceM <= rayon)
    if (proches.length >= max || rayon === RAYONS_COMPARABLES[RAYONS_COMPARABLES.length - 1]) {
      return proches
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, max)
        .map((sale) => ({
          kind: sale.kind,
          distanceM: sale.distanceM,
          surface: Math.round(sale.surface),
          rooms: sale.rooms,
          price: Math.round(sale.price),
          pricePerM2: Math.round(sale.pricePerM2),
          date: sale.date,
          commune: sale.commune,
        }))
    }
  }

  return []
}
