// Moteur d'estimation — le calcul, et rien que le calcul.
//
// CE MODULE NE TOUCHE NI AU RÉSEAU, NI À L'HORLOGE, NI À RIEN D'EXTÉRIEUR. On
// lui donne un bien, une liste de ventes et une date de référence ; il rend un
// montant. Deux appels avec les mêmes entrées rendent le même euro, aujourd'hui
// comme dans six mois.
//
// POURQUOI CETTE SÉPARATION. Le banc de test (`scripts/backtest.mjs`) estime
// des biens déjà vendus pour mesurer l'erreur du moteur. Il ne vaut quelque
// chose que s'il fait tourner le moteur **de production**, pas une
// reconstitution qui en diverge au premier réglage modifié. D'où la règle :
// tout ce qui décide du prix vit ici — filtres de qualité, cascade de rayons,
// similarité, poids, actualisation, repli par les surfaces, régression de
// terrain, prix, fourchette — et `api/estimation.js` ne garde que la
// récupération des données et la mise en forme de la réponse.
//
// LA FOURCHETTE AFFICHÉE est une bande fixe autour du prix, dont la largeur ne
// dépend que du niveau de confiance : ±15, ±20 ou ±25 %. Elle ne se déduit plus
// de la dispersion des comparables, qui mesurait l'accord des ventes voisines
// entre elles et non l'erreur du moteur — voir `fourchetteDeConfiance`.
//
// LA DATE DE RÉFÉRENCE (`maintenant`) sert à deux choses, et à deux seulement :
// la décroissance de récence des poids, et le semestre auquel les comparables
// sont actualisés. Elle vaut « maintenant » par défaut ; le banc de test y met
// la date de la vente qu'il cache au moteur, ce qui suffit à replacer tout le
// calcul à cette date-là.
//
// CE QUI RESTE DEHORS, et pourquoi. Le moteur ne télécharge rien : il travaille
// sur les ventes qu'on lui donne. Quand il a dû s'éloigner faute de
// comparables, il le dit — `rayonsASonderM` énumère les rayons qui
// mériteraient qu'on aille chercher les départements voisins. C'est à
// l'appelant d'y répondre en rappelant le moteur avec un jeu de ventes élargi
// (voir la boucle de `api/estimation.js`). Le calcul reste ainsi entièrement
// décidé ici, et le chargement entièrement décidé là-bas.
//
// PRINCIPE DIRECTEUR, inchangé : **on reste le plus près possible du bien.** La
// similarité est un seuil minimum à franchir, pas un score à maximiser.
// Au-dessus de ce seuil, c'est la proximité qui tranche — une vente voisine un
// peu moins ressemblante en dit plus long qu'une vente très ressemblante à deux
// kilomètres, parce que l'emplacement se négocie rue par rue là où la surface
// et le terrain se corrigent par le calcul.
//
// ET QUAND IL N'Y A PAS CINQ VENTES SIMILAIRES À DEUX KILOMÈTRES ? La médiane
// du département entier servait de repli. Elle ne décrivait rien — ni le
// quartier, ni le bien — et elle tombait sur deux situations parfaitement
// ordinaires : le bien atypique (une maison de 300 m² dans un tissu de 90 m²,
// dont aucun comparable n'entre dans la fenêtre 0,7×–1,4×) et la zone peu dense
// (un hameau où cinq maisons ne se vendent pas en cinq ans dans un rayon de
// 2 km). Ces deux cas ont leur propre repli, qui relâche la seule contrainte
// qui bloque — la fenêtre de surface — et garde tout le reste : même type, même
// secteur, mêmes filtres de qualité, ventes **les plus proches en surface** du
// bien, pondérées par la distance et par l'écart de surface. Le rayon ne
// s'élargit (5, 10 puis 20 km) que s'il n'y a pas cinq ventes du type à 2 km.
// La médiane départementale n'est plus qu'un dernier filet, qui ne doit
// pratiquement jamais se déclencher.

