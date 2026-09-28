// Fonction serverless Vercel — moteur d'estimation.
//
// Reçoit le bâtiment repéré sur la carte et renvoie un montant en euros. Tout
// le calcul vit ici : le front ne connaît ni les sources de données, ni la
// méthode, ni les paliers d'élargissement — il n'obtient qu'un nombre, et les
// quelques caractéristiques que les bases connaissaient déjà du bien (type,
// classe énergie), afin de ne pas les redemander au formulaire suivant.
//
// La Principauté de Monaco court-circuite tout cela : aucune des sources
// n'y publie quoi que ce soit, et le montant s'y calcule d'une multiplication
// par un prix au m² de référence (voir `../src/lib/monaco.js`).
//
//   A. Caractéristiques du bien      → `_lib/bien.js`      (BDNB, cadastre)
//   B. Chargement des ventes DVF     → `_lib/dvf.js`       (DVF / Etalab)
//   C. Calcul du prix                → `_lib/moteur.js`    (fonction pure)
//   D. Ajustements du formulaire     → `_lib/ajustements.js`
//   E. Replis successifs             → `_lib/reference.js`
//   E'. Territoire du livre foncier   → `_lib/alsaceMoselle.js` (Insee Filosofi)
//
// L'étape D n'existe qu'au second appel. Le moteur est sollicité deux fois par
// parcours : une première fois pendant l'analyse, sur ce que les bases savent
// du bâtiment, une seconde à la validation du formulaire, avec la surface
// déclarée *et* les caractéristiques saisies. Seul ce second montant fait foi
// au rapport (voir `saveCharacteristics` dans `src/App.jsx`).
//
// ------------------------------------------------------------------------
// CE QUI A CHANGÉ AU PORTAGE DU MOTEUR D'IMMOVIA
// ------------------------------------------------------------------------
//
// L'étape C ne cherche plus elle-même ses ventes. `_lib/dvf.js` charge les
// millésimes du département, `_lib/moteur.js` fait tout le reste — et le fait
// en **fonction pure** : mêmes entrées, même euro. C'est la condition pour que
// le banc de test d'Immovia mesure le moteur de production et non une
// reconstitution. Voir l'en-tête de `_lib/moteur.js`.
//
// **Une estimation peut désormais échouer.** L'ancienne version retombait en
// silence sur une médiane départementale, puis sur un prix de référence : un
// fichier DVF en panne rendait un montant indiscernable d'un montant calculé.
// Une source injoignable rend maintenant un 503 et aucun prix (voir
// `indisponible`, en bas de ce fichier) — le front affiche une page
// d'indisponibilité plutôt qu'un chiffre de consolation.
//
// **Les replis de référence restent en place**, mais pour la seule raison qui
// les justifiait : les territoires que DVF ne couvre pas. Moselle, Bas-Rhin,
// Haut-Rhin, Mayotte — là, le prix de référence n'est pas un filet de secours,
// c'est le calcul ordinaire.
//
// **L'étage passe au moteur.** Il était corrigé des deux côtés — par le moteur
// d'Immovia (`src/lib/etage.js`, appliqué dans `partBati`) et par la couche
// Barnes (`coefEtage`, dans `_lib/ajustements.js`) —, ce qui aurait décoté un
// rez-de-chaussée deux fois. `coefEtage` a été retiré : le barème du moteur est
// le seul mesuré (banc de test d'Immovia, trois mille ventes), et c'est le seul
// qui garantisse la parité — deux barèmes d'étage auraient fait diverger les
// deux moteurs sur tous les appartements, sans qu'aucune maison le montre.
//
// L'étage voyage dans `characteristics` côté Barnes, là où Immovia le porte à
// la racine de la requête : c'est la seule différence, et elle est de forme.
// Il n'existe donc qu'au second appel, celui qui suit le formulaire — le
// premier, qui précède la saisie, calcule à coefficient 1.
//
// Aucune autre étape ne peut faire échouer la réponse : chacune a son repli, et
// le parcours utilisateur ne doit jamais s'interrompre sur une donnée manquante.
// Toutes les sources sont des services publics ouverts — aucune clé d'API n'est
// nécessaire, et aucune ne transiterait par le front de toute façon.

