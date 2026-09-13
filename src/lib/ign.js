// Fonds de carte et données bâtiment de la Géoplateforme IGN — service public,
// licence ouverte Etalab, sans clé ni quota déclaré.
// https://geoservices.ign.fr/services-geoplateforme-diffusion

import { boundingBox, pointInRing } from './geo.js'

/**
 * Orthophotographie IGN en WMTS. Le jeu de tuiles « PM » est la pyramide
 * Web Mercator standard : les indices WMTS se confondent avec ceux d'un fond
 * XYZ classique, ce qui permet de l'utiliser tel quel dans Leaflet.
 */
export const ORTHO_TILE_URL =
  'https://data.geopf.fr/wmts' +
  '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'

/**
 * Dernier niveau réellement photographié (~20 cm/pixel). Au-delà, Leaflet
 * agrandit la tuile du niveau 19 au lieu de demander une dalle inexistante,
 * qui reviendrait en 404.
 */
export const ORTHO_MAX_NATIVE_ZOOM = 19

/**
 * Plan IGN v2 — le fond cartographique dessiné, par opposition à la
 * photographie.
 *
 * Il sert la carte des commodités du rapport, et lui seul convient : sur une
 * orthophoto, une pastille de couleur posée sur des toitures et de la
 * végétation ne se rattache à rien. Le plan, lui, montre les rues et leurs
 * noms — c'est ce qui permet de lire « l'école est de l'autre côté du
 * boulevard » plutôt que « l'école est à 210 m ».
 *
 * Même service, même licence ouverte, même pyramide Web Mercator que
 * l'orthophoto ci-dessus : aucune clé, et des indices de tuiles directement
 * utilisables par Leaflet.
 */
export const PLAN_TILE_URL =
  'https://data.geopf.fr/wmts' +
  '?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png' +
  '&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'

/** Dernier niveau dessiné du Plan IGN v2. */
export const PLAN_MAX_NATIVE_ZOOM = 19

// --- Vue aérienne figée ----------------------------------------------------

const WMS_ENDPOINT = 'https://data.geopf.fr/wms-r/wms'

/**
 * Mètres par degré de latitude. La valeur varie de quelques dixièmes de
 * pour cent selon la latitude ; à l'échelle d'une vue de quartier, l'écart est
 * inférieur au pixel.
 */
const M_PAR_DEGRE = 111320

/**
 * Vue aérienne figée d'un point, en une seule image JPEG.
 *
 * Le rapport ne peut pas embarquer la carte Leaflet du repérage : elle charge
 * ses dalles à l'exécution, ne s'imprime pas de façon fiable — le navigateur
 * n'attend pas les tuiles avant de composer la page — et n'a aucune raison
 * d'être manipulable une fois le bien choisi. Le service WMS de la même
 * Géoplateforme rend la vue d'un bloc, à la dimension demandée : une image
 * ordinaire, qui s'imprime comme telle.
 *
 * `spanM` est l'étendue couverte par la hauteur de l'image. La largeur en
 * découle par le rapport de forme, corrigé du cosinus de la latitude : un degré
 * de longitude vaut ~0,73 degré de latitude à la hauteur de Marseille, et
 * l'ignorer étirerait la photo horizontalement.
 */
export function orthoImageUrl(lat, lon, { width = 1000, height = 700, spanM = 320 } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const demiLat = spanM / 2 / M_PAR_DEGRE
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.01)
  const demiLon = (demiLat * (width / height)) / cos

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: 'ORTHOIMAGERY.ORTHOPHOTOS',
    STYLES: '',
    FORMAT: 'image/jpeg',
    // En WMS 1.3.0 et EPSG:4326, l'emprise s'écrit latitude d'abord — à
    // l'inverse de l'ordre GeoJSON employé partout ailleurs ici. Inversée,
    // la requête ne lève pas : elle renvoie une image d'ailleurs.
    CRS: 'EPSG:4326',
    BBOX: [lat - demiLat, lon - demiLon, lat + demiLat, lon + demiLon].join(','),
    WIDTH: String(width),
    HEIGHT: String(height),
  })

  return `${WMS_ENDPOINT}?${params}`
}

