// Cadre de vie du bien — vue, exposition, luminosité, déduits des référentiels.
//
// ── Pourquoi ce module existe ─────────────────────────────────────────────
//
// Ces trois champs étaient demandés à l'agent, sur le formulaire de
// caractéristiques, et la raison en était écrite noir sur blanc dans
// `environnement.js` : « aucune base ne les publie, et elles ne se devinent pas
// d'une emprise au sol ». C'était exact, et c'est resté exact — aucune base ne
// publie l'exposition d'un logement.
//
// Ce que ce module fait est autre chose, et la nuance est tout le sujet : il ne
// lit pas ces valeurs, il les **déduit d'une géométrie mesurée**. L'emprise du
// bâtiment donne l'orientation de ses façades ; les emprises voisines, avec
// leurs hauteurs, donnent ce qui les dégage ou les bouche ; le relief donne le
// surplomb. Trois faits mesurables, d'où l'on tire trois qualifications
// présumées.
//
// ── Ce que cela ne vaut pas, et qui doit être dit ─────────────────────────
//
// Un immeuble a quatre façades et vingt logements ; savoir que sa façade
// principale regarde le sud ne dit pas où donne le séjour du troisième droite.
// Le relevé décrit **le bâtiment**, pas l'appartement, et c'est exactement ce
// que le motif joint à chaque valeur énonce — le rapport l'imprime, et l'agent
// corrige d'un clic ce qu'il a vu sur place.
//
// D'où la règle qui gouverne tout le fichier, et à laquelle il n'est fait
// aucune exception : **une valeur qu'on ne peut pas fonder n'est pas
// fabriquée**. Pas d'emprise bâtie sous le point ? Pas d'exposition. Le WFS ne
// répond pas ? Pas de luminosité. Le champ redescend à `null`, le rapport écrit
// « Non renseigné », et l'agent le remplit lui-même — ce qui est infiniment
// préférable à un « Sud, lumineux » présenté comme un relevé.
//
// C'est aussi pourquoi « Traversante » n'est jamais rendue : une double
// orientation se constate à l'intérieur du logement, et rien de ce qui est
// mesuré ici ne permet de l'affirmer. La qualification existe toujours au
// rapport, où elle se saisit à la main.
//
// ── Les sources ───────────────────────────────────────────────────────────
//
//  - **BD TOPO® bâtiment** (WFS Géoplateforme), déjà employée par le repérage :
//    emprises et hauteurs des bâtiments dans un rayon de 150 m.
//  - **RGE ALTI®** (service de calcul altimétrique de la Géoplateforme) : neuf
//    altitudes, le bien et huit points à 250 m, d'où se lit un surplomb.
//
// Ni l'une ni l'autre ne lève ici : chaque panne rend `null` sur la part qu'elle
// concerne, et les autres continuent.

import { pointInRing } from './geo.js'
import { fetchBuildings } from './ign.js'

/** Budget par appel. Ils partent ensemble ; aucun ne doit retarder le rapport. */
const FETCH_TIMEOUT_MS = 7000

const ALTI_ENDPOINT = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json'

/**
 * Les jeux de données mobilisés, sous leur nom de référentiel.
 *
 * La mention d'attribution complète est composée par le rapport, qui réunit ce
 * relevé et celui d'`environnement.js` sous une seule ligne de provenance —
 * deux phrases toutes faites s'y répéteraient mot pour mot.
 */
export const CADRE_SOURCES = ['BD TOPO®', 'RGE ALTI®']

/**
 * Portée des rayons de dégagement, en mètres.
 *
 * Quatre-vingts mètres est la distance au-delà de laquelle un bâtiment cesse de
 * peser sur la vue depuis une fenêtre : à cette distance, un immeuble de six
 * étages tient dans un dixième du champ visuel. Pousser plus loin ferait
 * qualifier « bouché » un bien qui a deux cents mètres de recul devant lui.
 */
const PORTEE_M = 80

/** Pas d'échantillonnage le long d'un rayon. Trois mètres : la largeur d'une pièce. */
const PAS_M = 3

/** Nombre de rayons tirés autour du bien — un tous les 22,5°. */
const RAYONS = 16

/**
 * En deçà, on est en vis-à-vis : quinze mètres est la largeur d'une rue
 * ordinaire, et c'est la distance à laquelle on distingue ce qui se passe en
 * face.
 */
const VIS_A_VIS_M = 15

