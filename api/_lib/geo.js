// Géométrie et découpage administratif — briques partagées par le moteur
// d'estimation. Aucune dépendance : tout tient en quelques formules, et un
// paquet de plus alourdirait inutilement la fonction serverless.

const EARTH_RADIUS_M = 6371008.8

const toRad = (deg) => (deg * Math.PI) / 180

/**
 * Distance orthodromique entre deux points, en mètres (formule de haversine).
 *
 * Suffisamment exacte aux échelles qui nous concernent (quelques kilomètres),
 * et surtout assez rapide pour être appelée sur des dizaines de milliers de
 * ventes sans peser sur le budget de temps.
 */
export function distanceM(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

/**
 * Code département déduit d'un code commune INSEE.
 *
 * Deux exceptions à la règle « les deux premiers caractères » : l'outre-mer,
 * codé sur trois chiffres (97x), et la Corse, dont les codes commencent par
 * `2A`/`2B` — que cette même règle renvoie correctement, les fichiers DVF
 * étant eux aussi rangés sous `2A` et `2B`.
 */
export function departementFromInsee(codeInsee) {
  const code = String(codeInsee ?? '').trim().toUpperCase()
  if (code.length < 4) return null
  return code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2)
}

const COMMUNE_ENDPOINT = 'https://geo.api.gouv.fr/communes'

/** Point décalé de `distanceM` mètres depuis un point, selon un cap en degrés. */
function destination(lat, lon, distance, bearingDeg) {
  const deltaLat = (distance * Math.cos(toRad(bearingDeg))) / 111320
  // Plancher sur le cosinus : purement défensif, la France n'en approche jamais.
  const cos = Math.max(Math.cos(toRad(lat)), 0.01)
  const deltaLon = (distance * Math.sin(toRad(bearingDeg))) / (111320 * cos)

  return [lat + deltaLat, lon + deltaLon]
}

/** Commune contenant un point, ou `null` (mer, étranger, panne). */
async function communeAt(lat, lon, { signal } = {}) {
  const url = `${COMMUNE_ENDPOINT}?lat=${lat}&lon=${lon}&fields=code,codeDepartement`

  try {
    const response = await fetch(url, { signal })
    if (!response.ok) return null
    const data = await response.json().catch(() => null)
    return Array.isArray(data) && data[0] ? data[0] : null
  } catch (error) {
    if (error?.name === 'AbortError') throw error
    return null
  }
}

/** Commune INSEE sous un point — repli quand le cadastre n'a rien renvoyé. */
export async function communeAtPoint(lat, lon, { signal } = {}) {
  const commune = await communeAt(lat, lon, { signal })
  return commune?.code ?? null
}

/** Nombre de caps sondés sur le pourtour du disque de recherche. */
const BEARINGS = [0, 45, 90, 135, 180, 225, 270, 315]

/**
 * Départements traversés par le disque de recherche.
 *
 * Les fichiers DVF sont rangés par département : dès que le rayon dépasse la
 * commune, une part des ventes comparables peut se trouver de l'autre côté
 * d'une limite administrative. Plutôt que d'embarquer une table d'adjacence à
 * maintenir, on sonde le pourtour du disque — huit caps, à mi-rayon et au
 * rayon plein — et on relève les départements rencontrés.
 *
 * Les sondes tombées à l'eau ou hors de France ne renvoient rien : elles sont
 * simplement ignorées. Une panne du service laisse la liste inchangée plutôt
 * que d'interrompre le calcul.
 */
export async function departementsAround(lat, lon, radiusM, { signal } = {}) {
  const points = BEARINGS.flatMap((bearing) => [
    destination(lat, lon, radiusM / 2, bearing),
    destination(lat, lon, radiusM, bearing),
  ])

  const communes = await Promise.all(
    points.map(([sampleLat, sampleLon]) => communeAt(sampleLat, sampleLon, { signal })),
  )

  return [...new Set(communes.map((c) => c?.codeDepartement).filter(Boolean))]
}
