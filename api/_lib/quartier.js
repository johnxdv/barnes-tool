// Profil du quartier — page « démographie » du rapport.
//
// Deux sources, et deux échelles qu'il ne faut surtout pas confondre :
//
//  1. **Le quartier lui-même**, nommé et délimité : le découpage IRIS de
//     l'Insee, diffusé par l'IGN sur la Géoplateforme (couche
//     `STATISTICALUNITS.IRIS:contours_iris`, même service WFS que le bâti de la
//     BD TOPO® employé au repérage). C'est lui qui permet d'écrire « Grande
//     Couronne » plutôt que « Cassis » — un IRIS regroupe environ 2 000
//     habitants, une commune peut en compter cinquante.
//
//  2. **Les chiffres** : l'API Melodi de l'Insee, ouverte et sans clé — le
//     recensement pour la population et les logements, le dispositif Filosofi
//     pour les revenus.
//
// La limite est là, et elle est assumée à découvert plutôt que masquée : Melodi
// s'arrête à la commune. L'Insee publie bien ses bases au niveau IRIS, mais
// sous forme de fichiers annuels de plusieurs dizaines de mégaoctets, sans
// aucune interface d'interrogation — rien qu'une fonction serverless puisse
// consulter dans le temps d'un rapport. L'API « Données locales », qui le
// permettrait, exige une clé nominative.
//
// D'où le contrat de ce module : le quartier est identifié au niveau IRIS
// chaque fois que le découpage en couvre le point, les chiffres restent
// communaux, et `niveau` dit lequel des deux a servi aux chiffres. La page du
// rapport l'écrit en toutes lettres sous le tableau — un chiffre communal
// présenté comme celui d'un quartier serait un faux.

const WFS_ENDPOINT = 'https://data.geopf.fr/wfs/ows'
const IRIS_LAYER = 'STATISTICALUNITS.IRIS:contours_iris'
const MELODI_ENDPOINT = 'https://api.insee.fr/melodi/data'

/** Budget par requête — trois partent en parallèle, aucune ne doit traîner. */
const FETCH_TIMEOUT_MS = 5000

/**
 * Interroge un service JSON avec un budget de temps. Renvoie `null` sur panne,
 * refus ou réponse illisible : chacun des blocs de cette page sait s'afficher
 * incomplet, aucun ne doit faire échouer le rapport.
 */
async function getJson(url, { signal, accept = 'application/json' } = {}) {
  const budget = AbortSignal.timeout(FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: { Accept: accept },
      signal: signal ? AbortSignal.any([signal, budget]) : budget,
    })
    if (!response.ok) throw new Error(`réponse ${response.status}`)
    return await response.json()
  } catch (error) {
    if (signal?.aborted) throw error
    console.error('[rapport] Source quartier indisponible —', url.slice(0, 80), error?.message ?? error)
    return null
  }
}

/**
 * IRIS contenant un point.
 *
 * Le filtre `CQL_FILTER=INTERSECTS(...)` évite de rapatrier les contours pour
 * refaire le point-dans-polygone ici : une emprise rectangulaire autour du
 * point en croiserait trois ou quatre en ville, et rien ne dirait lequel
 * contient réellement le bien.
 *
 * Attention à l'ordre des coordonnées : la couche est servie en latitude puis
 * longitude, à l'inverse de la convention GeoJSON employée partout ailleurs
 * dans le projet. Inversé, le filtre ne lève pas — il ne trouve simplement
 * jamais rien, ce qui se lit comme une commune sans découpage IRIS.
 */
