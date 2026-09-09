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
 * Vocation BDNB (`usage_principal_bdnb_open`) → type du parcours.
 * Les valeurs sont comparées en minuscules et sans accents : la nomenclature
 * a déjà changé de casse d'une version à l'autre.
 */
function fromBdnbUsage(usage, logements) {
  const normalized = String(usage ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (normalized.includes('residentiel individuel')) return 'maison'
  if (normalized.includes('residentiel collectif')) return 'appartement'

  // Immeuble mixte — commerces en pied d'immeuble, logements au-dessus : la
  // BDNB le classe « Tertiaire », alors que celui qui fait estimer son bien y
  // habite presque toujours. Dès qu'il y a plusieurs logements, le résidentiel
  // l'emporte donc sur la vocation déclarée. Le cas inverse (quelques logements
  // de fonction dans un vrai bâtiment tertiaire) reste rattrapable d'un tap via
  // la correction manuelle.
  if (Number(logements) >= 2) return 'appartement'

  if (normalized.includes('tertiaire') || normalized.includes('commercial')) return 'local'
  if (normalized.includes('industriel') || normalized.includes('agricole')) return 'local'

  // Vocation résidentielle sans plus de précision : le nombre de logements
  // tranche seul entre maison et collectif.
  if (normalized.includes('residentiel')) {
    return Number(logements) > 1 ? 'appartement' : 'maison'
  }

  return null
}

/**
 * Repli sur la BD TOPO® quand la BDNB ne connaît pas le bâtiment — fréquent
 * sur les constructions récentes et les annexes.
 */
function fromBdTopo(properties) {
  if (!properties) return null

  const usage = String(properties.usage_1 ?? '').toLowerCase()
  const logements = Number(properties.nombre_de_logements)

  if (usage.includes('résidentiel') || usage.includes('residentiel')) {
    return logements > 1 ? 'appartement' : 'maison'
  }
  if (usage.includes('commercial') || usage.includes('industriel') || usage.includes('agricole')) {
    return 'local'
  }
  if (Number.isFinite(logements) && logements > 0) {
    return logements > 1 ? 'appartement' : 'maison'
  }

  return null
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
    return { type: fromBdnb, source: 'bdnb', parcelle, fiche }
  }

  const fallback = fromBdTopo(properties)
  if (fallback) {
    return { type: fallback, source: 'bdtopo', parcelle, fiche }
  }

  return { type: 'autre', source: 'inconnu', parcelle, fiche }
}
