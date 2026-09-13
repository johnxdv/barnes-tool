// Ajustements du prix selon les caractéristiques déclarées.
//
// Le montant sort de la comparaison DVF : une médiane au m² du secteur,
// multipliée par la surface. Cette médiane porte déjà la moyenne des biens
// vendus autour — leur état moyen, leur diagnostic moyen, leur stationnement
// moyen. Ce module ne fait qu'une chose : écarter le bien estimé de cette
// moyenne, du peu dont ses caractéristiques déclarées le distinguent.
//
// Trois règles gouvernent tout ce qui suit, et elles expliquent à la fois ce
// qui est ici et ce qui n'y est pas :
//
//  1. **Modéré et plafonné.** Aucun coefficient ne dépasse ±8 %, et leur cumul
//     est borné (`PLAFOND_CUMUL`). Une estimation reste portée par les ventes
//     comparables ; ces ajustements la nuancent, ils ne la refont pas.
//
//  2. **Rien qui soit déjà compté ailleurs.** Nombre de pièces, chambres,
//     salles de bain, salles d'eau, niveaux : ces caractéristiques figurent au
//     rapport mais n'entrent pas dans le calcul. Elles ne décrivent, à surface
//     égale, que le découpage intérieur du bien — un T4 de 90 m² et un T3 de
//     90 m² se vendent au même ordre de prix dans la même rue —, et la surface
//     est déjà le multiplicateur du montant. Les repayer ici reviendrait à
//     compter deux fois le même mètre carré.
//
//     La terrasse relève du même raisonnement, à une nuance près : elle ne
//     figure pas dans la surface habitable, mais les ventes comparables du
//     secteur en comportent en moyenne autant que le bien estimé — c'est
//     précisément ce que décrit une médiane locale. Seul un écart franc à cette
//     moyenne mériterait un ajustement, et le formulaire ne recueille pas de
//     quoi l'établir.
//
//  3. **Un champ vide n'ajuste rien.** Le formulaire distingue le zéro déclaré
//     du champ laissé de côté (voir `SpecControls`), et cette distinction est
//     tenue jusqu'ici : un état général non renseigné vaut coefficient nul, pas
//     coefficient défavorable. On ne fait pas payer une case qu'on n'a pas
//     cochée.
//
// Chaque ajustement retenu ressort nommé et chiffré (`details`), pour être
// journalisé côté serveur et affiché au rapport : un prix qu'on ne sait pas
// décomposer est un prix que l'agent ne peut pas défendre devant son client.

/**
 * État général — le seul ajustement franchement négatif du lot.
 *
 * « À rénover » pèse plus lourd, en valeur absolue, que « neuf » ne rapporte :
 * un acquéreur escompte le budget de travaux qu'il devra engager, et il
 * l'escompte largement, là qu'un bien neuf se vend au prix du marché plus une
 * prime de confort. Le « bon état » est la référence — c'est l'état du bien
 * médian du secteur, celui que la médiane DVF décrit déjà.
 */
export const COEF_ETAT_GENERAL = {
  'a-renover': -0.08,
  'bon-etat': 0,
  renove: 0.05,
  neuf: 0.08,
}

/**
 * Classe énergie — même barème de principe que l'état général, adossé à la
 * réglementation plutôt qu'au confort.
 *
 * C et D sont neutres : ce sont les classes les plus représentées du parc, donc
 * celles que porte déjà la médiane. En dessous, la décote suit l'échéancier de
 * l'interdiction de location (G depuis 2025, F en 2028) — un bien qui écarte la
 * clientèle investisseur perd une part de son marché. Au-dessus, la prime reste
 * modeste : un bon diagnostic rassure, il ne fait pas le prix.
 */
export const COEF_CLASSE_ENERGIE = {
  A: 0.05,
  B: 0.03,
  C: 0,
  D: 0,
  E: -0.03,
  F: -0.06,
  G: -0.08,
}

/**
 * Étage — appartements seulement, et le formulaire ne pose la question qu'à
 * eux (voir `EstimationCharacteristicsStep`).
 *
 * L'échelle n'est pas linéaire et ne peut pas l'être : ce qui se paie n'est pas
 * la hauteur mais ce qu'elle apporte — l'absence de vis-à-vis, le calme, la
 * lumière. Le rez-de-chaussée les perd tous les trois d'un coup et se décote
 * franchement ; le premier reste en retrait ; les deuxième et troisième sont la
 * référence, l'étage du bien médian que porte déjà la médiane DVF. Au-dessus,
 * la prime existe mais se tasse vite : entre un sixième et un neuvième étage,
 * l'acquéreur ne distingue plus grand-chose.
 *
 * Un étage élevé sans ascenseur se décoterait, lui, au lieu de se valoriser —
 * mais le formulaire ne recueille pas la présence d'un ascenseur, et la
 * supposer serait décider à la place de l'agent. Le barème retient donc
 * l'hypothèse majoritaire du parc collectif de plus de trois niveaux.
 */
export function coefEtage(etage) {
  if (etage === 0) return -0.04
  if (etage === 1) return -0.01
  if (etage <= 3) return 0
  if (etage <= 5) return 0.02
  return 0.03
}

