// Points d'intérêt à proximité du bien — page « commodités » du rapport.
//
// ── Ce que la page exige, et ce qui l'empêchait ───────────────────────────
//
// La page porte une carte, un point coloré par commodité relevée, une couleur
// par catégorie. Elle n'a de sens que remplie : un rapport d'agence ne peut pas
// contenir une feuille disant « à compléter à la main » — c'est précisément le
// travail que l'outil est censé faire, et le vendeur a le document sous les
// yeux.
//
// Ce repli existait, et il se déclenchait trop souvent. La cause était unique :
// une seule source, Overpass, interrogée sur deux instances. Overpass est un
// service bénévole qui plafonne par adresse IP, refuse franchement quand il est
// saturé, et dont les miroirs tombent en maintenance à tour de rôle. Les deux
// instances refusant en même temps — ce qui arrive — la page sortait vide.
//
// ── Trois sources indépendantes, essayées dans l'ordre ────────────────────
//
//  1. **Overpass** (OpenStreetMap). La plus riche, et de loin : elle seule
//     ramène écoles, commerces et arrêts d'un même mouvement, avec leurs noms.
//     Deux instances.
//
//  2. **Photon** (komoot). Autre serveur, autre logiciel, mêmes données OSM :
//     son point d'entrée `/reverse` accepte un filtre `osm_tag` et un rayon,
//     ce qui suffit exactement à ce qu'on cherche. Une requête par catégorie.
//     Il n'a pas les faiblesses d'Overpass — pas de langage de requête à faire
//     exécuter, donc pas de calcul à refuser — et tombe rarement en même temps.
//
//  3. **La BD TOPO® de l'IGN**, par le WFS de la Géoplateforme. Ni
//     OpenStreetMap, ni bénévole : le référentiel de l'État, servi par le même
//     hôte que les orthophotos et le bâti dont l'outil se sert déjà à chaque
//     estimation. Sa couverture est plus étroite — elle ignore les arrêts de
//     bus, et le commerce de détail n'y est que partiel — mais elle ne
//     s'effondre pas, et une carte portant les écoles, les équipements publics
//     et les services d'un quartier vaut infiniment mieux qu'une page blanche.
//
// La première source qui répond l'emporte. Elles ne sont pas fusionnées : deux
// référentiels décrivent le même monde avec des découpages différents, et les
// mêler produirait des doublons qu'aucune règle simple ne rattraperait. La
// provenance du relevé descend au rapport, qui l'imprime en pied de page.
//
// ── Le rayon s'élargit plutôt que de rendre une carte vide ────────────────
//
// Cinq cents mètres est le bon rayon en ville : l'ordre de grandeur de ce qui
// se fait à pied. Dans un hameau, il ne contient rien — et une carte sans un
// point est aussi inutile qu'une page absente. Le relevé s'élargit donc, par
// paliers, jusqu'à trouver de quoi remplir la carte ; la page annonce le rayon
// réellement parcouru, qui n'est donc pas toujours le même d'un rapport à
// l'autre.
//
// L'appel part du navigateur, et c'est le seul bloc du rapport dans ce cas :
// tous les autres (DVF, Insee, BCE) restent assemblés par `api/rapport.js`.
// Overpass sert les requêtes des IP les plus sollicitées au ralenti avant de
// les refuser franchement ; derrière une fonction serverless, tout le trafic se
// concentrait sur les quelques IP de sortie de l'hébergeur, partagées avec le
// reste de sa clientèle. Depuis le navigateur, chaque visiteur consomme son
// propre quota. Les trois sources servent délibérément un en-tête CORS ouvert.

import { distanceM } from './geo.js'

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

const PHOTON_ENDPOINT = 'https://photon.komoot.io/reverse'

const IGN_WFS_ENDPOINT = 'https://data.geopf.fr/wfs/ows'