import { semestreDe } from './dvf.js'
import { departementFromInsee, distanceM } from './geo.js'
import { actualise, construitIndice } from './indice.js'
import { median, medianePonderee, quantile, quantilePondere } from './statistiques.js'
import { ajustementTerrain, estimeValeurTerrain, valeurM2Terrain } from './terrain.js'
import { coefficientEtage } from '../../src/lib/etage.js'
import {
  CONFIANCE,
  FOURCHETTE,
  MAX_COMPARABLES,
  MIN_COMPARABLES,
  POIDS,
  QUALITE,
  RAYONS_ELARGIS_M,
  RAYONS_M,
  SIMILARITE,
  TERRAIN,
} from './estimationConfig.js'

/** Rayon maximal de la cascade — dernier palier, et premier palier du repli. */
const RAYON_MAX_M = RAYONS_M[RAYONS_M.length - 1]

/** Bornes du montant renvoyé — au-delà, le calcul relève de la donnée aberrante. */
export const PRICE_RANGE = [15000, 20000000]

const clampPrice = (value) => Math.min(Math.max(value, PRICE_RANGE[0]), PRICE_RANGE[1])

/**
 * Le montant est arrondi au millier : une estimation au dernier euro
 * afficherait une précision qu'elle n'a pas.
 */
const round = (value) => Math.round(value / 1000) * 1000

/** Borne de fourchette — au millier au-delà de 100 000 €, à la centaine en deçà. */
const arrondiBorne = (value) => {
  const pas = value >= 100000 ? 1000 : 100
  return Math.round(value / pas) * pas
}

/**
 * Types DVF comparables à un type détecté sur la carte.
 *
 * **Jamais de mélange maison / appartement.** L'ancienne version renvoyait les
 * deux pour un type indéterminé ou un local professionnel, au motif qu'une
 * médiane tous logements confondus valait mieux que pas d'estimation. Elle ne
 * vaut mieux que rien pour personne : sur le cas marseillais, les maisons du
 * secteur se négocient à 4 892 €/m² et les appartements à 2 176 €/m², et le
 * mélange des deux donne 4 761 €/m² — un chiffre qui ne décrit aucun des deux
 * marchés. Un local ou un type resté indéterminé est aligné sur la maison,
 * comme le fait déjà `clePrix` dans `pointsReference.js`.
 */
export function comparableKinds(type) {
  if (type === 'appartement') return ['appartement']
  if (type === 'terrain') return ['terrain']
  return ['maison']
}

/** Écart relatif en logarithme — symétrique : moitié et double s'éloignent autant. */
const ecartLog = (valeur, cible) => Math.abs(Math.log(valeur / cible))

/**
 * Les quatre facteurs de poids, et leur produit. Formes et paramètres sont
 * documentés dans `estimationConfig.js` — c'est là qu'ils se règlent.
 */
function poidsDe(vente, { type, surfaceCible, terrainCible }, maintenant) {
  const distance = 1 / (1 + (vente.distanceM / POIDS.distance.d0M) ** POIDS.distance.exposant)

  const surface = Math.exp(-ecartLog(vente.surface, surfaceCible) / POIDS.surface.tolerance)

  const terrainConnu = vente.surfaceTerrain > 0 && terrainCible > 0
  const terrain =
    type !== 'maison'
      ? 1
      : terrainConnu
        ? Math.exp(-ecartLog(vente.surfaceTerrain, terrainCible) / POIDS.terrain.tolerance)
        : POIDS.terrain.penaliteInconnu

  const ageAnnees = Math.max((maintenant - Date.parse(vente.date)) / 31557600000, 0)
  const recence = 0.5 ** (ageAnnees / POIDS.recence.demiVieAnnees)

  return {
    poids: distance * surface * terrain * recence,
    facteurs: {
      distance: Number(distance.toFixed(4)),
      surface: Number(surface.toFixed(4)),
      terrain: Number(terrain.toFixed(4)),
      recence: Number(recence.toFixed(4)),
    },
    // Score de similarité : les seules dimensions éliminatoires, sans la
    // distance ni la récence. Sert à se relire, pas à sélectionner.
    similarite: Number((surface * terrain).toFixed(4)),
    terrainConnu,
  }
}

