// Réglages de la sélection des comparables DVF — un seul endroit.
//
// Tout ce qui se règle à la main dans le moteur d'estimation vit ici :
// bornes de qualité, critères de similarité, cascade de rayons, formes des
// poids, paramètres de l'indice temporel et de l'ajustement de terrain. Les
// modules de calcul n'inventent aucune constante de leur côté — s'il faut
// changer un seuil, il se change ici et nulle part ailleurs.
//
// PÉRIMÈTRE. Ce fichier ne concerne QUE les zones couvertes par DVF. Les
// départements du livre foncier (57, 67, 68) et Mayotte (976) sont servis par
// `reference.js`, qui ne lit rien d'ici et dont la majoration commerciale
// (`MAJORATION_HORS_DVF`) n'a aucun équivalent sur ce chemin-ci.
//
// PRINCIPE DIRECTEUR, dont découle presque tout le reste : **on reste le plus
// près possible du bien.** La similarité est un seuil minimum à franchir, pas
// un score à maximiser. Au-dessus de ce seuil, c'est la proximité qui tranche
// — une vente voisine un peu moins ressemblante en dit plus long qu'une vente
// très ressemblante à deux kilomètres, parce que l'emplacement se négocie
// rue par rue là où la surface se corrige par le calcul.

/** Profondeur d'historique, en années. Au-delà, l'actualisation devient plus fragile que la vente n'est utile. */
export const FENETRE_ANNEES = 5

/**
 * Filtres de qualité, appliqués avant toute comparaison.
 *
 * `bornesPrixM2` sont des bornes absolues, en €/m² : elles écartent la faute
 * de saisie et la vente qui n'en est pas une. Le plancher est passé de 200 à
 * **500 €/m²** — 200 laissait entrer des cessions manifestement hors marché
 * (relevé sur le 13 : une maison de 40 m² à 10 000 €, soit 250 €/m²,
 * retenue comme comparable à 166 m de l'adresse estimée).
 *
 * `ecartMedianeMin/Max` sont un filtre *relatif*, et c'est le plus utile des
 * deux : il se calibre sur le secteur au lieu de supposer un niveau de prix.
 * Une vente à moins de la moitié ou plus du double de la médiane des
 * candidates du secteur ne décrit pas le même marché, quel que soit ce marché.
 */
export const QUALITE = {
  bornesPrixM2: {
    maison: [500, 25000],
    appartement: [500, 25000],
    // Le terrain nu n'est pas visé par la consigne des 500 €/m², qui n'aurait
    // aucun sens sur du sol constructible — ses bornes d'origine sont gardées.
    terrain: [2, 3000],
  },
  bornesSurface: {
    maison: [15, 1000],
    appartement: [8, 500],
    terrain: [50, 20000],
  },
  ecartMedianeMin: 0.5,
  ecartMedianeMax: 2,
}

/**
 * Critères de similarité — **éliminatoires**, pas pondérés.
 *
 * Une vente qui ne les franchit pas n'entre pas dans l'échantillon, même s'il
 * n'y a rien d'autre : le moteur préfère annoncer une confiance faible qu'une
 * médiane bâtie sur des biens qui ne se ressemblent pas. Ces seuils ne sont
 * jamais relâchés pour atteindre le minimum d'échantillon.
 *
 * Les bornes de surface (0,7× à 1,4×) encadrent la cible sans symétrie
 * apparente, et c'est volontaire : le €/m² décroît avec la surface, si bien
 * qu'un comparable plus petit s'écarte plus vite du bien qu'un comparable
 * plus grand. Sur un bien de 100 m², cela donne 70 à 140 m².
 *
 * Le terrain n'est éliminatoire que si **les deux** sont connus. Dans DVF, une
 * `surface_terrain` à 0 ne veut pas dire « pas de terrain » mais « non
 * renseigné » — 10 des 40 comparables du cas marseillais étaient dans ce cas.
 * L'inconnu est donc admis, mais pénalisé dans le poids (voir `POIDS`).
 */
