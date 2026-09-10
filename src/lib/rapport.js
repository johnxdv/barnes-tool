// Appel de l'assemblage du rapport. Comme pour l'estimation, tout le calcul
// vit côté serveur (`api/rapport.js`) : le front n'envoie que ce qu'il sait du
// bien et reçoit des blocs de chiffres déjà arrêtés. Aucune source de données
// n'est connue ici, et aucune ne le sera — c'est ce qui garantit que deux
// agents ouvrant le même rapport y lisent les mêmes nombres.

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
