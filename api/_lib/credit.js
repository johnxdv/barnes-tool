// Coût du crédit — le taux d'emprunt du moment, sa série historique, et les
// deux formules qui en découlent (mensualité, revenu requis).
//
// Source : Banque centrale européenne, statistiques MIR (« MFI interest rate
// statistics »), série `M.FR.B.A2C.AM.R.A.2250.EUR.N` — coût du crédit à
// l'habitat des ménages, France, production nouvelle, taux effectif au sens
// étroit. Publiée mensuellement, ouverte, sans clé.
// https://data.ecb.europa.eu/
//
// Pourquoi celle-là plutôt que l'Observatoire Crédit Logement/CSA, qui est la
// référence du marché français : l'Observatoire ne publie aucune API ni aucun
// fichier ouvert — ses séries ne circulent qu'en communiqués mensuels et en
// graphiques. La série BCE en est très proche (quelques dixièmes de point) et
// a l'avantage décisif d'être interrogeable.
//
// Une réserve à connaître, et qui est portée jusque dans le rapport : la série
// couvre toutes les durées confondues, quand le rapport raisonne sur 25 ans —
// la maturité la plus longue, donc la plus chère. Le taux réel d'un emprunt à
// 25 ans est en général supérieur de l'ordre d'un quart de point. Pour caler
// le calcul sur le barème d'une banque partenaire plutôt que sur la moyenne
// nationale, renseigner `RAPPORT_TAUX_25ANS` (voir plus bas).

const ECB_ENDPOINT = 'https://data-api.ecb.europa.eu/service/data/MIR'
const ECB_SERIES = 'M.FR.B.A2C.AM.R.A.2250.EUR.N'

/** Budget de l'appel : au-delà, la table de repli fait aussi bien l'affaire. */
const FETCH_TIMEOUT_MS = 4000

/** Nombre d'années d'historique restituées, année en cours comprise. */
const ANNEES_HISTORIQUE = 6

/**
 * Hypothèses du profil acquéreur standard. Elles sont renvoyées avec les
 * chiffres, et non pas seulement appliquées : un revenu requis sans ses
 * hypothèses n'est pas un chiffre, c'est une affirmation.
 *
 * 35 % est le taux d'effort maximal fixé par le Haut Conseil de stabilité
 * financière (décision D-HCSF-2021-7), assurance emprunteur comprise.
 */
export const HYPOTHESES = {
  dureeAnnees: 25,
  tauxEffortMax: 0.35,
}

/**
 * Repli hors ligne, moyennes annuelles de la même série BCE relevées à la
 * main. Il ne sert qu'en cas de panne : la série est demandée à chaque
 * rapport, et c'est elle qui fait foi. Les valeurs figées vieillissent — d'où
 * le drapeau `estimatif` que porte la réponse quand elles servent.
 */
const TAUX_REPLI = [
  { annee: 2021, taux: 1.15 },
  { annee: 2022, taux: 1.47 },
  { annee: 2023, taux: 3.01 },
  { annee: 2024, taux: 3.39 },
  { annee: 2025, taux: 3.02 },
  { annee: 2026, taux: 3.11 },
]

/**
 * Surcharge du taux courant, en pourcentage annuel, par la variable
 * d'environnement `RAPPORT_TAUX_25ANS` (Vercel → Environment Variables).
 *
 * C'est le seul moyen de faire entrer le barème réel d'un partenaire bancaire
 * dans le rapport : la série BCE donne une moyenne nationale toutes durées
 * confondues, là où une agence négocie un taux à 25 ans qu'elle connaît.
 * L'historique, lui, reste celui de la BCE — la surcharge ne porte que sur le
 * taux du moment, seul chiffre qui entre dans le calcul du revenu requis.
 */
function tauxSurcharge() {
  const brut = process.env.RAPPORT_TAUX_25ANS
  if (!brut) return null

  const taux = Number(brut)
  if (!Number.isFinite(taux) || taux <= 0 || taux > 25) {
    console.error('[rapport] RAPPORT_TAUX_25ANS illisible — surcharge ignorée')
    return null
  }

  return taux
}

/** Moyenne arithmétique, ou `null` sur série vide. */
const moyenne = (values) =>
  values.length === 0 ? null : values.reduce((total, v) => total + v, 0) / values.length

const arrondi = (value, decimales = 2) => {
  const facteur = 10 ** decimales
  return Math.round(value * facteur) / facteur
}

/**
 * Lit la réponse CSV de la BCE et en tire les moyennes annuelles.
 *
 * Le découpage sur la virgule suffit ici alors que le fichier contient des
 * champs entre guillemets : les deux colonnes lues — `TIME_PERIOD` (12) et
 * `OBS_VALUE` (13) — précèdent toutes les colonnes de libellé, seules à être
 * échappées. Un parseur CSV complet ne servirait qu'à lire des titres dont on
 * n'a que faire.
 */
