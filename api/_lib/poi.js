// Points d'intérêt à proximité du bien — page « commodités » du rapport.
//
// Source : OpenStreetMap, interrogé par l'API Overpass. C'est la seule base
// ouverte qui couvre écoles, commerces et arrêts de transport d'un même
// mouvement et à l'échelle de la rue ; la Base permanente des équipements de
// l'Insee, plus officielle, s'arrête à la commune — inutilisable pour dire ce
// qu'il y a à cinq minutes à pied.
//
// L'appel part d'ici, c'est-à-dire de la fonction serverless, à la différence
// du repérage des bâtiments monégasques qui interroge Overpass depuis le
// navigateur (voir `src/lib/osm.js` côté référence). Le compromis n'est pas le
// même : Overpass plafonne par adresse IP, et derrière une fonction serverless
// tout le trafic se concentre sur les quelques IP de sortie de l'hébergeur. La
// requête est ici bien plus légère qu'un relevé d'emprises — un rayon de 500 m,
// trois familles d'objets, quelques dizaines de résultats — et elle n'est tirée
// qu'une fois par rapport, là où la carte en déclenche une par déplacement.
// Deux instances sont essayées, et l'échec des deux laisse simplement la page
// vide.

import { distanceM } from './geo.js'

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

/** Mention d'attribution imposée par la licence ODbL. */
export const OSM_ATTRIBUTION = '© OpenStreetMap (ODbL)'

/** Rayon interrogé — l'ordre de grandeur de ce qui se fait à pied. */
export const POI_RADIUS_M = 500

/** Budget annoncé à Overpass dans la requête : au-delà, il abandonne seul. */
const OVERPASS_TIMEOUT_S = 10

/**
 * Budget client, par instance.
 *
 * Court, et pour une raison précise : deux instances sont essayées l'une après
 * l'autre, et leur somme doit tenir dans le budget global de la fonction
 * (voir `BUDGET_MS` dans `api/rapport.js`). À six secondes chacune, un premier
 * miroir en panne consommait tout le budget et le second était interrompu en
 * plein vol — la page des commodités sortait vide alors qu'un serveur
 * répondait. En pratique, une instance en état de marche répond en moins de
 * deux secondes.
 */
const FETCH_TIMEOUT_MS = 3500

/**
 * Résultats détaillés conservés par catégorie.
 *
 * Quatre, et le chiffre vient de la mise en page : trois catégories de quatre
 * lignes remplissent la page « commodités » sans la faire déborder sur une
 * seconde feuille A4. Le décompte complet, lui, n'est pas plafonné — la page
 * annonce « 10 arrêts à moins de 500 m » et n'en nomme que les quatre plus
 * proches.
 */
const MAX_PAR_CATEGORIE = 4

/**
 * En-tête d'identification, exigé — pas seulement recommandé.
 *
 * `fetch` sous Node annonce un agent générique, qu'`overpass-api.de` refuse
 * d'un 406 sans autre explication : la requête part, revient en erreur, et rien
 * dans le corps ne dit que c'est l'en-tête qui la fait rejeter. Le miroir Kumi,
 * lui, l'accepte — de sorte que sans cette ligne le repli fonctionnerait, en
 * masquant que l'instance principale n'est jamais atteinte.
 *
 * C'est par ailleurs la règle d'usage des instances Overpass publiques :
 * s'identifier, pour qu'un trafic anormal puisse être imputé plutôt que
 * l'ensemble des IP de sortie de l'hébergeur bloqué d'un bloc.
 */
// ASCII strictement : un en-tête HTTP est une suite d'octets, et l'apostrophe
// typographique du reste du code y ferait échouer la requête avant même de
// partir.
const USER_AGENT = 'barnes-estimation/1.0 (outil estimation immobiliere)'