/** Mentions d'attribution imposées par les licences respectives. */
export const OSM_ATTRIBUTION = '© OpenStreetMap (ODbL)'
const PHOTON_ATTRIBUTION = '© OpenStreetMap (ODbL) — relevé Photon / komoot'
const IGN_ATTRIBUTION_POI = '© IGN — BD TOPO® (Géoplateforme)'

/**
 * Rayon interrogé en premier — l'ordre de grandeur de ce qui se fait à pied —
 * puis les élargissements successifs, tentés tant que rien n'a été trouvé.
 *
 * Deux kilomètres est le dernier palier : au-delà, on ne décrit plus un
 * voisinage mais une commune, et « le collège est à 4 km » n'est pas une
 * commodité de proximité. Une campagne réellement isolée rendra donc une carte
 * clairsemée — ce qui est l'information juste, et se lit d'un coup d'œil.
 */
export const POI_RADIUS_M = 500
const RAYONS = [POI_RADIUS_M, 1000, 2000]

/**
 * En deçà, la carte ne montre rien qui se lise comme un quartier — trois
 * pastilles est le minimum pour qu'une répartition apparaisse. Le rayon
 * s'élargit tant que ce compte n'est pas atteint, et le meilleur relevé
 * obtenu l'emporte si aucun palier n'y parvient.
 */
const MIN_POINTS = 3

/** Budget annoncé à Overpass dans la requête : au-delà, il abandonne seul. */
const OVERPASS_TIMEOUT_S = 10

/**
 * Budget client, par requête.
 *
 * Large, parce qu'il n'a plus à tenir dans le budget d'une fonction serverless
 * — seulement dans la patience de l'écran d'assemblage, qui attend sans limite.
 * Une instance en état de marche répond en moins de deux secondes ; ce délai ne
 * sert qu'à passer à la source suivante quand celle-ci ne répondra jamais.
 */
const FETCH_TIMEOUT_MS = 9000

/**
 * Résultats détaillés conservés par catégorie.
 *
 * Trois, et le chiffre vient de la mise en page : la feuille A4 est pleine, et
 * ces trois lignes par catégorie sont ce qui reste une fois la carte servie.
 * Elles en valaient quatre ; la quatrième a été rendue à la carte, qui est ce
 * que cette page doit d'abord montrer — une liste de noms se lit aussi bien
 * dans un moteur de recherche, la répartition d'un quartier ne se lit nulle
 * part ailleurs.
 *
 * Le décompte complet, lui, n'est pas plafonné : la page annonce « 10 arrêts à
 * moins de 500 m » et n'en nomme que les trois plus proches.
 */
const MAX_PAR_CATEGORIE = 3

/**
 * Points portés sur la carte, par catégorie.
 *
 * La liste détaillée nomme les quatre plus proches ; la carte, elle, montre
 * tout ce qui a été relevé — c'est même sa raison d'être : un quartier dense se
 * reconnaît à la densité de ses points, pas à un décompte. Le plafond ne sert
 * qu'à borner un centre-ville où les arrêts se comptent par dizaines, au-delà
 * desquels on ne distingue plus rien.
 *
 * Les points sans nom y figurent, contrairement à la liste : sur une carte, un
 * arrêt de bus anonyme est un arrêt de bus tout de même.
 */
const MAX_POINTS_CARTE = 40

// Aucun en-tête d'identification n'est posé ici, et ce n'est pas un oubli.
// `User-Agent` figure parmi les en-têtes interdits à `fetch` dans un
// navigateur : le poser ne le poserait pas, il ferait seulement échouer la
// requête. Il était en revanche indispensable du temps où l'appel partait de
// Node — `overpass-api.de` refusait l'agent générique d'un 406 muet, et seul le
// miroir Kumi répondait. Les instances publiques n'attendent d'identification
// que des clients automatisés ; le navigateur d'un utilisateur envoie déjà le
// sien, et c'est celui qu'elles veulent voir.

