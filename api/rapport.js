// Fonction serverless Vercel — assemblage du rapport d'estimation.
//
// L'estimation (`api/estimation.js`) rend un montant. Cette fonction-ci rend
// tout ce qui l'entoure : le quartier, son marché, ses budgets, son historique,
// les ventes voisines et ce qu'il faut gagner pour acheter. Onze pages de
// rapport, dont pas une n'est écrite ici — le front reçoit des nombres et des
// libellés, et les met en page.
//
//   a. Profil du quartier             → `_lib/quartier.js` (IGN IRIS + Insee Melodi)
//   b. Prix médian et évolution       → `_lib/secteur.js`  (DVF)
//   c. Budgets par typologie          → `_lib/secteur.js`  (DVF + `_lib/credit.js`)
//   d. Historique annuel des ventes   → `_lib/secteur.js`  (DVF)
//   e. Profil acquéreur               → `_lib/credit.js`   (BCE)
//   f. Points forts / de réserve      → `_lib/points.js`   (formulaire)
//
// Une page manque à cette liste, et c'est volontaire : les commodités du
// quartier. Overpass plafonne par adresse IP, et les quelques IP de sortie de
// l'hébergeur, partagées avec le reste de sa clientèle, étaient servies assez
// lentement pour épuiser le budget laissé à chaque instance — la page sortait
// vide sur un service qui, depuis un poste ordinaire, répond en moins d'une
// seconde. Le relevé est donc parti dans le navigateur, où chaque visiteur
// consomme son propre quota (voir `src/lib/poi.js`). Il rejoint les blocs
// d'ici dans `src/lib/rapport.js`.
//
// Deux principes, hérités du moteur d'estimation et valables ici mot pour mot :
//
//  - **Aucune source ne peut faire échouer la réponse.** Chaque bloc a son
//    repli, et un bloc manquant devient une page vide plutôt qu'un rapport
//    perdu. L'agent a devant lui un client ; il ne peut pas repartir de zéro
//    parce qu'un millésime DVF était indisponible.
//  - **Toutes les sources sont ouvertes.** Aucune clé d'API, et aucune n'aurait
//    de raison de transiter par le navigateur — celles qui restent ici sont
//    celles qu'un serveur sert mieux.
//
// À la différence de l'estimation, la réponse n'est pas volontairement pauvre :
// tout ce qui est calculé descend, puisque tout est destiné à s'afficher. Le
// front n'a en revanche aucune part au calcul — les mêmes chiffres au même
// moment, quel que soit le navigateur.

import { communeAtPoint, departementFromInsee } from './_lib/geo.js'
import { fetchQuartier } from './_lib/quartier.js'
import { fetchTaux, profilAcquereur, HYPOTHESES } from './_lib/credit.js'
import { suggererPoints } from './_lib/points.js'
import {
  budgetsParTypologie,
  comparablesProches,
  historiqueAnnuel,
  marcheSecteur,
  ventesSecteur,
} from './_lib/secteur.js'

/**
 * Budget global, calé juste sous la durée d'exécution par défaut d'une fonction
 * Vercel : passé ce délai, c'est la plateforme qui coupe, et elle ne rend rien
 * — pas même les blocs déjà prêts. Mieux vaut abandonner soi-même une source en
 * retard et livrer le reste.
 *
 * Chaque source a par ailleurs son propre délai, dimensionné pour tenir
 * dedans : l'Insee et la BCE 4 à 5 s, DVF 4 s par millésime. L'échéance globale
 * ne sert qu'au cas où toutes traîneraient ensemble.
 */
const BUDGET_MS = 9500

/** Ventes comparables listées sur leur page. Au-delà, elle déborderait en A4. */
const MAX_COMPARABLES = 8

function badRequest(res, message) {
  return res.status(400).json({ ok: false, error: message })
}

/**
 * Exécute une promesse en la privant du droit d'emporter le rapport.
 *
 * `Promise.all` rejette au premier échec ; ici, chaque bloc doit pouvoir
 * manquer seul. `Promise.allSettled` conviendrait, au prix d'un dépaquetage à
 * chaque usage — ce petit enrobage rend directement la valeur ou le repli.
 */
