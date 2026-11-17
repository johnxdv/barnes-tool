// Ce module ne cherche plus les ventes comparables — le moteur le fait.
//
// CE QU'IL CONTENAIT. `findComparables` élargissait un rayon par paliers
// (300 m à 15 km) jusqu'à réunir cinq ventes, et en tirait une médiane simple
// des €/m² ; `departementPricePerM2` servait de repli quand l'élargissement ne
// donnait rien. Les deux sont remplacés par `moteur.js`, repris d'Immovia, qui
// fait le même travail autrement : rayon de départ à 100 m, fenêtre de
// similarité sur la surface et sur le terrain, pondération par distance,
// surface, terrain et récence, actualisation par un indice temporel semestriel,
// ajustement de terrain par régression, et replis explicites là où la médiane
// départementale tombait en silence.
//
// Les garder ici aurait laissé deux sélections concurrentes dans le dépôt, et
// rien n'aurait dit laquelle avait produit un prix donné.
//
// CE QU'IL RESTE, et pourquoi il reste ici. Deux fonctions que le rapport
// emploie encore — `api/_lib/secteur.js` pour ses pages de marché, et
// `api/prix-m2.js` pour l'aperçu du curseur. Elles vivent désormais dans le
// moteur et dans `statistiques.js` ; ce fichier n'en est plus que le point
// d'entrée, pour que leurs appelants n'aient pas à savoir d'où elles viennent.
//
// **`comparableKinds` a changé de comportement au passage**, et c'est le moteur
// d'Immovia qui l'impose : l'ancienne version rapprochait un type indéterminé
// ou un local professionnel de l'ensemble du résidentiel (`['maison',
// 'appartement']`), au motif qu'une médiane tous logements confondus valait
// mieux que pas d'estimation. Le moteur ne mélange plus jamais les deux — sur
// le cas marseillais, les maisons se négocient à 4 892 €/m² et les appartements
// à 2 176 €/m², et leur mélange donne 4 761 €/m², un chiffre qui ne décrit aucun
// des deux marchés. Les pages de marché du rapport suivent la même règle que
// l'estimation, sans quoi le rapport aurait annoncé une médiane de secteur
// calculée sur un échantillon que le prix affiché, lui, n'a pas employé.

export { comparableKinds } from './moteur.js'
export { median } from './statistiques.js'
