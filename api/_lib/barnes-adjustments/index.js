// Couche d'ajustements Barnes — tout ce que le moteur d'Immovia ne fait pas.
//
// LA FRONTIÈRE QUE CE MODULE DÉFEND. Les fichiers du moteur (`moteur.js`,
// `estimationConfig.js`, `indice.js`, `terrain.js`, `statistiques.js`,
// `dvf.js`, `geo.js`, `bien.js`, `reference.js`, `pointsReference.js` et
// l'index `_data/points-reference.js`) sont repris **à l'identique** du dépôt
// Immovia et doivent pouvoir y être resynchronisés en remplaçant simplement les
// fichiers. Rien de Barnes n'y entre. Tout ce qui suit s'applique **après**, sur
// le montant qu'ils ont rendu, et ne remonte jamais dans leur calcul.
//
// CE QU'ELLE CONTIENT, dans l'ordre d'application :
//
//  1. `ajustements.js` — les coefficients tirés du formulaire : état général,
//     classe énergie, étage, ascenseur, standing, piscine, stationnements. Leur
//     cumul est borné à ±15 %.
//  2. `annexes.js` — cave, rooftop, jardin privatif. Valorisées **hors** de ce
//     plafond : ce ne sont pas des nuances sur le même bien, ce sont des mètres
//     carrés en plus, et les faire entrer dans le plafond les aurait mis en
//     concurrence avec l'état et le standing.
//
// `presentation.js` (la majoration de positionnement ×1,07) vit à côté mais
// n'est pas appelée ici : elle s'applique en tout dernier, après cette couche,
// et `api/estimation.js` l'applique explicitement pour que l'ordre reste lisible
// à la lecture du handler.
//
// Le nombre de niveaux et les autres champs purement informatifs du formulaire
// ne passent pas par ici : ils figurent au rapport, ils ne pèsent sur aucun prix.

import { ajustementsPrix } from './ajustements.js'
import { valeurAnnexes } from './annexes.js'

export { ajustementsPrix } from './ajustements.js'
export { valeurAnnexes } from './annexes.js'
export { MAJORATION_FINALE, prixDePresentation } from './presentation.js'

/**
 * Applique la couche Barnes à un montant rendu par le moteur.
 *
 * `prixM2Base` est le prix au m² du moteur, et `surfaceM2` la surface qui l'a
 * multiplié : les deux sont nécessaires parce que les surfaces annexes se
 * valorisent contre le prix au m² **déjà ajusté**, de sorte qu'un bien rénové
 * voie aussi sa cave mieux valorisée.
 *
 * Rend le montant ajusté et le détail, sous la forme que le contrat de sortie
 * attend. Ne lève jamais : un formulaire vide rend le montant du moteur, intact.
 */
export function appliqueAjustementsBarnes({ prixBase, prixM2Base, surfaceM2, characteristics }) {
  const ajustements = ajustementsPrix(characteristics)

  // Le prix au m² une fois les coefficients du formulaire appliqués — c'est
  // contre lui que les annexes se valorisent.
  const prixM2Ajuste = Number(prixM2Base) * (1 + ajustements.coefficient)
  const annexes = valeurAnnexes(characteristics, prixM2Ajuste)

  const montant = prixBase * (1 + ajustements.coefficient) + annexes.montant

  return { montant, ajustements, annexes }
}
