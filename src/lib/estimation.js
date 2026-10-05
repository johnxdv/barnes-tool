// Appel du moteur d'estimation. Le calcul lui-même vit côté serveur
// (`api/estimation.js`) : le front n'envoie que ce qu'il a appris en repérant
// le bâtiment sur la carte, et ne reçoit qu'un montant assorti des quelques
// caractéristiques que les bases connaissaient déjà. Ni les sources de
// données, ni la méthode, ni les éventuels replis ne descendent jusqu'ici.

import { sansPhotos } from './photos.js'

const ENDPOINT = '/api/estimation'

/**
 * Caractéristiques détectées, quand il n'y en a aucune.
 *
 * La forme est la même détectée ou non — `value` et `detected` — et elle est
 * toujours présente : le formulaire de caractéristiques n'a ainsi jamais à se
 * demander si l'objet existe, seulement si le champ a été trouvé. Un moteur
 * injoignable ne se distingue alors d'un bâtiment inconnu des bases que dans
 * la console, ce qui est exactement le degré de différence qui l'intéresse.
 */
export const AUCUNE_DETECTION = {
  typeBien: { value: null, detected: false },
  classeEnergie: { value: null, detected: false },
}

/**
 * Filet de sécurité côté client. Le serveur s'impose déjà un budget plus
 * court que l'animation de chargement ; ce délai ne couvre que le cas où il ne
 * répondrait pas du tout.
 */
const TIMEOUT_MS = 15000

/**
 * Ajustements appliqués, quand il n'y en a aucun — forme identique à celle
 * d'une réponse qui en porte, pour que le rapport n'ait jamais à vérifier
 * l'existence de l'objet, seulement la longueur de sa liste.
 */
export const AUCUN_AJUSTEMENT = { coefficient: 0, plafonne: false, details: [] }

/**
 * Réponse rendue quand rien n'a pu être obtenu — même forme que les autres.
 *
 * `indisponible` distingue les deux façons de n'avoir pas de prix, et c'est
 * tout l'objet de ce champ : une source DVF en panne (503 `dvf-indisponible`)
 * n'est pas la même chose qu'un secteur sans ventes. Le premier cas se rejoue
 * — la page d'indisponibilité propose de relancer ; le second ne se rejouera
 * jamais mieux. Voir `EstimationIndisponibleStep`.
 */
const echec = (indisponible = null) => ({
  price: null,
  low: null,
  high: null,
  confiance: null,
  comparables: [],
  indisponible,
  detection: AUCUNE_DETECTION,
  ajustements: AUCUN_AJUSTEMENT,
})

/**
 * Demande l'estimation d'une sélection confirmée sur la carte.
 *
 * Renvoie `{ price, detection, ajustements }` : le montant, ce que les bases
 * savaient déjà du bien, et le détail des ajustements que les caractéristiques
 * déclarées ont fait jouer sur le prix — vide tant que le formulaire n'a pas
 * été rempli. Les deux premiers viennent du même aller-retour, celui qui court
 * derrière l'écran d'analyse — la chaîne cadastre → BDNB qu'il déroule pour
 * reconstituer la surface passe de toute façon devant la vocation du bâtiment
 * et son diagnostic énergétique ; les rapporter ne coûte rien de plus.
 *
 * Ne rejette jamais : le parcours ne doit pas s'interrompre parce qu'une
 * requête a échoué. En cas d'échec complet, la promesse est tenue avec un
 * montant `null` et aucune détection — l'écran résultat sait déjà afficher le
 * premier sans se casser, et le formulaire de caractéristiques se contente
 * alors de tout demander.
 *
 * Silencieux pour l'utilisateur, mais jamais pour la console : chaque sortie
 * sans montant laisse une trace. Un `null` sans explication a déjà coûté un
 * diagnostic complet — l'écran affichait « — € » et rien, nulle part, ne
 * disait que la fonction serverless ne démarrait plus.
 *
 * Le montant est volontairement tiré une seule fois, au lancement de
 * l'analyse : le redemander à l'affichage du résultat le ferait varier d'un
 * rendu à l'autre.
 *
 * À ne pas confondre avec l'aperçu au prix moyen du secteur
 * (`src/lib/prixSecteur.js`) : celui-ci n'est qu'un ordre de grandeur calculé
 * dans le navigateur, que le montant obtenu ici vient remplacer.
 */