import { ajustementsPrix } from './_lib/ajustements.js'
import { describeBien } from './_lib/bien.js'
import { DvfIndisponible, chargeDepartement, chargeVoisins, semestreLabel } from './_lib/dvf.js'
import { estime } from './_lib/moteur.js'
import { CHARGEMENT, FOURCHETTE } from './_lib/estimationConfig.js'
import { communeAtPoint, departementFromInsee } from './_lib/geo.js'
import { estLivreFoncier, prixLivreFoncier } from './_lib/alsaceMoselle.js'
import { estHorsCouvertureDvf, prixReference } from './_lib/reference.js'
import { detectPropertyType, estTypeFiable } from '../src/lib/typeBien.js'
import { coefficientEtage, normaliseEtage } from '../src/lib/etage.js'
import { MONACO_PRICE_PER_M2, MONACO_RANGE_PCT } from '../src/lib/monaco.js'

/**
 * Budget global du calcul.
 *
 * Il valait 10 s, calé sur l'écran de chargement du front, et la recherche DVF
 * avait son propre plafond de 7 s — au-delà duquel on retombait sur un prix de
 * référence. Ce compromis n'a plus lieu d'être : une estimation en retard ne se
 * remplace plus par un chiffre approché, elle échoue (503). Autant laisser au
 * chargement le temps d'aboutir.
 *
 * Le budget suit donc celui du moteur d'Immovia — 30 s de calcul dans une
 * fonction à qui `vercel.json` en accorde 60. L'écran de chargement du front
 * dure toujours 12 s ; il tourne désormais tant que la réponse n'est pas là,
 * au lieu de donner le tempo.
 *
 * `CHARGEMENT.budgetTotalMs` (25 s) borne l'étape DVF à l'intérieur de celui-ci,
 * réessais compris : il reste ainsi de quoi répondre proprement.
 */
const BUDGET_MS = 30000

/**
 * Surfaces de dernier recours, quand aucune base n'a rien à dire du bâtiment
 * — repérage libre hors cadastre, bâtiment inconnu de la BDNB comme de la
 * BD TOPO. Ordres de grandeur du parc français, retenus pour que le parcours
 * aboutisse malgré tout.
 */
const SURFACE_PAR_DEFAUT = { maison: 100, appartement: 65, terrain: 600 }

/**
 * Bornes de la surface déclarée au curseur, alignées sur celles du formulaire
 * qui la recueille (`EstimationCharacteristicsStep`). Le curseur ne peut rien
 * produire en dehors — la vérification vise une requête forgée, pas
 * l'utilisateur.
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

/**
 * Ce que le calcul a reconnu du bien, en plus de son prix.
 *
 * À la différence de `meta`, ce bloc descend toujours au front : il ne raconte
 * pas comment le montant a été obtenu — ce qui reste du diagnostic — mais dit
 * quelles caractéristiques les bases connaissaient déjà, pour que le formulaire
 * qui suit cesse de les demander.
 *
 * `detected` est aussi important que `value` : sans lui, un `null` de champ non
 * détecté ne se distinguerait pas d'un champ détecté vide, et le formulaire ne
 * saurait pas s'il doit poser la question.
 *
 * La règle est la même pour les deux champs — n'annoncer une détection que
 * lorsque la donnée est lue, jamais présumée. Un type de confiance moyenne est
 * assez bon pour le calcul, qui a de toute façon besoin d'un type ; il ne l'est
 * pas pour une caractéristique que l'agent verra ensuite figurer au rapport
 * sans jamais l'avoir déclarée.
 */
function detectionUtile({ type, confiance, classeEnergie }) {
  const typeFiable = estTypeFiable({ type, confiance })

  return {
    typeBien: { value: typeFiable ? type : null, detected: typeFiable },
    classeEnergie: { value: classeEnergie ?? null, detected: Boolean(classeEnergie) },
  }
}

/**
 * Caractéristiques transmises par le formulaire, ou objet vide.
 *
 * Absentes du premier appel — l'analyse précède le formulaire —, présentes au
 * second. Les photos du bien, elles, n'arrivent jamais jusqu'ici : le front les
 * retire de la charge utile (voir `sansPhotos` dans `src/lib/estimation.js`),
 * elles ne pèsent sur aucun calcul et se compteraient en mégaoctets.
 */
const lireCaracteristiques = (valeur) =>
  valeur && typeof valeur === 'object' && !Array.isArray(valeur) ? valeur : {}

/**
 * Ajustements sous une forme lisible dans un journal : « +5 % » plutôt que
 * « 0.05 », et la ligne de total à côté du détail.
 */