/** Le comparable franchit-il les seuils éliminatoires de similarité ? */
function similaire(vente, { type, surfaceCible, terrainCible }) {
  const regles = SIMILARITE[type] ?? SIMILARITE.maison

  const ratioSurface = vente.surface / surfaceCible
  if (ratioSurface < regles.surface[0] || ratioSurface > regles.surface[1]) return false

  // Le terrain n'est éliminatoire que si les deux sont connus : dans DVF, une
  // `surface_terrain` absente ne veut pas dire « pas de terrain » mais « non
  // renseigné », et écarter ces ventes reviendrait à jeter un quart de
  // l'échantillon pour une donnée manquante.
  if (regles.terrain && vente.surfaceTerrain > 0 && terrainCible > 0) {
    const ratioTerrain = vente.surfaceTerrain / terrainCible
    if (ratioTerrain < regles.terrain[0] || ratioTerrain > regles.terrain[1]) return false
  }

  return true
}

/**
 * Candidates d'un rayon, distance calculée, puis filtre de qualité **relatif au
 * secteur**.
 *
 * Les bornes absolues (500–25 000 €/m²) ont déjà été appliquées à la lecture du
 * CSV ; celui-ci se calibre sur la médiane des ventes du rayon, ce qui le rend
 * utile partout — y compris là où 500 €/m² est un prix normal. Le rayon est un
 * paramètre parce que les deux sélections en ont besoin : la cascade normale
 * se calibre sur son dernier palier (2 km), le repli par les surfaces sur le
 * rayon qu'il a dû atteindre.
 */
function candidatesDuSecteur(actualisees, { lat, lon }, rayonM) {
  const candidates = actualisees
    .map((v) => ({ ...v, distanceM: distanceM(lat, lon, v.lat, v.lon) }))
    .filter((v) => v.distanceM <= rayonM)

  const medianeSecteur = median(candidates.map((v) => v.prixM2Actualise))

  const plausibles = medianeSecteur
    ? candidates.filter(
        (v) =>
          v.prixM2Actualise >= medianeSecteur * QUALITE.ecartMedianeMin &&
          v.prixM2Actualise <= medianeSecteur * QUALITE.ecartMedianeMax,
      )
    : candidates

  return { candidates, plausibles, medianeSecteur }
}

/**
 * Filtres de qualité, cascade de rayons cumulés, poids : tout le cœur de la
 * sélection, sur un jeu de ventes déjà actualisé.
 */
function selectionne(actualisees, cible, maintenant) {
  // 1 et 2 — candidates du secteur (le rayon maximal de la cascade) et filtre
  // relatif : le but est d'écarter ce qui détonne *ici*, pas dans le
  // département.
  const { candidates, plausibles, medianeSecteur } = candidatesDuSecteur(
    actualisees,
    cible,
    RAYON_MAX_M,
  )

  // 3 — similarité éliminatoire, puis poids.
  const similaires = plausibles
    .filter((v) => similaire(v, cible))
    .map((v) => ({ ...v, ...poidsDe(v, cible, maintenant) }))

  // 4 — cascade de rayons **cumulés** : chaque palier compte les ventes de tous
  // les précédents. On s'arrête au premier qui atteint le minimum, et on
  // n'élargit jamais au-delà pour en avoir davantage — le gain de précision
  // d'une sixième vente ne compense pas le kilomètre qu'il faut faire pour la
  // trouver.
  let rayonAtteintM = null
  let retenus = []

  for (const rayon of RAYONS_M) {
    const dedans = similaires.filter((v) => v.distanceM <= rayon)
    if (dedans.length >= MIN_COMPARABLES) {
      rayonAtteintM = rayon
      retenus = dedans
      break
    }
  }

  // 5 — trop de similaires : on garde les mieux notées. Le tri est sur le poids,
  // donc très majoritairement sur la distance.
  if (retenus.length > MAX_COMPARABLES) {
    retenus = [...retenus].sort((a, b) => b.poids - a.poids).slice(0, MAX_COMPARABLES)
  }

  retenus.sort((a, b) => a.distanceM - b.distanceM)

  return {
    rayonAtteintM,
    retenus,
    journal: {
      duType: actualisees.length,
      dansLeSecteur: candidates.length,
      apresFiltreRelatif: plausibles.length,
      apresSimilarite: similaires.length,
      medianeSecteurPrixM2: medianeSecteur ? Math.round(medianeSecteur) : null,
      parRayon: RAYONS_M.map((rayon) => ({
        rayonM: rayon,
        similaires: similaires.filter((v) => v.distanceM <= rayon).length,
      })),
    },
  }
}