/** Au-delà, le dégagement est franc — un demi-hectare de recul devant soi. */
const DEGAGEMENT_M = 45

/** Surplomb à partir duquel le bien domine son environnement, en mètres. */
const SURPLOMB_M = 15

/** Distance des huit points de comparaison altimétrique. */
const RAYON_RELIEF_M = 250

const METRES_PAR_DEGRE_LAT = 111320

const versRad = (deg) => (deg * Math.PI) / 180

// --- Géométrie locale ------------------------------------------------------

/**
 * Projection métrique locale, centrée sur le bien.
 *
 * À l'échelle de cent cinquante mètres, un plan tangent est exact au
 * centimètre : inutile de sortir une reprojection conforme pour mesurer des
 * reculs de façade.
 */
function projecteur(lat0, lon0) {
  const mLon = METRES_PAR_DEGRE_LAT * Math.cos(versRad(lat0))
  return ([lon, lat]) => [(lon - lon0) * mLon, (lat - lat0) * METRES_PAR_DEGRE_LAT]
}

/** Les contours extérieurs d'une géométrie GeoJSON, en coordonnées [lon, lat]. */
function contoursExterieurs(geometry) {
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates.map((rings) => rings[0])
  if (geometry?.type === 'Polygon') return [geometry.coordinates[0]]
  return []
}

/** Le point tombe-t-il dans l'un des contours extérieurs de la géométrie ? */
function contient(geometry, lon, lat) {
  return contoursExterieurs(geometry).some((ring) => pointInRing(lon, lat, ring))
}

/**
 * Orientation dominante des façades d'une emprise, en degrés d'azimut (0 = nord,
 * 90 = est), ramenée à l'intervalle [0, 180).
 *
 * Chaque côté du contour est une façade, et l'on cherche celle qui commande —
 * pas la plus longue prise isolément, mais la **direction** vers laquelle le
 * plus de linéaire de façade est tourné. Un bâtiment en L a deux longs côtés
 * parallèles et deux retours : la moyenne pondérée par la longueur retient les
 * premiers, là où « le plus long côté » aurait pu tomber sur un retour.
 *
 * Les directions sont des axes, pas des vecteurs — une façade orientée à 20° et
 * une orientée à 200° sont la même façade. On moyenne donc dans l'espace des
 * angles doublés, seule façon d'additionner des axes sans que deux façades
 * opposées s'annulent.
 */
function orientationFacades(contours, projeter) {
  let sx = 0
  let sy = 0

  for (const ring of contours) {
    const points = ring.map(projeter)
    for (let i = 0; i < points.length - 1; i += 1) {
      const [x1, y1] = points[i]
      const [x2, y2] = points[i + 1]
      const dx = x2 - x1
      const dy = y2 - y1
      const longueur = Math.hypot(dx, dy)
      if (longueur < 1) continue

      const angle = Math.atan2(dy, dx)
      sx += longueur * Math.cos(2 * angle)
      sy += longueur * Math.sin(2 * angle)
    }
  }

  if (sx === 0 && sy === 0) return null

  // Retour dans l'espace des angles simples, puis passage de la convention
  // mathématique (0 = est, sens direct) à l'azimut (0 = nord, sens horaire).
  const angle = Math.atan2(sy, sx) / 2
  const azimut = (90 - (angle * 180) / Math.PI) % 360
  return ((azimut % 180) + 180) % 180
}

/** Centre de gravité approché d'un contour projeté (moyenne des sommets). */
function centre(contours, projeter) {
  const points = contours.flat().map(projeter)
  if (points.length === 0) return [0, 0]
  const somme = points.reduce(([sx, sy], [x, y]) => [sx + x, sy + y], [0, 0])
  return [somme[0] / points.length, somme[1] / points.length]
}

// --- Dégagement ------------------------------------------------------------

/**
 * Distance au premier obstacle bâti dans une direction, et sa hauteur.
 *
 * Le rayon est échantillonné plutôt qu'intersecté analytiquement : à trois
 * mètres de pas sur quatre-vingts mètres, cela fait vingt-sept tests de
 * point-dans-polygone par rayon, soit quelques milliers pour la rose complète —
 * le coût d'un rendu React. Une intersection segment à segment serait exacte au
 * décimètre, pour une information qu'on qualifie ensuite par tranches de quinze
 * mètres.
 *
 * Rend `PORTEE_M` quand rien n'est rencontré : c'est un plancher de mesure, pas
 * une distance réelle, et tout le reste du module le traite comme tel.
 */
