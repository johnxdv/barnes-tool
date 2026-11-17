// Prix au m² lorsque DVF ne peut rien fournir — cascade complète.
//
// Deux situations, très différentes :
//
// 1. **Une panne.** Réseau coupé, fichier du millésime indisponible : le cas
//    est rare et passager.
//
// 2. **Un trou de couverture permanent.** DVF ne couvre PAS l'Alsace-Moselle
//    — Moselle (57), Bas-Rhin (67), Haut-Rhin (68) — ni Mayotte (976). Ces
//    départements relèvent du livre foncier et non du fichier immobilier de la
//    DGFiP : leurs mutations ne sont publiées nulle part en open data, à aucun
//    millésime, ni à l'échelle communale ni à l'échelle départementale. Aucun
//    élargissement du rayon n'y changera quoi que ce soit.
//
// Le siège de l'agence étant à Diebling (57), c'est ce second cas qui se
// présente sur la quasi-totalité des estimations de son secteur : ici, ce
// fichier n'est pas un filet de sécurité théorique, c'est le moteur.
//
// CASCADE, du plus précis au plus grossier
//
//   1. `ESTIMATION_PRIX_M2`, clé commune     → `reference-commune`
//   2. `ESTIMATION_PRIX_M2`, clé département → `reference-departement`
//   3. Pool, commune exacte                  → `reference-commune-pool`
//   4. Pool, point le plus proche ≤ 25 km    → `reference-point-proche`
//   5. Table départementale intégrée         → `reference-hors-couverture`
//   6. Filet national                        → `reference-nationale`
//
// Les deux premiers étages restent au-dessus du pool : `ESTIMATION_PRIX_M2`
// est le correctif manuel, et un correctif manuel doit toujours l'emporter sur
// une donnée calculée — c'est ce qui permet de rattraper une erreur du pool
// sans redéployer.
//
// SUR LES SOURCES TIERCES — À LIRE AVANT D'AJOUTER UNE SOURCE « EN DIRECT »
//
// L'idée d'interroger en direct un site de prix immobiliers (efficity,
// MeilleursAgents, SeLoger…) pour combler ce trou revient périodiquement. Elle
// a été examinée en septembre 2026 et écartée, sur un fait vérifiable :
// `https://www.efficity.com/robots.txt` sert `User-agent: * / Disallow: /`,
// soit un refus explicite et lisible par machine de tout accès automatisé hors
// d'une liste nommée de moteurs de recherche. Ce n'est pas une clause
// d'usage enfouie dans des CGU, c'est le signal standard du refus.
//
// S'y ajoutent deux choses qu'un cache ne règle pas : l'usage serait
// commercial, et efficity est un réseau immobilier, donc un concurrent direct
// de l'agence. Le cache réduit la fréquence des requêtes, pas leur nature.
//
// Le pool ci-dessous est la réponse retenue : mêmes étages de cascade, même
// gain de précision, alimenté par ce que l'agence possède — sa connaissance du
// secteur et ses propres ventes (voir `../_data/points-reference.js`).

import { pointCommune, pointLePlusProche, clePrix } from './pointsReference.js'

/**
 * Surcharge des prix de référence, au format JSON, dans la variable
 * d'environnement `ESTIMATION_PRIX_M2` (Vercel → Project Settings →
 * Environment Variables). Les clés sont des codes commune INSEE ou des codes
 * département, les valeurs des prix au m² par type :
 *
 *   {"57176":{"maison":1650,"appartement":1400},"57":{"maison":1850}}
 *
 * La commune l'emporte sur le département, qui l'emporte sur tout le reste.
 * C'est le correctif de première intention : il ne demande pas de déploiement.
 */
function overrides() {
  const raw = process.env.ESTIMATION_PRIX_M2
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    console.error('[estimation] ESTIMATION_PRIX_M2 illisible — surcharge ignorée')
    return {}
  }
}

/**
 * Ordres de grandeur par département, pour les seules zones hors couverture
 * DVF — étage atteint quand le pool n'a aucun point à portée.
 *
 * Arrondis volontairement grossièrement : ils ne prétendent pas à la précision
 * d'une médiane calculée sur des ventes réelles. Ce sont les valeurs que le
 * moteur sert quand il ne sait rien de plus précis, et rien d'autre.
 *
 * La Moselle a été relevée de 1850/1700 à 2200/2200 en septembre 2026, sur
 * indication de l'agence — le marché mosellan résidentiel s'était resserré
 * entre maison et appartement, et l'ancien couple sous-estimait les deux. Ce
 * sont des chiffres d'agence, pas une mesure : ils restent à confirmer, et le
 * pool est le bon endroit pour les affiner commune par commune. Le terrain n'a
 * pas été revu faute d'élément.
 *
 * 67, 68 et 976 n'ont pas été revus : aucun relevé ne les appuie.
 */
const HORS_COUVERTURE = {
  57: { maison: 2200, appartement: 2200, terrain: 70 },
  67: { maison: 2650, appartement: 2900, terrain: 150 },
  68: { maison: 2350, appartement: 2300, terrain: 110 },
  976: { maison: 1600, appartement: 1600, terrain: 90 },
}