/**
 * Les trois catégories restituées, et leur traduction dans chacune des trois
 * sources.
 *
 * Un seul endroit décrit ce qu'est « une école » : les trois adaptateurs y
 * puisent, et une catégorie qu'on ajouterait n'a qu'une entrée à écrire ici.
 *
 *  - `overpass.filtres` — clauses Overpass QL, insérées telles quelles ;
 *    `overpass.retenir` rejoue le même tri à l'arrivée, la réponse mêlant
 *    toutes les catégories dans une seule liste sans dire quelle clause a
 *    ramené quel objet.
 *  - `photon.tags` — filtres `osm_tag`, combinés en « ou » par le service.
 *  - `bdtopo` — couche WFS et catégories BD TOPO® retenues, ou `null` quand le
 *    référentiel ne couvre pas la catégorie (c'est le cas des transports :
 *    la BD TOPO® ne cartographie pas les arrêts de bus).
 *
 * `detail` traduit un objet en libellé affichable, et chaque source a le sien —
 * les vocabulaires ne se recouvrent pas.
 */
const CATEGORIES = [
  {
    id: 'ecoles',
    label: 'Écoles',
    overpass: {
      filtres: ['["amenity"~"^(school|kindergarten)$"]'],
      retenir: (tags) => tags.amenity === 'school' || tags.amenity === 'kindergarten',
    },
    photon: { tags: ['amenity:school', 'amenity:kindergarten'] },
    bdtopo: { couche: 'zone_d_activite_ou_d_interet', categories: ['Science et enseignement'] },
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
    overpass: {
      filtres: [
        '["shop"~"^(supermarket|convenience|bakery|butcher|greengrocer|mall|department_store)$"]',
      ],
      retenir: (tags) => Boolean(tags.shop),
    },
    photon: {
      tags: [
        'shop:supermarket',
        'shop:convenience',
        'shop:bakery',
        'shop:butcher',
        'shop:greengrocer',
        'shop:mall',
        'shop:department_store',
      ],
    },
    // La BD TOPO® ne recense pas le commerce de détail — la catégorie
    // « Commerce et services » y est quasi vide en zone urbaine. Ce qu'elle
    // porte de plus proche relève des services publics du quotidien : la poste,
    // la mairie, l'hôpital. C'est une autre information, et la catégorie change
    // donc de nom dans le relevé plutôt que de faire passer une gendarmerie
    // pour une boulangerie.
    //
    // La liste de natures est un choix, pas un filet : sans elle, le
    // huitième arrondissement de Marseille rendait vingt-huit « établissements
    // extraterritoriaux » — les consulats — en tête des commodités de
    // proximité. Casernes, enceintes militaires et maisons de retraite sont
    // écartées pour la même raison : ce ne sont pas des services qu'on utilise.
    bdtopo: {
      couche: 'zone_d_activite_ou_d_interet',
      categories: ['Commerce et services', 'Administratif ou militaire', 'Santé'],
      natures: [
        'Poste',
        'Mairie',
        'Police',
        'Gendarmerie',
        'Caserne de pompiers',
        'Hôpital',
        'Etablissement hospitalier',
        'Marché',
        'Centre commercial',
      ],
      label: 'Services de proximité',
    },
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
    overpass: {
      filtres: [
        '["highway"="bus_stop"]',
        '["railway"~"^(tram_stop|station|subway_entrance)$"]',
        '["public_transport"="station"]',
      ],
      retenir: (tags) =>
        tags.highway === 'bus_stop' ||
        ['tram_stop', 'station', 'subway_entrance'].includes(tags.railway) ||
        tags.public_transport === 'station',
    },
    photon: {
      tags: [
        'highway:bus_stop',
        'railway:station',
        'railway:tram_stop',
        'railway:subway_entrance',
        'public_transport:station',
      ],
    },
    // La BD TOPO® ignore les arrêts de bus, mais pas les gares, les stations de
    // métro et de tramway : sur un secteur desservi, le repli reste parlant. Sur
    // un secteur qui ne l'est que par autobus, la catégorie ressort vide — et
    // c'est une lacune de la source, que la page signale comme telle.
    bdtopo: {
      couche: 'equipement_de_transport',
      natures: [
        'Gare voyageurs',
        'Gare',
        'Station de métro',
        'Station de tramway',
        'Gare routière',
        'Station de téléphérique',
      ],
      label: 'Transports (hors autobus)',
      // Une catégorie que la source ne couvre qu'en partie : trouver une gare
      // est une information, n'en trouver aucune n'en est pas une — il peut
      // très bien y avoir six arrêts de bus que la BD TOPO® ne cartographie
      // pas. Le vide est alors signalé comme une lacune de la source, et non
      // comme un quartier mal desservi.
      partiel: true,
    },
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

/** Relevé vide d'une catégorie — la forme est la même, remplie ou non. */
const categorieVide = ({ id, label }) => ({
  id,
  label,
  total: 0,
  plusProcheM: null,
  lieux: [],
  points: [],
})

// --- Source 1 : Overpass ---------------------------------------------------

/**
 * Requête Overpass QL — tout ce qui nous intéresse dans un disque.
 *
 * `nwr` interroge d'un coup nœuds, chemins et relations : une école est un
 * chemin (son emprise), un arrêt de bus un nœud, un centre commercial parfois
 * une relation. `out center` renvoie, pour les objets surfaciques, le centre de
 * l'emprise plutôt que sa géométrie complète — il ne s'agit que de mesurer une
 * distance, pas de tracer un contour.
 */
function overpassQuery(lat, lon, rayonM) {
  const autour = `(around:${rayonM},${lat},${lon})`
  const clauses = CATEGORIES.flatMap((categorie) =>
    categorie.overpass.filtres.map((filtre) => `nwr${filtre}${autour};`),
  )

  return `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(${clauses.join('')});out center tags 300;`
}

/** Coordonnées d'un élément Overpass — nœud direct, ou centre d'une emprise. */
function positionOverpass(element) {
  const lat = element.lat ?? element.center?.lat
  const lon = element.lon ?? element.center?.lon
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

/** Interroge une instance. Lève sur panne, refus (429), ou réponse illisible. */
async function queryOverpass(endpoint, query, signal) {
  const budget = AbortSignal.timeout(FETCH_TIMEOUT_MS)

  const response = await fetch(endpoint, {
    method: 'POST',
    // Overpass attend sa requête dans un champ `data` de formulaire ; le corps
    // brut lui vaut un refus sur certaines instances.
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
 * Relevé complet par Overpass, ou `null` si aucune instance n'a répondu.
 *
 * Une seule requête ramène les trois catégories, qu'il faut ensuite redémêler :
 * la réponse ne dit pas quelle clause a ramené quel objet.
 */
async function releveOverpass(lat, lon, rayonM, { signal }) {
  const query = overpassQuery(lat, lon, rayonM)

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const elements = await queryOverpass(endpoint, query, signal)

      return CATEGORIES.map((categorie) => ({
        categorie,
        lieux: elements
          .filter((element) => categorie.overpass.retenir(element.tags ?? {}))
          .map((element) => {
            const point = positionOverpass(element)
            if (!point) return null
            return {
              nom: element.tags?.name ?? null,
              type: categorie.detail(element.tags ?? {}),
              ...point,
            }
          })
          .filter(Boolean),
      }))
    } catch (error) {
      if (signal?.aborted) throw error
      console.error(`[commodités] Overpass ${endpoint} —`, error?.message ?? error)
    }
  }

  return null
}

// --- Source 2 : Photon -----------------------------------------------------

/**
 * Libellé d'un objet Photon, à partir du couple clé/valeur OSM qu'il renvoie.
 *
 * Photon ne rend pas les étiquettes complètes de l'objet — seulement l'`osm_key`
 * et l'`osm_value` qui l'ont fait retenir. On reconstitue donc le minimum
 * d'étiquettes dont `detail` a besoin, plus le nom, dont la catégorie « écoles »
 * se sert pour distinguer un lycée d'une maternelle.
 */
const tagsPhoton = (proprietes) => ({
  [proprietes.osm_key]: proprietes.osm_value,
  name: proprietes.name ?? null,
})

/** Une requête par catégorie : les filtres `osm_tag` s'y combinent en « ou ». */
async function categoriePhoton(categorie, lat, lon, rayonM, { signal }) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    // Photon compte en kilomètres. Son rayon est un filtre approché — les
    // distances exactes sont recalculées à l'arrivée, comme pour les autres
    // sources.
    radius: String(rayonM / 1000),
    limit: '50',
    lang: 'fr',
  })
  for (const tag of categorie.photon.tags) params.append('osm_tag', tag)

  const budget = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  const response = await fetch(`${PHOTON_ENDPOINT}?${params}`, {
    headers: { Accept: 'application/json' },
    signal: signal ? AbortSignal.any([signal, budget]) : budget,
  })

  if (!response.ok) throw new Error(`Photon — réponse ${response.status}`)

  const data = await response.json().catch(() => null)
  if (!Array.isArray(data?.features)) throw new Error('Photon — réponse inattendue')

  return data.features
    .map((feature) => {
      const [lonPoint, latPoint] = feature.geometry?.coordinates ?? []
      if (!Number.isFinite(latPoint) || !Number.isFinite(lonPoint)) return null

      const proprietes = feature.properties ?? {}
      return {
        nom: proprietes.name ?? null,
        type: categorie.detail(tagsPhoton(proprietes)),
        lat: latPoint,
        lon: lonPoint,
      }
    })
    .filter(Boolean)
}

/**
 * Relevé complet par Photon, ou `null` si le service n'a rien rendu du tout.
 *
 * Les trois requêtes partent ensemble et sont indépendantes : une catégorie en
 * échec — un filtre refusé, une réponse tronquée — laisse les deux autres à
 * leur place. Le relevé n'est abandonné que si les trois échouent, ce qui
 * signale le service en panne et non un quartier sans commerces.
 */
async function relevePhoton(lat, lon, rayonM, { signal }) {
  const resultats = await Promise.all(
    CATEGORIES.map((categorie) =>
      categoriePhoton(categorie, lat, lon, rayonM, { signal }).catch((error) => {
        if (signal?.aborted) throw error
        console.error(`[commodités] Photon ${categorie.id} —`, error?.message ?? error)
        return null
      }),
    ),
  )

  if (resultats.every((lieux) => lieux === null)) return null

  return CATEGORIES.map((categorie, index) => ({
    categorie,
    lieux: resultats[index] ?? [],
  }))
}

// --- Source 3 : BD TOPO® de l'IGN ------------------------------------------

/**
 * Centre approché d'une géométrie GeoJSON.
 *
 * Les zones d'activité de la BD TOPO® sont des polygones — l'emprise de
 * l'école, pas un point posé dessus. La moyenne des sommets suffit : il s'agit
 * de poser une pastille sur une carte de quartier, pas de calculer un
 * barycentre exact.
 */
function centreGeometrie(geometry) {
  const sommets = []
  const parcourir = (noeud) => {
    if (!Array.isArray(noeud)) return
    if (typeof noeud[0] === 'number' && typeof noeud[1] === 'number') {
      sommets.push(noeud)
      return
    }
    for (const enfant of noeud) parcourir(enfant)
  }
  parcourir(geometry?.coordinates)

  if (sommets.length === 0) return null

  const somme = sommets.reduce((acc, [lon, lat]) => [acc[0] + lon, acc[1] + lat], [0, 0])
  return { lon: somme[0] / sommets.length, lat: somme[1] / sommets.length }
}

/** Une requête WFS par catégorie couverte par le référentiel. */
async function categorieBdTopo(categorie, lat, lon, rayonM, { signal }) {
  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: `BDTOPO_V3:${categorie.bdtopo.couche}`,
    OUTPUTFORMAT: 'application/json',
    SRSNAME: 'EPSG:4326',
    COUNT: '150',
    // Attention à l'ordre : la couche est servie en latitude puis longitude, à
    // l'inverse de la convention GeoJSON employée partout ailleurs. Inversé, le
    // filtre ne lève pas — il ne trouve simplement jamais rien.
    CQL_FILTER: `DWITHIN(geometrie,POINT(${lat} ${lon}),${rayonM},meters)`,
  })

  const budget = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  const response = await fetch(`${IGN_WFS_ENDPOINT}?${params}`, {
    headers: { Accept: 'application/json' },
    signal: signal ? AbortSignal.any([signal, budget]) : budget,
  })

  if (!response.ok) throw new Error(`IGN WFS — réponse ${response.status}`)

  const data = await response.json().catch(() => null)
  if (!Array.isArray(data?.features)) throw new Error('IGN WFS — réponse inattendue')

  const categoriesRetenues = categorie.bdtopo.categories
    ? new Set(categorie.bdtopo.categories)
    : null
  const naturesRetenues = categorie.bdtopo.natures ? new Set(categorie.bdtopo.natures) : null

  return data.features
    .filter((feature) => {
      const p = feature.properties ?? {}
      // Un objet hors service, ou fictif — un rond-point nommé, un contour de
      // travail — n'est pas une commodité.
      if (p.fictif === true || p.etat_de_l_objet === 'Détruit') return false
      if (categoriesRetenues && !categoriesRetenues.has(p.categorie)) return false
      if (naturesRetenues && !naturesRetenues.has(p.nature)) return false
      return true
    })
    .map((feature) => {
      const centre = centreGeometrie(feature.geometry)
      if (!centre) return null

      const p = feature.properties ?? {}
      return {
        nom: p.toponyme ?? null,
        // La BD TOPO® nomme sa nature elle-même, et mieux qu'une traduction
        // depuis OSM : « Enseignement primaire », « Maison de retraite ».
        type: p.nature_detaillee || p.nature || categorie.label,
        ...centre,
      }
    })
    .filter(Boolean)
}

