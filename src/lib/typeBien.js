import { fetchBuildingsOnParcel } from './bdnb.js'
import { fetchParcelle } from './ign.js'

/**
 * Types de bien reconnus par le parcours. `manuel` liste ceux proposés à la
 * correction manuelle : quatre choix, pas davantage — au-delà, le choix rapide
 * cesse d'être rapide.
 */
export const PROPERTY_TYPES = {
  maison: { id: 'maison', label: 'Maison individuelle', court: 'Maison', genre: 'f' },
  appartement: {
    id: 'appartement',
    label: 'Appartement ou immeuble collectif',
    court: 'Appartement',
    genre: 'm',
  },
  local: { id: 'local', label: 'Local professionnel', court: 'Local pro', genre: 'm' },
  terrain: { id: 'terrain', label: 'Terrain nu', court: 'Terrain', genre: 'm' },
  autre: { id: 'autre', label: 'Autre type de bien', court: 'Autre', genre: 'm' },
}

/**
 * Ordre d'affichage du choix manuel.
 *
 * Le correcteur de type a été retiré de l'interface : le type détecté n'est plus
 * montré à l'utilisateur, il ne sert qu'au calcul de l'estimation. Ces deux
 * aides restent en place pour le jour où il refera surface.
 */
export const MANUAL_TYPE_IDS = ['maison', 'appartement', 'terrain', 'autre']

export const typeLabel = (id) => PROPERTY_TYPES[id]?.label ?? PROPERTY_TYPES.autre.label

/**
 * Participe accordé au genre du type — « Maison individuelle détectée » mais
 * « Appartement […] détecté ». Le libellé étant choisi dans une table, l'accord
 * doit l'être aussi : le déduire du texte serait fragile.
 */
export const typeDetecte = (id) =>
  (PROPERTY_TYPES[id] ?? PROPERTY_TYPES.autre).genre === 'f' ? 'détectée' : 'détecté'

/**
 * Degrés de confiance de la détection.
 *
 * `haute` désigne le seul cas où la base *dit* la vocation du bâtiment plutôt
 * qu'elle ne la laisse déduire : nomenclature explicite, ou nombre de logements
 * réellement compté. Tout ce qui relève de la présomption — vocation générique,
 * comptage absent, immeuble mixte — reste en `moyenne`, et l'absence de source
 * en `nulle`.
 *
 * Ce n'est pas une nuance de journal : c'est ce qui décide, au formulaire de
 * caractéristiques, si le type est repris tel quel ou redemandé à l'agent
 * (voir `estTypeFiable`).
 */
export const CONFIANCES = ['nulle', 'moyenne', 'haute']

/**
 * Vocation BDNB (`usage_principal_bdnb_open`) → type du parcours, assorti de sa
 * confiance. Les valeurs sont comparées en minuscules et sans accents : la
 * nomenclature a déjà changé de casse d'une version à l'autre.
 */