const traceAjustements = ({ coefficient, brut, plafonne, details }) => ({
  total: `${(coefficient * 100).toFixed(1)} %`,
  ...(plafonne ? { avantPlafond: `${(brut * 100).toFixed(1)} %` } : {}),
  detail: details.map((d) => `${d.id} ${d.coefficient > 0 ? '+' : ''}${(d.coefficient * 100).toFixed(1)} %`),
})

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
 * Prix de référence, quand aucune vente comparable ne peut être trouvée.
 *
 * Sur les trois départements du livre foncier — Moselle, Bas-Rhin, Haut-Rhin —
 * ce repli n'est pas un filet de secours mais le calcul ordinaire : DVF n'y
 * publiera jamais rien (voir `_lib/alsaceMoselle.js`). Le niveau départemental
 * y est donc modulé par le niveau de vie médian de la commune, seule source
 * ouverte qui couvre ce territoire à cette échelle — un repère communal plutôt
 * qu'un même chiffre pour tout un département.
 *
 * Une surcharge communale posée par l'agence (`ESTIMATION_PRIX_M2`) échappe à
 * cette modulation : elle est déjà locale, et la corriger d'un indice
 * reviendrait à discuter le chiffre de celui qui connaît le marché.
 */
async function referenceLocale({ codeInsee, departement, type }, { signal }) {
  const base = prixReference({ codeInsee, departement, type })
  const nu = { ...base, count: 0, radiusM: null }

  if (base.source === 'reference-commune' || !estLivreFoncier(departement)) return nu

  const affine = await prixLivreFoncier(
    { codeInsee, departement, type, ancre: base.pricePerM2 },
    { signal },
  ).catch(() => null)

  if (!affine) return nu

  return {
    pricePerM2: affine.pricePerM2,
    source: affine.source,
    count: 0,
    radiusM: null,
    indice: affine.indice?.indice ?? null,
  }
}

/**
 * Le moteur, appelé autant de fois qu'il réclame des départements voisins.
 *
 * Le moteur ne télécharge rien : il travaille sur les ventes qu'on lui donne, et
 * quand il a dû s'éloigner faute de comparables, il le dit — `rayonsASonderM`
 * énumère les rayons où un département voisin pourrait avoir ce qui manque ici.
 * C'est à cette fonction d'y répondre, en rechargeant puis en rappelant.
 *
 * Sonder coûte seize requêtes de découpage administratif et jusqu'à six
 * téléchargements par département retenu — d'où l'ordre, du rayon le plus
 * resserré au plus large, et d'où le fait qu'un rayon déjà sondé ne le soit
 * jamais deux fois.
 *
 * `etage` est déjà normalisé par l'appelant, et ne corrige que les appartements
 * — le moteur l'ignore pour tout autre type (voir `partBati` dans `moteur.js`).
 */
async function calcule(
  { lat, lon, type, surfaceM2, contenance, etage, codeInsee, departement },
  ctx,
) {
  const { ventes: initiales, millesimesEnEchec } = await chargeDepartement(departement, ctx)

  const cible = { lat, lon, type, surfaceM2, contenance, etage, codeInsee, departement }

  let ventes = initiales
  const departements = [departement]
  const echecsNonEssentiels = []
  const sondes = new Set()

  let marche = estime({ bien: cible, ventes })

  for (;;) {
    const rayon = marche.rayonsASonderM.find((r) => !sondes.has(r))
    if (rayon == null) break
    sondes.add(rayon)

    const voisins = await chargeVoisins(lat, lon, rayon, { exclure: departements, ...ctx })

    echecsNonEssentiels.push(...voisins.echecs)
    if (voisins.ventes.length === 0) continue

    departements.push(...voisins.departements)
    ventes = [...ventes, ...voisins.ventes]
    marche = estime({ bien: cible, ventes })
  }

  return { marche, departements, millesimesEnEchec, echecsNonEssentiels, ventes: ventes.length }
}

