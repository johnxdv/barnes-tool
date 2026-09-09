/**
 * Étapes affichées pendant l'analyse. Les durées sont fixes et purement
 * visuelles : aucun calcul ne tourne derrière cet écran. L'animation a son
 * rythme propre — total = 12 s, à parts égales.
 */
export const ANALYSIS_STEPS = [
  { id: 'batiment', label: 'Expertise du bien…', done: 'Bien expertisé', durationMs: 4000 },
  { id: 'marche', label: 'Étude comparative de marché…', done: 'Étude de marché réalisée', durationMs: 4000 },
  { id: 'calcul', label: 'Calcul de l’estimation…', done: 'Estimation calculée', durationMs: 4000 },
]

/**
 * Repères de marché affichés pendant l'attente. Volontairement factuels et
 * vérifiables.
 */
export const DID_YOU_KNOW = [
  'Depuis 2025, les logements classés G au DPE ne peuvent plus être proposés à la location nue en France métropolitaine.',
  'Le diagnostic de performance énergétique est valable dix ans, mais il doit être refait après des travaux de rénovation importants.',
  'Deux biens identiques peuvent se négocier très différemment d’une rue à l’autre : l’emplacement reste le premier critère de valeur.',
  'Les transactions immobilières sont publiques : la base DVF recense les ventes des cinq dernières années, adresse par adresse.',
  'Un bien correctement estimé dès la mise en vente se vend en moyenne bien plus vite qu’un bien surévalué puis rebaissé.',
]
