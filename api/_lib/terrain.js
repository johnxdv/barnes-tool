// Ajustement de terrain — maisons seulement.
//
// LE PIÈGE, à relire avant de toucher quoi que ce soit ici. Le €/m² d'une
// maison dans DVF **inclut déjà la valeur de son terrain** : le prix de la
// mutation entière (maison + dépendance + terrain) est divisé par la seule
// surface de plancher du logement. Deux erreurs en découlent, qu'il faut
// écarter d'emblée :
//
//   • multiplier la contenance du bien par le €/m² habitable — absurde, ce
//     sont deux grandeurs sans rapport ;
//   • ajouter au produit « €/m² × surface habitable » la valeur du terrain du
//     bien — double comptage pur, puisque le premier terme contient déjà la
//     valeur d'un terrain, celui des comparables.
//
// Seule la **différence** de terrain entre le bien et ses comparables se
// valorise. Si le bien a 359 m² là où ses comparables en ont 207 en médiane,
// on valorise 152 m² de plus, et rien d'autre.
//
// LE MODÈLE. Régression des prix actualisés sur la surface habitable et le
// logarithme du terrain :
//
//     prix ≈ a × surface_habitable + c × ln(terrain) + k
//
// Le logarithme porte les rendements décroissants demandés : la valeur d'un m²
// de terrain supplémentaire vaut `c / T`, donc dix fois moins sur un terrain de
// 2 000 m² que sur un terrain de 200 m². C'est le comportement qu'on observe —
// au-delà d'une certaine surface, le terrain d'une maison de ville cesse
// d'ajouter de la valeur au rythme de ses premiers mètres carrés.
//
// L'ajustement est alors l'intégrale exacte de cette valeur marginale entre le
// terrain de référence et celui du bien :
//
//     ajustement = ∫(Tref → Tbien) c/T dT = c × ln(Tbien / Tref)
//
// Ce qui a le mérite de rester cohérent avec le modèle au lieu de linéariser
// autour d'un point arbitraire.
//
// L'ÉCHANTILLON est large et distinct des comparables — deux kilomètres, cinq
// ans, cinquante ventes au minimum. Une régression sur les cinq à huit
// comparables retenus ne dirait rien du tout : elle aurait autant de
// paramètres que de degrés de liberté utiles.

import { TERRAIN } from './estimationConfig.js'
import { inverse, median, quantile, resoudre } from './statistiques.js'
import { distanceM } from './geo.js'

/**
 * Estime la valeur du terrain dans le secteur.
 *
 * `ventes` : toutes les maisons actualisées du département chargé. La zone est
 * resserrée ici même, du rayon à la commune puis au département, jusqu'à
 * réunir `TERRAIN.minVentes` ventes au terrain connu.
 *
 * Ne lève jamais : un échantillon trop mince ou un coefficient non significatif
 * rend un résultat inexploitable mais explicite (`significatif: false`,
 * `motif`), que l'appelant traduit par « pas d'ajustement » — et le dit dans
 * `meta`. Corriger au hasard serait pire que ne pas corriger.
 */
