// Surfaces annexes — cave, rooftop, jardin privatif.
//
// POURQUOI ELLES NE SONT PAS DES AJUSTEMENTS. `ajustements.js` écarte le bien
// du bien moyen du secteur, en pourcentages modérés et sous un plafond de cumul
// de ±15 % : un état général, un diagnostic, un standing décrivent **le même
// bien** autrement. Une cave de quatre-vingts mètres carrés, un rooftop, un
// jardin de rez-de-chaussée ne font pas cela — ils ajoutent de la surface. Les
// faire entrer dans le plafond les aurait mis en concurrence avec l'état et le
// standing, et un bien neuf de haut standing avec rooftop aurait vu son rooftop
// absorbé par un plafond déjà atteint. Ils sont donc valorisés à part, et après.
//
// COMMENT. Chaque mètre carré annexe vaut une fraction du mètre carré habitable
// du bien — celui d'après les ajustements, pas la médiane brute du secteur, de
// sorte qu'un bien rénové voie aussi sa cave mieux valorisée. Les fractions
// décroissent avec la surface pour le rooftop et le jardin : les premiers
// mètres carrés font l'agrément, les suivants font l'entretien.
//
// CE QUI N'EST PAS ICI. La terrasse, qui reste non valorisée (voir l'en-tête
// d'`ajustements.js` : les ventes comparables du secteur en comportent en
// moyenne autant que le bien estimé). Et le terrain, qui n'a jamais été
// valorisé par cette couche.

/**
 * Pondérations, en fraction du prix au m² habitable du bien.
 *
 * `plein` s'applique aux `jusqua` premiers mètres carrés, `reduit` au-delà. Une
 * pondération sans `jusqua` vaut sur toute la surface.
 *
 * Les niveaux retenus :
 *
 *  - **cave, 0,10 sur tout** — un sous-sol se vend, mais il ne se vit pas ; la
 *    décote est forte et ne s'atténue pas avec la surface, une grande cave
 *    restant une cave.
 *  - **rooftop, 0,30 puis 0,15 au-delà de 20 m²** — la plus forte des trois :
 *    c'est un extérieur privatif en étage, l'argument de vente le plus rare du
 *    collectif haut de gamme. Vingt mètres carrés suffisent à en faire un lieu ;
 *    ce qui s'ajoute ensuite compte moitié moins.
 *  - **jardin privatif, 0,10 puis 0,05 au-delà de 50 m²** — un rez-de-jardin se
 *    paie pour l'usage qu'on en a, et cet usage sature vite : au-delà d'une
 *    cinquantaine de mètres carrés, c'est de l'entretien qui s'ajoute.
 */
export const PONDERATIONS = {
  cave: { plein: 0.1 },
  rooftop: { plein: 0.3, jusqua: 20, reduit: 0.15 },
  jardinPrivatif: { plein: 0.1, jusqua: 50, reduit: 0.05 },
}

/** Libellés du rapport, dans l'ordre où les surfaces y apparaissent. */
const LIBELLES = {
  cave: 'Cave',
  rooftop: 'Rooftop',
  jardinPrivatif: 'Jardin privatif',
}

const nombreFr = new Intl.NumberFormat('fr-FR')

/** Surface déclarée strictement positive, ou 0 — un champ vide n'ajoute rien. */
const surface = (valeur) => {
  const n = Number(valeur)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Surface pondérée d'une annexe : la part de mètre carré habitable qu'elle
 * représente.
 */
function pondere(surfaceM2, { plein, jusqua, reduit }) {
  if (jusqua === undefined) return surfaceM2 * plein

  const premiers = Math.min(surfaceM2, jusqua)
  const suivants = Math.max(0, surfaceM2 - jusqua)

  return premiers * plein + suivants * reduit
}

/**
 * Valeur des surfaces annexes déclarées.
 *
 * `prixM2Ajuste` est le prix au m² du bien **après** la couche d'ajustements —
 * c'est contre lui que les annexes se valorisent.
 *
 * Rend toujours la même forme, y compris pour un formulaire vide :
 *
 *  - `montant` — l'euro à ajouter au prix, `0` quand rien n'est déclaré ;
 *  - `surfacePonderee` — le total pondéré, en m² habitables équivalents ;
 *  - `details` — chaque annexe retenue, nommée et mesurée, pour le rapport.
 *
 * Ne lève jamais : un formulaire d'une forme inattendue rend un montant nul, et
 * le prix sort inchangé de cette couche.
 *
 * Le jardin privatif n'est retenu qu'en appartement : le formulaire ne pose la
 * question qu'à lui, mais une requête forgée — ou un état hérité d'un parcours
 * précédent — pourrait encore en porter un sur une maison.
 */
export function valeurAnnexes(characteristics, prixM2Ajuste) {
  const c = characteristics && typeof characteristics === 'object' ? characteristics : {}
  const m2 = Number(prixM2Ajuste)
  const details = []

  const declarees = {
    cave: surface(c.surfaceCave),
    rooftop: surface(c.surfaceRooftop),
    jardinPrivatif: c.typeBien === 'appartement' ? surface(c.surfaceJardinPrivatif) : 0,
  }

  let surfacePonderee = 0
  for (const [id, surfaceM2] of Object.entries(declarees)) {
    if (surfaceM2 <= 0) continue
    surfacePonderee += pondere(surfaceM2, PONDERATIONS[id])
    details.push({
      id,
      surfaceM2,
      // « Cave de 15 m² » — nommée et mesurée, jamais chiffrée en euros : le
      // rapport dit ce qui a été pris en compte, pas ce que cela vaut.
      label: `${LIBELLES[id]} de ${nombreFr.format(surfaceM2)} m²`,
    })
  }

  const montant = Number.isFinite(m2) && m2 > 0 ? surfacePonderee * m2 : 0

  return { montant, surfacePonderee, details }
}
