// Indice de prix par semestre, reconstruit sur DVF — étape préalable à toute
// comparaison.
//
// POURQUOI. La fenêtre d'historique est de cinq ans, et cinq ans de marché
// immobilier ne sont pas comparables entre eux. Relevé sur les seules maisons
// des Bouches-du-Rhône, la médiane départementale va de 3 807 €/m² en 2021 à
// 4 221 €/m² en 2023 : mettre dans la même médiane une vente de 2021 et une
// vente de 2025 sans rien corriger, c'est mélanger deux marchés et appeler le
// résultat une estimation. L'ancien moteur faisait exactement cela — aucune
// pondération par la date, aucune actualisation.
//
// COMMENT. Une médiane de €/m² par semestre et par type de bien, à l'échelle
// de la commune quand elle en a le volume, du département sinon. Chaque vente
// est ensuite ramenée au dernier semestre disponible par le rapport des deux
// indices. Le procédé est grossier — il ne tient compte ni de la composition
// de l'échantillon, ni du mix de surfaces — mais il corrige la dérive dans le
// bon sens et avec les seules données dont on dispose.
//
// Le lissage n'est pas un raffinement : sur quelques centaines de ventes, une
// médiane semestrielle bouge de plusieurs pour cent par pur hasard
// d'échantillonnage, et sans lissage ce bruit se retrouverait multiplié tel
// quel dans le prix de chaque comparable.

import { INDICE, FENETRE_ANNEES } from './estimationConfig.js'
import { semestreLabel } from './dvf.js'
import { median } from './statistiques.js'

/**
 * Construit l'indice d'un type de bien.
 *
 * `ventes` doit être la liste **complète** des ventes du type considéré
 * chargées pour le département : l'indice se calcule sur le volume, pas sur le
 * voisinage — c'est même tout l'intérêt de le séparer de la sélection des
 * comparables.
 *
 * `semestreCible`, s'il est fourni ET qu'il porte un point d'indice, désigne le
 * semestre auquel les ventes seront ramenées. Sinon — et c'est le cas en
 * production, où la date du jour devance toujours le dernier millésime publié —
 * la référence reste le dernier semestre réellement disponible. Ce paramètre
 * n'existe que pour le banc de test, qui doit actualiser les comparables au
 * semestre de la vente qu'il cache au moteur, et non au dernier semestre connu
 * de nous aujourd'hui.
 *
 * Rend de quoi actualiser (`coefficient`) et de quoi se relire (`zone`,
 * `semestreReference`, `points`).
 */
