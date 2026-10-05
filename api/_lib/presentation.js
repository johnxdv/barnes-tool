// Prix de présentation — le passage du net vendeur au prix affiché.
//
// POURQUOI CE MODULE EXISTE, ET POURQUOI IL EST À PART. Tout ce qui précède —
// `moteur.js`, `estimationConfig.js`, `indice.js`, `terrain.js`,
// `statistiques.js`, `dvf.js` — est repris à l'identique du moteur d'Immovia, et
// doit pouvoir être **recopié depuis Immovia sans réfléchir** au prochain
// portage. Une constante commerciale propre à Barnes posée dans
// `estimationConfig.js` disparaîtrait silencieusement à la première
// resynchronisation, et les prix baisseraient de sept pour cent sans que rien ne
// le signale. Elle vit donc ici, dans un fichier que le moteur ne connaît pas et
// qu'aucune copie ne viendra écraser.
//
// CE QUE LA MAJORATION CORRIGE, ET CE N'EST PAS UN RÉGLAGE DE CONFORT. DVF
// publie la **valeur foncière** d'une mutation, c'est-à-dire le prix porté à
// l'acte : en vente par agence, c'est le prix **net vendeur**, honoraires
// exclus, dès lors qu'ils sont à la charge de l'acquéreur — la pratique
// dominante en Provence. Le moteur, qui ne travaille que sur ces mutations, rend
// donc lui aussi un net vendeur. L'afficher tel quel sous l'intitulé « valeur de
// présentation recommandée » reviendrait à proposer au vendeur un prix de
// vitrine inférieur à ce que l'acquéreur paiera réellement, et à retrouver
// l'écart au moment du mandat.
//
// Le taux retenu est celui du barème de l'agence. Il ne se dissimule pas : la
// page « Estimation de valeur » porte la mention « Honoraires d'agence inclus »
// sous le montant, et ce module journalise le net vendeur à côté du prix affiché
// (`prixNetVendeur` dans `meta`) — un prix qu'on ne sait pas décomposer est un
// prix que l'agent ne peut pas défendre.
//
// CE QU'ELLE NE TOUCHE PAS. Les ventes comparables et les statistiques de
// marché restent des valeurs foncières brutes, telles que la DGFiP les publie.
// Les majorer en ferait des chiffres qui ne correspondraient plus à aucun
// registre, et que personne ne pourrait vérifier.

/**
 * Taux de passage du net vendeur au prix de présentation, honoraires inclus.
 *
 * Le ramener à 0 neutralise la majoration partout — prix, fourchette, prix au m²
 * affiché et profil acquéreur suivent, puisqu'ils dérivent tous du même montant.
 */
export const MAJORATION_FINALE = 0.07

/**
 * Montant arrondi au millier, comme partout ailleurs dans le calcul : une
 * estimation au dernier euro afficherait une précision qu'elle n'a pas.
 */
const auMillier = (valeur) => Math.round(valeur / 1000) * 1000

/**
 * Applique la majoration à un montant net vendeur.
 *
 * S'applique **en dernier**, après la couche d'ajustements Barnes et son plafond
 * de cumul : c'est une conversion de l'unité affichée, pas un ajustement de
 * valeur, et elle n'a donc pas à entrer dans le plafond qui borne les seconds.
 *
 * La fourchette n'est pas majorée séparément — elle est recalculée autour du
 * prix de présentation (voir `fourchetteAutour` dans `api/estimation.js`), ce qui
 * garantit qu'elle reste centrée et conserve exactement la demi-largeur que le
 * niveau de confiance commande.
 */
export const prixDePresentation = (netVendeur) => auMillier(netVendeur * (1 + MAJORATION_FINALE))