/**
 * Cadre figé du Plan IGN, et de quoi y poser des points.
 *
 * ── Pourquoi une image, alors qu'il y a déjà une carte ────────────────────
 *
 * La carte des commodités du rapport est une carte Leaflet, et elle s'affiche
 * parfaitement — à l'écran. À l'impression, elle disparaissait.
 *
 * La cause est une chaîne, et chaque maillon est correct pris seul : la feuille
 * d'impression ramène le cadre de la carte de 265 px à 70 mm (`.rapport-carte`),
 * Leaflet observe ce redimensionnement et recadre, recadrer change le niveau de
 * zoom, et un nouveau niveau de zoom veut de nouvelles dalles — que le
 * navigateur demande au réseau au moment précis où il compose l'aperçu, sans
 * les attendre. Il imprime donc le cadre vide. Rien de tout cela n'est un bogue
 * de Leaflet : une carte glissante est faite pour charger à la demande, et
 * l'impression ne demande rien.
 *
 * D'où cette fonction : le **même** cadrage, rendu d'un bloc par le WMS de la
 * Géoplateforme, en une image ordinaire. Elle est chargée avec la page, bien
 * avant qu'on imprime, et s'imprime comme n'importe quelle photographie. La
 * carte Leaflet reste à l'écran, où elle est nette et vivante ; l'image prend sa
 * place sur la feuille (voir `CarteCommodites`).
 *
 * ── Web Mercator, et pas EPSG:4326 ────────────────────────────────────────
 *
 * L'emprise est demandée en EPSG:3857. En 4326, le service rendrait une
 * projection plate-carrée — des latitudes et des longitudes portées telles
 * quelles sur deux axes —, qui aplatit l'image d'un facteur `cos(latitude)` :
 * un quart en Provence. Les rues n'y seraient plus perpendiculaires, et surtout
 * les pastilles posées dessus ne tomberaient pas sur leur bâtiment. En 3857, la
 * projection est celle de Leaflet, et poser un point revient à une règle de
 * trois.
 *
 * `position(lat, lon)` rend justement cette règle de trois : la place du point
 * dans l'image, en pourcentages de largeur et de hauteur, prête pour un
 * positionnement CSS.
 *
 * Le cadrage reprend celui de la carte : le disque relevé, plus une marge, la
 * hauteur commandant l'échelle — c'est ce qui fait que deux rapports de même
 * rayon s'impriment à la même échelle.
 */
export function cadrePlan({ lat, lon, rayonM, largeurPx, hauteurPx, margePx = 12 }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const rayon = Number.isFinite(rayonM) && rayonM > 0 ? rayonM : 500

  // Mètres de terrain par pixel : le disque doit tenir dans la hauteur, marges
  // déduites. C'est la contrainte de la carte à l'écran, reprise à l'identique.
  const utile = Math.max(hauteurPx - 2 * margePx, 1)
  const metresParPixel = (2 * rayon) / utile

  // Le mètre Mercator vaut moins que le mètre de terrain dès qu'on quitte
  // l'équateur : l'échelle y est dilatée de `1 / cos(latitude)`. Oublier cette
  // correction rendrait une image trop large d'un quart sous nos latitudes.
  const dilatation = 1 / Math.max(Math.cos((lat * Math.PI) / 180), 0.01)
  const demiLargeur = (largeurPx / 2) * metresParPixel * dilatation
  const demiHauteur = (hauteurPx / 2) * metresParPixel * dilatation

  const [x0, y0] = versMercator(lat, lon)
  const bbox = [x0 - demiLargeur, y0 - demiHauteur, x0 + demiLargeur, y0 + demiHauteur]

  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    LAYERS: 'GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2',
    STYLES: '',
    FORMAT: 'image/png',
    // EPSG:3857 est un système projeté : l'emprise s'y écrit x puis y, à
    // l'inverse de l'ordre latitude/longitude qu'impose EPSG:4326 en WMS 1.3.0.
    CRS: 'EPSG:3857',
    BBOX: bbox.join(','),
    // Trois fois la taille d'affichage : la feuille sort à 300 points par pouce
    // là où l'écran en montre 96, et une image rendue à la taille du cadre
    // s'imprimerait floue.
    WIDTH: String(Math.round(largeurPx * 3)),
    HEIGHT: String(Math.round(hauteurPx * 3)),
  })

  return {
    url: `${WMS_ENDPOINT}?${params}`,
    position(latPoint, lonPoint) {
      if (!Number.isFinite(latPoint) || !Number.isFinite(lonPoint)) return null
      const [x, y] = versMercator(latPoint, lonPoint)
      return {
        gauche: ((x - bbox[0]) / (bbox[2] - bbox[0])) * 100,
        // L'axe des ordonnées Mercator monte vers le nord, celui de l'image
        // descend : le rapport s'inverse.
        haut: ((bbox[3] - y) / (bbox[3] - bbox[1])) * 100,
      }
    },
  }
}

