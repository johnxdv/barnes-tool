// Modèle d'affichage du rapport — la couche qui sépare les données de leur
// mise en page.
//
// Tout ce qui s'affiche dans le rapport passe par ici et en ressort sous une
// seule et même forme : `{ id, label, valeur }`, où `valeur` est **une chaîne
// déjà formatée** ou `null`. Deux raisons, et la seconde est la vraie.
//
//  1. Les composants n'ont plus à savoir qu'un prix s'écrit avec une espace
//     insécable et qu'une évolution porte son signe. Ils alignent des couples.
//
//  2. Surtout : chaque champ du rapport est modifiable à la main, et une
//     modification est du texte. Si le modèle rendait des nombres, il faudrait
//     décider à chaque champ si l'agent édite « 620000 » ou « 620 000 € », puis
//     reformater une saisie libre — ou la refuser. En formatant ici, une fois,
//     la valeur affichée et la valeur modifiée sont le même objet : l'agent
//     réécrit ce qu'il voit, et ce qu'il écrit est ce qui s'imprime.
//
// `id` est la clé de cette modification, et sa stabilité est un contrat : elle
// ne doit dépendre ni de l'ordre d'affichage ni du contenu, faute de quoi une
// correction se retrouverait sur la ligne d'à côté au prochain assemblage.

import {
  formatDateFr,
  formatDistance,
  formatEuros,
  formatMois,
  formatNumber,
  formatPct,
  formatSurface,
  priceRange,
} from './format.js'
import { orthoImageUrl } from './ign.js'
import { MONACO_RANGE_PCT } from './monaco.js'

/** Champ affiché : couple libellé / valeur, et la clé qui permet de le corriger. */
const champ = (id, label, valeur) => ({ id, label, valeur: valeur ?? null })

const TYPE_LABELS = { maison: 'Maison', appartement: 'Appartement', autre: 'Autre' }

const STANDING_LABELS = {
  standard: 'Standard',
  'bon-standing': 'Bon standing',
  'haut-standing': 'Haut standing',
}

const ETAT_LABELS = {
  'a-renover': 'À rénover',
  'bon-etat': 'Bon état',
  renove: 'Rénové',
  neuf: 'Neuf',
}

/** Étage écrit comme on le dit — le zéro d'un appartement est un rez-de-chaussée. */
function etageLabel(value) {
  if (value == null) return null
  if (value === 0) return 'Rez-de-chaussée'
  return value === 1 ? '1er étage' : `${value}e étage`
}

/** Nombre entier, ou `null` — jamais « 0 » là où rien n'a été déclaré. */
const entier = (valeur) => (valeur == null ? null : formatNumber(valeur))

/** Surface suffixée, ou `null` — jamais « 0 m² » pour un champ non renseigné. */
const formatSurfaceOuNull = (valeur) => (valeur == null ? null : formatSurface(valeur))

/** Prix au m², suffixé. */
const parM2 = (valeur) => (valeur == null ? null : `${formatNumber(Math.round(valeur))} €/m²`)

/**
 * Caractéristiques du bien, dans l'ordre du formulaire qui les a recueillies.
 *
 * Les champs laissés de côté ne sont pas écartés : ils descendent avec une
 * valeur `null`, que la page affiche « Non renseigné ». C'est une information —
 * elle dit à l'agent ce qu'il lui reste à compléter avant d'imprimer, là qu'une
 * ligne absente le lui cacherait.
 */
