// Points forts et points de réserve, déduits des caractéristiques saisies.
//
// Ce module ne consulte rien : il relit le formulaire de l'étape précédente et
// en tire une première liste d'arguments de vente et de réserves. C'est un
// brouillon, pas un verdict — le rapport les affiche comme tout le reste,
// c'est-à-dire modifiables : l'agent en retire, en réécrit, en ajoute. Un
// « Travaux à prévoir » déduit d'un état déclaré « à rénover » n'engage que la
// case cochée ; c'est l'agent qui a vu le bien.
//
// Deux règles de rédaction, valables pour toute la table ci-dessous :
//
//  1. **Ne rien affirmer que le formulaire n'ait déclaré.** Un champ laissé à
//     `null` ne produit aucune ligne — ni fort, ni réserve. L'absence de
//     piscine déclarée n'est pas l'absence de piscine.
//  2. **Rester descriptif.** « Classe énergie F » plutôt que « passoire
//     thermique » : le rapport porte l'en-tête de l'agence, et l'agent doit
//     pouvoir signer chaque ligne sans l'avoir récrite.

const nombreFr = new Intl.NumberFormat('fr-FR')

const m2 = (valeur) => `${nombreFr.format(valeur)} m²`

/** Classes de l'étiquette énergie considérées comme un argument, et leur envers. */
const DPE_FAVORABLE = new Set(['A', 'B', 'C', 'D'])

/**
 * Règles, dans l'ordre où elles apparaîtront au rapport.
 *
 * `quand` reçoit les caractéristiques et renvoie un booléen ; `titre` et
 * `detail` en tirent le texte. Une règle dont `quand` renvoie faux ne laisse
 * aucune trace.
 */
