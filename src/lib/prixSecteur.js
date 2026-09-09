// Aperçu du marché — prix indicatif au m² du secteur, pour la fenêtre de
// saisie de la surface. Le calcul vit côté serveur (`api/prix-m2.js`), comme
// celui de l'estimation : le front n'envoie que le point repéré sur la carte
// et ne reçoit qu'un prix au m².
//
// Ce prix n'est demandé qu'une fois, à l'ouverture de la fenêtre. Tout le
// reste — le montant qui suit le curseur — se calcule ensuite dans le
// navigateur par une simple multiplication : déplacer le curseur ne doit
// déclencher aucune requête.

const ENDPOINT = '/api/prix-m2'

/**
 * Filet côté client. Le serveur s'impose déjà un budget plus court ; ce délai
 * ne couvre que le cas où il ne répondrait pas du tout.
 */
const TIMEOUT_MS = 6000

/**
 * Prix indicatif au m² autour d'une sélection, ou `null`.
 *
 * Ne rejette jamais, hors annulation explicite : la fenêtre reste utilisable
 * sans aperçu — l'estimation réelle, elle, ne dépend pas de cet appel.
 */
export async function fetchPrixM2(selection, { signal } = {}) {
  if (!selection || !Number.isFinite(selection.lat) || !Number.isFinite(selection.lon)) {
    return null
  }

  const timeout = AbortSignal.timeout(TIMEOUT_MS)

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: selection.lat,
        lon: selection.lon,
        type: selection.type ?? null,
        // Déjà obtenu en repérant le bâtiment, le plus souvent : le serveur
        // s'épargne alors l'appel au découpage administratif.
        codeInsee: selection.parcelle?.codeInsee ?? null,
      }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })

    if (!response.ok) return null

    const data = await response.json().catch(() => null)
    const pricePerM2 = Number(data?.pricePerM2)

    return Number.isFinite(pricePerM2) && pricePerM2 > 0 ? pricePerM2 : null
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}
