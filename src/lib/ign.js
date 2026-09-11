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