export async function requestEstimation(selection) {
  if (!selection) return echec()

  const monaco = selection.monaco === true

  // Les coordonnées commandent tout le calcul français — commune, département,
  // millésimes DVF. Sans elles, il n'y a rien à demander. Monaco fait
  // exception : son calcul ne dépend d'aucun découpage administratif, seulement
  // du type et de la surface déclarés.
  if (!monaco && (!Number.isFinite(selection.lat) || !Number.isFinite(selection.lon))) {
    return echec()
  }

  const { properties } = selection

  const payload = {
    lat: selection.lat,
    lon: selection.lon,
    // Bascule le moteur sur son barème monégasque : prix au m² de référence ×
    // surface déclarée, sans cadastre ni comparables (voir `src/lib/monaco.js`).
    monaco,
    kind: selection.kind ?? null,
    // LE TYPE DÉCLARÉ PASSE AVANT LE TYPE DÉTECTÉ, et c'est un correctif.
    //
    // Seul le type détecté sur la carte partait ici, y compris au second appel,
    // c'est-à-dire alors même que l'agent venait de trancher dans le formulaire.
    // Une détection en échec envoyait donc `autre` au moteur — et depuis le
    // portage, `autre` se compare aux **maisons** (`comparableKinds`), là où
    // l'ancienne version prenait une médiane tous logements confondus. Mesuré
    // au 132 rue Paradis à Marseille, sur un appartement de 70 m² : 294 000 €
    // avec le bon type, 410 000 € avec `autre`, soit +39,5 % sur huit
    // comparables qui étaient tous des maisons.
    //
    // `api/rapport.js` lisait déjà le type du formulaire en priorité (voir
    // `src/lib/rapport.js`) : l'estimation et le rapport s'accordent désormais.
    // Le repli reste la détection — le premier appel précède le formulaire, et
    // « Autre » déclaré n'est pas une réponse exploitable.
    type: typeExploitable(selection.characteristics?.typeBien) ?? selection.type ?? null,
    // Le degré de confiance du type détecté sur la carte. Le moteur n'en a que
    // faire pour calculer — il lui faut un type, fiable ou non — mais c'est lui
    // qui décidera si le formulaire de caractéristiques reprend ce type sans
    // rien demander ou s'il pose la question.
    typeConfiance: selection.typeConfiance ?? null,
    areaM2: selection.areaM2 ?? null,
    // Surface déclarée par l'utilisateur, quand il y en a une : le serveur la
    // fait passer avant toute surface reconstituée depuis les bases. Nulle au
    // lancement de l'analyse — plus rien n'est demandé avant elle, la surface
    // ne se règle qu'ensuite, au formulaire de caractéristiques.
    surfaceM2: selection.surfaceM2 ?? null,
    // Le formulaire de caractéristiques, quand il a été rempli — absent au
    // premier appel, qui le précède. Le serveur en tire les ajustements de prix
    // (état général, classe énergie, standing, piscine, stationnements ; voir
    // `api/_lib/ajustements.js`) et l'étage, que le moteur applique lui-même.
    // Les photos en sont retirées : aucun calcul ne les regarde, et elles se
    // compteraient en mégaoctets sur la requête.
    characteristics: sansPhotos(selection.characteristics ?? null),
    // Parcelle cadastrale et fiche BDNB ont déjà été obtenues pour déterminer
    // le type du bien, au moment du clic sur la carte. Les retransmettre évite
    // au serveur de refaire la même chaîne d'appels — deux à trois secondes qui
    // comptent dans le budget de l'analyse.
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

      // 503 : une source DVF n'a pas répondu, réessais épuisés. Le serveur ne
      // rend plus de prix de consolation dans ce cas (voir l'en-tête de
      // `api/estimation.js`), et c'est bien un échec technique — donc
      // rejouable. On remonte son motif tel quel : il ne s'affiche pas, il se
      // journalise.
      if (response.status === 503) {
        const detail = await response.json().catch(() => null)
        return echec({ motif: detail?.motif ?? 'dvf-indisponible', rejouable: true })
      }

      return echec({ motif: `http-${response.status}`, rejouable: response.status >= 500 })
    }

    const data = await response.json().catch(() => null)
    const price = Number(data?.price)
    const detection = lireDetection(data?.detection)
    const ajustements = lireAjustements(data?.ajustements)

    if (!Number.isFinite(price) || price <= 0) {
      console.error('[estimation] Réponse sans montant exploitable —', data)
      // La détection est tout de même conservée : rien ne lie les deux, et un
      // montant manquant n'est pas une raison de redemander à l'agent ce que
      // les bases ont su dire du bien. Les ajustements, eux, ne survivent pas à
      // l'absence du montant sur lequel ils portaient.
      return { ...echec({ motif: 'sans-montant', rejouable: false }), detection }
    }

    return {
      price,
      // Les bornes viennent du serveur depuis le portage du moteur : leur
      // largeur ne dépend plus d'un pourcentage fixe côté front, mais du niveau
      // de confiance du calcul — ±15 % en confiance normale, ±20 % en moyenne,
      // ±25 % en faible. Le front ne la recalcule plus (voir `priceRange`).
      low: nombreOuNull(data?.low),
      high: nombreOuNull(data?.high),
      confiance: CONFIANCES.includes(data?.confiance) ? data.confiance : null,
      // Les ventes qui portent réellement l'estimation — celles que le moteur a
      // retenues et pondérées, et non un relevé de voisinage fait à part. C'est
      // cette liste que la page « ventes comparables » du rapport met en page.
      comparables: lireComparables(data?.comparables),
      indisponible: null,
      detection,
      ajustements,
    }
  } catch (error) {
    console.error('[estimation] Appel au moteur en échec —', error)
    return echec({ motif: 'reseau', rejouable: true })
  }
}

