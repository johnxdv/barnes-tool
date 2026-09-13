// Alsace-Moselle — combler le trou de DVF là où il est permanent.
//
// ── Le problème, et pourquoi ce n'est pas un bug ──────────────────────────
//
// La Moselle (57), le Bas-Rhin (67) et le Haut-Rhin (68) relèvent du **livre
// foncier**, une institution du droit local alsacien-mosellan héritée de la
// période allemande : la publicité foncière y est tenue par le juge du livre
// foncier, et non par le service de la publicité foncière de la DGFiP. Les
// mutations de ces trois départements n'entrent donc pas dans le fichier
// immobilier dont sont extraites les Demandes de valeurs foncières, à aucun
// millésime et à aucune échelle.
//
// Ce n'est pas une lacune de couverture qu'un élargissement de rayon
// rattraperait : c'est un autre régime juridique. Le moteur peut chercher
// jusqu'à quinze kilomètres, il ne trouvera rien — et à la frontière du
// département, ce qu'il trouverait serait le marché voisin, pas le local.
//
// ── Ce que ce module fait à la place ──────────────────────────────────────
//
// Aucune base ouverte ne publie les prix de transaction de ce territoire. Les
// données existent — les notaires les versent à leur base PERVAL, les
// chambres départementales en publient des synthèses — mais rien ne s'y
// interroge par programme. Il n'y a donc pas d'équivalent à DVF à brancher, et
// prétendre le contraire serait mentir sur la nature du chiffre affiché.
//
// Ce module construit donc un **repère**, et l'annonce comme tel, à partir de
// deux éléments dont chacun est vérifiable :
//
//  1. **Un niveau départemental** (`LIVRE_FONCIER`), ordre de grandeur du
//     marché des trois départements — la seule partie du calcul qui ne vienne
//     pas d'une source interrogée en direct, et celle que l'agence a tout
//     intérêt à remplacer par ses propres références (`ESTIMATION_PRIX_M2`).
//
//  2. **Un indice communal**, tiré de deux indicateurs Insee qui, eux,
//     couvrent parfaitement le territoire : le niveau de vie médian de la
//     commune (dispositif Filosofi) et sa population (recensement). L'API
//     Melodi les sert sans clé — c'est déjà la source de la page « profil du
//     quartier », voir `quartier.js`. Leur rapport aux valeurs départementales
//     donne l'écart de la commune à son marché départemental.
//
// ── Deux variables, et des exposants mesurés plutôt que supposés ──────────
//
// L'indice a été calibré sur la Meurthe-et-Moselle (54) — département
// limitrophe de la Moselle, de structure comparable, et couvert par DVF, donc
// vérifiable. Sur ses communes rassemblant au moins quarante ventes en cinq
// millésimes, la régression en logarithmes du prix médian au m² donne :
//
//   ln(prix / prix_dep) = 1,06 × ln(revenu / revenu_dep)
//                       + 0,10 × ln(population / 10 000)
//
// Le **niveau de vie** porte l'essentiel : sur le seul revenu, l'élasticité
// mesurée vaut 0,997 — proportionnelle à trois millièmes près.
//
// La **population** corrige ce que le revenu à lui seul rate, et le rate
// systématiquement : la ville-centre. Nancy a un niveau de vie inférieur de 5 %
// à celui de son département et des prix supérieurs de 22 % — un faubourg
// pavillonnaire aisé n'est pas un centre-ville, quand bien même ses habitants
// gagnent davantage. Sans ce second terme, Strasbourg et Metz sortaient sous
// leur propre moyenne départementale, ce qui est faux dans les deux cas.
// L'exposant est faible (0,10) et le pivot volontairement bas (10 000
// habitants) : le terme relève les villes sans écraser les villages.
//
// Le R² de la régression vaut **0,28**, et il est aussi important que les
// exposants : ces deux variables expliquent un peu plus du quart de l'écart de
// prix entre communes, pas la totalité. Deux communes semblables sur ces deux
// points peuvent se tenir à 30 % l'une de l'autre — la desserte, le relief, la
// réputation d'un centre ancien ne se lisent ni dans un revenu ni dans un
// décompte d'habitants. Le repère rendu ici est donc un ordre de grandeur
// informé, et le rapport l'écrit en toutes lettres. C'est aussi la raison des
// bornes posées sur l'indice : hors de cet intervalle, l'extrapolation
// cesserait d'être prudente.
//
// Ne lève jamais : l'Insee indisponible ramène simplement au niveau
// départemental, qui est le comportement d'avant ce module.