/**
 * Fourchette affichée, adossée au **montant final** — celui que les ajustements
 * Barnes ont déjà écarté de la médiane du secteur.
 *
 * Le moteur rend ses propres bornes, mais il les calcule sur le prix qu'il vient
 * d'établir, c'est-à-dire avant l'étape D : les reprendre telles quelles aurait
 * donné une fourchette décentrée autour du prix affiché — sur un bien à rénover
 * décoté de 8 %, la borne haute se serait retrouvée à +6 % seulement du montant.
 *
 * Seule la **demi-largeur** est donc reprise, et elle est la seule chose qui
 * compte : le moteur la tire du niveau de confiance, et de rien d'autre — ±15 %
 * en confiance normale, ±20 % en moyenne, ±25 % en faible (voir
 * `FOURCHETTE.parConfiance`). La bande garde sa largeur, elle se recentre.
 */
function fourchetteAutour(prix, confiance) {
  const demiLargeurPct = FOURCHETTE.parConfiance[confiance] ?? FOURCHETTE.parConfiance.faible

  const arrondiBorne = (valeur) => {
    const pas = valeur >= 100000 ? 1000 : 100
    return Math.round(valeur / pas) * pas
  }

  return {
    low: arrondiBorne(Math.max(prix * (1 - demiLargeurPct), PRICE_RANGE[0])),
    high: arrondiBorne(Math.min(prix * (1 + demiLargeurPct), PRICE_RANGE[1])),
    demiLargeurPct,
  }
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

    // Les caractéristiques déclarées ajustent le barème monégasque comme elles
    // ajustent la médiane française : un bien à rénover se négocie partout,
    // et le prix au m² de référence décrit ici aussi un bien moyen.
    const caracteristiques = lireCaracteristiques(body.characteristics)
    const ajustements = ajustementsPrix(caracteristiques)

    // L'étage se corrige à Monaco comme ailleurs, et par le même barème : le
    // prix au m² de la Principauté décrit un logement moyen, étage moyen
    // compris. C'est le moteur qui en est désormais maître (voir l'en-tête).
    const etageMonaco = type === 'appartement' ? normaliseEtage(caracteristiques.etage) : null
    const coefficientEtageMonaco = coefficientEtage(etageMonaco)

    // Pas de bornage ici, contrairement au calcul français : les facteurs sont
    // déjà bornés — la surface par le curseur (10 à 800 m²), le prix au m² par
    // une constante, l'étage par un barème qui ne s'écarte jamais de 5 % de 1.
    // Le produit tient de lui-même entre 575 000 € et 46 M€, et le plafond
    // français (20 M€) écrêterait une villa monégasque de grande surface sur un
    // montant qui, lui, n'a rien d'aberrant. L'ajustement est lui-même plafonné
    // à ±15 %, il ne peut pas en sortir.
    const price = round(
      MONACO_PRICE_PER_M2 * surfaceM2 * coefficientEtageMonaco * (1 + ajustements.coefficient),
    )

    // Monaco garde sa fourchette symétrique : elle ne relève pas du barème par
    // confiance, qui suppose des ventes voisines et un niveau de confiance tiré
    // d'elles. Ici le montant ne repose que sur une moyenne de la Principauté,
    // et l'écart d'un quartier monégasque à l'autre est sans commune mesure —
    // d'où ±20 %, plus large que le ±15 % d'une estimation DVF bien servie.
    const arrondiBorne = (valeur) => {
      const pas = valeur >= 100000 ? 1000 : 100
      return Math.round(valeur / pas) * pas
    }
    const low = arrondiBorne(price * (1 - MONACO_RANGE_PCT))
    const high = arrondiBorne(price * (1 + MONACO_RANGE_PCT))

    const meta = {
      type,
      surfaceM2,
      surfaceSource: declaree ? 'declaree' : 'defaut',
      etage: etageMonaco,
      coefficientEtage: coefficientEtageMonaco,
      pricePerM2: MONACO_PRICE_PER_M2,
      source: 'monaco-imsee',
      confiance: 'moyenne',
      demiLargeurPct: MONACO_RANGE_PCT,
      ajustements: traceAjustements(ajustements),
    }

    console.log('[estimation]', JSON.stringify(meta))

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      price,
      low,
      high,
      confiance: 'moyenne',
      comparables: [],
      // Le `type` retenu juste au-dessus est une coercition, pas une lecture :
      // il ramène à « appartement » tout ce qui n'est pas « maison », faute de
      // quoi le barème n'aurait rien à multiplier. C'est donc la détection
      // faite côté carte qui est jugée ici, pas lui. Aucune classe énergie
      // n'est cherchée à Monaco : la BDNB s'arrête à la frontière.
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

  const characteristics = lireCaracteristiques(body.characteristics)

  // Une ligne par fichier DVF touché : cache, non publié, ou échec avec son
  // nombre de tentatives. C'est ce qui permet de mesurer à l'usage la fréquence
  // réelle des pannes, jusqu'ici invisible.
  const journal = []

  try {
    // Le type est normalement détecté côté carte et transmis tel quel ; on ne
    // le recalcule que s'il manque — détection interrompue par une validation
    // rapide, ou réseau capricieux au moment du clic.
    //
    // La confiance voyage avec le type, et pour une seule raison : le
    // formulaire de caractéristiques ne reprend le type détecté qu'à condition
    // qu'il ait été lu dans une base, pas déduit. Sans elle, la réponse ne
    // saurait pas distinguer les deux.
    let type = body.type
    let confiance = typeof body.typeConfiance === 'string' ? body.typeConfiance : null
    if (!type) {
      const detected = await detectPropertyType(
        { kind: body.kind ?? 'batiment', lat, lon, areaM2: body.areaM2, properties: body.properties },
        { signal },
      ).catch(() => null)
      type = detected?.type ?? 'autre'
      confiance = detected?.confiance ?? 'nulle'
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

    // Étape A, lancée sans être attendue : les caractéristiques du bien et le
    // marché local ne dépendent pas les unes des autres, et les enchaîner
    // doublerait le temps de réponse pour rien.
    const bienDecrit = describeBien(selection, { signal }).catch(() => ({
      surfaceM2: null,
      surfaceSource: 'aucune',
      anneeConstruction: null,
      classeEnergie: null,
      codeInsee: null,
    }))

    // Le produit prix au m² × surface décrit le bien moyen du secteur ; les
    // caractéristiques déclarées l'en écartent, modérément et sous plafond
    // (voir `_lib/ajustements.js`). Nul au premier appel, qui ne connaît pas
    // encore le formulaire.
    const ajustements = ajustementsPrix(characteristics)

    // L'étage, que le moteur applique lui-même et qui ne corrige que les
    // appartements. Il arrive par le formulaire, donc au second appel seulement :
    // au premier, `null` vaut coefficient 1 — ne rien savoir de l'étage ne doit
    // ni bonifier ni pénaliser.
    const etage = type === 'appartement' ? normaliseEtage(characteristics.etage) : null

    // ------------------------------------------------------------------
    // Territoires hors couverture DVF (57, 67, 68, 976) : chemin inchangé.
    // DVF n'y publiera jamais rien ; le prix de référence y est le calcul
    // ordinaire, et non un repli.
    // ------------------------------------------------------------------
    if (!departement || estHorsCouvertureDvf(departement)) {
      const [bien, prix] = await Promise.all([
        bienDecrit,
        referenceLocale({ codeInsee, departement, type }, { signal }),
      ])

      const surfaceM2 =
        selection.surfaceM2 ??
        bien.surfaceM2 ??
        SURFACE_PAR_DEFAUT[type] ??
        SURFACE_PAR_DEFAUT.maison

      // Le coefficient d'étage s'applique ici aussi, comme chez Immovia : le
      // prix de référence décrit un logement moyen du secteur, étage moyen
      // compris, et un rez-de-chaussée s'y négocie moins cher qu'un troisième
      // de la même façon qu'ailleurs.
      const coefficientEtageApplique = coefficientEtage(etage)

      const price = clampPrice(
        round(
          prix.pricePerM2 * surfaceM2 * coefficientEtageApplique * (1 + ajustements.coefficient),
        ),
      )

      // Aucune vente ne porte ce montant : il sort d'un repère statistique, et
      // la confiance la plus basse est la seule honnête. La fourchette suit —
      // ±25 %.
      const confianceHorsDvf = 'faible'
      const { low, high, demiLargeurPct } = fourchetteAutour(price, confianceHorsDvf)

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
        pricePerM2: Math.round(prix.pricePerM2),
        source: prix.source,
        // Renseigné sur le seul territoire du livre foncier : l'indice de
        // niveau de vie qui a écarté le repère communal du départemental.
        ...(prix.indice ? { indiceCommune: prix.indice } : {}),
        confiance: confianceHorsDvf,
        demiLargeurPct,
        ajustements: traceAjustements(ajustements),
        prixAvantAjustements: Math.round(
          prix.pricePerM2 * surfaceM2 * coefficientEtageApplique,
        ),
        elapsedMs: Date.now() - startedAt,
      }

      console.log('[estimation]', JSON.stringify(meta))

      res.setHeader('Cache-Control', 'no-store')
      return res.status(200).json({
        ok: true,
        price,
        low,
        high,
        confiance: confianceHorsDvf,
        comparables: [],
        detection: detectionUtile({ type, confiance, classeEnergie: bien.classeEnergie }),
        ajustements,
        ...(process.env.ESTIMATION_DEBUG ? { meta } : {}),
      })
    }

    // ------------------------------------------------------------------
    // Territoires couverts par DVF — chargement, puis appel du moteur.
    // ------------------------------------------------------------------
    const dvfDeadline = AbortSignal.timeout(CHARGEMENT.budgetTotalMs)
    const dvfSignal = AbortSignal.any([signal, dvfDeadline])

    const bien = await bienDecrit

    // La surface déclarée passe avant celle qu'ont reconstituée les bases : elle
    // est la seule à avoir été vue de l'intérieur. Le calcul de `describeBien`
    // n'est pas pour autant inutile — il tourne en parallèle du chargement DVF,
    // sans coût de temps propre, et renseigne le journal.
    //
    // Immovia refuse désormais d'estimer sans surface déclarée (400). Barnes ne
    // le peut pas : son premier appel précède le formulaire qui la recueille, et
    // le rejeter interromprait l'analyse. La cascade de replis est donc gardée
    // telle qu'elle était — et `meta.surfaceSource` dit toujours d'où vient le
    // chiffre retenu.
    const surfaceM2 =
      selection.surfaceM2 ?? bien.surfaceM2 ?? SURFACE_PAR_DEFAUT[type] ?? SURFACE_PAR_DEFAUT.maison

    const { marche, departements, millesimesEnEchec, echecsNonEssentiels, ventes } = await calcule(
      {
        lat,
        lon,
        type,
        surfaceM2,
        // Le terrain de la cible est la contenance cadastrale, et le moteur ne
        // la valorise que pour une maison. Inconnue, elle n'est pas
        // éliminatoire — aucun ajustement de terrain ne sera simplement calculé.
        contenance: selection.contenance,
        etage,
        codeInsee,
        departement,
      },
      { signal: dvfSignal, journal },
    )

    if (!marche.prix) {
      // Les fichiers sont là mais ne contiennent aucune vente de ce type, même
      // en débordant sur les voisins : il n'y a rien à estimer, et inventer un
      // chiffre serait exactement ce que ce portage a supprimé.
      return indisponible(res, 'aucune-vente-du-type', journal, startedAt)
    }

    if (marche.etape === 'departement') {
      // Ce cas doit rester exceptionnel : même vingt kilomètres n'ont pas donné
      // cinq ventes du type. S'il remonte dans les journaux, c'est la sélection
      // qu'il faut regarder, pas la donnée.
      console.warn(
        '[estimation] repli départemental',
        JSON.stringify({ departement, codeInsee, type, departements, ventes }),
      )
    }

    // Le montant du moteur, puis la couche Barnes par-dessus. L'ordre est celui
    // que le portage impose : le moteur établit ce que vaut le bien moyen du
    // secteur à cette surface et à ce terrain, les caractéristiques déclarées
    // l'en écartent ensuite.
    const price = clampPrice(round(marche.prix * (1 + ajustements.coefficient)))
    const { low, high, demiLargeurPct } = fourchetteAutour(price, marche.confiance)

    // Chaque comparable retenu, avec de quoi refaire le calcul à la main. Ce
    // bloc redescend au front — c'est lui que la page « ventes comparables » du
    // rapport met en page.
    const comparables = marche.comparables.map((v) => ({
      adresse: v.adresse,
      kind: v.kind,
      date: v.date,
      semestre: semestreLabel(v.semestre),
      commune: v.commune,
      surface: v.surface,
      terrainM2: v.surfaceTerrain,
      terrainConnu: v.terrainConnu,
      dependance: v.dependance,
      price: v.price,
      pricePerM2: Math.round(v.pricePerM2),
      coefficientTemps: Number(v.coefficientTemps.toFixed(4)),
      prixM2Actualise: Math.round(v.prixM2Actualise),
      distanceM: Math.round(v.distanceM),
      similarite: v.similarite,
      poids: Number(v.poids.toFixed(4)),
      facteurs: v.facteurs,
    }))

    const echecs = journal.filter((f) => f.issue === 'echec')

    const meta = {
      type,
      surfaceM2,
      surfaceSource: selection.surfaceM2 ? 'declaree' : bien.surfaceSource,
      // Conservée à côté de la surface retenue : c'est l'écart entre les deux
      // qui dira si la reconstitution géométrique vise juste.
      surfaceEstimee: bien.surfaceM2,
      anneeConstruction: bien.anneeConstruction,
      classeEnergie: bien.classeEnergie,
      typeConfiance: confiance,
      contenance: selection.contenance,
      etage,
      coefficientEtage: marche.coefficientEtage,

      codeInsee,
      departement,
      source: marche.statut === 'departement' ? 'dvf-departement' : 'dvf',
      // L'étape qui a produit le prix, en clair : `cascade-normale`,
      // `atypique-2km`, `elargi-5km` / `-10km` / `-20km`, ou `departement`.
      // C'est la première chose à lire dans ce journal — tout le reste
      // s'interprète différemment selon elle.
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

      // Entonnoir de sélection — combien de ventes à chaque filtre, et combien
      // de similaires par rayon. C'est ce qui permet de dire *pourquoi* le rayon
      // retenu est celui-là.
      candidats: marche.candidats,
      repli: marche.repli,
      terrain: marche.terrain,
      decomposition: marche.decomposition,

      fourchette: {
        low,
        high,
        demiLargeurPct,
        // Dispersion des comparables retenus. Elle ne décide plus des bornes,
        // mais elle reste au journal : elle dit si les ventes voisines
        // s'accordaient, ce que la fourchette affichée, désormais fixe, ne dit
        // plus.
        q25PrixM2: marche.fourchette.q25PrixM2,
        q75PrixM2: marche.fourchette.q75PrixM2,
      },

      comparables,

      // Le détail des ajustements appliqués, ligne à ligne : c'est par lui que
      // l'on vérifie qu'un prix sorti différent de son voisin l'est pour une
      // raison qu'on peut nommer.
      ajustements: traceAjustements(ajustements),
      prixAvantAjustements: marche.prix,

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

    // Le détail du calcul n'a pas à redescendre : l'utilisateur ne doit rien
    // percevoir d'un élargissement de rayon ou d'un repli. Il reste accessible
    // pour le diagnostic en activant `ESTIMATION_DEBUG`.
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({
      ok: true,
      price,
      low,
      high,
      confiance: marche.confiance,
      // Ces deux blocs-ci descendent toujours, à la différence de `meta` : le
      // rapport liste les ventes qui portent l'estimation et détaille les
      // ajustements sous le montant. Un prix qu'on ne sait pas décomposer est un
      // prix que l'agent ne peut pas défendre.
      comparables,
      detection: detectionUtile({ type, confiance, classeEnergie: bien.classeEnergie }),
      ajustements,
      ...(process.env.ESTIMATION_DEBUG ? { meta } : {}),
    })
  } catch (error) {
    // Panne technique d'une source DVF, réessais épuisés : pas de prix. C'est le
    // renversement central de ce portage — voir l'en-tête du fichier.
    if (error instanceof DvfIndisponible) {
      return indisponible(res, error.key, journal, startedAt, error)
    }

    // Budget global dépassé : même traitement. Un montant rendu après trente
    // secondes de dégradation silencieuse ne vaut pas mieux qu'une erreur.
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
      return indisponible(res, 'budget-depasse', journal, startedAt, error)
    }

    console.error('[estimation] Échec du calcul', error)
    return res.status(500).json({ ok: false, error: 'Estimation indisponible.', code: 'erreur' })
  } finally {
    clearTimeout(budget)
  }
}

/**
 * Réponse d'indisponibilité — 503, jamais un prix de consolation.
 *
 * C'est le renversement que ce portage apporte. L'ancienne version n'échouait
 * jamais : un millésime DVF injoignable retombait sur la médiane départementale,
 * puis sur un prix de référence, et le montant qui s'affichait était
 * indiscernable d'un montant calculé sur des ventes voisines. L'agent le
 * présentait au client sans savoir qu'il ne reposait sur rien.
 *
 * Le front relance une fois, puis affiche la page d'indisponibilité (voir
 * `EstimationIndisponibleStep`). Le journal de chargement descend dans les logs
 * quoi qu'il arrive : c'est précisément le cas où l'on veut savoir quel fichier
 * a lâché, et après combien de tentatives.
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
