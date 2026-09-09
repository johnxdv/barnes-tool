// Principauté de Monaco — parcours simplifié.
//
// Tout le pipeline français (BAN, cadastre IGN, BDNB, DVF) s'arrête à la
// frontière : Monaco n'est pas un territoire français, aucune de ces bases ne
// le décrit. OpenStreetMap comble deux de ces manques — les adresses, par
// Nominatim (`src/lib/adresseMonaco.js`), et les contours de bâtiments, par
// Overpass (`src/lib/osm.js`) : l'utilisateur retrouve donc sa rue au clavier,
// puis son immeuble sur la photo aérienne, comme en France.
//
// Le troisième manque, lui, ne se comble pas : aucune base de mutations n'est
// publiée en Principauté, et le cadastre monégasque ne se demande que sur
// papier, extrait par extrait. Il n'y a donc ni surface habitable à lire, ni
// ventes voisines à comparer. D'où ce qu'il reste de simplifié au parcours :
// l'utilisateur déclare son type de bien et sa surface, et le montant se
// calcule d'une multiplication par un prix au m² de référence. C'est un ordre
// de grandeur assumé — la fourchette affichée en fin de parcours s'élargit en
// conséquence (voir `MONACO_RANGE_PCT`).

/** Seul et unique code postal monégasque. */
export const MONACO_POSTAL_CODE = '98000'

/**
 * Prix moyen au m² à Monaco, en euros.
 *
 * Source : IMSEE (Institut Monégasque de la Statistique et des Études
 * Économiques), institut statistique officiel de la Principauté. Valeur figée
 * en dur, à réviser à la main de temps à autre — il n'existe pour Monaco aucun
 * équivalent ouvert de DVF où aller la chercher.
 */
export const MONACO_PRICE_PER_M2 = 57500

/**
 * Demi-largeur de la fourchette affichée en fin de parcours, pour Monaco.
 *
 * Quatre fois celle du parcours français (± 5 %), et ce n'est pas de la
 * prudence rhétorique : le marché monégasque va, selon le quartier et les
 * sources, de ~38 000 € à plus de 100 000 €/m². Une moyenne unique ne peut pas
 * prétendre au même resserrement qu'une médiane de ventes voisines.
 */
export const MONACO_RANGE_PCT = 0.2

/** Centre de la Principauté — point de repli quand aucune rue n'est désignée. */
const MONACO_CENTER = { lat: 43.7384, lon: 7.4246 }

const NON_ACCENTUE = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

/**
 * Une adresse déjà normalisée (`{ postcode, city, label }`) désigne-t-elle
 * Monaco ?
 *
 * On ne regarde que la commune et le code postal — jamais le libellé entier :
 * « Boulevard Princesse Grace de Monaco 06300 Nice » existe bel et bien, et
 * c'est une adresse française.
 */
export function isMonacoAddress(address) {
  if (!address) return false
  if (address.monaco === true) return true
  if (String(address.postcode ?? '') === MONACO_POSTAL_CODE) return true

  return NON_ACCENTUE(address.city) === 'monaco'
}

/**
 * La saisie en cours désigne-t-elle Monaco ?
 *
 * La BAN ne connaît aucune adresse monégasque : interrogée sur « Monte-Carlo,
 * Monaco », elle répond par des avenues Monte-Carlo à Cannes ou à Toulon. Une
 * saisie monégasque ne peut donc pas être reconnue à la réponse — seulement à
 * ce qui a été tapé.
 *
 * Deux déclencheurs, l'un et l'autre resserrés pour ne jamais requalifier une
 * adresse française :
 *
 * - le code postal 98000, qui n'appartient qu'à la Principauté ;
 * - « Monaco » en fin de saisie, à la place où s'écrit une commune. « Impasse
 *   de Monaco 31100 Toulouse » ou « rue de Monaco Nice » se terminent par leur
 *   ville française et ne déclenchent rien.
 *
 * La présence d'un autre code postal à cinq chiffres suffit par ailleurs à
 * écarter la piste : la saisie désigne alors une commune française.
 *
 * Reste le cas de « impasse de Monaco » tapé seul, sans ville — la Principauté
 * sera proposée à côté de l'adresse toulousaine. C'est une proposition de plus
 * dans la liste, pas une requalification : le choix reste explicite (voir
 * `monacoSuggestion`).
 */
export function looksLikeMonacoQuery(query) {
  const normalise = NON_ACCENTUE(query).trim()
  if (!normalise) return false

  const codesPostaux = normalise.match(/\b\d{5}\b/g) ?? []
  if (codesPostaux.includes(MONACO_POSTAL_CODE)) return true
  if (codesPostaux.length > 0) return false

  // Ponctuation et espaces de fin retirés : « Monte-Carlo, Monaco » compte.
  return /(^|[\s,])monaco[\s,.]*$/.test(normalise)
}

/**
 * Proposition « Principauté de Monaco », à glisser dans la liste de
 * suggestions quand la saisie la désigne.
 *
 * Une proposition, et non une détection appliquée d'office : les adresses
 * françaises retournées par la BAN restent affichées à côté, et c'est
 * l'utilisateur qui tranche. Aucune adresse française ne peut ainsi basculer
 * dans le parcours monégasque sans avoir été explicitement écartée.
 *
 * Les coordonnées sont celles du centre de la Principauté : cette proposition
 * générique ne désigne aucune rue, et la carte qu'elle ouvre montrera le
 * quartier du Rocher plutôt que celui du bien. C'est le repli du repli — les
 * propositions de Nominatim, qui portent chacune leur propre point, passent
 * avant (voir `src/lib/adresseMonaco.js`).
 */
export function monacoSuggestion() {
  return {
    id: 'monaco-98000',
    label: `Principauté de Monaco (${MONACO_POSTAL_CODE})`,
    postcode: MONACO_POSTAL_CODE,
    city: 'Monaco',
    lat: MONACO_CENTER.lat,
    lon: MONACO_CENTER.lon,
    monaco: true,
  }
}

/**
 * La saisie évoque-t-elle la Principauté, sans pour autant la désigner ?
 *
 * Bien plus large que `looksLikeMonacoQuery` : « Monaco » ou « Monte-Carlo »
 * n'importe où dans le texte suffit. Cette largeur n'a qu'un usage — décider
 * s'il vaut la peine d'interroger le géocodeur monégasque en plus de la BAN
 * (voir `src/lib/adresse.js`). Les propositions qui en reviennent sont alors
 * placées *après* les adresses françaises : « Impasse de Monaco 31100
 * Toulouse » garde ses résultats en tête, et rien n'est requalifié.
 */
export function mentionsMonaco(query) {
  return /\bmonaco\b|\bmonte[-\s]?carlo\b/.test(NON_ACCENTUE(query))
}