export const SIMILARITE = {
  maison: { surface: [0.7, 1.4], terrain: [0.5, 2.0] },
  appartement: { surface: [0.7, 1.4] },
  // Le terrain nu se compare à lui-même : sa contenance tient le rôle de la
  // surface habitable, et il n'a pas de second terrain à comparer.
  terrain: { surface: [0.5, 2.0] },
}

/**
 * Cascade de rayons, en mètres. **Cumulés** : chaque palier compte les ventes
 * de tous les paliers précédents, une vente à 80 m restant acquise quand on
 * ouvre à 200 m.
 *
 * On s'arrête au premier palier qui atteint `MIN_COMPARABLES` ventes
 * similaires, et on n'élargit jamais au-delà pour en avoir davantage : le
 * gain de précision d'une sixième vente ne compense pas le kilomètre qu'il
 * faut parcourir pour la trouver.
 */
export const RAYONS_M = [100, 200, 300, 500, 1000, 2000]

/** En dessous, l'échantillon ne porte pas une médiane ; on élargit. */
export const MIN_COMPARABLES = 5

/** Au-dessus, seules les mieux notées sont gardées — une médiane cesse de bouger bien avant. */
export const MAX_COMPARABLES = 8

/**
 * Rayons du **repli par les surfaces**, en mètres, au-delà du dernier palier de
 * la cascade (2 km).
 *
 * CE QU'ILS REMPLACENT. Quand la cascade ne réunissait pas cinq ventes
 * similaires à 2 km, le moteur servait la médiane du département entier. C'est
 * un chiffre qui ne décrit rien : ni le quartier, ni le bien. Il tombait
 * pourtant sur deux cas parfaitement ordinaires, qui n'ont rien d'une panne —
 * le bien atypique (une maison de 300 m² dans un tissu de 90 m²) et la zone
 * peu dense (un hameau où cinq maisons ne se vendent pas en cinq ans dans un
 * rayon de 2 km).
 *
 * CE QUE FAIT LE REPLI. Il relâche la seule contrainte qui bloque, et une
 * seule : la fenêtre de surface 0,7×–1,4×. Les ventes retenues restent du même
 * type, dans le même secteur, filtrées par la qualité, et ce sont les **plus
 * proches en surface** du bien — pour une maison de 300 m², la plus grande
 * maison vendue à proximité, même si elle n'en fait que 220. Le rayon ne
 * s'élargit qu'ensuite, et seulement s'il n'y a pas cinq ventes du type à 2 km.
 *
 * L'ordre importe : relâcher la surface coûte une comparaison moins juste,
 * s'éloigner coûte un autre marché. On paie donc la surface d'abord.
 */
export const RAYONS_ELARGIS_M = [5000, 10000, 20000]

/**
 * Niveaux de confiance, par rayon réellement atteint.
 *
 * Jusqu'à 500 m, l'échantillon décrit le quartier : confiance normale.
 * Au-delà et jusqu'à 2 km, il décrit un secteur : confiance moyenne. Faute de
 * cinq ventes similaires à 2 km, on passe aux replis par les surfaces
 * (`RAYONS_ELARGIS_M`), qui sont tous en confiance faible. Ces trois niveaux
 * décident à eux seuls de la largeur de la fourchette affichée (voir
 * `FOURCHETTE`), et redescendent dans `meta`.
 */
export const CONFIANCE = {
  rayonNormalMaxM: 500,
  rayonMoyenMaxM: 2000,
}

