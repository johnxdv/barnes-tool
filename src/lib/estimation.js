// Appel du moteur d'estimation. Le calcul lui-même vit côté serveur
// (`api/estimation.js`) : le front n'envoie que ce qu'il a appris en repérant
// le bâtiment sur la carte, et ne reçoit qu'un montant. Ni les sources de
// données, ni la méthode, ni les éventuels replis ne descendent jusqu'ici.

const ENDPOINT = '/api/estimation'

/**
 * Filet de sécurité côté client. Le serveur s'impose déjà un budget plus
 * court que l'animation de chargement ; ce délai ne couvre que le cas où il ne
 * répondrait pas du tout.
 */
const TIMEOUT_MS = 15000

/**
 * Demande l'estimation d'une sélection confirmée sur la carte.
 *
 * Ne rejette jamais : le parcours ne doit pas s'interrompre parce qu'une
 * requête a échoué. En cas d'échec complet, la promesse est tenue avec `null`
 * — l'écran résultat sait déjà l'afficher sans se casser.
 *
 * Silencieux pour l'utilisateur, mais jamais pour la console : chaque sortie
 * en `null` laisse une trace. Un `null` sans explication a déjà coûté un
 * diagnostic complet — l'écran affichait « — € » et rien, nulle part, ne
 * disait que la fonction serverless ne démarrait plus.
 *
 * Le montant est volontairement tiré une seule fois, au lancement de
 * l'analyse : le redemander à l'affichage du résultat le ferait varier d'un
 * rendu à l'autre.
 *
 * À ne pas confondre avec l'aperçu de la fenêtre de surface
 * (`src/lib/prixSecteur.js`) : celui-ci n'est qu'un ordre de grandeur calculé
 * dans le navigateur, que le montant obtenu ici vient remplacer.
 */
export async function requestEstimation(selection) {
  if (!selection) return null

  const monaco = selection.monaco === true

  // Les coordonnées commandent tout le calcul français — commune, département,
  // millésimes DVF. Sans elles, il n'y a rien à demander. Monaco fait
  // exception : son calcul ne dépend d'aucun découpage administratif, seulement
  // du type et de la surface déclarés.
  if (!monaco && (!Number.isFinite(selection.lat) || !Number.isFinite(selection.lon))) {
    return null
  }

  const { properties } = selection

  const payload = {
    lat: selection.lat,
    lon: selection.lon,
    // Bascule le moteur sur son barème monégasque : prix au m² de référence ×
    // surface déclarée, sans cadastre ni comparables (voir `src/lib/monaco.js`).
    monaco,
    kind: selection.kind ?? null,
    type: selection.type ?? null,
    areaM2: selection.areaM2 ?? null,
    // Surface déclarée au curseur de la fenêtre de surface — la seule donnée
    // que l'utilisateur ait saisie de tout le parcours. Le serveur la fait
    // passer avant toute surface reconstituée depuis les bases. Nulle pour un
    // terrain, qui ne passe pas par cette fenêtre : sa contenance cadastrale
    // voyage dans `parcelle`.
    surfaceM2: selection.surfaceM2 ?? null,
    // Parcelle cadastrale et fiche BDNB ont déjà été obtenues pour déterminer
    // le type du bien, pendant que la fenêtre de confirmation était à l'écran.
    // Les retransmettre évite au serveur de refaire la même chaîne d'appels —
    // deux à trois secondes qui comptent dans le budget de l'analyse.
    parcelle: selection.parcelle ?? null,
    fiche: selection.fiche ?? null,
    // Seuls les attributs BD TOPO® dont le calcul se sert : inutile de faire
    // voyager la fiche complète.
    properties: properties
      ? {
          usage_1: properties.usage_1 ?? null,
          nombre_de_logements: properties.nombre_de_logements ?? null,
          nombre_d_etages: properties.nombre_d_etages ?? null,
          // Repli pour compter les niveaux quand `nombre_d_etages` manque : le
          // serveur saurait la retrouver seul, mais c'est une requête de plus
          // sur le budget de l'écran de chargement, et la carte l'a déjà.
          hauteur: properties.hauteur ?? null,
        }
      : null,
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      console.error(`[estimation] ${ENDPOINT} a répondu ${response.status}`)
      return null
    }

    const data = await response.json().catch(() => null)
    const price = Number(data?.price)

    if (!Number.isFinite(price) || price <= 0) {
      console.error('[estimation] Réponse sans montant exploitable —', data)
      return null
    }

    return price
  } catch (error) {
    console.error('[estimation] Appel au moteur en échec —', error)
    return null
  }
}