/** Coordonnées Web Mercator (EPSG:3857) d'un point, en mètres. */
function versMercator(lat, lon) {
  const phi = (lat * Math.PI) / 180
  return [
    (lon * Math.PI * EARTH_RADIUS_M) / 180,
    EARTH_RADIUS_M * Math.log(Math.tan(Math.PI / 4 + phi / 2)),
  ]
}

/** Rayon équatorial, celui sur lequel Web Mercator est défini. */
const EARTH_RADIUS_M = 6378137

/** Mention d'attribution imposée par la licence ouverte. */
export const IGN_ATTRIBUTION = '© IGN — Géoplateforme'

// --- Emprises bâties -------------------------------------------------------

const WFS_ENDPOINT = 'https://data.geopf.fr/wfs/ows'

/**
 * Couche bâtiment de la BD TOPO®. Deux raisons de la préférer au parcellaire
 * cadastral : elle est levée par photogrammétrie sur ces mêmes orthophotos —
 * donc calée dessus, sans décalage visible — et elle porte déjà les attributs
 * (usage, nombre d'étages, hauteur) dont l'étape d'estimation se sert.
 */
const BUILDING_LAYER = 'BDTOPO_V3:batiment'

/**
 * Seuls attributs demandés : la fiche BD TOPO® complète triplerait le poids.
 * `usage_1` et `nombre_de_logements` servent de repli à la détection du type
 * de bien quand la BDNB ne connaît pas le bâtiment.
 *
 * `hauteur` est le repli du repli pour compter les niveaux : `nombre_d_etages`
 * couvre 99 % des bâtiments résidentiels mais seulement 57 % du bâti tous
 * usages confondus, là où la hauteur en couvre 92 %. Attention à ce qu'elle
 * mesure — voir `niveauxDepuisHauteur` côté moteur d'estimation.
 */
const BUILDING_FIELDS = [
  'cleabs',
  'nature',
  'usage_1',
  'nombre_de_logements',
  'nombre_d_etages',
  'hauteur',
  'construction_legere',
  'geometrie',
]

/** Garde-fou : au-delà, la réponse pèserait plus qu'elle n'aiderait. */
const MAX_BUILDINGS = 400

/**
 * Emprises des bâtiments autour d'un point, en GeoJSON prêt pour Leaflet
 * (`FeatureCollection` de polygones en WGS 84).
 *
 * `signal` annule la requête si l'utilisateur quitte l'étape avant la réponse.
 * Lève une erreur en cas de panne réseau, de réponse non 2xx, ou de rapport
 * d'exception WFS — que le serveur renvoie en 200 avec du XML, d'où la
 * vérification du contenu et pas seulement du statut.
 */
export async function fetchBuildings(lat, lon, { signal } = {}) {
  const { south, west, north, east } = boundingBox(lat, lon)

  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: BUILDING_LAYER,
    OUTPUTFORMAT: 'application/json',
    // Avec `EPSG:4326` en forme courte, le service raisonne en longitude/latitude
    // — l'ordre du GeoJSON. La forme URN inverserait les axes.
    SRSNAME: 'EPSG:4326',
    BBOX: `${west},${south},${east},${north},EPSG:4326`,
    PROPERTYNAME: BUILDING_FIELDS.join(','),
    COUNT: String(MAX_BUILDINGS),
  })

  const response = await fetch(`${WFS_ENDPOINT}?${params}`, { signal })

  if (!response.ok) {
    throw new Error(`WFS Géoplateforme — réponse ${response.status}`)
  }

  const data = await response.json().catch(() => null)

  if (data?.type !== 'FeatureCollection') {
    throw new Error('WFS Géoplateforme — réponse inattendue')
  }

  return {
    type: 'FeatureCollection',
    features: (data.features ?? [])
      .filter((feature) => Boolean(feature?.geometry))
      // `id` d'un bâtiment BD TOPO® : `cleabs` est l'identifiant stable, l'id
      // de la réponse WFS ne l'est pas d'une édition à l'autre.
      .map((feature) => ({ ...feature, id: feature.properties?.cleabs ?? feature.id })),
  }
}