/**
 * Repli par les surfaces — pour le bien atypique et la zone peu dense.
 *
 * La fenêtre de similarité de surface (0,7×–1,4×) est la seule contrainte
 * relâchée, et elle l'est complètement : sont retenues les ventes du même type
 * les **plus proches en surface** du bien, dans le rayon donné. Pour une maison
 * de 300 m² dont la plus grande voisine vendue en fait 220, c'est celle-là
 * qu'on prend — avec un poids de surface qui dit exactement ce qu'elle vaut.
 *
 * Tout le reste est celui de la cascade normale : même type, mêmes filtres de
 * qualité, même loi de pondération (`poidsDe`), donc distance et écart de
 * surface en tête. Rien n'est inventé pour l'occasion : c'est le même calcul,
 * sur un échantillon choisi autrement.
 *
 * Le tri départage à égalité d'écart de surface par la distance — deux maisons
 * de 220 m², on garde la plus proche.
 */
function selectionneParSurface(actualisees, cible, maintenant, rayonM) {
  const { candidates, plausibles, medianeSecteur } = candidatesDuSecteur(
    actualisees,
    cible,
    rayonM,
  )

  const retenus = [...plausibles]
    .sort(
      (a, b) =>
        ecartLog(a.surface, cible.surfaceCible) - ecartLog(b.surface, cible.surfaceCible) ||
        a.distanceM - b.distanceM,
    )
    .slice(0, MAX_COMPARABLES)
    .map((v) => ({ ...v, ...poidsDe(v, cible, maintenant) }))

  retenus.sort((a, b) => a.distanceM - b.distanceM)

  return {
    retenus,
    journal: {
      rayonM,
      duType: actualisees.length,
      dansLeRayon: candidates.length,
      apresFiltreRelatif: plausibles.length,
      medianeSecteurPrixM2: medianeSecteur ? Math.round(medianeSecteur) : null,
      // De quoi juger d'un coup d'œil ce que le relâchement a coûté : la
      // surface du bien contre celles réellement retenues.
      surfaceCibleM2: cible.surfaceCible,
      surfacesRetenuesM2: retenus.map((v) => v.surface),
    },
  }
}

/**
 * Prix au m², dispersion et terrain de référence d'un échantillon pondéré.
 *
 * Commun à la cascade normale et aux replis par les surfaces : les deux se
 * calculent exactement de la même façon — médiane pondérée des €/m² actualisés,
 * quantiles pondérés 25 et 75 pour le journal — et seule la manière de choisir
 * les ventes les distingue. Le terrain de référence est la médiane pondérée des terrains
 * **connus** des ventes retenues : c'est contre lui que se mesure l'écart de
 * terrain du bien, et non contre une moyenne départementale qui ne dirait rien
 * du parcellaire local.
 */
function depuisEchantillon(retenus) {
  const points = retenus.map((v) => ({ valeur: v.prixM2Actualise, poids: v.poids }))

  const terrainsConnus = retenus
    .filter((v) => v.surfaceTerrain > 0)
    .map((v) => ({ valeur: v.surfaceTerrain, poids: v.poids }))

  return {
    prixM2: medianePonderee(points),
    quantiles: { q25: quantilePondere(points, 0.25), q75: quantilePondere(points, 0.75) },
    comparables: retenus,
    terrainReference: terrainsConnus.length > 0 ? medianePonderee(terrainsConnus) : null,
  }
}

const confianceDe = (rayonM) => {
  if (rayonM == null) return 'faible'
  return rayonM <= CONFIANCE.rayonNormalMaxM ? 'normale' : 'moyenne'
}

/**
 * Rayons qu'il vaudrait la peine de sonder chez les voisins, compte tenu de
 * l'étape à laquelle le calcul a dû descendre.
 *
 * La cascade normale n'a besoin de personne. Tout le reste signifie qu'on a
 * franchi au moins les 2 km du dernier palier, et chaque palier franchi désigne
 * un rayon où un département voisin pourrait avoir ce qui manque ici. C'est la
 * seule chose que le moteur demande au monde extérieur — et il la demande en la
 * décrivant, sans jamais aller la chercher lui-même.
 */