/** Relevé par la BD TOPO®, ou `null` si le service n'a rien rendu. */
async function releveBdTopo(lat, lon, rayonM, { signal }) {
  const couvertes = CATEGORIES.filter((categorie) => categorie.bdtopo)

  const resultats = await Promise.all(
    couvertes.map((categorie) =>
      categorieBdTopo(categorie, lat, lon, rayonM, { signal }).catch((error) => {
        if (signal?.aborted) throw error
        console.error(`[commodités] IGN ${categorie.id} —`, error?.message ?? error)
        return null
      }),
    ),
  )

  if (resultats.every((lieux) => lieux === null)) return null

  return CATEGORIES.map((categorie) => {
    const index = couvertes.indexOf(categorie)
    const lieux = index === -1 ? [] : (resultats[index] ?? [])

    return {
      categorie,
      lieux,
      // Ni couverte du tout, ou couverte en partie et revenue vide : dans les
      // deux cas la page doit distinguer « rien à proximité » de « la source ne
      // sait pas ».
      horsPortee: index === -1 || (categorie.bdtopo?.partiel === true && lieux.length === 0),
      label: categorie.bdtopo?.label ?? categorie.label,
    }
  })
}

// --- Assemblage ------------------------------------------------------------

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
 * Met en forme ce qu'une source a rendu : distances calculées, tri, doublons
 * écartés, décomptes.
 *
 * Le filtrage sur le rayon est refait ici quelle que soit la source, et pas par
 * méfiance : Photon travaille en kilomètres entiers, la BD TOPO® mesure au
 * contour du polygone quand nous mesurons à son centre. Sans ce recadrage, deux
 * sources ne rendraient pas le même quartier.
 */
