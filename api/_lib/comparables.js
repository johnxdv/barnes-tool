// Ce module ne cherche plus les ventes comparables — le moteur le fait.
//
// CE QU'IL CONTENAIT. `findComparables` élargissait un rayon jusqu'à réunir
// assez de ventes, en tirait une médiane simple des €/m², et
// `departementPricePerM2` servait de repli quand l'élargissement ne donnait
// rien. Les deux ont été remplacés par `moteur.js`, qui fait le même travail
// en mieux : filtres de qualité relatifs au secteur, fenêtre de similarité,
// pondération par distance / surface / terrain / récence, actualisation par un
// indice temporel, et replis explicites plutôt qu'une médiane départementale
// silencieuse. Les garder ici aurait laissé deux sélections concurrentes dans
// le dépôt, et rien n'aurait dit laquelle avait produit un prix donné.
//
// CE QU'IL RESTE, et pourquoi il reste ici. Deux fonctions que le rapport
// emploie encore — `api/_lib/secteur.js` pour ses pages de marché, et
// `api/prix-m2.js`. Elles vivent désormais dans le moteur et dans
// `statistiques.js` ; ce fichier n'en est plus que le point d'entrée, pour que
// leurs appelants n'aient pas à savoir d'où elles viennent.
//
// **`comparableKinds` a changé de comportement au passage**, et c'est
// volontaire : l'ancienne version rapprochait un type indéterminé ou un local
// professionnel de l'ensemble du résidentiel (`['maison', 'appartement']`),
// au motif qu'une médiane tous logements confondus valait mieux que pas
// d'estimation. Le moteur ne mélange plus jamais les deux — sur le cas
// marseillais, les maisons se négocient à 4 892 €/m² et les appartements à
// 2 176 €/m², et leur mélange donne 4 761 €/m², un chiffre qui ne décrit aucun
// des deux marchés. Les pages de marché du rapport suivent la même règle que
// l'estimation, sans quoi le rapport aurait annoncé une médiane de secteur
// calculée sur un échantillon que le prix affiché, lui, n'a pas employé.

export { comparableKinds } from './moteur.js'
export { median } from './statistiques.js'