function obstacle(azimut, origine, voisins, lat0, lon0) {
  const rad = versRad(azimut)
  const [ox, oy] = origine
  // Azimut : 0 = nord (+y), 90 = est (+x).
  const ux = Math.sin(rad)
  const uy = Math.cos(rad)
  const mLon = METRES_PAR_DEGRE_LAT * Math.cos(versRad(lat0))

  for (let d = PAS_M; d <= PORTEE_M; d += PAS_M) {
    const x = ox + ux * d
    const y = oy + uy * d
    const lon = lon0 + x / mLon
    const lat = lat0 + y / METRES_PAR_DEGRE_LAT

    for (const voisin of voisins) {
      if (contient(voisin.geometry, lon, lat)) {
        return { distanceM: d, hauteurM: voisin.hauteurM }
      }
    }
  }

  return { distanceM: PORTEE_M, hauteurM: null }
}

/** Médiane d'une liste de nombres. */
function mediane(valeurs) {
  if (valeurs.length === 0) return null
  const triees = [...valeurs].sort((a, b) => a - b)
  const milieu = Math.floor(triees.length / 2)
  return triees.length % 2 === 0 ? (triees[milieu - 1] + triees[milieu]) / 2 : triees[milieu]
}

/** Le point cardinal le plus proche d'un azimut. */
function cardinal(azimut) {
  const a = ((azimut % 360) + 360) % 360
  if (a < 45 || a >= 315) return { value: 'nord', label: 'Nord' }
  if (a < 135) return { value: 'est', label: 'Est' }
  if (a < 225) return { value: 'sud', label: 'Sud' }
  return { value: 'ouest', label: 'Ouest' }
}

// --- Relief ----------------------------------------------------------------

/**
 * Surplomb du bien sur son voisinage, en mètres, ou `null`.
 *
 * Neuf altitudes en une requête : le bien, et huit points à deux cent cinquante
 * mètres tout autour. L'écart entre la première et la moyenne des huit autres
 * dit si le bien domine — ce qui est la seule condition objective d'une vue
 * panoramique, avec le dégagement.
 *
 * Deux cent cinquante mètres est un compromis : trop près, on mesure la pente
 * de la rue ; trop loin, une maison de bord de mer paraît dominer l'eau.
 */
async function surplomb(lat, lon, { signal } = {}) {
  const points = [[lat, lon]]
  for (let i = 0; i < 8; i += 1) {
    const rad = (i * Math.PI) / 4
    const dLat = (RAYON_RELIEF_M * Math.cos(rad)) / METRES_PAR_DEGRE_LAT
    const dLon =
      (RAYON_RELIEF_M * Math.sin(rad)) / (METRES_PAR_DEGRE_LAT * Math.cos(versRad(lat)))
    points.push([lat + dLat, lon + dLon])
  }

  const params = new URLSearchParams({
    lat: points.map(([la]) => la.toFixed(6)).join('|'),
    lon: points.map(([, lo]) => lo.toFixed(6)).join('|'),
    resource: 'ign_rge_alti_wld',
    delimiter: '|',
    zonly: 'true',
  })

  const budget = AbortSignal.timeout(FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(`${ALTI_ENDPOINT}?${params}`, {
      headers: { Accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, budget]) : budget,
    })
    if (!response.ok) throw new Error(`réponse ${response.status}`)

    const data = await response.json()
    const altitudes = (data?.elevations ?? []).map(Number)
    // Le service rend -99999 sur un point hors couverture : une valeur de ce
    // genre dans la moyenne ferait de n'importe quel bien un belvédère.
    if (altitudes.length < 9 || altitudes.some((z) => !Number.isFinite(z) || z < -1000)) {
      return null
    }

    const [site, ...autour] = altitudes
    const moyenne = autour.reduce((s, z) => s + z, 0) / autour.length
    return site - moyenne
  } catch (error) {
    if (signal?.aborted) throw error
    console.error('[cadre] RGE ALTI indisponible —', error?.message ?? error)
    return null
  }
}

// --- Qualifications --------------------------------------------------------

