// Fonction serverless Vercel — estimation.
//
// CE FICHIER EST UN ADAPTATEUR, et rien d'autre. Le calcul vit dans le moteur
// repris d'Immovia (`_lib/moteur.js` et ses dépendances) ; la correction propre
// à Barnes vit dans `_lib/barnes-adjustments/`. Ce handler ne fait que les
// enchaîner et rendre le résultat sous la forme que le front Barnes attend
// depuis toujours.
//
// ORDRE DU CALCUL, et il ne doit pas changer :
//
//   1. **Moteur Immovia** — sélection des comparables, pondération,
//      actualisation temporelle, ajustement de terrain, étage. Pour un même
//      bien, il rend l'euro qu'Immovia rendrait.
//   2. **Couche Barnes** — les coefficients du formulaire (plafonnés à ±15 %)
//      puis les surfaces annexes (hors plafond). Voir
//      `_lib/barnes-adjustments/index.js`.
//   3. **Majoration de positionnement ×1,07** — en tout dernier, hors du moteur
//      comme hors du plafond. Voir `_lib/barnes-adjustments/presentation.js`.
//
// LA FRONTIÈRE. Rien de Barnes n'entre dans les fichiers du moteur : ils sont
// byte-identiques au dépôt Immovia et doivent pouvoir y être resynchronisés en
// remplaçant simplement les fichiers. C'est ici, et seulement ici, que les deux
// se rencontrent.
//
// LE CONTRAT DE SORTIE ne bouge pas : `{ ok, price, detection, ajustements }`,
// plus `meta` sous `ESTIMATION_DEBUG`. L'interface, le rapport et l'export PDF
// lisent ces champs-là et n'ont pas été touchés. Le moteur d'Immovia rend, lui,
// `{ price, low, high, confiance }` : ses bornes et son niveau de confiance ne
// remontent donc pas au front, qui calcule sa fourchette comme avant.
//
// DEUX ÉCARTS ASSUMÉS AVEC LE HANDLER D'IMMOVIA, et les voici en toutes lettres :
//
//  - **La surface peut manquer.** Immovia refuse d'estimer sans surface
//    déclarée (400). Barnes ne le peut pas : son premier appel part pendant
//    l'écran d'analyse, avant le formulaire qui la recueille, et le rejeter
//    interromprait le parcours. La cascade de replis de Barnes est donc gardée
//    — surface déclarée, puis reconstituée par `describeBien`, puis ordre de
//    grandeur.
//  - **L'étage appartient au moteur.** Il était corrigé des deux côtés ; le
//    barème d'Immovia est le seul mesuré, et deux barèmes auraient fait diverger
//    Barnes d'Immovia sur tous les appartements. `coefEtage` a donc quitté la
//    couche Barnes. L'ascenseur, lui, y reste : Immovia n'en a aucune notion.

import { describeBien } from './_lib/bien.js'
import { DvfIndisponible, chargeDepartement, chargeVoisins } from './_lib/dvf.js'
import { estime, montantAffichable } from './_lib/moteur.js'
import { communeAtPoint, departementFromInsee } from './_lib/geo.js'
import { estHorsCouvertureDvf, majoreHorsDvf, prixReference } from './_lib/reference.js'
import { CHARGEMENT } from './_lib/estimationConfig.js'
import {
  appliqueAjustementsBarnes,
  prixDePresentation,
} from './_lib/barnes-adjustments/index.js'
import { arbitreTypeResidentiel, detectPropertyType, estTypeFiable } from '../src/lib/typeBien.js'
import { coefficientEtage, normaliseEtage } from '../src/lib/etage.js'
import { MONACO_PRICE_PER_M2 } from '../src/lib/monaco.js'

/**
 * Budget global de l'appel, aligné sur celui d'Immovia : le chargement DVF a
 * son propre plafond (`CHARGEMENT.budgetTotalMs`, 25 s) et ses réessais, et
 * `vercel.json` accorde une minute à la fonction.
 */
