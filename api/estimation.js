// Fonction serverless Vercel — moteur d'estimation.
//
// Reçoit le bâtiment repéré sur la carte et renvoie un montant en euros. Tout
// le calcul vit ici : le front ne connaît ni les sources de données, ni la
// méthode, ni les paliers d'élargissement — il n'obtient qu'un nombre.
//
// La Principauté de Monaco court-circuite tout cela : aucune des sources
// n'y publie quoi que ce soit, et le montant s'y calcule d'une multiplication
// par un prix au m² de référence (voir `../src/lib/monaco.js`).
//
//   A. Caractéristiques du bien      → `_lib/bien.js`      (BDNB, cadastre)
//   B. Ventes comparables            → `_lib/comparables.js` (DVF / Etalab)
//   C. Médiane au m² × surface       → ci-dessous
//   D. Replis successifs             → `_lib/reference.js`
//
// Aucune de ces étapes ne peut faire échouer la réponse : chacune a son repli,
// et le parcours utilisateur ne doit jamais s'interrompre sur une donnée
// manquante. Toutes les sources sont des services publics ouverts — aucune clé
// d'API n'est nécessaire, et aucune ne transiterait par le front de toute façon.

import { describeBien } from './_lib/bien.js'
import { departementPricePerM2, findComparables } from './_lib/comparables.js'
import { communeAtPoint, departementFromInsee } from './_lib/geo.js'
import { estHorsCouvertureDvf, prixReference } from './_lib/reference.js'
import { detectPropertyType } from '../src/lib/typeBien.js'
import { MONACO_PRICE_PER_M2 } from '../src/lib/monaco.js'

/**
 * Budgets de temps. L'écran de chargement dure 12 s côté front, et c'est lui
 * qui donne le tempo : le calcul doit rendre la main avant, quitte à rendre un
 * repli plutôt qu'une réponse juste mais en retard.
 *
 * La recherche DVF a son propre plafond, plus court : elle est de loin l'étape
 * la plus lourde (plusieurs millésimes départementaux à télécharger), et si
 * elle traîne, il reste ainsi le temps de retomber sur un prix de référence.
 */
const BUDGET_MS = 10000
const DVF_BUDGET_MS = 7000

/**
 * Surfaces de dernier recours, quand aucune base n'a rien à dire du bâtiment
 * — repérage libre hors cadastre, bâtiment inconnu de la BDNB comme de la
 * BD TOPO. Ordres de grandeur du parc français, retenus pour que le parcours
 * aboutisse malgré tout.
 */
const SURFACE_PAR_DEFAUT = { maison: 100, appartement: 65, terrain: 600 }

/**
 * Bornes de la surface déclarée au curseur, alignées sur celles de la fenêtre
 * qui la recueille (`BuildingConfirmModal`). Le curseur ne peut rien produire
 * en dehors — la vérification vise une requête forgée, pas l'utilisateur.
 */
const SURFACE_DECLAREE_RANGE = [10, 800]

/**
 * Surface saisie par l'utilisateur, ou `null` si le champ est absent ou
 * aberrant. Elle vaut mieux que toute reconstitution : celui qui fait estimer
 * son bien en connaît la surface, là où le moteur la déduit d'une emprise au
 * sol et d'un nombre de niveaux présumé.
 */
function surfaceDeclaree(value) {
  const surface = Number(value)
  const [min, max] = SURFACE_DECLAREE_RANGE

  return Number.isFinite(surface) && surface >= min && surface <= max ? surface : null
}

/** Bornes du montant renvoyé — au-delà, le calcul relève de la donnée aberrante. */
const PRICE_RANGE = [15000, 20000000]

const clampPrice = (value) => Math.min(Math.max(value, PRICE_RANGE[0]), PRICE_RANGE[1])

/**
 * Le montant est arrondi au millier : une estimation au dernier euro
 * afficherait une précision qu'elle n'a pas.
 */
const round = (value) => Math.round(value / 1000) * 1000