function caracteristiques(c = {}) {
  const bien = [
    champ('carac.typeBien', 'Type de bien', TYPE_LABELS[c.typeBien] ?? null),
    champ('carac.etage', 'Étage', etageLabel(c.etage)),
    champ('carac.surfaceHabitable', 'Surface habitable', formatSurfaceOuNull(c.surfaceHabitable)),
    champ('carac.surfaceTerrain', 'Surface du terrain', formatSurfaceOuNull(c.surfaceTerrain)),
    champ('carac.surfaceTerrasse', 'Surface de terrasse', formatSurfaceOuNull(c.surfaceTerrasse)),
    champ('carac.nombrePieces', 'Nombre de pièces', entier(c.nombrePieces)),
    champ('carac.nombreChambres', 'Chambres', entier(c.nombreChambres)),
    champ('carac.nombreSallesBain', 'Salles de bain', entier(c.nombreSallesBain)),
    champ('carac.nombreSallesEau', 'Salles d’eau', entier(c.nombreSallesEau)),
    champ('carac.standing', 'Standing', STANDING_LABELS[c.standing] ?? null),
    champ('carac.classeEnergie', 'Classe énergie', c.classeEnergie ?? null),
  ]

  const bati = [
    champ('carac.anneeConstruction', 'Année de construction', entier(c.anneeConstruction)),
    champ('carac.nombreNiveaux', 'Nombre de niveaux', entier(c.nombreNiveaux)),
    champ('carac.etatGeneral', 'État général', ETAT_LABELS[c.etatGeneral] ?? null),
    // Le booléen est le seul champ dont le `false` mérite d'être écrit : « Non »
    // est une réponse, et un bien sans piscine dans un secteur qui en compte
    // beaucoup a intérêt à le dire plutôt qu'à laisser la question ouverte.
    champ('carac.piscine', 'Piscine', c.piscine == null ? null : c.piscine ? 'Oui' : 'Non'),
    champ('carac.stationnementsInterieurs', 'Stationnements couverts', entier(c.stationnementsInterieurs)),
    champ('carac.stationnementsExterieurs', 'Stationnements extérieurs', entier(c.stationnementsExterieurs)),
  ]

  // L'étage n'a de sens qu'en appartement : le formulaire ne le pose pas
  // ailleurs, la page n'a donc pas à en montrer la ligne vide.
  const utiles = (liste) =>
    liste.filter((f) => f.id !== 'carac.etage' || c.typeBien === 'appartement')

  return { bien: utiles(bien), bati }
}


/** Points forts et points de réserve, suggérés par le moteur puis modifiables. */
function points(suggestions) {
  const liste = (camp, items) =>
    (items ?? []).map((item, index) => ({
      // L'identifiant du moteur d'abord : il désigne la règle qui a produit la
      // ligne et ne bouge pas d'un assemblage à l'autre. Le rang ne sert que de
      // repli, pour une ligne ajoutée à la main.
      cle: `points.${camp}.${item.id ?? index}`,
      titre: item.titre ?? '',
      detail: item.detail ?? '',
    }))

  return {
    forts: liste('forts', suggestions?.forts),
    reserves: liste('reserves', suggestions?.reserves),
  }
}

/** Points d'intérêt, par catégorie, avec le détail de chacun. */
function commodites(poi) {
  if (!poi) return null

  return {
    rayon: formatDistance(poi.rayonM),
    attribution: poi.attribution ?? null,
    disponible: poi.disponible === true,
    categories: (poi.categories ?? []).map((categorie) => ({
      id: categorie.id,
      label: categorie.label,
      total: categorie.total ?? 0,
      totalTexte:
        categorie.total > 0
          ? `${formatNumber(categorie.total)} à moins de ${formatDistance(poi.rayonM)}`
          : 'Aucun relevé à proximité immédiate',
      plusProche: formatDistance(categorie.plusProcheM),
      lieux: (categorie.lieux ?? []).map((lieu, index) => ({
        cle: `poi.${categorie.id}.${index}`,
        nom: lieu.nom ?? '',
        type: lieu.type ?? '',
        distance: formatDistance(lieu.distanceM) ?? '',
      })),
    })),
  }
}