/**
 * Catégories restituées, et les mots-clés OpenStreetMap qui les composent.
 *
 * `filtre` est écrit en Overpass QL et sert tel quel dans la requête ;
 * `retenir` rejoue le même tri côté serveur, parce que la réponse mélange
 * toutes les catégories dans une seule liste d'éléments — Overpass ne dit pas
 * quelle clause a ramené quel objet.
 */
const CATEGORIES = [
  {
    id: 'ecoles',
    label: 'Écoles',
    filtre: '["amenity"~"^(school|kindergarten)$"]',
    retenir: (tags) => tags.amenity === 'school' || tags.amenity === 'kindergarten',
    // Les niveaux sont distingués à l'affichage : une maternelle et un lycée
    // ne pèsent pas de la même façon dans le choix d'une famille.
    // Le nom départage ce que les mots-clés ne disent pas : `amenity=school`
    // couvre en France de la maternelle au lycée, et `isced:level` n'est
    // renseigné que sur une minorité d'établissements.
    detail: (tags) => {
      const nom = tags.name ?? ''
      if (tags.amenity === 'kindergarten' || /maternelle/i.test(nom)) return 'Maternelle'
      if (/lycée/i.test(nom)) return 'Lycée'
      if (/collège/i.test(nom)) return 'Collège'
      if (tags['isced:level']?.startsWith('1') || /élémentaire|primaire/i.test(nom)) {
        return 'Élémentaire'
      }
      return 'École'
    },
  },
  {
    id: 'commerces',
    label: 'Commerces',
    filtre:
      '["shop"~"^(supermarket|convenience|bakery|butcher|greengrocer|mall|department_store)$"]',
    retenir: (tags) => Boolean(tags.shop),
    detail: (tags) =>
      ({
        supermarket: 'Supermarché',
        convenience: 'Supérette',
        bakery: 'Boulangerie',
        butcher: 'Boucherie',
        greengrocer: 'Primeur',
        mall: 'Centre commercial',
        department_store: 'Grand magasin',
      })[tags.shop] ?? 'Commerce',
  },
  {
    id: 'transports',
    label: 'Transports',
    filtre: null, // Trois clauses distinctes, voir `TRANSPORT_FILTRES`.
    retenir: (tags) =>
      tags.highway === 'bus_stop' ||
      ['tram_stop', 'station', 'subway_entrance'].includes(tags.railway) ||
      tags.public_transport === 'station',
    detail: (tags) =>
      tags.highway === 'bus_stop'
        ? 'Arrêt de bus'
        : tags.railway === 'tram_stop'
          ? 'Tramway'
          : tags.railway === 'subway_entrance'
            ? 'Métro'
            : 'Gare',
  },
]

const TRANSPORT_FILTRES = [
  '["highway"="bus_stop"]',
  '["railway"~"^(tram_stop|station|subway_entrance)$"]',
  '["public_transport"="station"]',
]

/**
 * Requête Overpass QL — tout ce qui nous intéresse dans un disque.
 *
 * `nwr` interroge d'un coup nœuds, chemins et relations : une école est un
 * chemin (son emprise), un arrêt de bus un nœud, un centre commercial parfois
 * une relation. `out center` renvoie, pour les objets surfaciques, le centre de
 * l'emprise plutôt que sa géométrie complète — il ne s'agit que de mesurer une
 * distance, pas de tracer un contour.
 */
function overpassQuery(lat, lon) {
  const autour = `(around:${POI_RADIUS_M},${lat},${lon})`
  const clauses = [
    ...CATEGORIES.filter((c) => c.filtre).map((c) => `nwr${c.filtre}${autour};`),
    ...TRANSPORT_FILTRES.map((filtre) => `nwr${filtre}${autour};`),
  ]

  return `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(${clauses.join('')});out center tags 300;`
}

