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
 * ── Ce que valent les défauts ci-dessous ──────────────────────────────────
 *
 * Ils étaient vides, et pour une bonne raison : inventer une adresse ou un
 * numéro plausibles ferait imprimer un faux. Ils sont désormais renseignés,
 * mais la règle n'a pas changé — elle est seulement satisfaite autrement. Ce
 * sont les coordonnées **publiées** de BARNES Marseille, relevées sur
 * `barnes-provence-littoral.com` et au registre du commerce : rien ici n'est
 * supposé, tout est vérifiable à la source.
 *
 * C'est le réglage de la version de démonstration, qui présente l'outil aux
 * couleurs d'une agence réelle. En production, chaque agence du réseau
 * disposera de son compte et renseignera ses propres informations, qui
 * alimenteront cette page à chaque rapport — les variables `VITE_AGENCE_*`
 * ci-dessous en sont déjà la préfiguration, et priment sur ces valeurs sans
 * qu'une ligne de code change.
 *
 * Deux champs restent volontairement vides, et ce n'est pas un oubli : le
 * conseiller et ses coordonnées directes. Ils ne décrivent pas l'agence mais la
 * personne qui signe l'avis de valeur — elle change d'un rapport à l'autre au
 * sein d'une même agence, et faire figurer par défaut le nom d'un négociateur
 * sous une estimation qu'il n'a pas établie serait précisément le genre de faux
 * que ce module s'interdit. La page les affiche « Non renseigné », et ils se
 * saisissent à l'écran, rapport par rapport.
 */
export const AGENCE = {
  enseigne: lire('VITE_AGENCE_ENSEIGNE') ?? 'Barnes',
  nom: lire('VITE_AGENCE_NOM') ?? 'BARNES Marseille',
  baseline:
    lire('VITE_AGENCE_BASELINE') ??
    'Immobilier de prestige à Marseille, Cassis et sur la Côte Bleue — réseau BARNES Provence Littoral.',
  adresse: lire('VITE_AGENCE_ADRESSE') ?? '550, rue Paradis',
  codePostal: lire('VITE_AGENCE_CODE_POSTAL') ?? '13008',
  ville: lire('VITE_AGENCE_VILLE') ?? 'Marseille',
  // Le second bureau de l'agence, ouvert à la Pointe Rouge. Distinct de
  // l'adresse principale plutôt que fondu dedans : un vendeur du sud de la
  // ville n'a aucune raison de traverser Marseille pour un rendez-vous.
  adresseSecondaire:
    lire('VITE_AGENCE_ADRESSE_SECONDAIRE') ?? '49, avenue de Montredon — 13008 Marseille',
  telephone: lire('VITE_AGENCE_TELEPHONE') ?? '+33 (0)4 91 60 50 50',
  email: lire('VITE_AGENCE_EMAIL') ?? 'provence-littoral@barnes-international.com',
  siteWeb: lire('VITE_AGENCE_SITE') ?? 'barnes-provence-littoral.com',
  // Mentions légales du pied de page : forme sociale, RCS, siège. Ce sont elles
  // qui font d'un avis de valeur un document d'agence plutôt qu'une note.
  //
  // Le numéro de carte professionnelle (CPI) et le garant financier n'y
  // figurent pas : ils ne sont publiés ni sur le site de l'agence ni au
  // registre, et une carte professionnelle inventée sur un document remis à un
  // vendeur serait une infraction, pas une approximation. La phrase se termine
  // donc sur ce qui est vérifiable, et l'agence complète le reste à l'écran.
  mentionsLegales:
    lire('VITE_AGENCE_MENTIONS') ??
    'Marseille Luxury Realty — société par actions simplifiée, RCS Marseille 844 519 165, ' +
      '550 rue Paradis, 13008 Marseille. Membre du réseau BARNES International Realty.',
  // Le conseiller qui signe. Distinct de l'agence : le même déploiement peut
  // servir à plusieurs négociateurs, et celui-ci se corrige alors à l'écran,
  // rapport par rapport.
  conseiller: lire('VITE_AGENCE_CONSEILLER'),
  conseillerTelephone: lire('VITE_AGENCE_CONSEILLER_TELEPHONE'),
  conseillerEmail: lire('VITE_AGENCE_CONSEILLER_EMAIL'),
}