function fromBdnbUsage(usage, logements) {
  const normalized = String(usage ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  const nbLog = Number(logements)
  // Un comptage à zéro n'est pas un comptage : la BDNB y met aussi bien le
  // bâtiment non résidentiel que celui dont elle ignore le contenu.
  const compte = Number.isFinite(nbLog) && nbLog > 0

  if (normalized.includes('residentiel individuel')) return { type: 'maison', confiance: 'haute' }
  if (normalized.includes('residentiel collectif')) {
    return { type: 'appartement', confiance: 'haute' }
  }

  // Immeuble mixte — commerces en pied d'immeuble, logements au-dessus : la
  // BDNB le classe « Tertiaire », alors que celui qui fait estimer son bien y
  // habite presque toujours. Dès qu'il y a plusieurs logements, le résidentiel
  // l'emporte donc sur la vocation déclarée. Le cas inverse (quelques logements
  // de fonction dans un vrai bâtiment tertiaire) reste rattrapable d'un tap via
  // la correction manuelle — raison pour laquelle la confiance n'est pas haute :
  // c'est un arbitrage, pas une lecture.
  if (nbLog >= 2) return { type: 'appartement', confiance: 'moyenne' }

  if (normalized.includes('tertiaire') || normalized.includes('commercial')) {
    return { type: 'local', confiance: 'haute' }
  }
  if (normalized.includes('industriel') || normalized.includes('agricole')) {
    return { type: 'local', confiance: 'haute' }
  }

  // Vocation résidentielle sans plus de précision : le nombre de logements
  // tranche seul entre maison et collectif. Sans lui, « maison » n'est plus
  // qu'un repli — le cas le plus fréquent du parc, pas une caractéristique
  // lue sur ce bâtiment-ci.
  if (normalized.includes('residentiel')) {
    return { type: nbLog > 1 ? 'appartement' : 'maison', confiance: compte ? 'haute' : 'moyenne' }
  }

  return null
}

/**
 * Repli sur la BD TOPO® quand la BDNB ne connaît pas le bâtiment — fréquent
 * sur les constructions récentes et les annexes.
 *
 * Ses attributs portent sur le polygone effectivement cliqué : un usage déclaré
 * et un nombre de logements compté y valent ceux de la BDNB, d'où une confiance
 * haute malgré le statut de repli de la source.
 */
function fromBdTopo(properties) {
  if (!properties) return null

  const usage = String(properties.usage_1 ?? '').toLowerCase()
  const logements = Number(properties.nombre_de_logements)
  const compte = Number.isFinite(logements) && logements > 0

  if (usage.includes('résidentiel') || usage.includes('residentiel')) {
    return {
      type: logements > 1 ? 'appartement' : 'maison',
      confiance: compte ? 'haute' : 'moyenne',
    }
  }
  if (usage.includes('commercial') || usage.includes('industriel') || usage.includes('agricole')) {
    return { type: 'local', confiance: 'haute' }
  }
  if (compte) {
    // Aucun usage déclaré : le seul comptage de logements dit qu'on habite là,
    // sans dire dans quoi.
    return { type: logements > 1 ? 'appartement' : 'maison', confiance: 'moyenne' }
  }

  return null
}

/**
 * Le type détecté peut-il être repris sans être redemandé ?
 *
 * Deux conditions, et pas une de moins : une confiance haute, et un type que le
 * formulaire de caractéristiques sait lui-même exprimer. Un terrain ou un local
 * détecté à coup sûr n'y a pas de case — le proposer reviendrait à le ranger
 * sous « Autre », c'est-à-dire à perdre l'information en prétendant la garder.
 */
export function estTypeFiable(detection) {
  const type = detection?.type
  return detection?.confiance === 'haute' && (type === 'maison' || type === 'appartement')
}

/**
 * Parmi les bâtiments d'une parcelle, celui dont l'emprise au sol se rapproche
 * le plus de celle du bâtiment cliqué. Les deux bases n'ont aucun identifiant
 * commun ; la surface est le seul rapprochement possible sans reprojeter les
 * géométries BDNB depuis le Lambert-93.
 *
 * Sans surface de référence, on retient la plus grande fiche renseignée : sur
 * une parcelle pavillonnaire, c'est l'habitation plutôt que le garage.
 */
function closestByFootprint(candidates, areaM2) {
  const usable = candidates.filter((c) => c.usage_principal_bdnb_open || c.nb_log)

  const pool = usable.length > 0 ? usable : candidates
  if (pool.length === 0) return null
  if (pool.length === 1) return pool[0]

  if (!Number.isFinite(areaM2)) {
    return pool.reduce((best, c) => ((c.s_geom_groupe ?? 0) > (best.s_geom_groupe ?? 0) ? c : best))
  }

  return pool.reduce((best, c) => {
    const d = Math.abs((c.s_geom_groupe ?? 0) - areaM2)
    const bestD = Math.abs((best.s_geom_groupe ?? 0) - areaM2)
    return d < bestD ? c : best
  })
}

/**
 * Déduit le type du bien à partir de la sélection faite sur la carte.
 *
 * Chaîne : parcelle cadastrale sous le point (API Carto) → fiches BDNB de
 * cette parcelle → vocation du bâtiment. Une parcelle sans emprise bâtie
 * sélectionnée vaut terrain nu.
 *
 * Ne lève jamais : un type indéterminé (`autre`) reste exploitable, et
 * l'utilisateur peut de toute façon corriger. Seule l'annulation remonte.
 *
 * Le résultat porte toujours une `confiance` à côté du `type` : le moteur
 * d'estimation se contente du second — il lui faut un type quoi qu'il arrive —
 * là où le formulaire de caractéristiques n'ose se passer de la question que
 * sur la première (voir `estTypeFiable`).
 */
export async function detectPropertyType(selection, { signal } = {}) {
  const { lat, lon, areaM2, properties } = selection
  const isBuilding = selection.kind === 'batiment'

  let parcelle = null
  try {
    parcelle = await fetchParcelle(lat, lon, { signal })
  } catch (error) {
    if (error.name === 'AbortError') throw error
  }

  // Repérage libre : aucun contour n'a été retenu. Sur une parcelle cadastrée,
  // c'est un terrain ; ailleurs, on ne présume rien.
  if (!isBuilding) {
    return {
      type: parcelle ? 'terrain' : 'autre',
      source: parcelle ? 'cadastre' : 'inconnu',
      // Une parcelle cadastrée sous un point ne dit pas qu'elle est nue : elle
      // dit seulement qu'aucun contour n'a été retenu, ce qui arrive aussi
      // au-dessus d'un bâti que la BD TOPO® ne cartographie pas.
      confiance: parcelle ? 'moyenne' : 'nulle',
      parcelle,
      fiche: null,
    }
  }

  let fiche = null
  if (parcelle) {
    try {
      const candidates = await fetchBuildingsOnParcel(parcelle, { signal })
      fiche = closestByFootprint(candidates, areaM2)
    } catch (error) {
      if (error.name === 'AbortError') throw error
    }
  }

  const fromBdnb = fiche ? fromBdnbUsage(fiche.usage_principal_bdnb_open, fiche.nb_log) : null
  if (fromBdnb) {
    return { ...fromBdnb, source: 'bdnb', parcelle, fiche }
  }

  const fallback = fromBdTopo(properties)
  if (fallback) {
    return { ...fallback, source: 'bdtopo', parcelle, fiche }
  }

  return { type: 'autre', source: 'inconnu', confiance: 'nulle', parcelle, fiche }
}