/**
 * Dernier filet, national. N'est atteint que si le département n'est ni
 * couvert par DVF ni listé ci-dessus — donc en pratique sur panne seule.
 */
const NATIONAL = { maison: 2200, appartement: 3100, terrain: 90 }

/**
 * Majoration appliquée au prix au m² des seules zones hors couverture DVF,
 * quelle que soit la source retenue dans la cascade ci-dessous — pool, table
 * départementale ou filet national.
 *
 * Demandée par l'agence, qui juge le niveau de ces références en retrait du
 * marché qu'elle constate. Ce n'est pas une correction mesurée : c'est un
 * réglage commercial. La ramener à 1 le neutralise partout.
 *
 * Elle vit ici, et non dans l'un des deux handlers, parce qu'ils s'en servent
 * tous les deux : l'estimation et l'aperçu du curseur montrent deux chiffres
 * au même utilisateur à quelques secondes d'intervalle, et un réglage présent
 * d'un côté seulement les faisait diverger de dix pour cent.
 */
export const MAJORATION_HORS_DVF = 1.10

/**
 * Applique la majoration à un résultat de `prixReference`, si et seulement si
 * le département est hors couverture DVF.
 *
 * La majoration suit le département, pas la source : elle vaut pour le pool
 * comme pour la table départementale. Un département couvert par DVF qui
 * retombe sur la référence après une panne n'y a pas droit — son marché est
 * connu, c'est seulement la mesure du jour qui a manqué.
 *
 * `source` n'est jamais modifié : il continue de dire d'où vient le chiffre.
 * Le prix d'avant majoration est conservé à part, sans quoi il deviendrait
 * impossible de vérifier une référence du pool ou de juger du réglage.
 */
export function majoreHorsDvf(resultat, departement) {
  const majoree = estHorsCouvertureDvf(departement)

  return {
    ...resultat,
    pricePerM2: majoree ? resultat.pricePerM2 * MAJORATION_HORS_DVF : resultat.pricePerM2,
    pricePerM2Base: resultat.pricePerM2,
    majorationAppliquee: majoree,
  }
}

/** Départements dont on sait qu'aucune vente ne sera jamais trouvée dans DVF. */
export function estHorsCouvertureDvf(departement) {
  return Object.prototype.hasOwnProperty.call(HORS_COUVERTURE, String(departement))
}

/**
 * Prix de référence au m² pour un type de bien, et provenance de ce prix.
 *
 * `lat`/`lon` sont facultatives : sans elles, la recherche du point le plus
 * proche est simplement sautée — un appelant qui n'a pas de coordonnées à
 * donner doit tout de même obtenir un prix.
 *
 * `type` peut valoir `autre` ou `local` : faute de mieux, ces biens sont
 * alignés sur la maison, comme ils le sont déjà dans la recherche de
 * comparables.
 */
export function prixReference({ codeInsee, departement, type, lat, lon }) {
  const key = clePrix(type)
  const table = overrides()

  // 1 — correctif manuel, commune.
  const communal = codeInsee ? table[String(codeInsee)] : null
  if (communal && Number.isFinite(Number(communal[key]))) {
    return { pricePerM2: Number(communal[key]), source: 'reference-commune' }
  }

  // 2 — correctif manuel, département.
  const departemental = departement ? table[String(departement)] : null
  if (departemental && Number.isFinite(Number(departemental[key]))) {
    return { pricePerM2: Number(departemental[key]), source: 'reference-departement' }
  }

  // 3 — pool, commune exacte. Le meilleur cas : le prix est celui du lieu.
  const exact = pointCommune(codeInsee, type, lat, lon)
  if (exact) {
    return {
      pricePerM2: Number(exact.prix[key]),
      source: 'reference-commune-pool',
      pointNom: exact.nom,
      pointDistanceM: 0,
    }
  }

  // 4 — pool, point connu le plus proche. C'est l'étage qui fait la différence
  // entre « la Moselle vaut 2200 » et « votre secteur vaut ce qu'il vaut ».
  //
  // Cet étage n'est pas borné aux départements hors couverture, et c'est
  // délibéré. Une commune de Meurthe-et-Moselle à vingt kilomètres de Metz
  // n'arrive ici que si DVF est tombé ; le prix relevé à Metz la renseigne
  // alors mieux que la moyenne nationale. Le flux DVF nominal, lui, n'atteint
  // jamais cette fonction — il rend son résultat bien avant (`estimation.js`).
  //
  // Le débordement ne peut pas jouer dans l'autre sens : le script de
  // construction refuse tout point situé dans un département couvert par DVF,
  // de sorte que le pool ne contient que du 57, 67, 68 et 976.
  const proche = pointLePlusProche(lat, lon, type)
  if (proche) {
    return {
      pricePerM2: Number(proche.point.prix[key]),
      source: 'reference-point-proche',
      pointNom: proche.point.nom,
      pointDistanceM: Math.round(proche.distanceM),
    }
  }

  // 5 — valeur départementale.
  const integre = HORS_COUVERTURE[String(departement)]
  if (integre) {
    return { pricePerM2: integre[key], source: 'reference-hors-couverture' }
  }

  // 6 — filet national.
  return { pricePerM2: NATIONAL[key], source: 'reference-nationale' }
}