function mettreEnForme(brut, lat, lon, rayonM) {
  return brut.map(({ categorie, lieux, horsPortee = false, label }) => {
    const mesures = lieux
      .map((lieu) => ({ ...lieu, distanceM: Math.round(distanceM(lat, lon, lieu.lat, lieu.lon)) }))
      .filter((lieu) => lieu.distanceM <= rayonM)
      .sort((a, b) => a.distanceM - b.distanceM)

    const uniques = dedoublonne(mesures)

    return {
      id: categorie.id,
      label: label ?? categorie.label,
      total: uniques.length,
      plusProcheM: uniques[0]?.distanceM ?? null,
      // La source ne couvre pas cette catégorie : à distinguer, sur la page,
      // d'un quartier qui n'en compterait aucune.
      horsPortee,
      // Un arrêt de bus sans nom ne mérite pas une ligne à lui : il compte dans
      // le total, il ne figure pas au détail.
      lieux: uniques.filter((lieu) => lieu.nom).slice(0, MAX_PAR_CATEGORIE),
      // Ce que la carte porte : tout le relevé, nommé ou non, dans la limite
      // du lisible.
      points: uniques.slice(0, MAX_POINTS_CARTE),
    }
  })
}

const SOURCES = [
  { id: 'overpass', releve: releveOverpass, attribution: OSM_ATTRIBUTION },
  { id: 'photon', releve: relevePhoton, attribution: PHOTON_ATTRIBUTION },
  { id: 'ign', releve: releveBdTopo, attribution: IGN_ATTRIBUTION_POI },
]

