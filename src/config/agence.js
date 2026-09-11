// Coordonnées de l'agence — la page « Notre agence » du rapport.
//
// Ces informations ne se calculent pas et ne se devinent pas : elles sont
// propres à l'agence qui édite l'avis de valeur, et elles changent quand
// l'agence déménage, change de numéro ou passe la main. Elles n'ont donc rien à
// faire au milieu d'un composant — d'où ce module, qui est le seul endroit à
// modifier, et les variables d'environnement qui permettent de le faire sans
// toucher au code du tout.
//
// Trois niveaux, du plus fort au plus faible :
//
//  1. **La correction en place.** Chaque champ de la page est modifiable comme
//     le reste du rapport (voir `Edition.jsx`) : sur un rapport isolé — une
//     autre agence du réseau, un mandat co-porté — l'agent corrige à l'écran,
//     sans rien configurer.
//  2. **Les variables d'environnement** `VITE_AGENCE_*`, lues à la construction
//     du bundle. C'est le réglage durable, celui d'un déploiement : voir
//     `.env.example`.
//  3. **Les valeurs ci-dessous**, quand rien n'a été posé.
//
// Un champ laissé vide n'est pas une erreur : la page l'affiche « Non
// renseigné », en clair, plutôt que d'inventer. Un rapport qui annonce un
// numéro de téléphone faux est pire qu'un rapport qui n'en annonce aucun.

/**
 * Valeur d'environnement non vide, ou `null`.
 *
 * Une variable déclarée mais laissée vide (`VITE_AGENCE_TELEPHONE=`) doit valoir
 * « non renseigné » et non la chaîne vide, qui s'afficherait comme une réponse.
 */
function lire(cle) {
  const valeur = import.meta.env?.[cle]
  return typeof valeur === 'string' && valeur.trim() !== '' ? valeur.trim() : null
}

/**
 * L'agence qui édite le rapport.
 *
 * Les valeurs par défaut se limitent volontairement à ce qui ne peut pas être
 * faux — l'enseigne et la nature du document. Adresse, téléphone et courriel
 * restent vides jusqu'à ce qu'on les renseigne : ce sont des informations
 * vérifiables, et en inventer de plausibles ferait imprimer un faux.
 */
export const AGENCE = {
  enseigne: lire('VITE_AGENCE_ENSEIGNE') ?? 'Barnes',
  nom: lire('VITE_AGENCE_NOM') ?? 'Barnes',
  baseline: lire('VITE_AGENCE_BASELINE') ?? 'Avis de valeur immobilière',
  adresse: lire('VITE_AGENCE_ADRESSE'),
  codePostal: lire('VITE_AGENCE_CODE_POSTAL'),
  ville: lire('VITE_AGENCE_VILLE'),
  telephone: lire('VITE_AGENCE_TELEPHONE'),
  email: lire('VITE_AGENCE_EMAIL'),
  siteWeb: lire('VITE_AGENCE_SITE'),
  // Mentions légales du pied de page : numéro de carte professionnelle, RCS,
  // garant financier. Ce sont elles qui font d'un avis de valeur un document
  // d'agence plutôt qu'une note.
  mentionsLegales: lire('VITE_AGENCE_MENTIONS'),
  // Le conseiller qui signe. Distinct de l'agence : le même déploiement peut
  // servir à plusieurs négociateurs, et celui-ci se corrige alors à l'écran,
  // rapport par rapport.
  conseiller: lire('VITE_AGENCE_CONSEILLER'),
  conseillerTelephone: lire('VITE_AGENCE_CONSEILLER_TELEPHONE'),
  conseillerEmail: lire('VITE_AGENCE_CONSEILLER_EMAIL'),
}
