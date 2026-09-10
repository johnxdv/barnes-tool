// Appel de l'assemblage du rapport. Comme pour l'estimation, le calcul vit
// côté serveur (`api/rapport.js`) : le front n'envoie que ce qu'il sait du bien
// et reçoit des blocs de chiffres déjà arrêtés — DVF, Insee, BCE. C'est ce qui
// garantit que deux agents ouvrant le même rapport y lisent les mêmes nombres.
//
// Une seule exception, et elle est délibérée : les commodités du quartier, que
// le navigateur va chercher lui-même chez Overpass (voir `./poi.js`). Le
// service plafonne par adresse IP, et les quelques IP de sortie de l'hébergeur
// étaient assez sollicitées pour être servies au ralenti — la page sortait
// vide, à remplir à la main. Ce qui en revient n'est de toute façon pas un
// calcul mais un relevé : des écoles, des commerces et des arrêts, à moins de
// 500 m. Deux agents en obtiennent la même liste, à ceci près qu'ils ne
// l'obtiennent pas du même serveur.
//
// Les deux moitiés partent ensemble et se rejoignent ici : le serveur ne
// travaille pas pendant qu'Overpass répond, et l'assemblage ne dure pas plus
// longtemps qu'avant.

import { fetchPointsInteret } from './poi.js'

const ENDPOINT = '/api/rapport'

/**
 * Filet côté client. Le serveur s'impose déjà un budget plus court (12 s) et
 * chacune de ses sources le sien ; ce délai ne couvre que le cas où il ne
 * répondrait pas du tout.
 */
const TIMEOUT_MS = 20000

/**
 * Rapport vide — même forme qu'un rapport complet, tous les blocs à `null`.
 *
 * Rendu tel quel quand l'assemblage échoue, et c'est délibéré : le rapport
 * s'ouvre malgré tout, avec ses pages de secteur vides et tout ce qui vient du
 * parcours lui-même — adresse, caractéristiques, prix — intact. L'agent a un
 * client en face de lui ; il doit pouvoir présenter le bien, quitte à compléter
 * les pages de marché à la main.
 */
export const RAPPORT_VIDE = {
  genereLe: null,
  zone: null,
  poi: null,
  quartier: null,
  marche: null,
  budgets: null,
  historique: null,
  comparables: [],
  credit: null,
  profilAcquereur: null,
  hypothesesCredit: null,
  points: { forts: [], reserves: [] },
}

/**
 * Demande l'assemblage du rapport pour un bien estimé.
 *
 * Ne rejette jamais : le parcours ne doit pas s'interrompre au moment même où
 * il aboutit. Chaque sortie sans données laisse en revanche une trace en
 * console — un rapport aux pages vides sans explication a exactement le même
 * aspect qu'un secteur réellement dépourvu de ventes.
 */
export async function requestRapport({ selection, address, price, characteristics }) {
  const monaco = selection?.monaco === true || address?.monaco === true

  const payload = {
    lat: selection?.lat ?? address?.lat ?? null,
    lon: selection?.lon ?? address?.lon ?? null,
    monaco,
    type: characteristics?.typeBien ?? selection?.type ?? null,
    // Déjà obtenu au repérage du bâtiment le plus souvent : le serveur
    // s'épargne alors l'appel au découpage administratif.
    codeInsee: selection?.parcelle?.codeInsee ?? null,
    commune: selection?.parcelle?.commune ?? address?.city ?? null,
    price: price ?? null,
    // Le formulaire au complet — c'est de lui que sortent les points forts et
    // les points de réserve suggérés.
    characteristics: characteristics ?? null,
  }

  // Les deux moitiés en parallèle. `fetchPointsInteret` ne lève pas hors
  // annulation — l'échec des deux instances Overpass rend un relevé
  // `disponible: false`, que la page des commodités affiche en attente de
  // saisie. Elle est tout de même protégée : elle ne doit en aucun cas emporter
  // le reste du rapport.
  const [blocs, poi] = await Promise.all([
    fetchBlocsServeur(payload),
    fetchPointsInteret(payload.lat, payload.lon).catch((error) => {
      console.error('[rapport] Relevé des commodités en échec —', error)
      return null
    }),
  ])

  // Le relevé du navigateur passe après l'étalement des blocs serveur, et donc
  // devant : `api/rapport.js` ne renvoie plus de champ `poi`, mais un rapport
  // assemblé par une version antérieure de la fonction en porterait un, et
  // c'est celui d'ici qui doit gagner.
  return { ...blocs, poi }
}

/** Les blocs assemblés par la fonction serverless. Ne rejette jamais. */
async function fetchBlocsServeur(payload) {
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      console.error(`[rapport] ${ENDPOINT} a répondu ${response.status}`)
      return RAPPORT_VIDE
    }

    const data = await response.json().catch(() => null)
    if (!data?.rapport) {
      console.error('[rapport] Réponse sans rapport exploitable —', data)
      return RAPPORT_VIDE
    }

    return { ...RAPPORT_VIDE, ...data.rapport }
  } catch (error) {
    console.error('[rapport] Assemblage en échec —', error)
    return RAPPORT_VIDE
  }
}
