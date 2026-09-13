// Environnement du bien — le bloc « cadre » de la page caractéristiques.
//
// Ce que l'agent déclare décrit le bien ; ce module décrit ce qu'il y a autour,
// et que personne n'a à saisir parce que les référentiels le savent déjà : une
// voie ferrée à cent mètres, une autoroute derrière la colline, la mer au bout
// de la rue, un massif boisé de l'autre côté.
//
// ── Une seule source, et c'est délibéré ───────────────────────────────────
//
// Tout vient de la BD TOPO® de l'IGN, par le WFS de la Géoplateforme — le même
// service que les orthophotos du repérage, les emprises bâties, et le relevé de
// secours des commodités. Trois raisons de ne pas y mêler OpenStreetMap ici,
// contrairement à `poi.js` :
//
//  1. Le réseau routier et ferré est ce que la BD TOPO® fait de mieux : c'est
//     un référentiel d'État levé par photogrammétrie, exhaustif et hiérarchisé
//     (`importance`), là où la couverture OSM du même réseau varie d'un
//     département à l'autre.
//  2. Il n'y a rien à nommer, seulement à compter. Les commodités doivent
//     s'appeler « École Cap Canaille » ; ici, la question est « y a-t-il une
//     voie rapide à moins de trois cents mètres ». Un décompte suffit.
//  3. Un décompte se demande à un WFS pour deux cent soixante octets —
//     `COUNT=1` avec la seule clé en propriété, et l'en-tête `numberMatched`
//     porte la réponse. Neuf questions coûtent alors moins qu'une seule requête
//     de commodités.
//
// ── Ce qui est déduit, et ce qui ne l'est pas ─────────────────────────────
//
// Le niveau sonore, la proximité du littoral et celle des espaces boisés se
// déduisent d'une distance mesurée : ce sont des faits, et ils descendent au
// rapport comme tels.
//
// La vue, l'exposition et la luminosité, non. Aucune base ne les publie, et
// elles ne se devinent pas d'une emprise au sol — un troisième étage plein sud
// peut être sombre parce que l'immeuble d'en face est plus haut. Elles sont
// donc demandées à l'agent, qui a visité (voir `EstimationCharacteristicsStep`),
// et ce module ne fait que les compléter : « Dégagée » déclaré devient
// « Dégagée, mer » quand le trait de côte est à trois cents mètres.
//
// Ne lève jamais : chaque question a son repli à `null`, et un champ non déduit
// s'affiche « Non renseigné » au rapport, où il reste modifiable comme le reste.

const WFS_ENDPOINT = 'https://data.geopf.fr/wfs/ows'

/** Budget par question. Elles partent toutes ensemble ; aucune ne doit traîner. */
const FETCH_TIMEOUT_MS = 5000

/**
 * Nombre d'objets d'une couche BD TOPO® dans un rayon, ou `null` sur panne.
 *
 * `COUNT=1` et `PROPERTYNAME=cleabs` : on ne veut pas les objets, on veut leur
 * nombre — que le service rend dans `numberMatched` quand bien même il n'en
 * renvoie qu'un, et sans sa géométrie. La réponse tient en trois cents octets
 * là où la même requête complète en pèse cent quarante mille.
 *
 * Attention à l'ordre des coordonnées : la couche est servie en latitude puis
 * longitude, à l'inverse de la convention GeoJSON employée partout ailleurs
 * dans le projet. Inversé, le filtre ne lève pas — il ne trouve simplement
 * jamais rien.
 */