function rayonsASonder(rayonAtteintM, etape) {
  if (etape === 'cascade-normale') return []

  const paliers = [RAYON_MAX_M, ...RAYONS_ELARGIS_M]
  if (etape === 'departement') return paliers

  return paliers.filter((r) => r <= rayonAtteintM)
}

/**
 * Demi-largeur de fourchette, ramenée entre le plancher et le plafond.
 *
 * **Ne sert plus qu'aux chemins hors DVF** — Monaco, prix de référence — depuis
 * que la fourchette DVF est une bande fixe réglée par la confiance (voir
 * `fourchetteDeConfiance`). Le plafond y interdit qu'un barème révisé s'affiche
 * un jour en ±40 % : au-delà, une fourchette n'informe plus personne, annoncer
 * « entre 250 000 et 750 000 € » revenant à ne rien annoncer.
 */
const demiLargeur = (prix, demi) =>
  Math.min(Math.max(demi, prix * FOURCHETTE.demiLargeurMinPct), prix * FOURCHETTE.demiLargeurMaxPct)

/**
 * Fourchette affichée sur le chemin DVF — une bande fixe autour du prix, dont
 * la seule variable est le niveau de confiance : ±15 % en confiance normale,
 * ±20 % en moyenne, ±25 % en faible (voir `FOURCHETTE.parConfiance`).
 *
 * POURQUOI PLUS LES QUANTILES. Les bornes venaient de la dispersion des
 * comparables retenus, élargie selon la confiance. Le banc de test a montré ce
 * qu'elle valait : 38 % des prix réels tombaient dedans, pour une demi-largeur
 * médiane de 11 %. La dispersion de cinq à huit ventes voisines mesure
 * l'accord de ces ventes entre elles — pas l'erreur du moteur sur le bien
 * qu'on lui soumet. Rien n'obligeait ces deux grandeurs à coïncider, et elles
 * ne coïncidaient pas : une fourchette étroite sortait aussi bien d'un
 * voisinage homogène que d'un échantillon trop maigre pour être en désaccord.
 *
 * La bande fixe ne prétend plus rien lire du voisinage. Elle annonce l'ordre de
 * grandeur de l'erreur mesurée, et l'annonce pareil pour tous les biens servis
 * par le même chemin de calcul — ce que le niveau de confiance disait déjà, et
 * qu'il dit maintenant seul.
 *
 * Ni plancher ni plafond ici : les trois valeurs sont déjà choisies, et le
 * plafond de 20 % mordrait sur le ±25 % de la confiance faible.
 */
function fourchetteDeConfiance(prix, confiance) {
  const demiLargeurPct = FOURCHETTE.parConfiance[confiance] ?? FOURCHETTE.parConfiance.faible

  return {
    low: arrondiBorne(Math.max(prix * (1 - demiLargeurPct), PRICE_RANGE[0])),
    high: arrondiBorne(Math.min(prix * (1 + demiLargeurPct), PRICE_RANGE[1])),
    demiLargeurPct,
  }
}

/**
 * Fourchette symétrique en pourcentage — pour Monaco et les prix de référence.
 *
 * Passe par le plancher et le plafond : Monaco est aujourd'hui pile à 20 %, la
 * borne ne mord donc pas, mais elle interdit qu'une révision du barème
 * monégasque s'affiche un jour en fourchette de ±40 %.
 */
export function fourchetteSymetrique(prix, pct) {
  const demi = demiLargeur(prix, prix * pct)
  return { low: arrondiBorne(prix - demi), high: arrondiBorne(prix + demi) }
}

/** Montant arrondi et borné — exporté pour les chemins qui ne passent pas par `estime`. */
export const montantAffichable = (valeur) => clampPrice(round(valeur))

/**
 * Sélection des comparables, jusqu'au prix au m².
 *
 * Quatre étapes possibles, et `etape` dit laquelle a produit le prix :
 *
 *   • `cascade-normale` — cinq à huit ventes similaires, du palier atteint.
 *     C'est le cas ordinaire, et le seul qui garde une confiance normale ou
 *     moyenne.
 *   • `atypique-2km` — pas cinq ventes *similaires* à 2 km, mais cinq ventes du
 *     type : la fenêtre de surface est relâchée, les plus proches en surface
 *     sont retenues. Le bien est atypique pour son secteur.
 *   • `elargi-5km` / `elargi-10km` / `elargi-20km` — pas même cinq ventes du
 *     type à 2 km : le rayon s'ouvre par paliers, avec la même sélection par
 *     les surfaces. Zone peu dense.
 *   • `departement` — dernier filet : même 20 km ne donnent pas cinq ventes.
 *     L'appelant le journalise en `warn`, ce cas doit rester exceptionnel.
 */