const BUDGET_MS = 30000

/**
 * Surfaces de dernier recours, quand aucune base n'a rien à dire du bâtiment.
 * Propres à Barnes : voir l'écart assumé en tête de fichier.
 */
const SURFACE_PAR_DEFAUT = { maison: 100, appartement: 65, terrain: 600 }

/** Bornes de la surface déclarée au curseur, alignées sur le formulaire. */
const SURFACE_DECLAREE_RANGE = [10, 800]

function surfaceDeclaree(value) {
  const surface = Number(value)
  const [min, max] = SURFACE_DECLAREE_RANGE

  return Number.isFinite(surface) && surface >= min && surface <= max ? surface : null
}

const TYPES_CONNUS = new Set(['maison', 'appartement', 'terrain', 'local'])
const typeRecu = (value) => (TYPES_CONNUS.has(value) ? value : null)

/**
 * Ce que le calcul a reconnu du bien, en plus de son prix — le formulaire s'en
 * sert pour cesser de redemander ce qui est déjà su. Inchangé.
 */
function detectionUtile({ type, confiance, classeEnergie }) {
  const typeFiable = estTypeFiable({ type, confiance })

  return {
    typeBien: { value: typeFiable ? type : null, detected: typeFiable },
    classeEnergie: { value: classeEnergie ?? null, detected: Boolean(classeEnergie) },
  }
}

/** Caractéristiques transmises par le formulaire, ou objet vide. */
const lireCaracteristiques = (valeur) =>
  valeur && typeof valeur === 'object' && !Array.isArray(valeur) ? valeur : {}

/** Ajustements sous une forme lisible dans un journal. */
const traceAjustements = ({ coefficient, brut, plafonne, details }) => ({
  total: `${(coefficient * 100).toFixed(1)} %`,
  ...(plafonne ? { avantPlafond: `${(brut * 100).toFixed(1)} %` } : {}),
  detail: details.map(
    (d) => `${d.id} ${d.coefficient > 0 ? '+' : ''}${(d.coefficient * 100).toFixed(1)} %`,
  ),
})

function badRequest(res, message) {
  return res.status(400).json({ ok: false, error: message })
}

/**
 * Réponse d'indisponibilité — 503, jamais un prix de consolation.
 *
 * C'est le contrat du moteur d'Immovia : une source DVF injoignable après ses
 * réessais ne produit pas de montant. Le front de Barnes traite ce cas comme
 * tout échec d'appel — prix nul, et le rapport le dit sur sa page « Estimation
 * de valeur » — sans qu'aucun écran ait eu à changer.
 */
