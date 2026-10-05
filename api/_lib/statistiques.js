// Statistiques d'échantillon — médiane, quantiles, et leurs versions
// pondérées.
//
// Rassemblées ici parce que trois modules les emploient (l'indice temporel, la
// sélection des comparables, la régression de terrain) et qu'une médiane
// recopiée finit toujours par diverger de son original.

/**
 * Médiane d'une série. Retenue plutôt que la moyenne : sur un échantillon de
 * quelques ventes, une seule transaction hors norme — un bien d'exception, une
 * vente entre proches — déplacerait la moyenne de plusieurs dizaines de pour
 * cent.
 */
export function median(values) {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

/** Quantile non pondéré, par interpolation linéaire entre les deux rangs voisins. */
export function quantile(values, q) {
  if (values.length === 0) return null

  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * q
  const bas = Math.floor(position)
  const haut = Math.ceil(position)

  if (bas === haut) return sorted[bas]
  return sorted[bas] + (sorted[haut] - sorted[bas]) * (position - bas)
}

/**
 * Quantile pondéré d'une série de `{ valeur, poids }`.
 *
 * Convention du milieu de palier : la fonction de répartition est évaluée au
 * centre du poids de chaque point — `(cumul précédent + poids/2) / total` —
 * puis interpolée linéairement entre deux points voisins. C'est la convention
 * habituelle des quantiles pondérés, et la seule qui redonne exactement la
 * médiane classique quand tous les poids sont égaux.
 *
 * Sans interpolation, une médiane sur cinq à huit comparables sauterait d'une
 * valeur d'échantillon à l'autre au moindre changement de poids : la
 * fourchette afficherait alors des à-coups que rien, dans le marché, ne
 * justifie.
 */
export function quantilePondere(points, q) {
  const utiles = points.filter((p) => Number.isFinite(p.valeur) && p.poids > 0)
  if (utiles.length === 0) return null
  if (utiles.length === 1) return utiles[0].valeur

  const tries = [...utiles].sort((a, b) => a.valeur - b.valeur)
  const total = tries.reduce((somme, p) => somme + p.poids, 0)

  // Position de chaque point sur la fonction de répartition.
  let cumul = 0
  const positions = tries.map((p) => {
    const position = (cumul + p.poids / 2) / total
    cumul += p.poids
    return position
  })

  if (q <= positions[0]) return tries[0].valeur
  if (q >= positions[positions.length - 1]) return tries[tries.length - 1].valeur

  for (let i = 1; i < positions.length; i += 1) {
    if (q > positions[i]) continue

    const etendue = positions[i] - positions[i - 1]
    const fraction = etendue === 0 ? 0 : (q - positions[i - 1]) / etendue
    return tries[i - 1].valeur + (tries[i].valeur - tries[i - 1].valeur) * fraction
  }

  return tries[tries.length - 1].valeur
}

/** Médiane pondérée — le quantile pondéré 0,5, nommé pour ce qu'il est. */
export const medianePonderee = (points) => quantilePondere(points, 0.5)

/**
 * Résout un système linéaire carré par élimination de Gauss avec pivot
 * partiel. Rend `null` si la matrice est singulière — ce qui, pour la
 * régression de terrain, signifie simplement que l'échantillon ne permet pas
 * de l'estimer, et que l'appelant doit s'abstenir plutôt que d'inventer.
 *
 * Trois inconnues au plus : pas de bibliothèque à embarquer dans une fonction
 * serverless pour cela.
 */
export function resoudre(matrice, second) {
  const n = second.length
  const a = matrice.map((ligne, i) => [...ligne, second[i]])

  for (let colonne = 0; colonne < n; colonne += 1) {
    let pivot = colonne
    for (let ligne = colonne + 1; ligne < n; ligne += 1) {
      if (Math.abs(a[ligne][colonne]) > Math.abs(a[pivot][colonne])) pivot = ligne
    }

    if (Math.abs(a[pivot][colonne]) < 1e-12) return null
    ;[a[colonne], a[pivot]] = [a[pivot], a[colonne]]

    for (let ligne = 0; ligne < n; ligne += 1) {
      if (ligne === colonne) continue
      const facteur = a[ligne][colonne] / a[colonne][colonne]
      for (let k = colonne; k <= n; k += 1) a[ligne][k] -= facteur * a[colonne][k]
    }
  }

  return a.map((ligne, i) => ligne[n] / ligne[i])
}

/**
 * Inverse d'une matrice carrée, par Gauss-Jordan. Sert à lire la matrice de
 * covariance des coefficients d'une régression, donc à juger si le coefficient
 * de terrain est significatif ou s'il n'est que du bruit.
 */
export function inverse(matrice) {
  const n = matrice.length
  const a = matrice.map((ligne, i) => [
    ...ligne,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ])

  for (let colonne = 0; colonne < n; colonne += 1) {
    let pivot = colonne
    for (let ligne = colonne + 1; ligne < n; ligne += 1) {
      if (Math.abs(a[ligne][colonne]) > Math.abs(a[pivot][colonne])) pivot = ligne
    }

    if (Math.abs(a[pivot][colonne]) < 1e-12) return null
    ;[a[colonne], a[pivot]] = [a[pivot], a[colonne]]

    const diagonale = a[colonne][colonne]
    for (let k = 0; k < 2 * n; k += 1) a[colonne][k] /= diagonale

    for (let ligne = 0; ligne < n; ligne += 1) {
      if (ligne === colonne) continue
      const facteur = a[ligne][colonne]
      for (let k = 0; k < 2 * n; k += 1) a[ligne][k] -= facteur * a[colonne][k]
    }
  }

  return a.map((ligne) => ligne.slice(n))
}