/**
 * Exposition présumée de la façade principale.
 *
 * Des deux normales à l'orientation dominante — une façade a un devant et un
 * derrière —, on retient celle qui a le plus de dégagement. C'est le pari de
 * l'architecture ordinaire : les pièces de vie donnent du côté où il y a
 * quelque chose à voir, l'escalier et les services de l'autre.
 *
 * Quand les deux se valent à cinq mètres près, le sud l'emporte. Ce n'est pas
 * une élégance : sur un bâtiment dégagé des deux côtés, l'orientation des
 * pièces de vie vers le sud est la règle de composition constante du bâti
 * français, et il faut bien trancher — l'alternative serait de ne rien rendre
 * là où la moitié des cas se présentent.
 */
function exposition(azimutFacades, sonde) {
  if (azimutFacades === null) return null

  const candidats = [azimutFacades + 90, azimutFacades - 90].map((azimut) => {
    const a = ((azimut % 360) + 360) % 360
    return { azimut: a, degagement: sonde(a), sud: Math.cos(versRad(a - 180)) }
  })

  const [a, b] = candidats
  const ecart = a.degagement - b.degagement
  const retenu = Math.abs(ecart) <= 5 ? (a.sud >= b.sud ? a : b) : ecart > 0 ? a : b

  const point = cardinal(retenu.azimut)
  const arbitre =
    Math.abs(ecart) <= 5
      ? 'deux faces également dégagées, sud présumé'
      : `${Math.round(retenu.degagement)} m de recul, ${Math.round(
          Math.min(a.degagement, b.degagement),
        )} m au dos`

  return {
    value: point.value,
    label: point.label,
    // Le motif tient en une phrase courte : il est imprimé en aparté sous le
    // bloc « Environnement », où quatre motifs partagent deux colonnes de
    // feuille A4. Il dit l'essentiel — d'où vient la valeur, et sur quoi elle
    // porte (le bâtiment, pas le logement).
    motif: `Exposition : façade principale, ${arbitre}.`,
    degagement: retenu.degagement,
    azimut: retenu.azimut,
  }
}

/**
 * Vue depuis le bien — trois degrés, les mêmes que ceux que l'agent cochait.
 *
 * « Panoramique » demande deux conditions réunies, et pas une seule : un
 * dégagement franc **et** un surplomb sur le voisinage. Un terrain plat au
 * milieu des champs est dégagé sans être panoramique ; un balcon en surplomb
 * face à un mur ne l'est pas non plus.
 *
 * La mer n'entre pas ici : elle est ajoutée par le rapport à partir du trait de
 * côte relevé par `environnement.js` — « Dégagée » y devient « Dégagée, mer ».
 */
function vue({ ouverture, devant, relief }) {
  if (ouverture === null) return null

  const domine = typeof relief === 'number' && relief >= SURPLOMB_M

  if (ouverture >= DEGAGEMENT_M && domine) {
    return {
      value: 'panoramique',
      label: 'Panoramique',
      motif: `Vue : ${Math.round(ouverture)} m de dégagement, ${Math.round(relief)} m de surplomb.`,
    }
  }

  if (devant !== null && devant < VIS_A_VIS_M) {
    return {
      value: 'vis-a-vis',
      label: 'Vis-à-vis',
      motif: `Vue : bâti à ${Math.round(devant)} m devant la façade principale.`,
    }
  }

  if (ouverture >= DEGAGEMENT_M) {
    return {
      value: 'degagee',
      label: 'Dégagée',
      motif: `Vue : premier bâti à ${Math.round(ouverture)} m en médiane.`,
    }
  }

  if (ouverture < 20) {
    return {
      value: 'vis-a-vis',
      label: 'Vis-à-vis',
      motif: `Vue : bâti dense, premier obstacle à ${Math.round(ouverture)} m en médiane.`,
    }
  }

  return {
    value: 'degagee',
    label: 'Dégagée',
    motif: `Vue : sans vis-à-vis immédiat, premier bâti à ${Math.round(ouverture)} m.`,
  }
}

/**
 * Luminosité présumée, par points.
 *
 * Trois facteurs, et ce sont les trois seuls qui se mesurent : l'orientation de
 * la façade principale, le recul devant elle, et la hauteur de ce qui s'y
 * trouve. Un sud bouché à huit mètres par un immeuble plus haut est sombre ; un
 * nord avec cent mètres de recul ne l'est pas.
 *
 * « Traversante » n'est jamais rendue — voir l'en-tête du fichier.
 */