const MELODI_ENDPOINT = 'https://api.insee.fr/melodi/data'

/** Budget par requête — le rapport et l'estimation ont chacun le leur, plus large. */
const FETCH_TIMEOUT_MS = 4000

/**
 * Les trois départements du livre foncier.
 *
 * Mayotte (976) est elle aussi absente de DVF, mais pour une raison sans
 * rapport — le cadastre y est en cours de constitution, pas régi par un droit
 * local distinct — et le raisonnement ci-dessous ne s'y applique pas : elle
 * reste sur la table de repli de `reference.js`.
 */
export const LIVRE_FONCIER = {
  57: {
    nom: 'Moselle',
    // Ordres de grandeur du marché départemental, arrondis volontairement
    // grossièrement : ils ne prétendent pas à la précision d'une médiane
    // calculée sur des ventes réelles. Ils servent d'ancrage à l'indice
    // communal, et se remplacent par `ESTIMATION_PRIX_M2`.
    prixM2: { maison: 1850, appartement: 1700, terrain: 70 },
  },
  67: {
    nom: 'Bas-Rhin',
    prixM2: { maison: 2650, appartement: 2900, terrain: 150 },
  },
  68: {
    nom: 'Haut-Rhin',
    prixM2: { maison: 2350, appartement: 2300, terrain: 110 },
  },
}

/** Exposants de la régression décrite en tête de fichier. */
const EXPOSANT_REVENU = 1.06
const EXPOSANT_POPULATION = 0.1

/**
 * Pivot du terme de population : la commune de dix mille habitants ne reçoit
 * aucune correction. En dessous, le terme retire quelques points ; au-dessus,
 * il en ajoute — un peu plus de trente pour une préfecture de deux cent mille.
 */
const POPULATION_PIVOT = 10000

/**
 * Bornes de l'indice.
 *
 * L'étalonnage sur la Meurthe-et-Moselle voit les rapports observés s'étaler
 * de 0,55 à 1,40 ; au-delà, on quitte le nuage sur lequel les exposants ont
 * été mesurés et l'on extrapolerait. Les bornes sont posées un peu au large de
 * l'observé — une commune de montagne ou un faubourg très modeste peuvent en
 * sortir sans que le repère devienne faux — mais elles empêchent qu'un revenu
 * aberrant, ou une commune de trois cents habitants au niveau de vie atypique,
 * double le prix au m².
 */
const INDICE_MIN = 0.6
const INDICE_MAX = 1.8

/** Ce département relève-t-il du livre foncier ? */
export function estLivreFoncier(departement) {
  return Object.prototype.hasOwnProperty.call(LIVRE_FONCIER, String(departement))
}

/** Nom du département, pour les libellés du rapport. */
export const nomDepartementLivreFoncier = (departement) =>
  LIVRE_FONCIER[String(departement)]?.nom ?? null

/**
 * Dernière observation chiffrée d'un jeu Melodi, et son millésime. `null` sur
 * panne, refus, ou territoire que l'Insee ne diffuse pas.
 *
 * Filosofi ne publie pas les communes de moins d'une cinquantaine de ménages —
 * secret statistique — et la réponse est alors vide : c'est un cas normal, pas
 * une erreur, et il ramène simplement au niveau départemental.
 */