function lireSerieCsv(csv) {
  const lignes = csv.split('\n')
  const entete = lignes[0]?.split(',') ?? []
  const iPeriode = entete.indexOf('TIME_PERIOD')
  const iValeur = entete.indexOf('OBS_VALUE')
  if (iPeriode < 0 || iValeur < 0) throw new Error('BCE — colonnes attendues absentes')

  /** @type {Map<number, number[]>} relevés mensuels, par année */
  const parAnnee = new Map()

  for (let i = 1; i < lignes.length; i += 1) {
    const champs = lignes[i]?.split(',')
    if (!champs || champs.length <= iValeur) continue

    const annee = Number(champs[iPeriode]?.slice(0, 4))
    const taux = Number(champs[iValeur])
    if (!Number.isFinite(annee) || !Number.isFinite(taux)) continue

    if (!parAnnee.has(annee)) parAnnee.set(annee, [])
    parAnnee.get(annee).push(taux)
  }

  return [...parAnnee.entries()]
    .map(([annee, releves]) => ({ annee, taux: arrondi(moyenne(releves)) }))
    .sort((a, b) => a.annee - b.annee)
}

/**
 * Taux d'emprunt du moment et son historique annuel.
 *
 * Ne lève jamais : une panne de la BCE rend la table de repli, marquée comme
 * telle. Le rapport doit pouvoir s'assembler sans elle.
 */
export async function fetchTaux({ signal } = {}) {
  const debut = new Date().getUTCFullYear() - ANNEES_HISTORIQUE + 1
  const url = `${ECB_ENDPOINT}/${ECB_SERIES}?startPeriod=${debut}-01&format=csvdata`
  const budget = AbortSignal.timeout(FETCH_TIMEOUT_MS)

  let serie = null
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/csv' },
      signal: signal ? AbortSignal.any([signal, budget]) : budget,
    })
    if (!response.ok) throw new Error(`BCE — réponse ${response.status}`)
    const lue = lireSerieCsv(await response.text())
    if (lue.length > 0) serie = lue
  } catch (error) {
    if (signal?.aborted) throw error
    console.error('[rapport] Série de taux BCE indisponible —', error?.message ?? error)
  }

  const estimatif = serie === null
  const retenue = serie ?? TAUX_REPLI
  const surcharge = tauxSurcharge()

  return {
    // Le taux qui entre dans les calculs : celui de l'agence s'il est
    // renseigné, sinon la dernière moyenne annuelle connue.
    taux: surcharge ?? retenue[retenue.length - 1]?.taux ?? null,
    tauxSource: surcharge ? 'agence' : estimatif ? 'repli' : 'bce',
    serie: retenue.slice(-ANNEES_HISTORIQUE),
    // Vrai quand aucune donnée fraîche n'a pu être obtenue : le rapport
    // l'annonce alors plutôt que de faire passer une table figée pour un relevé.
    estimatif,
    source: estimatif
      ? 'Moyennes annuelles BCE relevées hors ligne — à rafraîchir'
      : 'BCE — coût du crédit à l’habitat des ménages (France)',
  }
}

/**
 * Mensualité d'un prêt amortissable à taux fixe — formule classique
 * `C × t / (1 − (1 + t)^−n)`, où `t` est le taux périodique et `n` le nombre
 * d'échéances.
 *
 * Renvoie `null` sur capital absent ou aberrant : le rapport préfère un champ
 * vide à un montant que personne ne pourrait justifier.
 */
export function mensualite(capital, tauxAnnuelPct, annees = HYPOTHESES.dureeAnnees) {
  const montant = Number(capital)
  const taux = Number(tauxAnnuelPct)
  if (!Number.isFinite(montant) || montant <= 0) return null
  if (!Number.isFinite(taux) || taux < 0 || !annees) return null

  const echeances = annees * 12
  // Taux nul : le capital se rembourse à parts égales, la formule générale
  // divisant alors par zéro.
  if (taux === 0) return Math.round(montant / echeances)

  const periodique = taux / 100 / 12

  return Math.round((montant * periodique) / (1 - (1 + periodique) ** -echeances))
}

/**
 * Revenu net mensuel qu'il faut justifier pour porter une mensualité donnée,
 * au taux d'effort maximal retenu.
 */
export function revenuRequis(echeance, tauxEffort = HYPOTHESES.tauxEffortMax) {
  if (echeance == null || !Number.isFinite(echeance) || echeance <= 0) return null
  return Math.round(echeance / tauxEffort)
}

/**
 * Profil acquéreur pour un montant d'acquisition : mensualité, revenu requis,
 * et les hypothèses qui les produisent.
 *
 * Le capital emprunté est pris égal au prix du bien — ni apport, ni frais
 * d'acquisition. C'est une convention, énoncée telle quelle dans le rapport :
 * un apport la ferait baisser, les frais de notaire la feraient monter, et
 * aucun des deux n'est connu à ce stade.
 */
export function profilAcquereur(prix, taux, hypotheses = HYPOTHESES) {
  const echeance = mensualite(prix, taux, hypotheses.dureeAnnees)

  return {
    prix: Number.isFinite(Number(prix)) ? Number(prix) : null,
    taux,
    mensualite: echeance,
    revenuMensuelRequis: revenuRequis(echeance, hypotheses.tauxEffortMax),
    dureeAnnees: hypotheses.dureeAnnees,
    tauxEffortMax: hypotheses.tauxEffortMax,
  }
}