/**
 * Points d'intérêt autour du bien, rangés par catégorie.
 *
 * Chaque catégorie porte son décompte, la distance du plus proche, le détail
 * des quelques premiers — c'est ce détail qui fait la page : « École maternelle
 * Cap Canaille, 210 m » vaut mieux que « 3 écoles » — et la position de tous,
 * dont la page tire sa carte.
 *
 * Les trois sources sont essayées dans l'ordre, à chaque palier de rayon : on
 * ne s'élargit qu'après avoir épuisé les trois, faute de quoi un Overpass
 * momentanément saturé ferait rendre à Photon un relevé de deux kilomètres là
 * où cinq cents mètres suffisaient.
 *
 * Ne lève jamais hors annulation, et `disponible` ne vaut faux que si les trois
 * sources ont refusé de répondre à tous les paliers — cas qui suppose une
 * panne de réseau côté client bien plus qu'une indisponibilité des services. La
 * page, elle, n'a plus de repli textuel : elle affiche sa carte dans tous les
 * cas (voir `PageCommodites`).
 */
export async function fetchPointsInteret(lat, lon, { signal } = {}) {
  const vide = {
    rayonM: POI_RADIUS_M,
    categories: CATEGORIES.map(categorieVide),
    attribution: OSM_ATTRIBUTION,
    source: null,
    disponible: false,
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return vide

  /**
   * Le relevé le plus fourni obtenu jusqu'ici. À égalité, le premier gagne —
   * c'est-à-dire le rayon le plus serré, donc le voisinage le plus juste.
   */
  let meilleur = null
  const total = (releve) => releve.categories.reduce((somme, c) => somme + c.total, 0)

  for (const rayonM of RAYONS) {
    for (const source of SOURCES) {
      const brut = await source.releve(lat, lon, rayonM, { signal }).catch((error) => {
        if (signal?.aborted) throw error
        console.error(`[commodités] ${source.id} —`, error?.message ?? error)
        return null
      })

      if (brut === null) continue

      const releve = {
        rayonM,
        categories: mettreEnForme(brut, lat, lon, rayonM),
        attribution: source.attribution,
        source: source.id,
        disponible: true,
      }

      if (total(releve) >= MIN_POINTS) return releve

      // Une source qui répond mais ne trouve presque rien n'est pas une source
      // en panne : on la retient, et on continue — d'abord vers les autres
      // sources, qui couvrent des objets différents, puis vers le palier de
      // rayon suivant.
      if (meilleur === null || total(releve) > total(meilleur)) meilleur = releve
    }
  }

  return meilleur ?? vide
}