/** Coordonnées d'un élément Overpass — nœud direct, ou centre d'une emprise. */
function position(element) {
  const lat = element.lat ?? element.center?.lat
  const lon = element.lon ?? element.center?.lon
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

/** Interroge une instance. Lève sur panne, refus (429), ou réponse illisible. */
async function queryOverpass(endpoint, query, signal) {
  const budget = AbortSignal.timeout(FETCH_TIMEOUT_MS)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: new URLSearchParams({ data: query }),
    signal: signal ? AbortSignal.any([signal, budget]) : budget,
  })

  if (!response.ok) throw new Error(`Overpass — réponse ${response.status}`)

  const data = await response.json().catch(() => null)
  // Une instance saturée répond parfois 200 avec un rapport d'erreur en guise
  // de corps : c'est la présence d'`elements` qui fait foi, pas le statut.
  if (!Array.isArray(data?.elements)) throw new Error('Overpass — réponse inattendue')

  return data.elements
}

/**
 * Écarte les doublons de même nom et de même nature, en gardant le plus proche.
 *
 * OpenStreetMap pose un objet par quai : un arrêt de bus desservi dans les deux
 * sens y figure deux fois, à quelques mètres d'écart et sous le même nom. Les
 * compter deux fois gonflerait la desserte du quartier du simple au double, et
 * la liste afficherait « Augustin Isnard » juste au-dessus d'« Augustin
 * Isnard ». Les objets sans nom sont laissés tels quels : rien ne permet de
 * dire s'ils font double emploi.
 *
 * La liste est déjà triée par distance à l'appel, donc le premier retenu est
 * bien le plus proche.
 */
function dedoublonne(lieux) {
  const vus = new Set()

  return lieux.filter((lieu) => {
    if (!lieu.nom) return true
    const cle = `${lieu.type}|${lieu.nom}`
    if (vus.has(cle)) return false
    vus.add(cle)
    return true
  })
}

/**
 * Points d'intérêt dans un rayon de 500 m autour du bien, rangés par catégorie.
 *
 * Chaque catégorie porte son décompte, la distance du plus proche, et le détail
 * des quelques premiers — c'est ce détail qui fait la page : « École maternelle
 * Cap Canaille, 210 m » vaut mieux que « 3 écoles ».
 *
 * Ne lève jamais hors annulation : une page de commodités vide est une page,
 * une erreur au milieu d'un rapport n'en est pas une.
 */
export async function fetchPointsInteret(lat, lon, { signal } = {}) {
  const vide = {
    rayonM: POI_RADIUS_M,
    categories: CATEGORIES.map(({ id, label }) => ({ id, label, total: 0, plusProcheM: null, lieux: [] })),
    attribution: OSM_ATTRIBUTION,
    disponible: false,
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return vide

  const query = overpassQuery(lat, lon)
  let elements = null

  for (const endpoint of ENDPOINTS) {
    try {
      elements = await queryOverpass(endpoint, query, signal)
      break
    } catch (error) {
      if (signal?.aborted) throw error
      console.error(`[rapport] Overpass ${endpoint} —`, error?.message ?? error)
    }
  }

  if (elements === null) return vide

  const categories = CATEGORIES.map((categorie) => {
    const lieux = elements
      .filter((element) => categorie.retenir(element.tags ?? {}))
      .map((element) => {
        const point = position(element)
        if (!point) return null

        return {
          nom: element.tags?.name ?? null,
          type: categorie.detail(element.tags ?? {}),
          distanceM: Math.round(distanceM(lat, lon, point.lat, point.lon)),
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceM - b.distanceM)

    const uniques = dedoublonne(lieux)

    return {
      id: categorie.id,
      label: categorie.label,
      total: uniques.length,
      plusProcheM: uniques[0]?.distanceM ?? null,
      // Un arrêt de bus sans nom ne mérite pas une ligne à lui : il compte dans
      // le total, il ne figure pas au détail.
      lieux: uniques.filter((lieu) => lieu.nom).slice(0, MAX_PAR_CATEGORIE),
    }
  })

  return { rayonM: POI_RADIUS_M, categories, attribution: OSM_ATTRIBUTION, disponible: true }
}
