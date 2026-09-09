// Étape A — caractéristiques du bien sélectionné : surface retenue pour le
// calcul, et année de construction quand les bases la connaissent.
//
// La chaîne est celle déjà utilisée par la carte (cadastre → BDNB) : les
// clients correspondants vivent dans `src/lib` et sont purement isomorphes,
// on les réutilise ici plutôt que d'en tenir une seconde version.

import { fetchBuildingsOnParcel } from '../../src/lib/bdnb.js'
import { fetchBuildingAt, fetchParcelle } from '../../src/lib/ign.js'

const DPE_ENDPOINT = 'https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_dpe_representatif_logement'

const DPE_FIELDS = [
  'batiment_groupe_id',
  'surface_habitable_logement',
  'surface_habitable_immeuble',
  'nombre_niveau_logement',
]

/** Au-delà, mieux vaut la surface géométrique tout de suite que la bonne réponse trop tard. */
const FETCH_TIMEOUT_MS = 4000

/**
 * Bornes de vraisemblance par type. Une surface hors de ces bornes n'est pas
 * corrigée mais écartée : une donnée aberrante multipliée par un prix au m²
 * produit exactement le genre d'estimation qui décrédibilise tout le parcours.
 */
const PLAUSIBLE = {
  maison: [20, 800],
  appartement: [9, 400],
  terrain: [50, 50000],
}

/**
 * Part réellement habitable d'un bâtiment, rapportée à emprise au sol ×
 * niveaux. L'emprise est mesurée au nu extérieur des murs et englobe tout ce
 * que la surface habitable exclut : murs, cage d'escalier, garage intégré,
 * combles perdus, parties communes.
 *
 * Valeur relevée sur les bâtiments que la BDNB documente à la fois par leur
 * géométrie et par un DPE — donc dont la surface habitable est connue : le
 * rapport y est médian à 0,678 (n = 92 maisons, quartiles 0,52 et 0,80).
 * Reconstituée avec ce coefficient, la surface ressort à 1,03 fois la surface
 * habitable réelle en médiane : la formule ne penche ni d'un côté ni de
 * l'autre, elle est seulement bruitée — quartiles 0,87 et 1,35.
 *
 * L'API ouverte plafonne ses réponses à dix lignes par requête, d'où la
 * pagination qu'il a fallu dérouler pour obtenir cet échantillon : il donne un
 * ordre de grandeur solide, pas un étalon.
 *
 * Ce coefficient ne sert que de repli — dès qu'un DPE couvre le bâtiment,
 * c'est sa surface habitable qui est retenue, sans reconstitution.
 */
const HABITABLE_RATIO = 0.7

/**
 * Niveaux plafonnés pour une maison : au-delà de trois, la donnée est fausse
 * plus souvent qu'elle n'est vraie, et l'erreur se paierait au prix fort une
 * fois multipliée par un prix au m². Un collectif garde ses niveaux réels — sa
 * surface est ensuite ramenée au logement.
 */
const MAX_LEVELS_HOUSE = 3
const MAX_LEVELS_BUILDING = 30

/**
 * Paliers de hauteur, en mètres, au-delà desquels on compte un niveau de plus.
 *
 * Le piège de la hauteur BD TOPO® est qu'elle est mesurée **au faîtage**, pas à
 * l'égout du toit : une maison de plain-pied mesure 5,2 m en médiane (n = 203,
 * quartiles 4,6 et 6,6), une R+1 en mesure 7,9 m. Diviser bêtement la hauteur
 * par une hauteur d'étage — 3 m, le réflexe naturel — donne alors deux niveaux
 * à 72 % des plain-pied : soit exactement la sur-évaluation que ce repli est
 * censé éviter, en sens inverse.
 *
 * D'où ces paliers : le premier absorbe la toiture en plus du rez-de-chaussée,
 * les suivants valent une hauteur d'étage ordinaire. Relevés sur 2 181
 * bâtiments résidentiels portant à la fois hauteur et nombre d'étages
 * (secteur de l'agence et cinq grandes villes), ils retrouvent le bon nombre de
 * niveaux dans 42 % des cas et tombent à un niveau près dans 84 %, sans biais
 * médian — contre 38 % pour une simple division par 3.
 */