function selectionneMarche(actualisees, cible, maintenant) {
  const resultat = selectionne(actualisees, cible, maintenant)

  if (resultat.rayonAtteintM !== null) {
    return {
      etape: 'cascade-normale',
      statut: 'voisinage',
      confiance: confianceDe(resultat.rayonAtteintM),
      rayonAtteintM: resultat.rayonAtteintM,
      candidats: resultat.journal,
      repli: null,
      ...depuisEchantillon(resultat.retenus),
    }
  }

  // Replis par les surfaces. Le premier palier est le rayon de la cascade
  // (2 km) : on relâche la surface **avant** de s'éloigner, parce qu'une
  // comparaison moins juste coûte moins cher qu'un autre marché.
  for (const rayon of [RAYON_MAX_M, ...RAYONS_ELARGIS_M]) {
    const repli = selectionneParSurface(actualisees, cible, maintenant, rayon)
    if (repli.retenus.length < MIN_COMPARABLES) continue

    return {
      etape: rayon === RAYON_MAX_M ? 'atypique-2km' : `elargi-${rayon / 1000}km`,
      statut: 'repli-surface',
      // Un échantillon hors fenêtre de surface, ou trouvé à plusieurs
      // kilomètres, ne peut pas prétendre à mieux — quel que soit le rayon.
      confiance: 'faible',
      rayonAtteintM: rayon,
      candidats: resultat.journal,
      repli: repli.journal,
      ...depuisEchantillon(repli.retenus),
    }
  }

  // Dernier filet : médiane départementale actualisée. Même vingt kilomètres ne
  // donnent pas cinq ventes du type — un département où le type de bien ne se
  // vend pratiquement pas.
  const prix = actualisees.map((v) => v.prixM2Actualise)

  return {
    etape: 'departement',
    statut: 'departement',
    confiance: 'faible',
    rayonAtteintM: null,
    candidats: resultat.journal,
    repli: null,
    prixM2: median(prix),
    // Dispersion interquartile du département entier, sans pondération. Elle
    // ne sert plus qu'au journal — la fourchette affichée est une bande fixe,
    // ici celle de la confiance faible.
    quantiles: { q25: quantile(prix, 0.25), q75: quantile(prix, 0.75) },
    comparables: [],
    terrainReference: null,
  }
}

/**
 * Estime un bien à partir des ventes fournies. **Fonction pure.**
 *
 * `bien` — `{ lat, lon, type, surfaceM2, contenance, etage, codeInsee,
 * departement }`. `surfaceM2` est la surface qui multiplie le prix au m² :
 * l'habitable déclarée pour un logement, la contenance pour un terrain nu.
 * `etage` est déjà normalisé (voir `src/lib/etage.js`) et ne corrige que les
 * appartements.
 *
 * `ventes` — les ventes DVF disponibles, **tous types confondus** : le moteur
 * fait lui-même le tri (`comparableKinds`), et c'est important qu'il le fasse
 * lui-même, sans quoi le banc de test et la production pourraient ne pas filtrer
 * de la même façon.
 *
 * Une vente peut porter `surfaceTerrainCadastre`, la contenance de sa parcelle,
 * qui sert de terrain quand DVF n'en renseigne pas. Rien ne le remplit en
 * production ; voir plus bas.
 *
 * `maintenant` — la date de référence, en millisecondes. Par défaut l'instant
 * présent : la production ne passe rien et ne change donc pas d'un euro.
 *
 * Rend toujours un objet, jamais `null` — y compris quand aucun prix n'a pu
 * être calculé, auquel cas `prix` vaut `null` et `rayonsASonderM` dit ce qu'il
 * faudrait charger pour espérer mieux. C'est à l'appelant de trancher entre
 * élargir et abandonner.
 */