/**
 * Demi-côté de la fenêtre interrogée pour retrouver un seul bâtiment. Assez
 * large pour rattraper un point posé au ras d'un mur, assez étroite pour que
 * la réponse tienne en quelques bâtiments plutôt qu'en quelques centaines.
 */
const SINGLE_BUILDING_RADIUS_M = 30

/** Le point tombe-t-il dans le contour extérieur de la géométrie ? */
function geometryContains(geometry, lon, lat) {
  const polygons =
    geometry?.type === 'MultiPolygon'
      ? geometry.coordinates
      : geometry?.type === 'Polygon'
        ? [geometry.coordinates]
        : []

  return polygons.some((rings) => pointInRing(lon, lat, rings[0]))
}

/**
 * Attributs BD TOPO® du bâtiment situé sous un point.
 *
 * Sert de repli au moteur d'estimation lorsque le front n'a pas transmis la
 * fiche du bâtiment cliqué — validation trop rapide, réseau capricieux. Le
 * point remonté par la carte étant toujours pris à l'intérieur du polygone, le
 * bâtiment recherché est celui qui contient le point ; à défaut, on ne devine
 * rien et l'on renvoie `null` plutôt qu'un voisin.
 *
 * Ne lève jamais : c'est un repli, et il ne doit pas pouvoir faire échouer un
 * calcul qui sait déjà se passer de lui.
 */
export async function fetchBuildingAt(lat, lon, { signal } = {}) {
  const { south, west, north, east } = boundingBox(lat, lon, SINGLE_BUILDING_RADIUS_M)

  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: BUILDING_LAYER,
    OUTPUTFORMAT: 'application/json',
    SRSNAME: 'EPSG:4326',
    BBOX: `${west},${south},${east},${north},EPSG:4326`,
    PROPERTYNAME: BUILDING_FIELDS.join(','),
    COUNT: '20',
  })

  try {
    const response = await fetch(`${WFS_ENDPOINT}?${params}`, { signal })
    if (!response.ok) return null

    const data = await response.json().catch(() => null)
    if (data?.type !== 'FeatureCollection') return null

    const match = (data.features ?? []).find((feature) =>
      geometryContains(feature?.geometry, lon, lat),
    )

    return match?.properties ?? null
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}

// --- Parcelles cadastrales -------------------------------------------------

const APICARTO_PARCELLE = 'https://apicarto.ign.fr/api/cadastre/parcelle'

/**
 * Parcelle cadastrale contenant un point. Sert à deux choses : rattacher le
 * bâtiment cliqué à un identifiant que la BDNB comprend (`idu`), et distinguer
 * un terrain nu — une parcelle sans aucune emprise bâtie — d'un simple clic
 * hors sujet.
 *
 * Renvoie `null` si aucune parcelle ne couvre le point (hors cadastre vecteur,
 * domaine public…) plutôt que de lever : l'absence de parcelle est une réponse,
 * pas une panne.
 */
export async function fetchParcelle(lat, lon, { signal } = {}) {
  const geom = JSON.stringify({ type: 'Point', coordinates: [lon, lat] })
  const response = await fetch(`${APICARTO_PARCELLE}?geom=${encodeURIComponent(geom)}`, { signal })

  if (!response.ok) {
    throw new Error(`API Carto cadastre — réponse ${response.status}`)
  }

  const data = await response.json().catch(() => null)
  const properties = data?.features?.[0]?.properties

  if (!properties?.idu) return null

  return {
    // Identifiant unique de parcelle, au format attendu par `l_parcelle_id`
    // côté BDNB (ex. « 57176000140471 »).
    idu: properties.idu,
    // Les cinq premiers caractères de l'IDU portent le code commune, et c'est
    // celui-là qu'il faut retenir : à Paris, Lyon et Marseille, `code_insee`
    // désigne la ville (75056) là où le cadastre et la BDNB raisonnent par
    // arrondissement (75104). S'aligner sur `code_insee` y ferait échouer tout
    // rapprochement.
    codeInsee: properties.idu.slice(0, 5) || properties.code_insee,
    commune: properties.nom_com,
    // Contenance cadastrale en m² — utile à l'estimation d'un terrain.
    contenance: properties.contenance ?? null,
  }
}