const REGLES = [
  // --- Points forts -------------------------------------------------------
  {
    camp: 'forts',
    id: 'piscine',
    quand: (c) => c.piscine === true,
    titre: () => 'Piscine',
    detail: () => 'Un équipement rare qui élargit sensiblement le public d’acquéreurs.',
  },
  {
    camp: 'forts',
    id: 'terrasse',
    quand: (c) => c.surfaceTerrasse > 0,
    titre: (c) => `Terrasse de ${m2(c.surfaceTerrasse)}`,
    detail: () => 'Un espace extérieur privatif, premier critère de recherche depuis 2020.',
  },
  {
    camp: 'forts',
    id: 'terrain',
    quand: (c) => c.surfaceTerrain >= 200,
    titre: (c) => `Terrain de ${m2(c.surfaceTerrain)}`,
    detail: () => 'Une parcelle qui dégage du recul et de l’intimité.',
  },
  {
    camp: 'forts',
    id: 'stationnement',
    quand: (c) => (c.stationnementsInterieurs ?? 0) + (c.stationnementsExterieurs ?? 0) > 0,
    titre: (c) => {
      const total = (c.stationnementsInterieurs ?? 0) + (c.stationnementsExterieurs ?? 0)
      return total > 1 ? `${total} stationnements` : 'Stationnement privatif'
    },
    detail: (c) =>
      (c.stationnementsInterieurs ?? 0) > 0
        ? 'Dont stationnement couvert — un atout décisif en secteur tendu.'
        : 'Un stationnement assuré, sans dépendre de la voirie.',
  },
  {
    camp: 'forts',
    id: 'etat-neuf',
    quand: (c) => c.etatGeneral === 'neuf' || c.etatGeneral === 'renove',
    titre: (c) => (c.etatGeneral === 'neuf' ? 'Bien neuf' : 'Bien rénové'),
    detail: () => 'Aucun budget de travaux à prévoir à court terme.',
  },
  {
    camp: 'forts',
    id: 'standing',
    quand: (c) => c.standing === 'haut-standing' || c.standing === 'bon-standing',
    titre: (c) => (c.standing === 'haut-standing' ? 'Haut standing' : 'Bon standing'),
    detail: () => 'Prestations et finitions au-dessus du marché local.',
  },
  {
    camp: 'forts',
    id: 'dpe-favorable',
    quand: (c) => DPE_FAVORABLE.has(c.classeEnergie),
    titre: (c) => `Classe énergie ${c.classeEnergie}`,
    detail: () =>
      'Un diagnostic favorable, hors de portée des restrictions de location progressives.',
  },
  {
    camp: 'forts',
    id: 'construction-recente',
    quand: (c) => c.anneeConstruction >= 2015,
    titre: (c) => `Construction de ${c.anneeConstruction}`,
    detail: () => 'Normes thermiques et acoustiques récentes.',
  },
  {
    camp: 'forts',
    id: 'chambres',
    quand: (c) => c.nombreChambres >= 4,
    titre: (c) => `${c.nombreChambres} chambres`,
    detail: () => 'Une distribution qui vise les familles, segment le plus actif du marché.',
  },
  {
    camp: 'forts',
    id: 'sanitaires',
    quand: (c) => (c.nombreSallesBain ?? 0) + (c.nombreSallesEau ?? 0) >= 2,
    titre: (c) => {
      const total = (c.nombreSallesBain ?? 0) + (c.nombreSallesEau ?? 0)
      return `${total} salles de bain et d’eau`
    },
    detail: () => 'Plusieurs points d’eau, appréciés dès quatre pièces.',
  },

  // --- Points de réserve --------------------------------------------------
  {
    camp: 'reserves',
    id: 'travaux',
    quand: (c) => c.etatGeneral === 'a-renover',
    titre: () => 'Travaux à prévoir',
    detail: () =>
      'L’état déclaré appelle un budget de rénovation, à chiffrer avant la mise en marché.',
  },
  {
    camp: 'reserves',
    id: 'dpe-defavorable',
    quand: (c) => typeof c.classeEnergie === 'string' && !DPE_FAVORABLE.has(c.classeEnergie),
    titre: (c) => `Classe énergie ${c.classeEnergie}`,
    detail: (c) =>
      c.classeEnergie === 'G'
        ? 'Location nue interdite depuis 2025 : la clientèle investisseur est écartée.'
        : c.classeEnergie === 'F'
          ? 'Location nue interdite à compter de 2028 — un argument de négociation courant.'
          : 'Un diagnostic perfectible, sur lequel les acquéreurs négocient.',
  },
  {
    camp: 'reserves',
    id: 'bati-ancien',
    quand: (c) => c.anneeConstruction != null && c.anneeConstruction < 1950,
    titre: (c) => `Bâti de ${c.anneeConstruction}`,
    detail: () =>
      'Un bâti ancien : le charme est un argument, l’isolation et les réseaux sont à vérifier.',
  },
  {
    camp: 'reserves',
    id: 'sans-exterieur',
    quand: (c) =>
      c.typeBien === 'appartement' && c.surfaceTerrasse === 0 && c.surfaceTerrain === 0,
    titre: () => 'Sans espace extérieur',
    detail: () => 'Ni terrasse ni jardin déclarés — le premier critère de recherche fait défaut.',
  },
  {
    camp: 'reserves',
    id: 'etage-eleve',
    quand: (c) => c.typeBien === 'appartement' && c.etage >= 3,
    titre: (c) => `${c.etage}e étage`,
    detail: () => 'À confirmer : la présence d’un ascenseur conditionne l’accessibilité.',
  },
]

/**
 * Points forts et points de réserve suggérés à partir des caractéristiques.
 *
 * Renvoie deux listes, éventuellement vides — un formulaire à peine rempli ne
 * produit rien, et c'est le comportement voulu : le rapport affiche alors des
 * sections vides que l'agent remplit lui-même, plutôt que des généralités qui
 * conviendraient à n'importe quel bien.
 */
export function suggererPoints(characteristics) {
  const c = characteristics && typeof characteristics === 'object' ? characteristics : {}
  const suggestions = { forts: [], reserves: [] }

  for (const regle of REGLES) {
    let retenue = false
    try {
      retenue = regle.quand(c) === true
    } catch {
      // Une caractéristique d'une forme inattendue ne doit pas emporter la
      // page : la règle est simplement passée.
      retenue = false
    }
    if (!retenue) continue

    suggestions[regle.camp].push({
      id: regle.id,
      titre: regle.titre(c),
      detail: regle.detail(c),
    })
  }

  return suggestions
}
