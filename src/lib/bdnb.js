// Client de la Base de Données Nationale des Bâtiments (BDNB, CSTB) — API
// ouverte, sans clé. https://bdnb.io
//
// L'API est un PostgREST : les filtres s'écrivent `colonne=operateur.valeur`.
const ENDPOINT = 'https://api.bdnb.io/v1/bdnb/donnees/batiment_groupe_complet'

/**
 * Champs demandés. `usage_principal_bdnb_open` porte la vocation du bâtiment,
 * `nb_log` distingue une maison d'un collectif, `s_geom_groupe` (emprise au
 * sol, m²) sert à retrouver le bon bâtiment quand la parcelle en porte
 * plusieurs, et l'année de construction complète la fiche remise au moteur
 * d'estimation.
 */
const FIELDS = [
  'batiment_groupe_id',
  'usage_principal_bdnb_open',
  'nb_log',
  'nb_niveau',
  's_geom_groupe',
  'annee_construction',
]

/**
 * Fiches BDNB des bâtiments d'une parcelle cadastrale.
 *
 * Le filtre porte sur la parcelle **et** la commune : sans le second, la
 * requête balaie la table nationale et expire (504 constaté). La géométrie
 * n'est pas demandée — la BDNB la publie en Lambert-93, inexploitable ici sans
 * reprojection, d'où le rapprochement par surface plutôt que par contenance
 * géométrique.
 *
 * L'API plafonne ses réponses à 10 lignes ; une parcelle dépasse rarement ce
 * nombre de bâtiments, et au-delà le rapprochement par surface reste opérant
 * sur les dix premiers.
 */
export async function fetchBuildingsOnParcel({ idu, codeInsee }, { signal } = {}) {
  if (!idu || !codeInsee) return []

  const params = new URLSearchParams({
    code_commune_insee: `eq.${codeInsee}`,
    // `cs` = « contains » : `l_parcelle_id` est un tableau d'identifiants.
    l_parcelle_id: `cs.{${idu}}`,
    select: FIELDS.join(','),
  })

  const response = await fetch(`${ENDPOINT}?${params}`, { signal })

  if (!response.ok) {
    throw new Error(`BDNB — réponse ${response.status}`)
  }

  const data = await response.json().catch(() => null)

  return Array.isArray(data) ? data : []
}