const nombreOuNull = (valeur) => {
  const n = Number(valeur)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Les trois niveaux que le moteur produit, et qui règlent la fourchette. */
const CONFIANCES = ['normale', 'moyenne', 'faible']

/**
 * Relit les comparables avant de les laisser entrer dans le rapport.
 *
 * Même exigence que pour la détection : ce que le serveur renvoie ici finit
 * dans un tableau que l'agent présente à son client, et qu'il peut corriger à
 * la main. Une ligne mal formée y passerait pour une vente réelle. On garde
 * donc ce qui se lit, et on jette le reste.
 */
function lireComparables(liste) {
  if (!Array.isArray(liste)) return []

  return liste
    .filter((v) => v && typeof v === 'object' && nombreOuNull(v.price))
    .map((v) => ({
      kind: typeof v.kind === 'string' ? v.kind : null,
      adresse: typeof v.adresse === 'string' ? v.adresse : null,
      commune: typeof v.commune === 'string' ? v.commune : null,
      date: typeof v.date === 'string' ? v.date : null,
      semestre: typeof v.semestre === 'string' ? v.semestre : null,
      surface: nombreOuNull(v.surface),
      terrainM2: nombreOuNull(v.terrainM2),
      terrainConnu: v.terrainConnu === true,
      dependance: v.dependance === true,
      price: nombreOuNull(v.price),
      pricePerM2: nombreOuNull(v.pricePerM2),
      prixM2Actualise: nombreOuNull(v.prixM2Actualise),
      coefficientTemps: nombreOuNull(v.coefficientTemps),
      distanceM: Number.isFinite(Number(v.distanceM)) ? Number(v.distanceM) : null,
      similarite: Number.isFinite(Number(v.similarite)) ? Number(v.similarite) : null,
      poids: Number.isFinite(Number(v.poids)) ? Number(v.poids) : null,
    }))
}

/** Classes de l'étiquette énergie, dans l'ordre de l'échelle réglementaire. */
const CLASSES_DPE = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

const TYPES_FORMULAIRE = ['maison', 'appartement']

/**
 * Type déclaré au formulaire, s'il désigne un marché que le moteur sait
 * comparer — « Autre » et un champ vide n'en sont pas, et valent mieux remplacés
 * par ce que la carte a détecté.
 */
const typeExploitable = (valeur) => (TYPES_FORMULAIRE.includes(valeur) ? valeur : null)

/**
 * Relit le bloc de détection avant de le laisser entrer dans le formulaire.
 *
 * Le serveur filtre déjà, et c'est le nôtre — mais ce qu'il renvoie ici ne
 * finit pas dans un affichage, il finit dans l'état du formulaire, d'où il
 * partira au rapport sous les mêmes dehors qu'une valeur déclarée par l'agent.
 * Une valeur hors nomenclature y serait indétectable ; on préfère la perdre.
 */
function lireDetection(detection) {
  const champ = (brut, admises) => {
    const value = typeof brut?.value === 'string' ? brut.value : null
    const retenue = brut?.detected === true && admises.includes(value) ? value : null

    return { value: retenue, detected: retenue !== null }
  }

  return {
    typeBien: champ(detection?.typeBien, TYPES_FORMULAIRE),
    classeEnergie: champ(detection?.classeEnergie, CLASSES_DPE),
  }
}

/**
 * Relit le détail des ajustements avant de le laisser entrer dans le rapport.
 *
 * Même précaution que pour la détection, et pour la même raison : ces lignes
 * finissent imprimées sous le montant, avec l'en-tête de l'agence. Une entrée
 * mal formée y passerait pour un ajustement réellement appliqué. Tout ce qui
 * n'a ni libellé lisible ni coefficient fini est écarté.
 */
function lireAjustements(ajustements) {
  const coefficient = Number(ajustements?.coefficient)
  if (!Number.isFinite(coefficient)) return AUCUN_AJUSTEMENT

  const details = (Array.isArray(ajustements?.details) ? ajustements.details : [])
    .filter(
      (detail) =>
        typeof detail?.id === 'string' &&
        typeof detail?.label === 'string' &&
        Number.isFinite(Number(detail?.coefficient)),
    )
    .map((detail) => ({
      id: detail.id,
      label: detail.label,
      coefficient: Number(detail.coefficient),
    }))

  return { coefficient, plafonne: ajustements?.plafonne === true, details }
}