/**
 * Formes des poids. Chaque facteur rend un nombre dans ]0, 1] ; le poids d'un
 * comparable est leur **produit**.
 *
 * `distance` — `1 / (1 + (d/d0)^p)`. C'est délibérément le facteur le plus
 * fort : avec `d0 = 150` et `p = 2`, une vente vaut 1 sur place, 0,50 à 150 m,
 * 0,20 à 300 m, 0,083 à 500 m et 0,006 à 2 km. Aucun autre facteur ne varie
 * d'un tel rapport, ce qui garantit que la proximité domine la sélection
 * finale même quand la similarité, elle, est déjà acquise.
 *
 * `surface` — `exp(-|ln(Sc/St)| / tolerance)`. L'écart est mesuré en
 * logarithme, donc de façon symétrique : un comparable deux fois plus grand
 * et un comparable deux fois plus petit sont également éloignés. Avec 0,35,
 * un écart de 40 % pèse 0,37.
 *
 * `terrain` — même forme, tolérance plus large : le terrain explique une part
 * bien moindre du prix que la surface habitable, et son ajustement direct
 * (voir `TERRAIN`) en corrige déjà l'essentiel. `penaliteInconnu` s'applique
 * quand DVF ne renseigne pas le terrain du comparable : la vente reste
 * utilisable, elle compte simplement moins.
 *
 * `recence` — décroissance par demi-vie, volontairement faible : l'indice
 * temporel a déjà ramené tous les prix au même semestre, ce facteur ne fait
 * que reconnaître qu'une vente ancienne a été davantage retouchée par le
 * calcul, donc qu'elle est plus incertaine. À 8 ans de demi-vie, une vente de
 * cinq ans pèse encore 0,65.
 */
export const POIDS = {
  distance: { d0M: 150, exposant: 2 },
  surface: { tolerance: 0.35 },
  terrain: { tolerance: 0.7, penaliteInconnu: 0.6 },
  recence: { demiVieAnnees: 8 },
}

/**
 * Indice de prix par semestre, reconstruit sur DVF.
 *
 * `medianeVentesSemestreCommune` / `minVentesSemestreCommune` : les deux
 * conditions de l'échelle communale. La **médiane** des volumes semestriels
 * doit atteindre 30 ventes, et **aucun** semestre ne doit descendre sous 15.
 *
 * La règle précédente exigeait 30 ventes à *chaque* semestre : un seul
 * semestre creux — un août calme, un millésime publié en retard — renvoyait
 * tout l'indice à l'échelle départementale, y compris pour des communes qui
 * en avaient largement le volume le reste du temps. Le couple médiane +
 * plancher garde l'intention de départ (ne pas bâtir un indice sur un
 * semestre vide, qui sauterait d'un point à l'autre) sans sanctionner un creux
 * isolé.
 *
 * `lissageSemestres` : moyenne glissante centrée sur 3 semestres. Une médiane
 * semestrielle sur quelques centaines de ventes bouge de plusieurs pour cent
 * par pur bruit d'échantillonnage ; sans lissage, ce bruit se retrouverait
 * tel quel dans le prix de chaque comparable.
 *
 * `coefficientMin/Max` : garde-fous. Un coefficient d'actualisation hors de
 * ces bornes signale un indice défaillant, pas un marché qui a doublé.
 */
export const INDICE = {
  medianeVentesSemestreCommune: 30,
  minVentesSemestreCommune: 15,
  lissageSemestres: 3,
  coefficientMin: 0.6,
  coefficientMax: 1.8,
}

/**
 * Ajustement direct du terrain — maisons seulement.
 *
 * RAPPEL MÉTHODOLOGIQUE, à ne pas perdre de vue en relisant `terrain.js` : le
 * €/m² d'une maison dans DVF **contient déjà la valeur de son terrain**, le
 * prix de la mutation entière étant divisé par la seule surface bâtie. Il ne
 * faut donc ni multiplier le terrain par le €/m² habitable, ni ajouter la
 * valeur du terrain du bien au produit obtenu : les deux revenaient à compter
 * le terrain deux fois. Seule la **différence** de terrain entre le bien et
 * ses comparables se valorise.
 *
 * `rayonM` / `minVentes` : l'échantillon qui sert à estimer la valeur du m² de
 * terrain est large et distinct des comparables — une régression sur cinq à
 * huit points ne dirait rien. À défaut de 50 ventes dans le rayon, on élargit
 * à la commune puis au département.
 *
 * `tStatMin` : seuil de significativité du coefficient de terrain. En dessous,
 * ou si le coefficient sort négatif, aucun ajustement n'est appliqué et
 * `meta` le dit. Mieux vaut ne pas corriger que corriger au hasard.
 *
 * `plafondPct` : l'ajustement ne peut pas déplacer le prix de plus de 15 %.
 * C'est une borne de sécurité sur un terme secondaire, pas un réglage fin.
 *
 * `percentileTerrainNu` : sert uniquement à la décomposition lisible
 * bâti / terrain affichée dans `meta`. Aucun effet sur le prix.
 */