function indisponible(res, motif, journal, startedAt, error) {
  const echecs = journal.filter((f) => f.issue === 'echec')

  console.error(
    '[estimation] indisponible',
    JSON.stringify({
      motif,
      message: error?.message ?? null,
      fichiers: journal.length,
      echecs: echecs.length,
      tentatives: journal.reduce((somme, f) => somme + f.tentatives, 0),
      detail: journal,
      elapsedMs: Date.now() - startedAt,
    }),
  )

  res.setHeader('Cache-Control', 'no-store')
  return res.status(503).json({
    ok: false,
    error: 'Estimation momentanément indisponible.',
    code: 'dvf-indisponible',
    motif,
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Méthode non autorisée.' })
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const lat = Number(body.lat)
  const lon = Number(body.lon)
  const characteristics = lireCaracteristiques(body.characteristics)

  // L'étage voyage dans le formulaire côté Barnes, là où Immovia le porte à la
  // racine de la requête. C'est une différence de forme, pas de calcul.
  const etageDeclare = characteristics.etage ?? body.etage

  // ------------------------------------------------------------------
  // Monaco — aucune source n'y publie, le barème tient en une constante.
  // ------------------------------------------------------------------
  if (body.monaco === true) {
    const type = body.type === 'maison' ? 'maison' : 'appartement'
    const declaree = surfaceDeclaree(body.surfaceM2)
    const surfaceM2 = declaree ?? SURFACE_PAR_DEFAUT[type]

    const etage = type === 'appartement' ? normaliseEtage(etageDeclare) : null
    const prixBase = MONACO_PRICE_PER_M2 * coefficientEtage(etage)

    const { montant, ajustements, annexes } = appliqueAjustementsBarnes({
      prixBase: prixBase * surfaceM2,
      prixM2Base: prixBase,
      surfaceM2,
      characteristics,
    })

    const price = prixDePresentation(montantAffichable(montant))

    const meta = {
      type,
      surfaceM2,
      surfaceSource: declaree ? 'declaree' : 'defaut',
      etage,
      coefficientEtage: coefficientEtage(etage),
      pricePerM2: MONACO_PRICE_PER_M2,
      source: 'monaco-imsee',
      ajustements: traceAjustements(ajustements),
      annexes: annexes.details.map((d) => `${d.id} ${d.surfaceM2} m²`),
    }

    console.log('[estimation]', JSON.stringify(meta))

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      price,
      detection: detectionUtile({
        type: body.type,
        confiance: body.typeConfiance,
        classeEnergie: null,
      }),
      ajustements,
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
  const journal = []

  try {
    // Le type est normalement détecté côté carte et transmis tel quel. Le type
    // déclaré au formulaire passe devant quand il existe : l'agent a tranché.
    let type = typeRecu(characteristics.typeBien) ?? typeRecu(body.type)
    let confiance = typeof body.typeConfiance === 'string' ? body.typeConfiance : null

    if (!type) {
      const detected = await detectPropertyType(
        { kind: body.kind ?? 'batiment', lat, lon, areaM2: body.areaM2, properties: body.properties },
        { signal },
      ).catch(() => null)
      type =
        typeRecu(detected?.type) ??
        arbitreTypeResidentiel({
          niveaux: body.properties?.nombre_d_etages,
          hauteur: body.properties?.hauteur,
          areaM2: body.areaM2,
        }).type
      confiance = detected?.confiance ?? 'nulle'
    }

    const record = (value) => (value && typeof value === 'object' ? value : null)
    const parcelle = record(body.parcelle)
    const contenance = Number(body.contenance) || parcelle?.contenance || null

    const selection = {
      lat,
      lon,
      type,
      areaM2: Number(body.areaM2) || null,
      surfaceM2: surfaceDeclaree(body.surfaceM2),
      properties: record(body.properties),
      parcelle,
      fiche: record(body.fiche),
      contenance,
      batimentGroupeId:
        typeof body.batimentGroupeId === 'string' ? body.batimentGroupeId : null,
    }

    const codeInsee =
      parcelle?.codeInsee ?? (await communeAtPoint(lat, lon, { signal }).catch(() => null))
    const departement = departementFromInsee(codeInsee)

    const etage = type === 'appartement' ? normaliseEtage(etageDeclare) : null
    const coefficientEtageApplique = coefficientEtage(etage)

    // Le terrain de la cible est la contenance cadastrale, et le moteur ne la
    // valorise que pour une maison.
    const terrainCible = type === 'maison' ? Number(contenance) || null : null

    const bienDecrit = describeBien(selection, { signal }).catch(() => ({
      surfaceM2: null,
      surfaceSource: 'aucune',
      anneeConstruction: null,
      classeEnergie: null,
      codeInsee: null,
    }))

    // ------------------------------------------------------------------
    // Zones hors couverture DVF (57, 67, 68, 976).
    // ------------------------------------------------------------------
    if (!departement || estHorsCouvertureDvf(departement)) {
      const bien = await bienDecrit
      const surfaceM2 =
        selection.surfaceM2 ??
        bien.surfaceM2 ??
        SURFACE_PAR_DEFAUT[type] ??
        SURFACE_PAR_DEFAUT.maison

      const reference = majoreHorsDvf(
        prixReference({ codeInsee, departement, type, lat, lon }),
        departement,
      )

      const prixM2Base = reference.pricePerM2 * coefficientEtageApplique
      const { montant, ajustements, annexes } = appliqueAjustementsBarnes({
        prixBase: prixM2Base * surfaceM2,
        prixM2Base,
        surfaceM2,
        characteristics,
      })

      const price = prixDePresentation(montantAffichable(montant))

      const meta = {
        type,
        surfaceM2,
        surfaceSource: selection.surfaceM2 ? 'declaree' : bien.surfaceSource,
        surfaceEstimee: bien.surfaceM2,
        anneeConstruction: bien.anneeConstruction,
        classeEnergie: bien.classeEnergie,
        typeConfiance: confiance,
        etage,
        coefficientEtage: coefficientEtageApplique,
        codeInsee,
        departement,
        pricePerM2: Math.round(reference.pricePerM2),
        pricePerM2Base:
          reference.pricePerM2Base != null ? Math.round(reference.pricePerM2Base) : null,
        majorationAppliquee: reference.majorationAppliquee ?? false,
        source: reference.source,
        pointNom: reference.pointNom ?? null,
        pointDistanceM: reference.pointDistanceM ?? null,
        confiance: 'faible',
        ajustements: traceAjustements(ajustements),
        annexes: annexes.details.map((d) => `${d.id} ${d.surfaceM2} m²`),
        elapsedMs: Date.now() - startedAt,
      }

      console.log('[estimation]', JSON.stringify(meta))

      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({
        ok: true,
        price,
        detection: detectionUtile({ type, confiance, classeEnergie: bien.classeEnergie }),
        ajustements,
        ...(process.env.ESTIMATION_DEBUG ? { meta } : {}),
      })
    }

    // ------------------------------------------------------------------
    // Zones couvertes par DVF — chargement, puis appel du moteur.
    // ------------------------------------------------------------------
    const dvfDeadline = AbortSignal.timeout(CHARGEMENT.budgetTotalMs)
    const dvfSignal = AbortSignal.any([signal, dvfDeadline])

    const [bien, essentiel] = await Promise.all([
      bienDecrit,
      chargeDepartement(departement, { signal: dvfSignal, journal }),
    ])

    const surfaceM2 =
      selection.surfaceM2 ?? bien.surfaceM2 ?? SURFACE_PAR_DEFAUT[type] ?? SURFACE_PAR_DEFAUT.maison

    const cible = {
      lat,
      lon,
      type,
      surfaceM2,
      contenance: terrainCible,
      etage,
      codeInsee,
      departement,
    }

    let ventes = essentiel.ventes
    const departements = [departement]
    const millesimesEnEchec = [...essentiel.millesimesEnEchec]
    const echecsNonEssentiels = []

    let marche = estime({ bien: cible, ventes })

    // Le moteur dit de quels rayons il aurait eu besoin ; on va les chercher,
    // du plus resserré au plus large, et on le rappelle.
    const sondes = new Set()

    for (;;) {
      const rayon = marche.rayonsASonderM.find((r) => !sondes.has(r))
      if (rayon == null) break
      sondes.add(rayon)

      const voisins = await chargeVoisins(lat, lon, rayon, {
        exclure: departements,
        signal: dvfSignal,
        journal,
      })

      echecsNonEssentiels.push(...voisins.echecs)
      if (voisins.ventes.length === 0) continue

      departements.push(...voisins.departements)
      ventes = [...ventes, ...voisins.ventes]
      marche = estime({ bien: cible, ventes })
    }

    if (!marche.prix) {
      return indisponible(res, 'aucune-vente-du-type', journal, startedAt)
    }

    if (marche.etape === 'departement') {
      console.warn(
        '[estimation] repli départemental',
        JSON.stringify({ departement, codeInsee, type, departements, ventes: ventes.length }),
      )
    }

    // --- Couche Barnes, puis majoration. Le moteur a fini son travail.
    const { montant, ajustements, annexes } = appliqueAjustementsBarnes({
      prixBase: marche.prix,
      // Le prix au m² du moteur porte déjà l'étage et l'ajustement de terrain,
      // puisqu'il est ramené du montant qu'il a établi.
      prixM2Base: marche.prix / surfaceM2,
      surfaceM2,
      characteristics,
    })

    const price = prixDePresentation(montantAffichable(montant))
    const echecs = journal.filter((f) => f.issue === 'echec')

    const meta = {
      type,
      typeSource: characteristics.typeBien ? 'formulaire' : (body.type ? 'front' : 'detection'),
      typeConfiance: confiance,

      surfaceM2,
      surfaceSource: selection.surfaceM2 ? 'declaree' : bien.surfaceSource,
      surfaceEstimee: bien.surfaceM2,
      anneeConstruction: bien.anneeConstruction,
      classeEnergie: bien.classeEnergie,
      contenance: terrainCible,
      etage,
      coefficientEtage: marche.coefficientEtage,

      codeInsee,
      departement,
      source: marche.statut === 'departement' ? 'dvf-departement' : 'dvf',
      etape: marche.etape,
      confiance: marche.confiance,
      pricePerM2: Math.round(marche.prixM2),
      rayonAtteintM: marche.rayonAtteintM,
      comparablesRetenus: marche.comparables.length,

      indice: {
        zone: marche.indice.zone,
        zoneCode: marche.indice.zoneCode,
        echelle: marche.indice.echelle,
        semestreReference: marche.indice.semestreReference,
        motif: marche.indice.motif,
        points: marche.indice.points,
      },

      candidats: marche.candidats,
      repli: marche.repli,
      terrain: marche.terrain,
      decomposition: marche.decomposition,

      // Les bornes et le niveau de confiance du moteur restent au journal : le
      // contrat de sortie du front Barnes ne les porte pas, et il n'a pas été
      // touché.
      fourchetteMoteur: marche.fourchette,

      comparables: marche.comparables.map((v) => ({
        adresse: v.adresse,
        date: v.date,
        commune: v.commune,
        surfaceM2: v.surface,
        terrainM2: v.surfaceTerrain,
        terrainConnu: v.terrainConnu,
        valeurFonciere: v.price,
        prixM2Brut: Math.round(v.pricePerM2),
        coefficientTemps: Number(v.coefficientTemps.toFixed(4)),
        prixM2Actualise: Math.round(v.prixM2Actualise),
        distanceM: Math.round(v.distanceM),
        similarite: v.similarite,
        poids: Number(v.poids.toFixed(4)),
      })),

      // Ce que la couche Barnes a ajouté par-dessus, et dans quel ordre.
      prixMoteur: marche.prix,
      ajustements: traceAjustements(ajustements),
      annexes: {
        surfacePonderee: Number(annexes.surfacePonderee.toFixed(2)),
        montant: Math.round(annexes.montant),
        detail: annexes.details.map((d) => `${d.id} ${d.surfaceM2} m²`),
      },
      prixAvantMajoration: montantAffichable(montant),

      chargement: {
        departements,
        fichiers: journal.length,
        echecs: echecs.length,
        millesimesEnEchec,
        echecsNonEssentiels,
        tentatives: journal.reduce((somme, f) => somme + f.tentatives, 0),
        detail: journal,
      },

      elapsedMs: Date.now() - startedAt,
    }

    console.log('[estimation]', JSON.stringify(meta))

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      price,
      detection: detectionUtile({ type, confiance, classeEnergie: bien.classeEnergie }),
      ajustements,
      ...(process.env.ESTIMATION_DEBUG ? { meta } : {}),
    })
  } catch (error) {
    if (error instanceof DvfIndisponible) {
      return indisponible(res, error.key, journal, startedAt, error)
    }

    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      return indisponible(res, 'budget-depasse', journal, startedAt, error)
    }

    console.error('[estimation] Échec du calcul', error)
    return res.status(500).json({ ok: false, error: 'Estimation indisponible.', code: 'erreur' })
  } finally {
    clearTimeout(budget)
  }
}