async function compter(couche, { lat, lon, rayonM, filtre = null }, { signal } = {}) {
  const conditions = [`DWITHIN(geometrie,POINT(${lat} ${lon}),${rayonM},meters)`]
  if (filtre) conditions.push(filtre)

  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: `BDTOPO_V3:${couche}`,
    OUTPUTFORMAT: 'application/json',
    COUNT: '1',
    PROPERTYNAME: 'cleabs',
    CQL_FILTER: conditions.join(' AND '),
  })

  const budget = AbortSignal.timeout(FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(`${WFS_ENDPOINT}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, budget]) : budget,
    })
    if (!response.ok) throw new Error(`réponse ${response.status}`)

    const data = await response.json()
    const nombre = Number(data?.numberMatched)
    return Number.isFinite(nombre) ? nombre : null
  } catch (error) {
    if (signal?.aborted) throw error
    console.error('[environnement] BD TOPO indisponible —', couche, error?.message ?? error)
    return null
  }
}

/**
 * Les questions posées au référentiel, et les distances auxquelles elles le
 * sont.
 *
 * Les seuils ne sont pas des réglages libres : ils correspondent à des ordres
 * de grandeur acoustiques et d'usage courants dans l'expertise immobilière.
 * Une voie rapide s'entend jusqu'à trois cents mètres en terrain dégagé ; une
 * route départementale passante gêne à cent cinquante ; un trait de côte à
 * moins de quatre cents mètres met le bien « en bord de mer » au sens où
 * l'entend un acquéreur, jusqu'à un peu plus d'un kilomètre il le met « à
 * proximité du littoral ».
 *
 * `importance` hiérarchise le réseau routier de 1 (liaison européenne) à 5
 * (desserte locale) : les trois premiers niveaux sont les axes qui portent le
 * trafic de transit, et donc le bruit.
 */
const QUESTIONS = {
  autoroute: {
    couche: 'troncon_de_route',
    rayonM: 300,
    filtre: "nature IN ('Type autoroutier','Route à 2 chaussées')",
  },
  routeMajeureProche: {
    couche: 'troncon_de_route',
    rayonM: 150,
    filtre: "importance IN ('1','2','3')",
  },
  routeMajeure: {
    couche: 'troncon_de_route',
    rayonM: 400,
    filtre: "importance IN ('1','2','3')",
  },
  railProche: { couche: 'troncon_de_voie_ferree', rayonM: 200 },
  rail: { couche: 'troncon_de_voie_ferree', rayonM: 600 },
  merImmediate: { couche: 'limite_terre_mer', rayonM: 400 },
  mer: { couche: 'limite_terre_mer', rayonM: 1200 },
  boisProche: { couche: 'zone_de_vegetation', rayonM: 300 },
  parc: { couche: 'parc_ou_reserve', rayonM: 1000 },
}

/** Vrai si la question a trouvé quelque chose ; `false` sur zéro comme sur panne. */
const present = (valeur) => typeof valeur === 'number' && valeur > 0

/**
 * Niveau sonore présumé du secteur, et la raison qui le fonde.
 *
 * Le motif compte autant que le niveau : « Passant » sans explication est un
 * jugement, « Passant — axe routier structurant à moins de 150 m » est un
 * constat que l'agent peut confirmer ou corriger sur place. Les deux
 * descendent au rapport.
 *
 * Un référentiel muet ne rend pas « Calme » : il rend `null`. Déduire le calme
 * d'une panne de réseau serait la pire des réponses — c'est le champ que
 * l'acquéreur vérifiera le premier.
 */
function niveauSonore(reponses) {
  const connu = ['autoroute', 'routeMajeure', 'rail'].some(
    (cle) => typeof reponses[cle] === 'number',
  )
  if (!connu) return { niveau: null, motif: null }

  if (present(reponses.autoroute)) {
    return { niveau: 'Exposé', motif: 'Voie rapide ou route à deux chaussées à moins de 300 m.' }
  }
  if (present(reponses.railProche)) {
    return { niveau: 'Exposé', motif: 'Voie ferrée à moins de 200 m.' }
  }
  if (present(reponses.routeMajeureProche)) {
    return { niveau: 'Passant', motif: 'Axe routier structurant à moins de 150 m.' }
  }
  if (present(reponses.routeMajeure)) {
    return { niveau: 'Modéré', motif: 'Axe routier structurant entre 150 et 400 m.' }
  }
  if (present(reponses.rail)) {
    return { niveau: 'Modéré', motif: 'Voie ferrée entre 200 et 600 m.' }
  }

  return {
    niveau: 'Calme',
    motif: 'Ni voie rapide, ni axe structurant, ni voie ferrée dans le voisinage.',
  }
}

/** Rapport du bien à la mer, ou `null` — l'intérieur des terres n'a rien à dire. */
function littoral(reponses) {
  if (present(reponses.merImmediate)) {
    return { proximite: 'Bord de mer', vue: 'mer', distanceMax: 400 }
  }
  if (present(reponses.mer)) {
    return { proximite: 'À proximité du littoral', vue: null, distanceMax: 1200 }
  }
  return null
}

/** Espaces boisés et protégés du voisinage. */
function espacesVerts(reponses) {
  const connu = typeof reponses.boisProche === 'number' || typeof reponses.parc === 'number'
  if (!connu) return null

  if (present(reponses.boisProche)) return 'Espace boisé à moins de 300 m'
  if (present(reponses.parc)) return 'Parc ou espace naturel protégé à moins d’1 km'
  return 'Aucun espace boisé relevé dans le voisinage immédiat'
}

/**
 * Ce que les référentiels savent de l'environnement du bien.
 *
 * Les neuf questions partent ensemble : elles sont indépendantes, et les
 * enchaîner coûterait neuf allers-retours là où il n'en faut qu'un de temps.
 *
 * Rend `null` sans coordonnées — Monaco, où toute la chaîne cartographique
 * française s'arrête à la frontière.
 */
export async function fetchEnvironnement({ lat, lon }, { signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const cles = Object.keys(QUESTIONS)
  const valeurs = await Promise.all(
    cles.map((cle) =>
      compter(QUESTIONS[cle].couche, { lat, lon, ...QUESTIONS[cle] }, { signal }),
    ),
  )

  const reponses = Object.fromEntries(cles.map((cle, index) => [cle, valeurs[index]]))

  // Toutes les questions en panne : le bloc n'a rien à dire, et mieux vaut
  // qu'il le dise en ne rendant rien plutôt qu'en rendant des « Calme » et des
  // « Aucun espace boisé » qui seraient des affirmations sans fondement.
  if (valeurs.every((valeur) => valeur === null)) return null

  return {
    sonore: niveauSonore(reponses),
    littoral: littoral(reponses),
    espacesVerts: espacesVerts(reponses),
    source: '© IGN — BD TOPO® (Géoplateforme)',
  }
}

/**
 * Qualification d'un accès, d'après la distance de la commodité la plus proche.
 *
 * L'échelle est celle de la marche : trois cents mètres est le coin de la rue,
 * six cents une promenade, douze cents un quart d'heure à pied avec des
 * courses. Au-delà, l'équipement existe mais ne fait plus partie du quotidien
 * sans voiture — et c'est cela que le rapport doit dire.
 *
 * Une catégorie que la source de repli ne couvre pas rend `null` et non
 * « Éloigné » : la page distinguerait sinon un quartier sans transports d'un
 * relevé qui n'en a pas cherché.
 */
export function qualifierAcces(categorie) {
  if (!categorie || categorie.horsPortee) return null
  const distance = categorie.plusProcheM
  if (distance == null) return 'Éloigné'
  if (distance <= 300) return 'Excellent'
  if (distance <= 600) return 'Bon'
  if (distance <= 1200) return 'Standard'
  return 'Éloigné'
}