/** Profil démographique — et, plus important, l'échelle à laquelle il se lit. */
function quartier(q) {
  if (!q) return null

  const lignes = [
    champ('quartier.population', 'Population', entier(q.population)),
    champ('quartier.menages', 'Nombre de ménages', entier(q.menages)),
    champ(
      'quartier.revenu',
      'Niveau de vie médian',
      q.revenuMedianMensuel == null
        ? null
        : `${formatEuros(q.revenuMedianMensuel)} / mois`,
    ),
    champ('quartier.logements', 'Logements', entier(q.logements)),
    champ(
      'quartier.secondaires',
      'Résidences secondaires',
      q.partSecondairesPct == null
        ? null
        : `${entier(q.residencesSecondaires)} — ${formatNumber(q.partSecondairesPct)} %`,
    ),
    champ(
      'quartier.vacants',
      'Logements vacants',
      q.partVacantsPct == null
        ? null
        : `${entier(q.logementsVacants)} — ${formatNumber(q.partVacantsPct)} %`,
    ),
  ]

  return {
    nom: q.iris?.nom ?? q.commune?.nom ?? null,
    commune: q.commune?.nom ?? null,
    codeIris: q.iris?.code ?? null,
    niveau: q.niveau ?? 'aucun',
    niveauMotif: q.niveauMotif ?? null,
    millesime: q.populationMillesime ?? null,
    source: q.source ?? null,
    lignes,
    // Population aux recensements successifs : la tendance, que le seul chiffre
    // du dernier millésime ne montre pas.
    serie: (q.populationSerie ?? []).map((point) => ({
      annee: point.annee,
      valeur: point.valeur,
      label: formatNumber(point.valeur),
    })),
  }
}

/** Libellé de la zone sur laquelle portent les pages chiffrées. */
function zoneLabel(zone) {
  if (!zone || zone.niveau === 'aucun') return null
  return zone.niveau === 'commune' ? (zone.label ?? 'la commune') : zone.label
}

/** Statistiques de marché du secteur. */
function marche(m, zone) {
  if (!m || m.references === 0) return null

  const periode = (p) =>
    p ? `${formatMois(p.debut)} – ${formatMois(p.fin)}` : null

  return {
    zone: zoneLabel(zone),
    lignes: [
      champ('marche.median', 'Prix médian au m²', parM2(m.prixM2Median)),
      champ('marche.maison', 'Médiane maisons', parM2(m.parType?.maison?.prixM2Median)),
      champ('marche.appartement', 'Médiane appartements', parM2(m.parType?.appartement?.prixM2Median)),
      champ('marche.references', 'Ventes analysées', entier(m.references)),
    ],
    evolution: {
      valeur: formatPct(m.evolutionPct),
      // Le sens de la variation, pour la couleur et la flèche — jamais déduit
      // du texte, qui peut avoir été réécrit à la main.
      sens: m.evolutionPct == null ? null : m.evolutionPct > 0 ? 'hausse' : m.evolutionPct < 0 ? 'baisse' : 'stable',
      recente: {
        periode: periode(m.periodes?.recente),
        prix: parM2(m.prixM2MedianRecent),
        ventes: entier(m.periodes?.recente?.ventes),
      },
      precedente: {
        periode: periode(m.periodes?.precedente),
        prix: parM2(m.prixM2MedianPrecedent),
        ventes: entier(m.periodes?.precedente?.ventes),
      },
    },
  }
}

