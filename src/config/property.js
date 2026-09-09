/**
 * Adresse du bien — fixée en dur pour cette étape.
 *
 * Il n'y a volontairement ni recherche ni autocomplétion : le parcours démarre
 * directement sur la vue satellite, centrée sur ce point. Pour changer de bien,
 * on modifie ces valeurs ici.
 *
 * `lat` / `lon` sont les coordonnées WGS 84 utilisées pour centrer la carte et
 * charger les emprises bâties alentour.
 */
export const PROPERTY_ADDRESS = {
  label: '41A rue Principale, 57980 Diebling',
  lat: 49.108307,
  lon: 6.942519,
}
