/**
 * Adresse du bien — fixée en dur pour cette étape.
 *
 * Il n'y a volontairement ni recherche ni autocomplétion : le parcours démarre
 * directement sur la vue satellite, centrée sur ce point. Pour changer de bien,
 * on modifie ces valeurs ici.
 *
 * `lat` / `lon` sont les coordonnées WGS 84 utilisées pour centrer la carte et
 * charger les emprises bâties alentour. Elles proviennent de l'API Adresse
 * (BAN, api-adresse.data.gouv.fr). La BAN ne référence pas le numéro 14 de
 * cette voie : le géocodage retombe au niveau de la rue (avenue Charles Gounod
 * à Cassis), ce qui reste suffisant pour centrer la carte.
 */
export const PROPERTY_ADDRESS = {
  label: '14 avenue Charles Gounod, 13260 Cassis',
  lat: 43.218091,
  lon: 5.542656,
}