export async function fetchIris(lat, lon, { signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const params = new URLSearchParams({
    SERVICE: 'WFS',
    VERSION: '2.0.0',
    REQUEST: 'GetFeature',
    TYPENAMES: IRIS_LAYER,
    OUTPUTFORMAT: 'application/json',
    SRSNAME: 'EPSG:4326',
    COUNT: '1',
    CQL_FILTER: `INTERSECTS(geometrie, POINT(${lat} ${lon}))`,
    PROPERTYNAME: 'code_iris,nom_iris,type_iris,code_insee,nom_commune',
  })

  const data = await getJson(`${WFS_ENDPOINT}?${params}`, { signal })
  const proprietes = data?.features?.[0]?.properties
  if (!proprietes?.code_iris) return null

  return {
    code: proprietes.code_iris,
    nom: proprietes.nom_iris ?? null,
    // `H` habitat, `A` activité, `D` divers, `Z` commune non découpée. Le
    // dernier cas est fréquent en zone rurale : la « commune non irisée » forme
    // alors un IRIS unique qui recouvre tout le territoire — l'identifier
    // n'apporte alors rien de plus que le nom de la commune.
    type: proprietes.type_iris ?? null,
    codeInsee: proprietes.code_insee ?? null,
    commune: proprietes.nom_commune ?? null,
  }
}

/**
 * Dernière observation d'une série Melodi, et son millésime.
 *
 * Les jeux du recensement portent plusieurs millésimes dans la même réponse
 * (2012, 2017, 2023 par exemple) : on prend le plus récent plutôt que de figer
 * une année ici, qui deviendrait fausse à la prochaine publication.
 *
 * `filtre` désigne les observations à retenir quand la requête en ramène
 * plusieurs par millésime — un jeu de données Melodi croise jusqu'à dix
 * dimensions, et toutes ne se filtrent pas dans l'URL.
 */
function derniere(data, filtre = () => true) {
  const retenues = (data?.observations ?? []).filter(
    (o) => filtre(o.dimensions ?? {}) && Number.isFinite(o.measures?.OBS_VALUE_NIVEAU?.value),
  )
  if (retenues.length === 0) return null

  const meilleure = retenues.reduce((max, o) =>
    (o.dimensions?.TIME_PERIOD ?? '') > (max.dimensions?.TIME_PERIOD ?? '') ? o : max,
  )

  return {
    valeur: meilleure.measures.OBS_VALUE_NIVEAU.value,
    millesime: Number(meilleure.dimensions?.TIME_PERIOD) || null,
  }
}

/** Série complète d'une mesure Melodi, par millésime croissant. */
function serie(data, filtre = () => true) {
  return (data?.observations ?? [])
    .filter((o) => filtre(o.dimensions ?? {}) && Number.isFinite(o.measures?.OBS_VALUE_NIVEAU?.value))
    .map((o) => ({
      annee: Number(o.dimensions?.TIME_PERIOD) || null,
      valeur: Math.round(o.measures.OBS_VALUE_NIVEAU.value),
    }))
    .filter((point) => point.annee !== null)
    .sort((a, b) => a.annee - b.annee)
}

const entier = (mesure) => (mesure === null ? null : Math.round(mesure.valeur))

/**
 * Profil démographique d'une commune : population, ménages, composition du
 * parc de logements et niveau de vie.
 *
 * Les trois jeux partent en parallèle et sont indépendants — une source en
 * panne laisse ses champs à `null` sans emporter les autres.
 *
 * Le parc de logements n'était pas demandé, il est pourtant ici : la part de
 * résidences secondaires est, sur une commune littorale, le chiffre qui
 * explique le marché. À Cassis elle dépasse 36 % — un vendeur qui l'ignore ne
 * comprend ni les prix qu'on lui annonce ni la saisonnalité des visites.
 */
export async function fetchDemographie(codeInsee, { signal } = {}) {
  if (!codeInsee) return null

  const geo = `COM-${codeInsee}`
  const url = (jeu, params) => `${MELODI_ENDPOINT}/${jeu}?GEO=${geo}&${params}`

  const [population, logements, revenus] = await Promise.all([
    getJson(url('DS_RP_POPULATION_PRINC', 'RP_MEASURE=POP&SEX=_T&AGE=_T'), { signal }),
    // Toutes les dimensions du jeu « logement » sont ramenées à leur total
    // (`_T`) sauf l'occupation, qui est précisément ce qu'on vient y chercher.
    // Sans ces filtres, la réponse croise chauffage, stationnement, époque de
    // construction et nombre de pièces — plusieurs milliers d'observations.
    getJson(
      url(
        'DS_RP_LOGEMENT_PRINC',
        'RP_MEASURE=DWELLINGS&TDW=_T&L_STAY=_T&CARS=_T&BUILD_END=_T&NRG_SRC=_T&TSH=_T&CARPARK=_T&NOR=_T',
      ),
      { signal },
    ),
    getJson(url('DS_FILOSOFI_CC', 'FILOSOFI_MEASURE=MED_SL'), { signal }),
  ])

  const parOccupation = (code) => derniere(logements, (d) => d.OCS === code)
  const principales = parOccupation('DW_MAIN')
  const secondaires = parOccupation('DW_SEC_DW_OCC')
  const vacants = parOccupation('DW_VAC')
  const totalLogements = parOccupation('_T')
  const pop = derniere(population)
  const revenu = derniere(revenus)

  const part = (mesure) =>
    mesure === null || totalLogements === null || totalLogements.valeur <= 0
      ? null
      : Math.round((mesure.valeur / totalLogements.valeur) * 1000) / 10

  return {
    population: entier(pop),
    populationMillesime: pop?.millesime ?? null,
    // Un ménage occupe une résidence principale et une seule : les deux
    // décomptes sont, par construction du recensement, le même nombre.
    menages: entier(principales),
    logements: entier(totalLogements),
    residencesSecondaires: entier(secondaires),
    partSecondairesPct: part(secondaires),
    logementsVacants: entier(vacants),
    partVacantsPct: part(vacants),
    // Niveau de vie médian : revenu disponible du ménage rapporté à ses unités
    // de consommation. C'est la mesure que publie Filosofi à cette échelle — le
    // revenu net moyen par foyer n'y est pas diffusé, la moyenne étant trop
    // sensible aux hauts revenus pour être publiée sans risque d'identification.
    revenuMedianAnnuel: entier(revenu),
    revenuMedianMensuel: revenu === null ? null : Math.round(revenu.valeur / 12),
    revenuMillesime: revenu?.millesime ?? null,
    // Population des recensements successifs — de quoi dire si le quartier se
    // peuple ou se vide, ce qu'un chiffre isolé ne dit pas.
    populationSerie: serie(population),
    source: 'Insee — recensement de la population et Filosofi (API Melodi)',
  }
}

/**
 * Profil du quartier : l'IRIS qui contient le bien, et les chiffres qui le
 * décrivent.
 *
 * `niveau` porte l'échelle des **chiffres**, pas celle du nom : il vaut
 * aujourd'hui `commune` dès qu'il y a des chiffres, et `aucun` quand l'Insee
 * n'a rien répondu. L'IRIS, lui, est restitué à part chaque fois qu'il a pu
 * être identifié — le rapport l'affiche comme nom de quartier, sans lui
 * attribuer les chiffres.
 */
export async function fetchQuartier({ lat, lon, codeInsee, commune }, { signal } = {}) {
  const iris = await fetchIris(lat, lon, { signal }).catch(() => null)
  const code = codeInsee ?? iris?.codeInsee ?? null
  const demographie = await fetchDemographie(code, { signal }).catch(() => null)

  return {
    iris,
    commune: { code, nom: commune ?? iris?.commune ?? null },
    niveau: demographie ? 'commune' : 'aucun',
    // Énoncé tel quel sous le tableau du rapport : l'échelle des chiffres n'est
    // pas un détail technique, c'est une précaution de lecture.
    niveauMotif:
      demographie && iris
        ? 'Quartier identifié au niveau IRIS ; chiffres publiés par l’Insee à l’échelle de la commune.'
        : demographie
          ? 'Chiffres publiés par l’Insee à l’échelle de la commune.'
          : null,
    ...(demographie ?? {}),
  }
}