/** Budgets moyens par typologie, et le revenu qu'ils réclament. */
function budgets(b, zone) {
  if (!b || b.ventesClassees === 0) return null

  return {
    zone: zoneLabel(zone),
    taux: b.taux == null ? null : `${formatNumber(b.taux)} %`,
    duree: `${b.hypotheses?.dureeAnnees ?? 25} ans`,
    effort: `${Math.round((b.hypotheses?.tauxEffortMax ?? 0.35) * 100)} %`,
    references: entier(b.ventesClassees),
    lignes: (b.typologies ?? []).map((t) => ({
      cle: `budgets.${t.id}`,
      label: t.label,
      ventes: t.ventes,
      partPct: t.partPct,
      champs: [
        champ(`budgets.${t.id}.surface`, 'Surface moyenne', formatSurfaceOuNull(t.surfaceMoyenne)),
        champ(`budgets.${t.id}.prix`, 'Budget moyen', formatEuros(t.prixMoyen)),
        champ(`budgets.${t.id}.part`, 'Part du marché', t.partPct == null ? null : `${formatNumber(t.partPct)} %`),
        champ(`budgets.${t.id}.revenu`, 'Revenu net requis', t.revenuMensuelRequis == null ? null : `${formatEuros(t.revenuMensuelRequis)} / mois`),
      ],
    })),
  }
}

/** Historique annuel des ventes du secteur. */
function historique(h, zone) {
  if (!h || h.annees.length === 0) return null

  const s = h.synthese

  return {
    zone: zoneLabel(zone),
    lignes: h.annees.map((a) => ({
      cle: `historique.${a.annee}`,
      annee: String(a.annee),
      ventes: entier(a.ventes),
      ventesBrut: a.ventes,
      prixM2: parM2(a.prixM2Moyen),
      prixM2Brut: a.prixM2Moyen,
      evolution: formatPct(a.evolutionPct),
      sens: a.evolutionPct == null ? null : a.evolutionPct > 0 ? 'hausse' : a.evolutionPct < 0 ? 'baisse' : 'stable',
    })),
    synthese: [
      champ('historique.periode', 'Période analysée', s.premiereAnnee ? `${s.premiereAnnee} – ${s.derniereAnnee}` : null),
      champ('historique.ventes', 'Ventes sur la période', entier(s.ventesTotal)),
      champ('historique.moyenne', 'Moyenne annuelle', s.ventesMoyenne == null ? null : `${entier(s.ventesMoyenne)} ventes`),
      champ('historique.prix', 'Prix moyen au m²', parM2(s.prixM2Moyen)),
      champ('historique.evolution', 'Évolution sur la période', formatPct(s.evolutionPeriodePct)),
    ],
  }
}

const KIND_LABELS = { maison: 'Maison', appartement: 'Appartement', terrain: 'Terrain' }

/** Ventes comparables — les biens voisins réellement vendus. */
function comparables(liste) {
  if (!liste || liste.length === 0) return null

  return liste.map((vente, index) => ({
    cle: `comparable.${index}`,
    type: KIND_LABELS[vente.kind] ?? 'Bien',
    distance: formatDistance(vente.distanceM) ?? '',
    surface: formatSurface(vente.surface),
    pieces: vente.rooms == null ? '—' : `${vente.rooms} p.`,
    prix: formatEuros(vente.price) ?? '',
    prixM2: parM2(vente.pricePerM2) ?? '',
    date: formatMois(vente.date) ?? '',
  }))
}

/** Le montant, sa fourchette, et le prix au m² qui en découle. */
function estimation({ price, characteristics, monaco }) {
  if (price == null) return null

  const fourchette = priceRange(price, monaco ? MONACO_RANGE_PCT : undefined)
  const surface = characteristics?.surfaceHabitable ?? null

  return {
    prix: formatEuros(price),
    bas: formatEuros(fourchette?.low),
    haut: formatEuros(fourchette?.high),
    prixM2: surface > 0 ? parM2(price / surface) : null,
    surface: formatSurfaceOuNull(surface),
  }
}

