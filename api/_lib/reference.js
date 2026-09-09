// Repli de dernier recours — prix au m² lorsque DVF ne peut rien fournir.
//
// Deux situations, très différentes :
//
// 1. **Une panne.** Réseau coupé, fichier du millésime indisponible : le cas
//    est rare et passager.
//
// 2. **Un trou de couverture permanent.** DVF ne couvre PAS l'Alsace-Moselle
//    — Moselle (57), Bas-Rhin (67), Haut-Rhin (68) — ni Mayotte (976). Ces
//    départements relèvent du livre foncier et non du fichier immobilier de la
//    DGFiP : leurs mutations ne sont publiées nulle part en open data, à aucun
//    millésime, ni à l'échelle communale ni à l'échelle départementale. Aucun
//    élargissement du rayon n'y changera quoi que ce soit.
//
// Le siège de l'agence étant à Diebling (57), c'est ce second cas qui se
// présentera sur la quasi-totalité des estimations de son secteur. Les valeurs
// ci-dessous ne sont donc PAS un filet de sécurité théorique : ce sont, en
// Moselle, les seuls chiffres dont le moteur dispose. Elles n'ont d'autre
// prétention que l'ordre de grandeur et doivent être remplacées par les
// références de l'agence — c'est l'objet de la variable d'environnement
// ci-dessous.

/**
 * Surcharge des prix de référence, au format JSON, dans la variable
 * d'environnement `ESTIMATION_PRIX_M2` (Vercel → Project Settings →
 * Environment Variables). Les clés sont des codes commune INSEE ou des codes
 * département, les valeurs des prix au m² par type :
 *
 *   {"57176":{"maison":1650,"appartement":1400},"57":{"maison":1850}}
 *
 * La commune l'emporte sur le département, qui l'emporte sur la table
 * intégrée. C'est le seul moyen de faire entrer dans le moteur ce qu'une
 * agence connaît de son propre marché — et, en Alsace-Moselle, la seule façon
 * d'y obtenir des chiffres réellement locaux.
 */
function overrides() {
  const raw = process.env.ESTIMATION_PRIX_M2
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    console.error('[estimation] ESTIMATION_PRIX_M2 illisible — surcharge ignorée')
    return {}
  }
}

/**
 * Ordres de grandeur par département, pour les seules zones hors couverture
 * DVF. Établis d'après le niveau de marché constaté en 2024-2025, arrondis
 * volontairement grossièrement : ils ne prétendent pas à la précision d'une
 * médiane calculée sur des ventes réelles, et une agence qui travaille le
 * secteur fera mieux en renseignant `ESTIMATION_PRIX_M2`.
 */
const HORS_COUVERTURE = {
  57: { maison: 1850, appartement: 1700, terrain: 70 },
  67: { maison: 2650, appartement: 2900, terrain: 150 },
  68: { maison: 2350, appartement: 2300, terrain: 110 },
  976: { maison: 1600, appartement: 1600, terrain: 90 },
}

/**
 * Dernier filet, national. N'est atteint que si le département n'est ni
 * couvert par DVF ni listé ci-dessus — donc en pratique sur panne seule.
 */
const NATIONAL = { maison: 2200, appartement: 3100, terrain: 90 }

/** Départements dont on sait qu'aucune vente ne sera jamais trouvée dans DVF. */
export function estHorsCouvertureDvf(departement) {
  return Object.prototype.hasOwnProperty.call(HORS_COUVERTURE, String(departement))
}

/**
 * Prix de référence au m² pour un type de bien, et provenance de ce prix.
 *
 * `type` peut valoir `autre` ou `local` : faute de mieux, ces biens sont
 * alignés sur la maison, comme ils le sont déjà dans la recherche de
 * comparables.
 */
export function prixReference({ codeInsee, departement, type }) {
  const key = type === 'appartement' || type === 'terrain' ? type : 'maison'
  const table = overrides()

  const communal = codeInsee ? table[String(codeInsee)] : null
  if (communal && Number.isFinite(Number(communal[key]))) {
    return { pricePerM2: Number(communal[key]), source: 'reference-commune' }
  }

  const departemental = departement ? table[String(departement)] : null
  if (departemental && Number.isFinite(Number(departemental[key]))) {
    return { pricePerM2: Number(departemental[key]), source: 'reference-departement' }
  }

  const integre = HORS_COUVERTURE[String(departement)]
  if (integre) {
    return { pricePerM2: integre[key], source: 'reference-hors-couverture' }
  }

  return { pricePerM2: NATIONAL[key], source: 'reference-nationale' }
}