const ouRepli = (promesse, repli, nom) =>
  promesse.catch((error) => {
    console.error(`[rapport] Bloc « ${nom} » abandonné —`, error?.message ?? error)
    return repli
  })

/** Caractéristiques transmises par le formulaire, ou objet vide. */
const lireCaracteristiques = (valeur) =>
  valeur && typeof valeur === 'object' && !Array.isArray(valeur) ? valeur : {}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Méthode non autorisée.' })
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {}
  const lat = Number(body.lat)
  const lon = Number(body.lon)
  const monaco = body.monaco === true

  if (!monaco && (!Number.isFinite(lat) || !Number.isFinite(lon))) {
    return badRequest(res, 'Coordonnées manquantes.')
  }

  const controller = new AbortController()
  const budget = setTimeout(() => controller.abort(), BUDGET_MS)
  const signal = controller.signal
  const startedAt = Date.now()

  const type = typeof body.type === 'string' ? body.type : 'autre'
  const price = Number.isFinite(Number(body.price)) ? Number(body.price) : null
  const characteristics = lireCaracteristiques(body.characteristics)

  try {
    // Rattachement administratif d'abord : c'est lui qui désigne le fichier DVF
    // à ouvrir et la commune à interroger à l'Insee. Le front l'a presque
    // toujours — la parcelle est identifiée dès le repérage sur la carte.
    const codeInsee =
      body.codeInsee ??
      (monaco ? null : await communeAtPoint(lat, lon, { signal }).catch(() => null))
    const departement = monaco ? null : departementFromInsee(codeInsee)

    // Les trois sources ne dépendent pas les unes des autres : les enchaîner
    // triplerait le temps d'assemblage. DVF est de loin la plus lourde, et
    // c'est elle qui donne son tempo à l'ensemble.
    const [secteur, quartier, credit] = await Promise.all([
      ouRepli(
        ventesSecteur({ lat, lon, departement, codeInsee, commune: body.commune }, { signal }),
        { sales: [], departementales: [], zone: { niveau: 'aucun', label: null, radiusM: null } },
        'marché DVF',
      ),
      // La Principauté n'a ni IRIS ni recensement français : la page quartier y
      // reste vide, comme l'est déjà tout le pipeline cadastral.
      monaco
        ? Promise.resolve(null)
        : ouRepli(
            fetchQuartier({ lat, lon, codeInsee, commune: body.commune }, { signal }),
            null,
            'profil du quartier',
          ),
      ouRepli(fetchTaux({ signal }), null, 'taux d’emprunt'),
    ])

    const taux = credit?.taux ?? null

    const rapport = {
      genereLe: new Date().toISOString(),
      zone: secteur.zone,
      // Pas de `poi` : le relevé des commodités est fait par le navigateur et
      // ajouté au rapport à l'arrivée (voir `src/lib/rapport.js`).
      quartier,
      marche: marcheSecteur(secteur.sales),
      budgets: budgetsParTypologie(secteur.sales, { taux }),
      historique: historiqueAnnuel(secteur.sales),
      comparables: comparablesProches({ lat, lon, type }, secteur.departementales, {
        max: MAX_COMPARABLES,
      }),
      credit,
      // Le profil acquéreur du bien estimé, à distinguer de ceux que la page
      // « budgets » calcule par typologie : celui-ci porte sur le montant que
      // le moteur vient de rendre, c'est-à-dire sur ce bien-là.
      profilAcquereur: price === null || taux === null ? null : profilAcquereur(price, taux),
      hypothesesCredit: HYPOTHESES,
      points: suggererPoints(characteristics),
    }

    console.log(
      '[rapport]',
      JSON.stringify({
        codeInsee,
        departement,
        zone: rapport.zone.niveau,
        ventes: secteur.sales.length,
        comparables: rapport.comparables.length,
        quartier: quartier?.niveau ?? 'aucun',
        taux,
        elapsedMs: Date.now() - startedAt,
      }),
    )

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ok: true, rapport })
  } catch (error) {
    console.error('[rapport] Échec de l’assemblage', error)
    return res.status(500).json({ ok: false, error: 'Rapport indisponible.' })
  } finally {
    clearTimeout(budget)
  }
}
