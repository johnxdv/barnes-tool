const EARTH_RADIUS_M = 6378137

/**
 * Rayon moyen du globe — celui des distances, là où `EARTH_RADIUS_M` ci-dessus
 * est le rayon équatorial, qui sert aux aires. Les deux valeurs diffèrent de
 * 0,1 % ; l'écart est sans conséquence ici, mais mélanger les deux formules
 * sur une même constante le serait moins.
 */
const EARTH_MEAN_RADIUS_M = 6371008.8

const toRad = (deg) => (deg * Math.PI) / 180

/**
 * Distance orthodromique entre deux points, en mètres (formule de haversine).
 *
 * Suffisamment exacte aux échelles qui nous concernent (quelques kilomètres),
 * et surtout assez rapide pour être appelée sur des dizaines de milliers de
 * ventes sans peser sur le budget de temps.
 *
 * Partagée avec les fonctions serverless, qui la réexportent depuis
 * `api/_lib/geo.js` : elle est employée des deux côtés — au relevé des
 * commodités dans le navigateur (`src/lib/poi.js`), au tri des ventes DVF sur
 * le serveur — et deux haversines valant chacune pour la moitié du produit
 * finiraient par diverger d'un rayon terrestre.
 */
export function distanceM(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_MEAN_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Aire d'un anneau de coordonnées [lon, lat], en m², par la formule de
 * l'excès sphérique. Le signe traduit le sens de parcours : positif pour un
 * contour extérieur, négatif pour un trou — ce qui permet de sommer les
 * anneaux d'un polygone sans les traiter à part.
 */
function ringAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0

  let total = 0

  for (let i = 0; i < ring.length; i += 1) {
    const [lon1, lat1] = ring[i]
    const [lon2, lat2] = ring[(i + 1) % ring.length]
    total += (toRad(lon2) - toRad(lon1)) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)))
  }

  return (total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2
}

/**
 * Emprise au sol d'une géométrie GeoJSON (`Polygon` ou `MultiPolygon`) en m².
 *
 * Sert à rapprocher le bâtiment cliqué de la bonne fiche BDNB lorsque plusieurs
 * bâtiments partagent une parcelle : à défaut d'identifiant commun entre les
 * deux bases, la surface au sol est le discriminant le plus fiable dont on
 * dispose sans reprojeter les géométries.
 *
 * La valeur absolue de la somme couvre les anneaux orientés à l'envers, que
 * l'on rencontre dans des données réelles.
 */
export function footprintAreaM2(geometry) {
  if (!geometry) return null

  const polygons =
    geometry.type === 'MultiPolygon'
      ? geometry.coordinates
      : geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : []

  if (polygons.length === 0) return null

  const area = polygons.reduce(
    (sum, rings) => sum + rings.reduce((acc, ring) => acc + ringAreaM2(ring), 0),
    0,
  )

  return Math.abs(area)
}

/**
 * Demi-côté de la zone interrogée pour charger les emprises bâties autour
 * d'une adresse, en mètres. Couvre largement la carte au zoom d'ouverture tout
 * en laissant de la marge pour un déplacement — le tout en une seule requête,
 * sans rechargement au panoramique.
 *
 * Commun aux deux fournisseurs d'emprises (BD TOPO® en France, OpenStreetMap
 * en Principauté) : c'est le cadrage de la carte qui le fixe, pas la source.
 */
export const BUILDINGS_RADIUS_M = 150

const METERS_PER_DEGREE_LAT = 111320

/**
 * Emprise carrée (en degrés) centrée sur un point. L'écart en longitude est
 * corrigé de la latitude, sans quoi la zone serait très aplatie sous nos
 * latitudes.
 */
export function boundingBox(lat, lon, radiusM = BUILDINGS_RADIUS_M) {
  const deltaLat = radiusM / METERS_PER_DEGREE_LAT
  // Plancher sur le cosinus : purement défensif, aucun territoire desservi
  // ici n'approche des pôles.
  const cos = Math.max(Math.cos((lat * Math.PI) / 180), 0.01)
  const deltaLon = radiusM / (METERS_PER_DEGREE_LAT * cos)

  return {
    south: lat - deltaLat,
    west: lon - deltaLon,
    north: lat + deltaLat,
    east: lon + deltaLon,
  }
}

/** Le point est-il dans l'anneau ? Lancer de rayon, en coordonnées [lon, lat]. */
export function pointInRing(lon, lat, ring) {
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const crosses = yi > lat !== yj > lat

    if (crosses && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
  }

  return inside
}