function luminosite({ expo, devant, hauteurDevant, hauteurBien }) {
  if (!expo || devant === null) return null

  const points =
    (expo.value === 'sud' ? 2 : expo.value === 'nord' ? 0 : 1) +
    (devant >= 40 ? 2 : devant >= 20 ? 1 : devant >= VIS_A_VIS_M ? 0 : -1) +
    // Un voisin nettement plus haut à portée immédiate coupe le ciel, quelle
    // que soit l'orientation : trois mètres d'écart, c'est un étage.
    (hauteurDevant !== null &&
    hauteurBien !== null &&
    devant <= 25 &&
    hauteurDevant > hauteurBien + 3
      ? -1
      : 0)

  const niveau =
    points >= 3
      ? { value: 'lumineuse', label: 'Lumineuse' }
      : points >= 1
        ? { value: 'correcte', label: 'Correcte' }
        : { value: 'sombre', label: 'Sombre' }

  return {
    ...niveau,
    motif: `Luminosité : présumée de l’exposition et de ${Math.round(devant)} m de recul.`,
  }
}

// --- Relevé ----------------------------------------------------------------

/**
 * Le cadre de vie du bien, déduit de sa géométrie et de son voisinage.
 *
 * `geometry` est l'emprise du bâtiment retenue au repérage, quand le parcours
 * l'a transmise ; à défaut, le bâtiment qui contient le point est retrouvé
 * parmi les emprises du voisinage. Sans emprise, il n'y a pas de façade, donc
 * pas d'exposition — mais les rayons de dégagement partent quand même du point,
 * et la vue reste qualifiable.
 *
 * Rend `null` entier quand rien n'a pu être mesuré : hors coordonnées, hors
 * couverture BD TOPO® (Monaco), ou WFS en panne. Ne lève jamais hors annulation.
 */
export async function fetchCadre({ lat, lon, geometry = null }, { signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const [batiments, relief] = await Promise.all([
    fetchBuildings(lat, lon, { signal }).catch((error) => {
      if (signal?.aborted) throw error
      console.error('[cadre] Emprises bâties indisponibles —', error?.message ?? error)
      return null
    }),
    surplomb(lat, lon, { signal }),
  ])

  if (!batiments) return null

  const projeter = projecteur(lat, lon)
  const features = batiments.features ?? []

  // L'emprise du bien : celle transmise par le repérage, ou celle qui contient
  // le point. Les autres sont le voisinage — y laisser le bâtiment lui-même
  // ferait buter chaque rayon sur son propre mur, à trois mètres.
  const sujet = geometry ?? features.find((f) => contient(f.geometry, lon, lat))?.geometry ?? null
  const voisins = features
    .filter((f) => !contient(f.geometry, lon, lat))
    .map((f) => ({
      geometry: f.geometry,
      hauteurM: Number.isFinite(Number(f.properties?.hauteur))
        ? Number(f.properties.hauteur)
        : null,
    }))

  const hauteurBien =
    features
      .filter((f) => contient(f.geometry, lon, lat))
      .map((f) => Number(f.properties?.hauteur))
      .find((h) => Number.isFinite(h)) ?? null

  const contours = sujet ? contoursExterieurs(sujet) : []
  const origine = contours.length > 0 ? centre(contours, projeter) : [0, 0]

  // La rose de dégagement, mesurée une fois : l'exposition, la vue et la
  // luminosité la relisent toutes les trois.
  const sondes = new Map()
  const sonder = (azimut) => {
    const cle = Math.round(azimut)
    if (!sondes.has(cle)) sondes.set(cle, obstacle(cle, origine, voisins, lat, lon))
    return sondes.get(cle)
  }

  const rose = Array.from({ length: RAYONS }, (_, i) => sonder((i * 360) / RAYONS))
  const ouverture = mediane(rose.map((r) => r.distanceM))

  const azimutFacades = contours.length > 0 ? orientationFacades(contours, projeter) : null
  const expo = exposition(azimutFacades, (azimut) => sonder(azimut).distanceM)
  const devant = expo ? sonder(expo.azimut) : null

  return {
    exposition: expo,
    vue: vue({
      ouverture,
      devant: devant?.distanceM ?? null,
      relief,
    }),
    luminosite: luminosite({
      expo,
      devant: devant?.distanceM ?? null,
      hauteurDevant: devant?.hauteurM ?? null,
      hauteurBien,
    }),
    // Le surplomb descend au rapport tel quel : il fonde la vue panoramique, et
    // un chiffre vaut mieux qu'un adjectif quand l'agent doit le défendre.
    surplombM: typeof relief === 'number' ? Math.round(relief) : null,
    sources: CADRE_SOURCES,
  }
}