export function estime({ bien, ventes, maintenant = Date.now() }) {
  const { lat, lon, type, surfaceM2, contenance, etage, codeInsee, departement } = bien

  const kinds = new Set(comparableKinds(type))
  const duType = ventes.filter((v) => kinds.has(v.kind))

  // L'indice temporel se calcule sur le seul département du bien (ou sur sa
  // commune si elle en a le volume) : c'est le marché du bien qu'il décrit, pas
  // une réunion de marchés voisins. Les ventes des voisins, elles, sont
  // actualisées avec ce même indice.
  const duDepartement = departement
    ? duType.filter((v) => departementFromInsee(v.commune) === departement)
    : duType

  const indice = construitIndice(duDepartement, {
    codeInsee,
    departement,
    // Les comparables sont ramenés au semestre de la date de référence quand
    // celle-ci porte un point d'indice. En production, la date est celle du
    // jour et DVF paraît avec plusieurs mois de retard : il n'y a jamais de
    // point, et l'indice retombe sur le dernier semestre publié — comme
    // toujours. Au banc de test, la date est celle de la vente cachée, et c'est
    // à son semestre que les comparables sont actualisés.
    semestreCible: semestreDe(new Date(maintenant).toISOString()),
  })

  // Terrain complété — `surfaceTerrainCadastre` porte la contenance cadastrale
  // de la parcelle de la vente, pour les mutations dont DVF laisse
  // `surface_terrain` vide — « non renseigné » n'y veut pas dire « pas de
  // terrain ». Le banc en relève 8 % des maisons sur ses dix départements, mais
  // 26 % dans les Alpes-Maritimes et 30 % à Paris. Le champ vaut terrain connu une fois
  // posé, et rien d'autre ne change : filtre de similarité, poids, terrain de
  // référence et régression de terrain le lisent comme ils lisent le terrain
  // DVF. **Personne ne l'alimente en production** — seul le banc de test le
  // remplit, pour mesurer ce que ce complément vaudrait avant de le brancher.
  const actualisees = duType.map((v) => {
    const actualisee = actualise(v, indice)
    return actualisee.surfaceTerrain > 0 || !(v.surfaceTerrainCadastre > 0)
      ? actualisee
      : { ...actualisee, surfaceTerrain: v.surfaceTerrainCadastre }
  })

  // Le terrain de la cible est la contenance cadastrale. Inconnue, elle n'est
  // pas éliminatoire — le filtre de similarité l'ignore et le poids pénalise
  // les comparables dont le terrain est lui aussi inconnu — mais aucun
  // ajustement de terrain ne sera calculé, et `meta` le dira.
  const terrainCible = type === 'maison' ? Number(contenance) || null : null
  const cible = { lat, lon, type, surfaceCible: surfaceM2, terrainCible }

  const marche = selectionneMarche(actualisees, cible, maintenant)
  const rayonsASonderM = rayonsASonder(marche.rayonAtteintM, marche.etape)

  const commun = {
    ...marche,
    rayonsASonderM,
    indice,
    // Les ventes actualisées restent disponibles pour la régression de terrain
    // et pour le banc de test : elle n'a pas besoin de comparables, seulement
    // de volume.
    actualisees,
  }

  // Aucune médiane calculable : les fichiers sont là mais ne contiennent aucune
  // vente du type. Il n'y a rien à estimer, et l'appelant doit le savoir.
  if (!marche.prixM2) {
    return { ...commun, prix: null, low: null, high: null, coefficientEtage: 1 }
  }

  // --- Terrain : valeur du m² supplémentaire, puis ajustement.
  const valeurTerrain =
    type === 'maison'
      ? estimeValeurTerrain(actualisees, { lat, lon, codeInsee, departement })
      : null

  const terrainReference =
    marche.terrainReference ?? (type === 'maison' ? valeurTerrain?.terrainMedian ?? null : null)

  const coefficient = coefficientEtage(etage)
  const partBati = marche.prixM2 * surfaceM2 * (type === 'appartement' ? coefficient : 1)

  // Pas d'ajustement de terrain sur le seul dernier filet départemental : le
  // €/m² y est celui du département entier, et lui adosser une valeur de
  // terrain mesurée dans un rayon de deux kilomètres mélangerait deux échelles.
  // Les replis par les surfaces, eux, y ont droit comme la cascade normale :
  // leurs ventes sont bien celles du secteur, et l'écart de terrain entre le
  // bien et elles se valorise de la même façon — c'est même sur un bien
  // atypique que cet ajustement a le plus de sens.
  const ajustement =
    type !== 'maison'
      ? { montant: 0, motif: 'sans-objet', plafonne: false }
      : marche.statut === 'departement'
        ? { montant: 0, motif: 'repli-departemental', plafonne: false }
        : ajustementTerrain(valeurTerrain, {
            terrainBien: terrainCible,
            terrainReference,
            partBati,
          })

  const prix = clampPrice(round(partBati + ajustement.montant))

  // La fourchette ne dépend plus que du prix et de la confiance.
  const { low, high, demiLargeurPct } = fourchetteDeConfiance(prix, marche.confiance)

  // --- Décomposition lisible bâti / terrain. Purement indicative : elle ne
  // participe pas au calcul, elle l'explique. La valeur foncière du bien est
  // mesurée contre un « terrain plancher » du secteur (5ᵉ centile), faute de
  // quoi le modèle logarithmique n'a pas d'origine naturelle.
  const valeurTerrainBien =
    valeurTerrain?.significatif && terrainCible > 0 && valeurTerrain.terrainPlancher > 0
      ? valeurTerrain.coefficientLog * Math.log(terrainCible / valeurTerrain.terrainPlancher)
      : null

  return {
    ...commun,
    prix,
    low,
    high,
    coefficientEtage: coefficient,

    terrain: {
      terrainBienM2: terrainCible,
      terrainReferenceM2: terrainReference != null ? Math.round(terrainReference) : null,
      coefficientLog:
        valeurTerrain?.coefficientLog != null
          ? Number(valeurTerrain.coefficientLog.toFixed(1))
          : null,
      // Le « b » de la méthode, rendu lisible : la valeur d'un m² de terrain
      // supplémentaire au voisinage du terrain de référence. Il n'est pas
      // constant — c'est tout l'intérêt des rendements décroissants.
      bEuroParM2: (() => {
        const b = valeurM2Terrain(valeurTerrain, terrainReference)
        return b != null ? Number(b.toFixed(2)) : null
      })(),
      tStat: valeurTerrain?.tStat != null ? Number(valeurTerrain.tStat.toFixed(2)) : null,
      significatif: valeurTerrain?.significatif ?? false,
      motif: valeurTerrain?.motif ?? ajustement.motif,
      echantillon: valeurTerrain?.echantillon ?? 0,
      echantillonZone: valeurTerrain?.zone ?? null,
      echantillonZoneDetail: valeurTerrain?.zoneDetail ?? null,
      tStatMin: TERRAIN.tStatMin,
      ajustementEuros: Math.round(ajustement.montant),
      ajustementBrutEuros: ajustement.brut != null ? Math.round(ajustement.brut) : null,
      plafonne: ajustement.plafonne,
      plafondEuros: ajustement.plafond != null ? Math.round(ajustement.plafond) : null,
    },

    decomposition: {
      prixFinal: prix,
      partBatiEuros: Math.round(partBati),
      ajustementTerrainEuros: Math.round(ajustement.montant),
      // Indicatif : valeur foncière du terrain du bien selon le modèle,
      // mesurée contre le terrain plancher du secteur.
      valeurTerrainIndicativeEuros:
        valeurTerrainBien != null ? Math.round(valeurTerrainBien) : null,
      partBatiHorsTerrainIndicativeEuros:
        valeurTerrainBien != null ? Math.round(prix - valeurTerrainBien) : null,
      terrainPlancherM2: valeurTerrain?.terrainPlancher
        ? Math.round(valeurTerrain.terrainPlancher)
        : null,
    },

    fourchette: {
      low,
      high,
      demiLargeurPct,
      // Dispersion des comparables retenus. Elle ne décide plus des bornes,
      // mais elle reste au journal : elle dit si les ventes voisines
      // s'accordaient, ce que la fourchette affichée, désormais fixe, ne dit
      // plus.
      q25PrixM2: marche.quantiles.q25 != null ? Math.round(marche.quantiles.q25) : null,
      q75PrixM2: marche.quantiles.q75 != null ? Math.round(marche.quantiles.q75) : null,
    },
  }
}