/** Profil de l'acquéreur type du bien estimé, et l'évolution des taux. */
function acquereur(profil, credit) {
  if (!profil) return null

  return {
    lignes: [
      champ('acquereur.revenu', 'Revenu net mensuel requis', profil.revenuMensuelRequis == null ? null : `${formatEuros(profil.revenuMensuelRequis)} / mois`),
      champ('acquereur.mensualite', 'Mensualité correspondante', profil.mensualite == null ? null : `${formatEuros(profil.mensualite)} / mois`),
      champ('acquereur.montant', 'Montant emprunté', formatEuros(profil.prix)),
      champ('acquereur.taux', 'Taux retenu', profil.taux == null ? null : `${formatNumber(profil.taux)} %`),
      champ('acquereur.duree', 'Durée du prêt', `${profil.dureeAnnees} ans`),
      champ('acquereur.effort', 'Taux d’effort maximal', `${Math.round(profil.tauxEffortMax * 100)} %`),
    ],
    taux: {
      source: credit?.source ?? null,
      estimatif: credit?.estimatif === true,
      serie: (credit?.serie ?? []).map((point) => ({
        annee: point.annee,
        valeur: point.taux,
        label: `${formatNumber(point.taux)} %`,
      })),
    },
  }
}

/**
 * Assemble le modèle d'affichage complet du rapport.
 *
 * Prend tout ce que le parcours a produit — l'adresse saisie, le bâtiment
 * repéré, le montant calculé, le formulaire rempli, les blocs rendus par
 * `api/rapport.js` — et rend les onze pages sous leur forme affichable.
 *
 * Aucun appel réseau, aucun aléa : à entrées égales, sorties égales. C'est ce
 * qui permet de recalculer le modèle à chaque rendu sans jamais écraser les
 * corrections de l'agent, qui vivent ailleurs (voir `RapportEdition`).
 */
export function construireModele({ address, selection, price, characteristics, rapport }) {
  const monaco = address?.monaco === true || selection?.monaco === true
  const lat = selection?.lat ?? address?.lat ?? null
  const lon = selection?.lon ?? address?.lon ?? null
  const parcelle = selection?.parcelle ?? null

  return {
    couverture: {
      adresse: address?.label ?? null,
      ville: [address?.postcode, address?.city].filter(Boolean).join(' ') || null,
      date: formatDateFr(rapport?.genereLe ?? new Date()),
    },
    localisation: {
      // Les proportions demandées à l'IGN sont celles de l'affichage : une
      // image servie dans un autre rapport de forme serait recadrée par le
      // navigateur, et le bien pourrait sortir du cadre.
      image: monaco ? null : orthoImageUrl(lat, lon, { width: 1120, height: 560, spanM: 300 }),
      // 900 m d'étendue : de quoi situer le bien dans son quartier. Au-delà, sur
      // une commune adossée à un massif comme Cassis, la vue se remplit de
      // garrigue et ne montre plus rien d'utile.
      large: monaco ? null : orthoImageUrl(lat, lon, { width: 1120, height: 360, spanM: 900 }),
      lignes: [
        champ('loc.adresse', 'Adresse', address?.label ?? null),
        champ('loc.commune', 'Commune', parcelle?.commune ?? address?.city ?? null),
        champ('loc.parcelle', 'Parcelle cadastrale', parcelle?.idu ?? null),
        champ('loc.contenance', 'Contenance cadastrale', formatSurfaceOuNull(parcelle?.contenance)),
        champ('loc.quartier', 'Quartier (IRIS)', rapport?.quartier?.iris?.nom ?? null),
        champ(
          'loc.coordonnees',
          'Coordonnées',
          lat == null ? null : `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        ),
      ],
    },
    description: {
      ...caracteristiques(characteristics ?? {}),
      ...points(rapport?.points),
    },
    commodites: commodites(rapport?.poi),
    quartier: quartier(rapport?.quartier),
    marche: marche(rapport?.marche, rapport?.zone),
    budgets: budgets(rapport?.budgets, rapport?.zone),
    historique: historique(rapport?.historique, rapport?.zone),
    comparables: comparables(rapport?.comparables),
    estimation: estimation({ price, characteristics, monaco }),
    acquereur: acquereur(rapport?.profilAcquereur, rapport?.credit),
  }
}
