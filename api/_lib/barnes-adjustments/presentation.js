// Passage du montant calculé au montant présenté.
//
// Ce module tient à l'écart du calcul, et c'est délibéré : `comparables.js`,
// `ajustements.js` et `dvf.js` établissent une valeur à partir des ventes du
// secteur et des caractéristiques déclarées, et ils doivent continuer à le faire
// sans rien savoir de ce qui vient après. Une constante commerciale posée au
// milieu d'eux serait tôt ou tard lue comme un paramètre de la méthode.
//
// CE QUE LA MAJORATION REPRÉSENTE. Un ajustement de positionnement sur le
// segment haut de gamme, arrêté par l'agence. Ce n'est pas une correction
// mesurée sur les ventes — le moteur s'en charge déjà — et ce ne sont pas des
// honoraires : le montant affiché ne les comprend pas. C'est l'écart que la
// maison constate entre la médiane d'un secteur et ce que s'y négocient
// réellement les biens qu'elle commercialise.
//
// OÙ ELLE S'APPLIQUE. En tout dernier, sur le montant déjà arrondi au millier,
// après le moteur et après la couche d'ajustements Barnes et son plafond de
// cumul. Elle ne rentre pas dans ce plafond : celui-ci borne ce que les
// caractéristiques déclarées peuvent déplacer, et il n'a pas à borner une
// décision de positionnement.
//
// CE QU'ELLE NE TOUCHE PAS. Les ventes comparables et les statistiques de
// marché du rapport restent les valeurs foncières brutes publiées par la DGFiP.
// Elles sont vérifiables au registre, et elles doivent le rester.

/**
 * Taux de positionnement appliqué au montant présenté.
 *
 * Le ramener à 0 le neutralise partout : le prix au m² affiché et la fourchette
 * se déduisent tous deux du montant, et suivent donc sans rien d'autre à
 * changer.
 */
export const MAJORATION_FINALE = 0.07

/**
 * Montant présenté, arrondi au millier comme le reste du calcul — une
 * estimation au dernier euro afficherait une précision qu'elle n'a pas.
 *
 * S'applique au montant **déjà arrondi**, et non à la valeur brute : c'est ce
 * qui rend l'opération lisible d'un bout à l'autre (1 000 000 € donne
 * 1 070 000 €) plutôt que dépendante d'une décimale invisible.
 */
export const prixDePresentation = (montant) =>
  Math.round((montant * (1 + MAJORATION_FINALE)) / 1000) * 1000
