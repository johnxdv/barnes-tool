// Adresses monégasques — géocodage de repli, rue par rue.
//
// La BAN ne couvre pas la Principauté (voir `src/lib/monaco.js`) : sans cette
// source, le champ d'adresse ne pouvait proposer que « Principauté de Monaco »
// d'un bloc. Nominatim (OpenStreetMap), lui, en connaît les voies.
//
// L'appel passe par `api/monaco-adresses.js` et non par le navigateur : la
// politique d'usage de Nominatim réclame un `User-Agent` identifiant
// l'application, en-tête qu'un navigateur refuse d'écrire, et un rythme
// plafonné qui se tient mieux depuis le serveur (cache et file d'attente).

const ENDPOINT = '/api/monaco-adresses'

/**
 * Filet côté client. Le serveur s'impose déjà un budget plus court ; ce délai
 * ne couvre que le cas où il ne répondrait pas du tout. Court à dessein : ces
 * propositions s'ajoutent à une liste déjà affichée.
 */
const TIMEOUT_MS = 6000

/**
 * Propositions monégasques pour une saisie, au format des suggestions de la
 * BAN (`{ id, label, postcode, city, lat, lon, monaco }`), ou `[]`.
 *
 * Ne rejette jamais, hors annulation explicite : une panne du géocodage ne
 * doit pas priver l'utilisateur des propositions françaises, ni de la
 * proposition générique dont l'appelant dispose en repli.
 */
export async function searchMonacoAddresses(query, { signal } = {}) {
  const q = String(query ?? '').trim()
  if (q.length < 3) return []

  const timeout = AbortSignal.timeout(TIMEOUT_MS)

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })

    if (!response.ok) return []

    const data = await response.json().catch(() => null)
    const suggestions = Array.isArray(data?.suggestions) ? data.suggestions : []

    return suggestions.filter((suggestion) => Boolean(suggestion?.label))
  } catch (error) {
    if (signal?.aborted) throw error
    return []
  }
}