export function construitIndice(ventes, { codeInsee, departement, semestreCible = null }) {
  const semestres = [...new Set(ventes.map((v) => v.semestre))].sort((a, b) => a - b)

  // La fenêtre est bornée par le dernier semestre réellement publié, et non
  // par l'année civile en cours : DVF paraît avec plusieurs mois de retard, et
  // un semestre à moitié rempli ferait un point d'indice trompeur.
  const dernier = semestres[semestres.length - 1] ?? null
  if (dernier === null) {
    return indiceNeutre({ motif: 'aucune-vente' })
  }

  const premier = dernier - FENETRE_ANNEES * 2 + 1
  const fenetre = semestres.filter((s) => s >= premier)

  // Échelle communale à deux conditions : la **médiane** des volumes
  // semestriels atteint 30 ventes, et **aucun** semestre ne descend sous 15.
  //
  // La règle précédente exigeait 30 ventes à chaque semestre. Elle renvoyait au
  // département des communes qui en avaient largement le volume, pour un seul
  // semestre creux — et le semestre le plus récent l'est presque toujours, DVF
  // étant publié par tranches. Le couple médiane + plancher garde l'intention
  // (pas d'indice bâti sur un semestre vide, qui sauterait d'un point à
  // l'autre) sans sanctionner un creux isolé.
  const communales = codeInsee
    ? ventes.filter((v) => String(v.commune) === String(codeInsee) && v.semestre >= premier)
    : []

  const parSemestre = (liste) => {
    const table = new Map()
    for (const vente of liste) {
      if (vente.semestre < premier) continue
      if (!table.has(vente.semestre)) table.set(vente.semestre, [])
      table.get(vente.semestre).push(vente.pricePerM2)
    }
    return table
  }

  const tableCommune = parSemestre(communales)
  const volumes = fenetre.map((s) => tableCommune.get(s)?.length ?? 0)

  const communeSuffit =
    volumes.length > 0 &&
    (median(volumes) ?? 0) >= INDICE.medianeVentesSemestreCommune &&
    Math.min(...volumes) >= INDICE.minVentesSemestreCommune

  const zone = communeSuffit ? 'commune' : 'departement'
  const table = communeSuffit ? tableCommune : parSemestre(ventes)

  const brut = new Map()
  for (const s of fenetre) {
    const valeurs = table.get(s)
    if (valeurs && valeurs.length > 0) brut.set(s, median(valeurs))
  }

  if (brut.size === 0) return indiceNeutre({ motif: 'aucun-semestre-exploitable', zone })

  const lisse = lissage(fenetre, brut, INDICE.lissageSemestres)

  // Référence : le semestre demandé s'il porte un point d'indice, à défaut le
  // dernier semestre qui en porte un.
  const reference =
    semestreCible != null && lisse.has(semestreCible)
      ? semestreCible
      : [...lisse.keys()].sort((a, b) => a - b).pop()

  const valeurReference = lisse.get(reference)

  /**
   * Coefficient qui ramène une vente de `semestre` au semestre de référence.
   *
   * Un semestre hors fenêtre ou sans point d'indice rend 1 : ne rien savoir ne
   * doit ni bonifier ni pénaliser la vente. Le coefficient est borné — hors de
   * ces bornes, c'est l'indice qui est en cause, pas le marché.
   */
  const coefficient = (semestre) => {
    const valeur = lisse.get(semestre)
    if (!valeur || !valeurReference) return 1
    const ratio = valeurReference / valeur
    return Math.min(Math.max(ratio, INDICE.coefficientMin), INDICE.coefficientMax)
  }

  return {
    coefficient,
    zone,
    zoneCode: communeSuffit ? String(codeInsee) : String(departement),
    // Pourquoi cette échelle-là : les deux mesures qui ont tranché, en regard
    // de leurs seuils. « departement » sans motif n'apprend rien.
    echelle: {
      medianeVentesSemestreCommune: median(volumes) ?? 0,
      minVentesSemestreCommune: volumes.length > 0 ? Math.min(...volumes) : 0,
      seuilMediane: INDICE.medianeVentesSemestreCommune,
      seuilPlancher: INDICE.minVentesSemestreCommune,
    },
    semestreReference: semestreLabel(reference),
    // Le détail, pour que l'indice se relise dans le journal plutôt que de
    // rester une boîte noire au milieu du calcul.
    points: fenetre.map((s) => ({
      semestre: semestreLabel(s),
      ventes: table.get(s)?.length ?? 0,
      indiceBrut: brut.has(s) ? Math.round(brut.get(s)) : null,
      indiceLisse: lisse.has(s) ? Math.round(lisse.get(s)) : null,
      coefficient: Number(coefficient(s).toFixed(4)),
    })),
    motif: null,
  }
}

/** Indice qui n'actualise rien — servi quand les données ne permettent pas d'en construire un. */
function indiceNeutre({ motif, zone = null }) {
  return {
    coefficient: () => 1,
    zone,
    zoneCode: null,
    echelle: null,
    semestreReference: null,
    points: [],
    motif,
  }
}

/**
 * Moyenne glissante centrée sur `largeur` semestres.
 *
 * Les bords n'ont pas de voisins des deux côtés : la fenêtre s'y rétrécit au
 * lieu d'être complétée par extrapolation — le dernier semestre sert de
 * référence à tout le reste, il vaut mieux qu'il reste ce que les ventes
 * disent plutôt qu'une projection.
 */
function lissage(semestres, brut, largeur) {
  const demi = Math.floor(largeur / 2)
  const lisse = new Map()

  for (const s of semestres) {
    if (!brut.has(s)) continue

    const voisins = []
    for (let d = -demi; d <= demi; d += 1) {
      const valeur = brut.get(s + d)
      if (valeur) voisins.push(valeur)
    }

    lisse.set(s, voisins.reduce((a, b) => a + b, 0) / voisins.length)
  }

  return lisse
}

/**
 * Applique l'indice à une vente : prix et €/m² actualisés au semestre de
 * référence, coefficient conservé pour le journal.
 *
 * Le prix l'est aussi, pas seulement le €/m² : la régression de terrain
 * (`terrain.js`) travaille sur des prix, et il serait absurde qu'elle le fasse
 * sur des millésimes non ramenés au même niveau.
 */
export function actualise(vente, indice) {
  const coefficient = indice.coefficient(vente.semestre)

  return {
    ...vente,
    coefficientTemps: coefficient,
    prixActualise: vente.price * coefficient,
    prixM2Actualise: vente.pricePerM2 * coefficient,
  }
}
