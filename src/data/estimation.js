/**
 * Étapes affichées pendant l'analyse. Les durées sont fixes et purement
 * visuelles : le calcul réel tourne bien en arrière-plan (voir
 * `src/lib/estimation.js`) mais répond en quelques secondes, sans rapport avec
 * ce déroulé. L'animation garde donc son rythme propre — elle n'est ni
 * raccourcie ni allongée par le moteur. Total = 12 s, à parts égales.
 */
export const ANALYSIS_STEPS = [
  { id: 'batiment', label: 'Expertise du bien…', done: 'Bien expertisé', durationMs: 4000 },
  { id: 'marche', label: 'Étude comparative de marché…', done: 'Étude de marché réalisée', durationMs: 4000 },
  { id: 'calcul', label: 'Calcul de l’estimation…', done: 'Estimation calculée', durationMs: 4000 },
]

/**
 * Ce qui défile pendant l'attente de l'analyse.
 *
 * C'étaient des repères de marché — le DPE, la base DVF, l'effet d'une
 * surévaluation. Exacts, mais interchangeables : la même phrase aurait pu
 * s'afficher sur l'outil de n'importe quel réseau. Ce sont désormais des faits
 * sur la maison qui édite l'avis de valeur, relevés sur ses propres pages
 * (`barnes-international.com`, `barnes-provence-littoral.com`) et au registre
 * du commerce.
 *
 * La règle qui gouvernait la liste précédente n'a pas bougé, elle est même plus
 * contraignante ici : **rien d'inventé**. Une date de fondation approximative
 * ou un effectif arrondi à la louche, sur un écran qui porte le nom de la
 * marque, se remarquent immédiatement — et le premier à s'en apercevoir sera
 * l'agent qui présente l'outil. Chaque phrase ci-dessous se vérifie à la
 * source.
 */
export const DID_YOU_KNOW = [
  'BARNES a été fondée en 1995 par Heidi Barnes, à Paris et à Londres, pour accompagner une clientèle internationale en quête d’une adresse dans les deux capitales.',
  'C’est sous l’impulsion de Thibault de Saint Vincent, son président, que la maison a entamé son déploiement international à partir de 2004.',
  'BARNES réunit aujourd’hui plus de 1 800 collaborateurs, présents dans plus de cent destinations dans le monde.',
  'Excellence, élégance et confiance : les trois valeurs que la maison met en avant, et qu’elle résume d’une formule — ambassadrice de l’art de vivre.',
  'BARNES Provence Littoral compte six agences, d’Eygalières au Lavandou : Aix-en-Provence, Alpilles & Luberon, Marseille, Cassis, Sanary et Le Lavandou.',
  'BARNES s’est implantée à Marseille en 2018, puis a ouvert un bureau à la Pointe Rouge avant de s’installer rue Paradis, l’une des adresses les plus emblématiques de la ville.',
  'Depuis 2018, le métier de la maison dépasse la transaction : conseil en art, yachting, aviation privée, domaines viticoles et propriétés de chasse.',
  'En 2024, BARNES est entrée dans l’hôtellerie avec Maison BARNES New York, ouverte aux côtés du chef Daniel Boulud.',
]

/**
 * Créneaux de rappel proposés à la dernière étape du parcours.
 * `phrase` porte la forme en milieu de phrase (« contactera aujourd’hui »),
 * `label` la forme autonome utilisée sur le bouton et dans la bulle de
 * réponse — les deux diffèrent uniquement par la casse.
 */
export const CALLBACK_SLOTS = [
  { id: 'aujourdhui', label: 'Aujourd’hui', phrase: 'aujourd’hui' },
  { id: 'demain-matin', label: 'Demain matin', phrase: 'demain matin' },
  { id: 'demain-apres-midi', label: 'Demain après-midi', phrase: 'demain après-midi' },
  { id: 'semaine', label: 'Dans la semaine', phrase: 'dans la semaine' },
]
