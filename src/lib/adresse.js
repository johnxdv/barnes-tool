// Client de l'API Adresse (Base Adresse Nationale), service public français :
// gratuite, sans clé ni configuration. https://adresse.data.gouv.fr/api-doc/adresse
import { searchMonacoAddresses } from './adresseMonaco.js'
import {
  isMonacoAddress,
  looksLikeMonacoQuery,
  mentionsMonaco,
  monacoSuggestion,
} from './monaco.js'

const ENDPOINT = 'https://api-adresse.data.gouv.fr/search/'

/** Seuil de déclenchement : en deçà, l'API renvoie du bruit. */
export const MIN_QUERY_LENGTH = 3

/** Délai d'anti-rebond entre la frappe et l'appel réseau (ms). */
export const SEARCH_DEBOUNCE_MS = 300

/**
 * Recherche d'adresses. Renvoie au plus `limit` propositions normalisées
 * (`{ id, label, postcode, city, lat, lon, monaco }`). Les coordonnées viennent de la géométrie
 * GeoJSON déjà présente dans la réponse : l'étape carte s'en sert pour se
 * centrer, sans jamais avoir à re-géocoder.
 *
 * `signal` permet d'annuler la requête précédente lorsque
 * l'utilisateur continue de taper — sans quoi une réponse lente pourrait
 * écraser une réponse plus récente.
 *
 * Les adresses de la Principauté de Monaco viennent d'ailleurs : la BAN n'en
 * connaît aucune et répondrait, au mieux, par des voies françaises homonymes.
 * Quand la saisie désigne la Principauté (voir `looksLikeMonacoQuery`), un
 * second géocodeur prend le relais pour elle seule — Nominatim, via
 * `src/lib/adresseMonaco.js` — et ses rues s'ajoutent en tête de liste ; à
 * défaut de réponse, la proposition générique « Principauté de Monaco » tient
 * ce rôle comme auparavant. Ces adresses restent des propositions parmi les
 * autres : c'est le choix de l'utilisateur, jamais une requalification, qui
 * fait basculer le parcours (voir `src/lib/monaco.js`).
 *
 * Lève une erreur en cas de panne réseau ou de réponse non 2xx ; l'annulation
 * remonte une `AbortError`, à ignorer côté appelant.
 */
export async function searchAddresses(query, { limit = 5, signal } = {}) {
  const response = await fetch(`${ENDPOINT}?q=${encodeURIComponent(query)}&limit=${limit}`, {
    signal,
  })

  if (!response.ok) {
    throw new Error(`API Adresse — réponse ${response.status}`)
  }

  const data = await response.json()

  const suggestions = (data?.features ?? [])
    .map((feature) => {
      // GeoJSON : [longitude, latitude] — l'ordre inverse de celui attendu par
      // les cartes, d'où la déstructuration explicite.
      const [lon, lat] = feature?.geometry?.coordinates ?? []

      const suggestion = {
        id: feature?.properties?.id,
        label: feature?.properties?.label,
        // Commune et code postal descendent jusqu'ici pour une seule raison :
        // reconnaître Monaco si la BAN venait un jour à en servir les adresses.
        postcode: feature?.properties?.postcode ?? null,
        city: feature?.properties?.city ?? null,
        lat: Number.isFinite(lat) ? lat : null,
        lon: Number.isFinite(lon) ? lon : null,
      }

      return { ...suggestion, monaco: isMonacoAddress(suggestion) }
    })
    .filter((suggestion) => Boolean(suggestion.label))

  // Aucune adresse française ne peut venir de la BAN pour la Principauté : si
  // l'une d'elles se dit monégasque, la question est déjà tranchée.
  if (suggestions.some((suggestion) => suggestion.monaco)) return suggestions

  const designeMonaco = looksLikeMonacoQuery(query)

  // Deux niveaux de déclenchement, pour deux traitements différents :
  //
  // - la saisie *désigne* la Principauté : ses adresses passent en tête ;
  // - elle ne fait que l'évoquer (« Monaco » ailleurs qu'en fin de saisie), et
  //   la BAN n'a rien trouvé : on complète, mais derrière — les adresses
  //   françaises restent prioritaires, elles ne sont jamais reléguées.
  const complete = !designeMonaco && suggestions.length === 0 && mentionsMonaco(query)
  if (!designeMonaco && !complete) return suggestions

  // Le géocodage monégasque ne rejette pas (hors annulation) : une panne rend
  // une liste vide, et la proposition générique reprend son rôle d'antan.
  const monegasques = await searchMonacoAddresses(query, { signal })
  const enTete = monegasques.length > 0 ? monegasques.slice(0, limit) : [monacoSuggestion()]

  return designeMonaco ? [...enTete, ...suggestions] : [...suggestions, ...enTete]
}