/**
 * Standing — la prestation de l'immeuble ou de la construction, à distinguer de
 * l'état général, qui décrit l'usure.
 *
 * Les deux se cumulent sans faire double emploi : un immeuble haussmannien de
 * belle facture peut être à rénover, un pavillon des années 1980 impeccablement
 * entretenu reste un pavillon des années 1980. « Standard » est la référence,
 * c'est-à-dire le bien que décrit déjà la médiane du secteur.
 *
 * La prime du haut standing est la plus forte du barème, et c'est cohérent avec
 * le marché de la maison : c'est le critère qui, à surface et à adresse égales,
 * écarte le plus les prix. Elle reste néanmoins bornée par le plafond de cumul
 * — un bien d'exception ne se calcule pas par correctif sur une médiane.
 */
export const COEF_STANDING = {
  standard: 0,
  'bon-standing': 0.03,
  'haut-standing': 0.07,
}

const STANDING_LABELS = {
  standard: 'Standard',
  'bon-standing': 'Bon standing',
  'haut-standing': 'Haut standing',
}

/** Piscine déclarée. Un équipement qui élargit le public, pas qui refait le prix. */
export const COEF_PISCINE = 0.04

/**
 * Stationnement — par emplacement, couvert ou non, et plafonné à trois.
 *
 * Le premier emplacement est celui qui compte ; le quatrième ne se revend pas.
 * Le plafond est là pour ça : sans lui, huit places extérieures déclarées au
 * compteur vaudraient +12 %, ce qu'aucun marché ne paie.
 */
export const COEF_PAR_STATIONNEMENT = 0.015
export const PLAFOND_STATIONNEMENTS = 0.045

/**
 * Plafond du cumul, dans les deux sens.
 *
 * Les coefficients ci-dessus ne sont pas indépendants : un bien à rénover est
 * souvent un bien mal classé au DPE, et l'on additionnerait deux fois la même
 * réalité. Ce plafond borne la somme à ±15 %, c'est-à-dire à un peu moins que
 * la largeur de la fourchette affichée au rapport — l'ajustement déplace
 * l'estimation à l'intérieur du marché, il ne l'en sort pas.
 */
export const PLAFOND_CUMUL = 0.15

const ETAT_LABELS = {
  'a-renover': 'à rénover',
  'bon-etat': 'bon état',
  renove: 'rénové',
  neuf: 'neuf',
}

/** Entier positif déclaré, ou 0 — un champ vide ne compte pas pour un zéro. */
const compte = (valeur) => {
  const n = Number(valeur)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

const borner = (valeur, plafond) => Math.min(Math.max(valeur, -plafond), plafond)

/**
 * Ajustements applicables aux caractéristiques déclarées.
 *
 * Renvoie toujours la même forme, y compris pour un formulaire vide :
 *
 *  - `coefficient` — le multiplicateur à appliquer au prix, déjà plafonné
 *    (`0` quand rien n'a été déclaré, donc prix inchangé) ;
 *  - `brut` — la somme avant plafonnement, conservée pour que le journal dise
 *    si le plafond a mordu ;
 *  - `plafonne` — vrai si c'est le cas ;
 *  - `details` — chaque ajustement retenu, nommé et chiffré, dans l'ordre
 *    d'application.
 *
 * Ne lève jamais : un formulaire d'une forme inattendue rend un ajustement nul,
 * et le prix sort du moteur tel que la comparaison DVF l'a établi.
 */
export function ajustementsPrix(characteristics) {
  const c = characteristics && typeof characteristics === 'object' ? characteristics : {}
  const details = []

  const etat = COEF_ETAT_GENERAL[c.etatGeneral]
  if (etat != null && etat !== 0) {
    details.push({
      id: 'etat-general',
      label: `État général — ${ETAT_LABELS[c.etatGeneral]}`,
      coefficient: etat,
    })
  }

  const dpe = COEF_CLASSE_ENERGIE[c.classeEnergie]
  if (dpe != null && dpe !== 0) {
    details.push({
      id: 'classe-energie',
      label: `Classe énergie ${c.classeEnergie}`,
      coefficient: dpe,
    })
  }

  // L'étage n'est retenu qu'en appartement : le formulaire l'efface au
  // changement de type, mais une requête forgée — ou un état hérité d'un
  // parcours précédent — pourrait encore en porter un sur une maison.
  const etage = Number(c.etage)
  if (c.typeBien === 'appartement' && Number.isInteger(etage) && etage >= 0) {
    const coefficient = coefEtage(etage)
    if (coefficient !== 0) {
      details.push({
        id: 'etage',
        label: etage === 0 ? 'Rez-de-chaussée' : etage === 1 ? '1er étage' : `${etage}e étage`,
        coefficient,
      })
    }
  }

  const standing = COEF_STANDING[c.standing]
  if (standing != null && standing !== 0) {
    details.push({
      id: 'standing',
      label: `Standing — ${STANDING_LABELS[c.standing].toLowerCase()}`,
      coefficient: standing,
    })
  }

  if (c.piscine === true) {
    details.push({ id: 'piscine', label: 'Piscine', coefficient: COEF_PISCINE })
  }

  const places = compte(c.stationnementsExterieurs) + compte(c.stationnementsInterieurs)
  if (places > 0) {
    const coefficient = Math.min(places * COEF_PAR_STATIONNEMENT, PLAFOND_STATIONNEMENTS)
    details.push({
      id: 'stationnements',
      label: places > 1 ? `${places} stationnements` : 'Stationnement privatif',
      coefficient,
    })
  }

  const brut = details.reduce((somme, detail) => somme + detail.coefficient, 0)
  const coefficient = borner(brut, PLAFOND_CUMUL)

  return {
    coefficient,
    brut,
    plafonne: coefficient !== brut,
    details,
  }
}