function badRequest(res, message) {
  return res.status(400).json({ ok: false, error: message })
}

/**
 * Prix au m² retenu, selon la meilleure source disponible — et repli en
 * cascade jusqu'à ce qu'il y en ait une.
 */
async function resolvePricePerM2({ lat, lon, type, departement, codeInsee }, { signal }) {
  const reference = () => ({
    ...prixReference({ codeInsee, departement, type }),
    count: 0,
    radiusM: null,
  })

  // Départements sans aucune donnée DVF (Alsace-Moselle, Mayotte) : inutile de
  // dérouler l'élargissement, il ne trouvera rien.
  if (!departement || estHorsCouvertureDvf(departement)) return reference()

  const deadline = AbortSignal.timeout(DVF_BUDGET_MS)
  const dvfSignal = signal ? AbortSignal.any([signal, deadline]) : deadline

  try {
    const comparables = await findComparables(
      { lat, lon, type, departement },
      { signal: dvfSignal },
    )

    if (comparables.pricePerM2) {
      return {
        pricePerM2: comparables.pricePerM2,
        source: 'dvf',
        count: comparables.sales.length,
        radiusM: comparables.radiusM,
      }
    }

    // Aucune vente comparable, même après élargissement maximal : on retombe
    // sur la médiane de tout le département.
    const fallback = await departementPricePerM2(departement, type, { signal: dvfSignal })
    if (fallback.pricePerM2) {
      return {
        pricePerM2: fallback.pricePerM2,
        source: 'dvf-departement',
        count: fallback.count,
        radiusM: null,
      }
    }
  } catch (error) {
    // Échéance dépassée ou source injoignable : le prix de référence prend le
    // relais. Une estimation approchée vaut mieux qu'un parcours interrompu.
    console.error('[estimation] Recherche DVF abandonnée —', error?.message ?? error)
  }

  return reference()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Méthode non autorisée.' })
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const lat = Number(body.lat)
  const lon = Number(body.lon)

  // Monaco d'abord, et avant même la vérification des coordonnées : elles ne
  // serviraient à rien ici — ni commune INSEE, ni département, ni millésime DVF
  // ne répondraient de l'autre côté de la frontière. Le barème monégasque tient
  // en une constante et une surface déclarée ; il n'y a rien à aller chercher,
  // donc rien qui puisse échouer ni prendre du temps.
  if (body.monaco === true) {
    const type = body.type === 'maison' ? 'maison' : 'appartement'
    const declaree = surfaceDeclaree(body.surfaceM2)
    const surfaceM2 = declaree ?? SURFACE_PAR_DEFAUT[type]

    // Pas de bornage ici, contrairement au calcul français : les deux facteurs
    // sont déjà bornés — la surface par le curseur (10 à 800 m²), le prix au m²
    // par une constante. Le produit tient de lui-même entre 575 000 € et 46 M€,
    // et le plafond français (20 M€) écrêterait une villa monégasque de grande
    // surface sur un montant qui, lui, n'a rien d'aberrant.
    const price = round(MONACO_PRICE_PER_M2 * surfaceM2)

    const meta = {
      type,
      surfaceM2,
      surfaceSource: declaree ? 'declaree' : 'defaut',
      pricePerM2: MONACO_PRICE_PER_M2,
      source: 'monaco-imsee',
    }

    console.log('[estimation]', JSON.stringify(meta))

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      price,
      ...(process.env.ESTIMATION_DEBUG ? { meta } : {}),
    })
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return badRequest(res, 'Coordonnées manquantes.')
  }

  const controller = new AbortController()
  const budget = setTimeout(() => controller.abort(), BUDGET_MS)
  const signal = controller.signal
  const startedAt = Date.now()

  try {
    // Le type est normalement détecté côté carte et transmis tel quel ; on ne
    // le recalcule que s'il manque — détection interrompue par une validation
    // rapide, ou réseau capricieux au moment du clic.
    let type = body.type
    if (!type) {
      const detected = await detectPropertyType(
        { kind: body.kind ?? 'batiment', lat, lon, areaM2: body.areaM2, properties: body.properties },
        { signal },
      ).catch(() => null)
      type = detected?.type ?? 'autre'
    }

    // Ce que le front a déjà appris en repérant le bâtiment. Rien n'est pris
    // au mot : chaque champ est vérifié, et tout ce qui manque ou détonne est
    // retrouvé côté serveur — la charge utile vient du navigateur.
    const record = (value) => (value && typeof value === 'object' ? value : null)

    const selection = {
      lat,
      lon,
      type,
      areaM2: Number(body.areaM2) || null,
      surfaceM2: surfaceDeclaree(body.surfaceM2),
      properties: record(body.properties),
      parcelle: record(body.parcelle),
      // Fiche BDNB du bâtiment : sa présence dispense de refaire la chaîne
      // cadastre → BDNB, soit deux à trois secondes de moins sur le calcul.
      fiche: record(body.fiche),
      contenance: Number(body.contenance) || null,
      batimentGroupeId:
        typeof body.batimentGroupeId === 'string' ? body.batimentGroupeId : null,
    }

    // Rattachement administratif d'abord : c'est lui qui désigne le fichier DVF
    // à ouvrir, et il coûte une requête légère quand le front ne l'a pas déjà
    // transmis. Le front l'a presque toujours — la parcelle est identifiée dès
    // l'ouverture de la fenêtre de confirmation, pendant que l'utilisateur lit.
    const codeInsee =
      body.parcelle?.codeInsee ?? (await communeAtPoint(lat, lon, { signal }).catch(() => null))
    const departement = departementFromInsee(codeInsee)

    // Étapes A et B en parallèle : les caractéristiques du bien et le marché
    // local ne dépendent pas l'une de l'autre. Les enchaîner doublerait le
    // temps de réponse pour rien.
    const [bien, prix] = await Promise.all([
      describeBien(selection, { signal }).catch(() => ({
        surfaceM2: null,
        surfaceSource: 'aucune',
        anneeConstruction: null,
        codeInsee: null,
      })),
      resolvePricePerM2({ lat, lon, type, departement, codeInsee }, { signal }),
    ])

    // La surface déclarée passe avant celle qu'ont reconstituée les bases : elle
    // est la seule à avoir été vue de l'intérieur. Le calcul de `describeBien`
    // n'est pas pour autant inutile — il tourne en parallèle de la recherche
    // DVF, sans coût de temps propre, et renseigne le journal.
    const surfaceM2 =
      selection.surfaceM2 ?? bien.surfaceM2 ?? SURFACE_PAR_DEFAUT[type] ?? SURFACE_PAR_DEFAUT.maison

    const raw = prix.pricePerM2 * surfaceM2
    const price = clampPrice(round(raw))

    const meta = {
      type,
      surfaceM2,
      surfaceSource: selection.surfaceM2 ? 'declaree' : bien.surfaceSource,
      // Conservée à côté de la surface retenue : c'est l'écart entre les deux
      // qui dira si la reconstitution géométrique vise juste.
      surfaceEstimee: bien.surfaceM2,
      anneeConstruction: bien.anneeConstruction,
      codeInsee,
      departement,
      pricePerM2: Math.round(prix.pricePerM2),
      source: prix.source,
      comparables: prix.count,
      radiusM: prix.radiusM ?? null,
      elapsedMs: Date.now() - startedAt,
    }

    console.log('[estimation]', JSON.stringify(meta))

    // Le détail du calcul n'a pas à redescendre : l'utilisateur ne doit rien
    // percevoir d'un élargissement de rayon ou d'un repli. Il reste accessible
    // pour le diagnostic en activant `ESTIMATION_DEBUG`.
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      price,
      ...(process.env.ESTIMATION_DEBUG ? { meta } : {}),
    })
  } catch (error) {
    console.error('[estimation] Échec du calcul', error)
    return res.status(500).json({ ok: false, error: 'Estimation indisponible.' })
  } finally {
    clearTimeout(budget)
  }
}