const HEIGHT_LEVELS = [7, 10, 13, 16, 19]

/**
 * Niveaux estimés depuis la hauteur au faîtage. Un bâtiment bas reste à un
 * seul niveau : le repli ne doit corriger que ce que la hauteur désigne
 * réellement comme un bâtiment à étages.
 */
function niveauxDepuisHauteur(hauteur) {
  const h = Number(hauteur)
  if (!Number.isFinite(h) || h <= 0) return null

  return HEIGHT_LEVELS.reduce((levels, palier) => (h >= palier ? levels + 1 : levels), 1)
}

/**
 * Niveaux retenus quand rien — ni les bases, ni la hauteur — n'a rien à dire.
 *
 * Compter un seul niveau reviendrait à retenir l'emprise au sol nue, ce qui
 * sous-évalue mécaniquement tout bâtiment à étage. Un niveau et demi traduit
 * qu'une maison a le plus souvent un étage, complet ou partiel : appliqué avec
 * `HABITABLE_RATIO`, il ramène la surface estimée à 1,05 fois l'emprise, très
 * près du rapport médian de 1,04 relevé entre emprise au sol et surface
 * habitable réelle sur le parc local.
 */
const DEFAULT_LEVELS = 1.5

/**
 * Surface d'un appartement quand aucune source n'a rien à en dire. Ordre de
 * grandeur du parc collectif français, retenu faute de mieux : sans surface, il
 * n'y a pas d'estimation du tout, et le parcours ne doit jamais s'arrêter.
 */
const DEFAULT_APARTMENT_M2 = 65

const inRange = (value, [min, max]) => Number.isFinite(value) && value >= min && value <= max

function readNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Fiche DPE représentative d'un bâtiment — seule source BDNB à porter une
 * véritable surface habitable. Sa couverture est partielle (les bâtiments
 * n'ont pas tous fait l'objet d'un diagnostic), d'où les replis géométriques
 * qui suivent. Renvoie `null` sans lever : une absence est ici la norme.
 */
async function fetchDpe(batimentGroupeId, { signal } = {}) {
  if (!batimentGroupeId) return null

  const params = new URLSearchParams({
    batiment_groupe_id: `eq.${batimentGroupeId}`,
    select: DPE_FIELDS.join(','),
  })

  try {
    const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS)
    const response = await fetch(`${DPE_ENDPOINT}?${params}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    if (!response.ok) return null

    const data = await response.json().catch(() => null)
    return Array.isArray(data) && data[0] ? data[0] : null
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}

/**
 * Retrouve la fiche BDNB du bâtiment quand le front n'a pas pu la joindre —
 * détection interrompue, réseau capricieux. Même rapprochement par emprise au
 * sol que côté carte : les deux bases n'ont aucun identifiant commun.
 */
async function resolveFiche({ lat, lon, areaM2, parcelle }, { signal } = {}) {
  const resolved = parcelle ?? (await fetchParcelle(lat, lon, { signal }).catch(() => null))
  if (!resolved?.idu) return { parcelle: null, fiche: null }

  const candidates = await fetchBuildingsOnParcel(resolved, { signal }).catch(() => [])
  if (candidates.length === 0) return { parcelle: resolved, fiche: null }

  const fiche = Number.isFinite(areaM2)
    ? candidates.reduce((best, c) =>
        Math.abs((c.s_geom_groupe ?? 0) - areaM2) < Math.abs((best.s_geom_groupe ?? 0) - areaM2)
          ? c
          : best,
      )
    : candidates.reduce((best, c) => ((c.s_geom_groupe ?? 0) > (best.s_geom_groupe ?? 0) ? c : best))

  return { parcelle: resolved, fiche }
}

/**
 * Surface retenue pour le calcul, et provenance de cette surface.
 *
 * Deux sources, par ordre de fiabilité décroissante : la surface habitable
 * mesurée d'un DPE, puis le produit emprise au sol × niveaux — les niveaux
 * étant eux-mêmes cherchés successivement dans la BDNB, la BD TOPO®, la
 * hauteur du bâtiment, et seulement à défaut présumés.
 *
 * L'emprise au sol nue n'est jamais retenue comme surface finale : c'est la
 * surface d'un seul plancher, et l'utiliser telle quelle sous-évaluait tout
 * bâtiment à étages d'un facteur égal à son nombre de niveaux.
 *
 * Aucune de ces étapes ne peut interrompre le calcul : à défaut de tout, un
 * ordre de grandeur vaut mieux qu'un parcours qui s'arrête.
 */
function resolveSurface({ type, fiche, dpe, areaM2, properties, contenance }) {
  const limits = PLAUSIBLE[type] ?? PLAUSIBLE.maison

  if (type === 'terrain') {
    const cadastre = readNumber(contenance)
    if (inRange(cadastre, limits)) return { surfaceM2: cadastre, source: 'cadastre' }

    const footprint = readNumber(areaM2) ?? readNumber(fiche?.s_geom_groupe)
    if (inRange(footprint, limits)) return { surfaceM2: footprint, source: 'emprise' }

    return { surfaceM2: null, source: 'aucune' }
  }

  const logements = readNumber(fiche?.nb_log) ?? readNumber(properties?.nombre_de_logements)
  const collective = type === 'appartement'

  // 1. Surface habitable issue d'un DPE — la seule mesurée, jamais reconstituée.
  const habitableUnit = readNumber(dpe?.surface_habitable_logement)
  const habitableBuilding = readNumber(dpe?.surface_habitable_immeuble)

  if (collective) {
    // La surface de l'immeuble ramenée au nombre de logements passe avant celle
    // du logement « représentatif » du DPE : ce dernier n'est qu'un diagnostic
    // parmi ceux du bâtiment, et si c'est celui d'un studio, il tirerait
    // l'estimation de tous les appartements de l'immeuble vers le bas.
    const perUnit = habitableBuilding && logements ? habitableBuilding / logements : null
    if (inRange(perUnit, limits)) return { surfaceM2: perUnit, source: 'dpe-immeuble' }
    if (inRange(habitableUnit, limits)) return { surfaceM2: habitableUnit, source: 'dpe' }
  } else {
    if (inRange(habitableBuilding, limits)) return { surfaceM2: habitableBuilding, source: 'dpe' }
    if (inRange(habitableUnit, limits)) return { surfaceM2: habitableUnit, source: 'dpe' }
  }

  // 2. Reconstitution géométrique : emprise au sol × niveaux.
  //
  // En collectif, elle n'a de sens que si le nombre de logements est connu :
  // sans lui, on ne divise rien et l'on estimerait l'immeuble entier au lieu
  // de l'appartement — l'erreur d'un facteur dix qu'il faut précisément éviter.
  // L'emprise du contour effectivement cliqué prime sur celle de la BDNB :
  // `s_geom_groupe` porte sur un *groupe* de bâtiments, que la base fusionne
  // dès qu'ils sont contigus — une ferme et sa grange, une rangée de maisons
  // de ville. Le polygone BD TOPO®, lui, ne décrit que le bâtiment désigné.
  const footprint = readNumber(areaM2) ?? readNumber(fiche?.s_geom_groupe)

  // Les niveaux, par ordre de fiabilité décroissante : comptés par la BDNB,
  // comptés par la BD TOPO®, déduits de la hauteur au faîtage, et à défaut
  // présumés. Ce qu'il ne faut surtout pas faire, c'est retomber sur un seul
  // niveau faute de mieux — c'est ce qui sous-évaluait les bâtiments à étages.
  const levels = Math.min(
    readNumber(fiche?.nb_niveau) ??
      readNumber(properties?.nombre_d_etages) ??
      niveauxDepuisHauteur(properties?.hauteur) ??
      DEFAULT_LEVELS,
    collective ? MAX_LEVELS_BUILDING : MAX_LEVELS_HOUSE,
  )

  if (footprint && (!collective || logements > 1)) {
    const built = footprint * levels * HABITABLE_RATIO
    const candidate = collective ? built / logements : built
    if (inRange(candidate, limits)) return { surfaceM2: candidate, source: 'geometrie' }

    // 3. Reconstitution hors bornes. Au-dessus du plafond, on s'y arrête : le
    // bâtiment est au moins aussi grand que ça, et retomber sur l'emprise au
    // sol nue — le repli d'origine — reviendrait à diviser la surface par le
    // nombre de niveaux, soit à sous-évaluer d'autant plus que le bâtiment est
    // haut. En dessous du plancher, il n'y a rien à sauver : une emprise de
    // quelques mètres carrés désigne un abri, pas un logement.
    if (!collective && candidate > limits[1]) {
      return { surfaceM2: limits[1], source: 'geometrie-plafonnee' }
    }
  }

  if (collective) return { surfaceM2: DEFAULT_APARTMENT_M2, source: 'defaut' }

  return { surfaceM2: null, source: 'aucune' }
}

/**
 * Caractéristiques du bien sélectionné.
 *
 * Le front transmet ce qu'il a déjà appris en repérant le bâtiment sur la
 * carte (emprise, parcelle, identifiant BDNB) ; tout ce qui manque est
 * retrouvé ici. Aucune de ces requêtes n'est bloquante : chacune a son repli,
 * et la fonction renvoie toujours un résultat exploitable.
 */
export async function describeBien(selection, { signal } = {}) {
  const { lat, lon, type, areaM2, properties } = selection

  // Le repérage sur la carte a déjà interrogé le cadastre puis la BDNB pour
  // déterminer le type du bien : quand le front nous transmet ce qu'il en a
  // retiré, l'étape A se résume à la fiche DPE — deux ou trois secondes de
  // gagnées sur le budget de l'écran de chargement.
  const resolved = selection.fiche
    ? { parcelle: selection.parcelle ?? null, fiche: selection.fiche }
    : await resolveFiche(
        { lat, lon, areaM2, parcelle: selection.parcelle ?? null },
        { signal },
      ).catch(() => ({ parcelle: selection.parcelle ?? null, fiche: null }))

  const { parcelle, fiche } = resolved
  const batimentGroupeId = fiche?.batiment_groupe_id ?? selection.batimentGroupeId

  // On ne va chercher la hauteur que si elle sert : elle ne compte les niveaux
  // que lorsque ni la BDNB ni la BD TOPO® ne les ont comptés, et la requête ne
  // mérite d'être payée que dans ce cas-là. Elle part en même temps que le DPE
  // plutôt qu'après : enchaînées, les deux coûteraient le double sur le budget
  // de l'écran de chargement.
  const besoinHauteur =
    type !== 'terrain' &&
    readNumber(fiche?.nb_niveau) === null &&
    readNumber(properties?.nombre_d_etages) === null &&
    readNumber(properties?.hauteur) === null

  const [dpe, releve] = await Promise.all([
    fetchDpe(batimentGroupeId, { signal }).catch(() => null),
    besoinHauteur ? fetchBuildingAt(lat, lon, { signal }).catch(() => null) : null,
  ])

  const { surfaceM2, source } = resolveSurface({
    type,
    fiche,
    dpe,
    areaM2,
    properties: releve ? { ...properties, ...releve } : properties,
    contenance: selection.contenance ?? parcelle?.contenance,
  })

  return {
    surfaceM2: surfaceM2 === null ? null : Math.round(surfaceM2),
    surfaceSource: source,
    // Récupérée comme le demande l'étape A, mais volontairement sans effet sur
    // le prix : le calcul retenu est la seule médiane au m², sans correctif.
    anneeConstruction: readNumber(fiche?.annee_construction),
    codeInsee: parcelle?.codeInsee ?? null,
  }
}