export function estimeValeurTerrain(ventes, { lat, lon, codeInsee, departement }) {
  const connues = ventes.filter((v) => v.surfaceTerrain > 0 && v.prixActualise > 0 && v.surface > 0)

  // Trois zones, de la plus pertinente à la plus large. On s'arrête à la
  // première qui réunit le volume exigé.
  const zones = [
    {
      nom: 'rayon',
      detail: `${TERRAIN.rayonM} m`,
      ventes: connues.filter((v) => distanceM(lat, lon, v.lat, v.lon) <= TERRAIN.rayonM),
    },
    {
      nom: 'commune',
      detail: String(codeInsee ?? ''),
      ventes: codeInsee ? connues.filter((v) => String(v.commune) === String(codeInsee)) : [],
    },
    { nom: 'departement', detail: String(departement ?? ''), ventes: connues },
  ]

  const zone = zones.find((z) => z.ventes.length >= TERRAIN.minVentes) ?? zones[zones.length - 1]

  if (zone.ventes.length < TERRAIN.minVentes) {
    return echec('echantillon-insuffisant', zone)
  }

  // Écrêtage des queues de la distribution de terrain. Le terrain a une queue
  // droite très longue — un seul terrain de 20 000 m² pèse, en logarithme,
  // autant que plusieurs dizaines de parcelles ordinaires, et emporterait la
  // pente à lui seul.
  const terrains = zone.ventes.map((v) => v.surfaceTerrain)
  const bas = quantile(terrains, 0.01)
  const haut = quantile(terrains, 0.99)
  const retenues = zone.ventes.filter((v) => v.surfaceTerrain >= bas && v.surfaceTerrain <= haut)

  if (retenues.length < TERRAIN.minVentes) return echec('echantillon-insuffisant', zone)

  // Moindres carrés ordinaires sur [surface, ln(terrain), 1].
  const X = retenues.map((v) => [v.surface, Math.log(v.surfaceTerrain), 1])
  const y = retenues.map((v) => v.prixActualise)
  const n = retenues.length
  const p = 3

  const XtX = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => X.reduce((somme, ligne) => somme + ligne[i] * ligne[j], 0)),
  )
  const Xty = Array.from({ length: p }, (_, i) =>
    X.reduce((somme, ligne, k) => somme + ligne[i] * y[k], 0),
  )

  const beta = resoudre(XtX, Xty)
  const inverseXtX = inverse(XtX)
  if (!beta || !inverseXtX) return echec('systeme-singulier', zone, retenues.length)

  const [a, c] = beta

  // Variance résiduelle, puis erreur type du coefficient de terrain : c'est
  // elle qui dit si la pente observée vaut mieux qu'un tirage au sort.
  const rss = y.reduce((somme, valeur, k) => {
    const prevu = X[k][0] * beta[0] + X[k][1] * beta[1] + X[k][2] * beta[2]
    return somme + (valeur - prevu) ** 2
  }, 0)

  const sigma2 = rss / (n - p)
  const erreurType = Math.sqrt(Math.max(sigma2 * inverseXtX[1][1], 0))
  const tStat = erreurType > 0 ? c / erreurType : 0

  const base = {
    zone: zone.nom,
    zoneDetail: zone.detail,
    echantillon: retenues.length,
    coefficientLog: c,
    coefficientSurface: a,
    tStat,
    terrainMedian: median(terrains),
    // Sert uniquement à la décomposition lisible bâti / terrain de `meta` :
    // le « terrain minimal » du secteur, contre lequel se mesure la valeur
    // foncière du bien. Aucun effet sur le prix.
    terrainPlancher: Math.max(quantile(terrains, TERRAIN.percentileTerrainNu) ?? 1, 1),
  }

  if (!(c > 0)) return { ...base, significatif: false, motif: 'coefficient-negatif' }
  if (!(tStat >= TERRAIN.tStatMin)) return { ...base, significatif: false, motif: 'non-significatif' }

  return { ...base, significatif: true, motif: null }
}

function echec(motif, zone, echantillon = zone.ventes.length) {
  return {
    zone: zone.nom,
    zoneDetail: zone.detail,
    echantillon,
    coefficientLog: null,
    coefficientSurface: null,
    tStat: null,
    terrainMedian: zone.ventes.length ? median(zone.ventes.map((v) => v.surfaceTerrain)) : null,
    terrainPlancher: null,
    significatif: false,
    motif,
  }
}

/**
 * Valeur d'un m² de terrain supplémentaire au voisinage de `terrain`, en €/m².
 *
 * C'est le « b » de la consigne, rendu explicite : il n'est pas constant, il
 * dépend de la taille du terrain sur lequel on ajoute ce mètre carré.
 */
export function valeurM2Terrain(valeurTerrain, terrain) {
  if (!valeurTerrain?.significatif || !(terrain > 0)) return null
  return valeurTerrain.coefficientLog / terrain
}

/**
 * Ajustement en euros pour passer du terrain de référence à celui du bien,
 * plafonné à `TERRAIN.plafondPct` de la part bâtie.
 *
 * Rend toujours un objet lisible — `montant: 0` et un `motif` quand
 * l'ajustement n'a pas lieu d'être. Le plafond est signalé quand il mord :
 * c'est le genre de chose qu'on veut voir dans un journal plutôt que déduire
 * d'un écart inexpliqué.
 */
export function ajustementTerrain(valeurTerrain, { terrainBien, terrainReference, partBati }) {
  if (!valeurTerrain?.significatif) {
    return { montant: 0, motif: valeurTerrain?.motif ?? 'indisponible', plafonne: false }
  }
  if (!(terrainBien > 0)) {
    return { montant: 0, motif: 'terrain-bien-inconnu', plafonne: false }
  }
  if (!(terrainReference > 0)) {
    return { montant: 0, motif: 'terrain-reference-inconnu', plafonne: false }
  }

  const brut = valeurTerrain.coefficientLog * Math.log(terrainBien / terrainReference)
  const plafond = Math.abs(partBati) * TERRAIN.plafondPct
  const montant = Math.min(Math.max(brut, -plafond), plafond)

  return {
    montant,
    brut,
    motif: null,
    plafonne: Math.abs(brut) > plafond,
    plafond,
  }
}