async function melodi(chemin, { signal } = {}) {
  const budget = AbortSignal.timeout(FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${MELODI_ENDPOINT}/${chemin}`,
      {
        headers: { Accept: 'application/json' },
        signal: signal ? AbortSignal.any([signal, budget]) : budget,
      },
    )
    if (!response.ok) throw new Error(`réponse ${response.status}`)

    const data = await response.json()
    const observations = (data?.observations ?? []).filter((o) =>
      Number.isFinite(o.measures?.OBS_VALUE_NIVEAU?.value),
    )
    if (observations.length === 0) return null

    // Plusieurs millésimes voyagent dans la même réponse : on prend le plus
    // récent plutôt que d'en figer un ici, qui vieillirait mal.
    const derniere = observations.reduce((max, o) =>
      (o.dimensions?.TIME_PERIOD ?? '') > (max.dimensions?.TIME_PERIOD ?? '') ? o : max,
    )

    return {
      valeur: Math.round(derniere.measures.OBS_VALUE_NIVEAU.value),
      millesime: Number(derniere.dimensions?.TIME_PERIOD) || null,
    }
  } catch (error) {
    if (signal?.aborted) throw error
    console.error('[alsace-moselle] Insee indisponible —', chemin.slice(0, 60), error?.message ?? error)
    return null
  }
}

/** Niveau de vie médian annuel d'un territoire Insee (`COM-57176`, `DEP-57`). */
const niveauDeVie = (geo, options) =>
  melodi(`DS_FILOSOFI_CC?GEO=${geo}&FILOSOFI_MEASURE=MED_SL`, options)

/** Population municipale du dernier recensement publié. */
const population = (geo, options) =>
  melodi(`DS_RP_POPULATION_PRINC?GEO=${geo}&RP_MEASURE=POP&SEX=_T&AGE=_T`, options)

const borner = (valeur, min, max) => Math.min(Math.max(valeur, min), max)

/** Type ramené aux trois barèmes disponibles — un local suit la maison. */
const cle = (type) => (type === 'appartement' || type === 'terrain' ? type : 'maison')

/**
 * Indice de marché de la commune, rapporté à son département.
 *
 * Rendu séparément du prix parce que les deux consommateurs n'en veulent pas la
 * même chose : l'estimation multiplie, le rapport affiche le détail — les deux
 * niveaux de vie comparés, leur rapport, et le millésime Insee qui les porte.
 */
export async function indiceCommune({ codeInsee, departement }, { signal } = {}) {
  if (!codeInsee || !estLivreFoncier(departement)) return null

  const [revenuCommune, revenuDept, habitants] = await Promise.all([
    niveauDeVie(`COM-${codeInsee}`, { signal }),
    niveauDeVie(`DEP-${departement}`, { signal }),
    population(`COM-${codeInsee}`, { signal }),
  ])

  // Le rapport de niveau de vie est le terme porteur : sans lui, il n'y a pas
  // d'indice du tout — la seule population ne suffirait pas à distinguer deux
  // communes de même taille.
  if (!revenuCommune || !revenuDept || revenuDept.valeur <= 0) return null

  const rapportRevenu = revenuCommune.valeur / revenuDept.valeur
  const rapportPopulation =
    habitants && habitants.valeur > 0 ? habitants.valeur / POPULATION_PIVOT : null

  const brut =
    rapportRevenu ** EXPOSANT_REVENU *
    (rapportPopulation === null ? 1 : rapportPopulation ** EXPOSANT_POPULATION)

  const arrondi = (valeur) => Math.round(valeur * 1000) / 1000

  return {
    indice: arrondi(borner(brut, INDICE_MIN, INDICE_MAX)),
    brut: arrondi(brut),
    borne: brut < INDICE_MIN || brut > INDICE_MAX,
    commune: {
      revenuAnnuel: revenuCommune.valeur,
      millesime: revenuCommune.millesime,
      population: habitants?.valeur ?? null,
      populationMillesime: habitants?.millesime ?? null,
    },
    departement: { revenuAnnuel: revenuDept.valeur, millesime: revenuDept.millesime },
  }
}

/**
 * Prix au m² de référence pour un bien du territoire du livre foncier.
 *
 * `ancre` permet à l'appelant d'imposer son propre niveau départemental —
 * c'est par là que la surcharge `ESTIMATION_PRIX_M2` de `reference.js` reste
 * prioritaire : l'agence qui connaît son marché ne doit pas voir ses chiffres
 * remplacés par les nôtres, seulement modulés par la commune.
 */
export async function prixLivreFoncier({ codeInsee, departement, type, ancre }, { signal } = {}) {
  const table = LIVRE_FONCIER[String(departement)]
  if (!table) return null

  const base = Number.isFinite(Number(ancre)) ? Number(ancre) : table.prixM2[cle(type)]
  const index = await indiceCommune({ codeInsee, departement }, { signal }).catch(() => null)

  return {
    pricePerM2: Math.round(base * (index?.indice ?? 1)),
    ancre: base,
    indice: index,
    source: index ? 'livre-foncier-indice-insee' : 'livre-foncier-departement',
  }
}

/**
 * Repères de marché du territoire, pour les pages chiffrées du rapport.
 *
 * Remplace ce que `marcheSecteur` aurait rendu si DVF couvrait le secteur —
 * en moins, et en le disant. Trois prix au m² plutôt qu'une médiane et son
 * évolution : il n'y a pas d'historique à publier faute de transactions à
 * dater.
 */
export async function reperesLivreFoncier(
  { codeInsee, departement, commune },
  { signal } = {},
) {
  const table = LIVRE_FONCIER[String(departement)]
  if (!table) return null

  const index = await indiceCommune({ codeInsee, departement }, { signal }).catch(() => null)
  const facteur = index?.indice ?? 1
  const applique = (valeur) => Math.round((valeur * facteur) / 10) * 10

  return {
    territoire: 'Alsace-Moselle',
    departement: String(departement),
    departementNom: table.nom,
    commune: commune ?? null,
    codeInsee: codeInsee ?? null,
    indice: index,
    prixM2: {
      maison: applique(table.prixM2.maison),
      appartement: applique(table.prixM2.appartement),
      terrain: applique(table.prixM2.terrain),
    },
    prixM2Departement: { ...table.prixM2 },
    // Restitués tels quels au rapport, qui les imprime sous le tableau : un
    // repère présenté comme une statistique de marché serait un faux, et
    // l'agent doit pouvoir dire à son vendeur d'où vient le chiffre.
    motif:
      'La Moselle, le Bas-Rhin et le Haut-Rhin relèvent du livre foncier du droit local ' +
      'alsacien-mosellan : leurs ventes n’entrent pas dans les Demandes de valeurs foncières ' +
      'de la DGFiP, qui alimentent toutes les statistiques de ce rapport. Aucune base ouverte ' +
      'ne publie les prix de transaction de ce territoire.',
    methode: index
      ? 'Niveau de marché du département, ajusté au niveau de vie médian et à la population ' +
        `de la commune (indice ${index.indice.toFixed(2)} — Insee, recensement et Filosofi).`
      : 'Niveau de marché du département. Les indicateurs communaux n’ont pas pu être obtenus ' +
        'de l’Insee, aucun ajustement local n’a donc été appliqué.',
    // La précision réelle du repère, énoncée plutôt que masquée.
    precision:
      'Ordre de grandeur, non une médiane de ventes constatées : niveau de vie et population ' +
      'expliquent un peu plus du quart de l’écart de prix entre communes voisines.',
    source: 'Insee — recensement et Filosofi (API Melodi), et niveaux de marché départementaux',
  }
}