export const TERRAIN = {
  rayonM: 2000,
  minVentes: 50,
  tStatMin: 2,
  plafondPct: 0.15,
  percentileTerrainNu: 0.05,
}

/**
 * Fourchette affichée — une bande fixe autour du prix, réglée par la seule
 * confiance.
 *
 * CE QU'ELLE REMPLACE. Les bornes venaient des quantiles pondérés 25 et 75 des
 * €/m² actualisés de l'échantillon retenu, élargis selon la confiance et
 * plafonnés à ±20 %. L'intention était bonne — faire dire aux ventes voisines
 * ce qu'elles savent, y compris leur désaccord — mais le banc de test l'a
 * chiffrée : cette fourchette-là ne contenait le prix réel que dans **38 % des
 * cas** en validation, pour une demi-largeur médiane de 11 %. Autrement dit
 * elle annonçait une précision que le moteur n'a pas, et se trompait deux fois
 * sur trois. La dispersion de cinq à huit ventes voisines mesure l'accord de
 * ces ventes entre elles, pas l'erreur du moteur sur le bien : les deux n'ont
 * pas de raison de coïncider, et de fait elles ne coïncidaient pas.
 *
 * CE QU'ELLE EST MAINTENANT. Une demi-largeur fixe, en pourcentage du prix,
 * qui ne dépend que du niveau de confiance — c'est-à-dire de la façon dont
 * l'échantillon a été trouvé (voir `CONFIANCE` et les étapes du moteur). Elle
 * ne prétend plus lire la dispersion locale ; elle annonce l'ordre de grandeur
 * de l'erreur que le banc mesure vraiment, et elle l'annonce de la même façon
 * pour tous les biens servis par le même chemin de calcul.
 *
 *   • `normale` — cinq à huit ventes similaires à moins de 500 m : ±15 % ;
 *   • `moyenne` — le même échantillon trouvé jusqu'à 2 km : ±20 % ;
 *   • `faible`  — repli par les surfaces, ou dernier filet départemental : ±25 %.
 *
 * PÉRIMÈTRE. `parConfiance` ne concerne que les zones couvertes par DVF, seul
 * chemin qui produit un niveau de confiance à partir de ventes. Monaco et les
 * prix de référence hors DVF gardent leur fourchette symétrique, et c'est elle
 * — et elle seule — que `demiLargeurMin/MaxPct` encadrent encore : un plancher
 * de 5 %, un plafond de 20 % au-delà duquel une fourchette n'informe plus
 * personne (« entre 250 000 et 750 000 € » revient à ne rien annoncer). Ces
 * deux bornes ne s'appliquent plus au chemin DVF, sans quoi le plafond mordrait
 * sur le ±25 % de la confiance faible.
 *
 * `demiLargeurHorsDvfPct` est la demi-largeur du chemin hors DVF. Elle a sa
 * propre constante depuis septembre 2026, et c'est le sujet de la note
 * ci-dessous.
 */
