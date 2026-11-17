// Recherche dans le pool de points de référence (`../_data/points-reference.js`).
//
// Deux accès, dans l'ordre où la cascade de `reference.js` les emploie :
// la commune exacte, puis le point connu le plus proche.
//
// La logique de proximité est volontairement la même que celle des ventes DVF
// — `distanceM` et « les plus proches d'abord » (voir `candidatesDuSecteur` dans
// `moteur.js`). Ce sont deux chiffres présentés au même utilisateur, et
// rien ne justifierait qu'ils ne se ressemblent pas.

import { POINTS_REFERENCE } from '../_data/points-reference.js'
import { distanceM } from './geo.js'

/**
 * Portée d'un point de référence.
 *
 * Au-delà, le point ne dit plus rien de l'adresse estimée : 25 km en Moselle,
 * c'est Metz vu depuis Sarreguemines, deux marchés sans rapport. Mieux vaut
 * alors la valeur départementale, qui ne prétend à rien, qu'un prix local
 * emprunté à un secteur qui n'est pas le bon.
 *
 * C'est l'arbitrage inverse de celui de DVF, et pour une bonne raison : là-bas
 * on élargit parce que chaque palier ramène de vraies ventes, ici on ne
 * ramènerait qu'un seul point de plus en plus lointain.
 */
export const RAYON_MAX_M = 25000

/** Clé de prix retenue pour un type de bien — `autre` et `local` suivent la maison. */
export function clePrix(type) {
  return type === 'appartement' || type === 'terrain' ? type : 'maison'
}

/** Le point porte-t-il un prix exploitable pour ce type de bien ? */
function renseigne(point, key) {
  const valeur = Number(point?.prix?.[key])
  return Number.isFinite(valeur) && valeur > 0
}

/**
 * Point de référence de la commune exacte, ou `null`.
 *
 * Un point sans prix pour ce type de bien ne compte pas : la commune est bien
 * dans le pool, mais elle n'a rien à dire sur ce type-là, et la recherche doit
 * poursuivre plutôt que de s'arrêter sur une case vide.
 *
 * **Un code INSEE ne désigne pas forcément un seul point.** Les grandes villes
 * sont découpées en quartiers, qui partagent le code de leur commune : Metz en
 * compte douze, de Borny (1 750 €/m²) au Centre-Ville (2 900 €/m²). Prendre le
 * premier venu reviendrait à servir le même prix dans toute la ville, et à
 * rendre ce découpage inutile — pire, le résultat dépendrait de l'ordre du
 * fichier. Les coordonnées tranchent donc, quand elles sont connues : c'est le
 * quartier le plus proche qui répond.
 */
export function pointCommune(codeInsee, type, lat, lon) {
  if (!codeInsee) return null
  const key = clePrix(type)
  const code = String(codeInsee)

  const candidats = POINTS_REFERENCE.filter(
    (p) => String(p.codeInsee) === code && renseigne(p, key),
  )

  if (candidats.length === 0) return null
  if (candidats.length === 1) return candidats[0]

  // Sans coordonnées — rare, mais possible — le premier fait l'affaire : tous
  // ces points décrivent la même commune, aucun n'est absurde.
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return candidats[0]

  return candidats.reduce((meilleur, p) =>
    distanceM(lat, lon, p.lat, p.lon) < distanceM(lat, lon, meilleur.lat, meilleur.lon)
      ? p
      : meilleur,
  )
}

/**
 * Point de référence renseigné le plus proche d'un point, dans `RAYON_MAX_M`.
 *
 * Renvoie `{ point, distanceM }`, ou `null` si le pool est vide, si aucun
 * point ne renseigne ce type de bien, ou si le plus proche est trop loin.
 */
export function pointLePlusProche(lat, lon, type, rayonM = RAYON_MAX_M) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const key = clePrix(type)

  let meilleur = null

  for (const point of POINTS_REFERENCE) {
    if (!renseigne(point, key)) continue
    if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue

    const d = distanceM(lat, lon, point.lat, point.lon)
    if (d > rayonM) continue
    if (meilleur === null || d < meilleur.distanceM) meilleur = { point, distanceM: d }
  }

  return meilleur
}

/** Nombre de points du pool — pour le journal et les tests. */
export function taillePool() {
  return POINTS_REFERENCE.length
}
