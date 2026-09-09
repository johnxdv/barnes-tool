// Fonds de carte et emprises bâties de la Géoplateforme IGN — service public,
// licence ouverte Etalab, sans clé ni quota déclaré.
// https://geoservices.ign.fr/services-geoplateforme-diffusion
//
// Périmètre volontairement réduit à l'affichage de la carte : seule la couche
// bâtiment (pour rendre les contours cliquables) et le fond orthophoto sont
// conservés. Tout ce qui servait au moteur de calcul — parcelle cadastrale,
// fiche d'un bâtiment isolé — a été retiré de cette étape.

import { boundingBox } from './geo.js'

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

/** Mention d'attribution imposée par la licence ouverte. */
export const IGN_ATTRIBUTION = '© IGN — Géoplateforme'

// --- Emprises bâties -------------------------------------------------------

const WFS_ENDPOINT = 'https://data.geopf.fr/wfs/ows'

/**
 * Couche bâtiment de la BD TOPO®, levée par photogrammétrie sur ces mêmes
 * orthophotos — donc calée dessus, sans décalage visible.
 */
const BUILDING_LAYER = 'BDTOPO_V3:batiment'

/** Seuls attributs demandés : la fiche BD TOPO® complète triplerait le poids. */
const BUILDING_FIELDS = ['cleabs', 'nature', 'geometrie']

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
      // `cleabs` est l'identifiant stable d'un bâtiment BD TOPO® ; l'id de la
      // réponse WFS ne l'est pas d'une édition à l'autre.
      .map((feature) => ({ ...feature, id: feature.properties?.cleabs ?? feature.id })),
  }
}