export const FOURCHETTE = {
  parConfiance: { normale: 0.15, moyenne: 0.2, faible: 0.25 },
  demiLargeurMinPct: 0.05,
  demiLargeurMaxPct: 0.2,

  /**
   * Demi-largeur de la fourchette hors couverture DVF (57, 67, 68, 976).
   *
   * CE QU'ELLE REMPLACE. Ce chemin passait `demiLargeurMinPct` à
   * `fourchetteSymetrique`, soit **±5 %** — non par choix, mais parce que le
   * plancher était la seule constante à portée de main. Personne n'avait
   * décidé que la fourchette mosellane devait être la plus serrée du produit ;
   * elle l'était par défaut, et c'était le contraire de ce qu'il fallait : ce
   * chemin est le moins bien renseigné des trois.
   *
   * CE QUE LE BANC A MESURÉ (`scripts/backtest-horsdvf.mjs`, 799 ventes réelles
   * de 2025 en 54/55/88, départements limitrophes de la Moselle qui, eux, ont
   * du DVF) : l'erreur médiane de la méthode hors DVF est de **20,9 %**, et le
   * ±5 % ne contenait le vrai prix que dans **12,6 % des cas**. La fourchette
   * annonçait donc une précision quatre fois supérieure à celle qu'elle a.
   *
   * POURQUOI 13 % ET NON 32 %. Le banc chiffre à ±32 % la demi-largeur qu'il
   * faudrait pour contenir 700 biens sur 1 000. C'est la vérité statistique, et
   * c'est commercialement inutilisable — « entre 131 000 et 255 000 € » sur une
   * maison à 193 000 € ne renseigne plus un vendeur. 13 % est un **compromis
   * assumé, demandé par l'agence** : il couvre nettement moins de biens que
   * 32 %, et nettement plus que 5 %. Ce n'est pas une mesure, c'est un
   * arbitrage entre justesse et lisibilité, et il doit être relu comme tel.
   *
   * Le prix central n'est pas touché : cette constante ne déplace que les
   * bornes. La majoration commerciale de +10 % (`MAJORATION_HORS_DVF`, dans
   * `reference.js`) reste en place et continue de porter le biais médian du
   * chemin à +8,7 %, mesuré sur le même banc.
   */
  demiLargeurHorsDvfPct: 0.13,
}

/**
 * Fiabilité du chargement DVF.
 *
 * `tentatives` / `delaisMs` / `timeoutsMs` : trois essais par fichier, avec
 * un délai et un plafond de temps qui croissent. L'ancien réglage — un seul
 * essai plafonné à 4 s — rendait `[]` en silence sur un simple démarrage à
 * froid, et cet `[]` était indiscernable d'un département sans ventes : le
 * moteur enchaînait alors sur la médiane départementale sans que rien ne le
 * signale (c'est l'origine du 403 000 € au lieu de 489 000 € à Marseille).
 *
 * `budgetTotalMs` : enveloppe de l'étape B tout entière, réessais compris.
 * `vercel.json` accorde à la fonction une durée maximale supérieure.
 *
 * `echecsToleres` : nombre de millésimes dont l'échec n'interrompt pas
 * l'estimation, sur le département du bien. Un seul — et à condition qu'un
 * millésime **plus récent** ait bel et bien été chargé. Perdre 2022 sur six
 * fichiers retire quelques ventes d'un échantillon qui en compte cinq à huit,
 * et l'indice temporel ramène de toute façon tout au dernier semestre ; perdre
 * le millésime le plus récent, en revanche, c'est estimer sur un marché qui
 * n'est plus le bon sans pouvoir le savoir. Deux échecs ou plus, ou l'échec du
 * plus récent publié : l'estimation s'arrête (503), comme avant.
 */
export const CHARGEMENT = {
  tentatives: 3,
  echecsToleres: 1,
  delaisMs: [0, 400, 1200],
  timeoutsMs: [6000, 9000, 12000],
  budgetTotalMs: 25000,
  concurrence: 4,
}

/**
 * À partir de ce rayon, la zone de recherche peut déborder sur un département
 * voisin — et les fichiers DVF sont rangés par département. Le débordement
 * reste facultatif : l'indisponibilité d'un département voisin n'interrompt
 * pas l'estimation, contrairement à celle du département du bien.
 */
export const RAYON_TRANSFRONTALIER_M = 2000
