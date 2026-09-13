import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { cadrePlan, IGN_ATTRIBUTION, PLAN_MAX_NATIVE_ZOOM, PLAN_TILE_URL } from '../../lib/ign'

/**
 * Fond de secours — les dalles d'OpenStreetMap.
 *
 * Le Plan IGN s'arrête aux frontières françaises et, comme tout service, tombe
 * parfois. Sans repli, la carte sortait alors en aplat gris : un cadre vide au
 * milieu du rapport, ce qui est précisément ce que cette page ne peut pas se
 * permettre. Le repli n'est posé que si les dalles françaises échouent
 * réellement — il ne s'agit pas de renoncer au fond officiel par précaution.
 */
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION_FOND = '© OpenStreetMap'

/**
 * Carte des commodités — la page « points d'intérêt » du rapport, en image.
 *
 * La liste dit combien et à quelle distance ; la carte dit *où*, et c'est une
 * autre information : quatre commerces tous du même côté d'une voie rapide ne
 * valent pas quatre commerces répartis autour du bien, et aucun décompte ne
 * fait la différence. Un point par relevé, la couleur pour la catégorie, le
 * bien au centre.
 *
 * Même Leaflet que le repérage du bâtiment (`BuildingMap`), avec deux partis
 * pris qui l'en séparent, et qui tiennent tous deux à ce que celle-ci vit dans
 * un document :
 *
 *  - **Le fond est le plan, pas la photographie.** Une pastille posée sur des
 *    toitures ne se rattache à rien ; posée sur un plan, elle se lit par rapport
 *    aux rues (voir `PLAN_TILE_URL`).
 *
 *  - **Elle ne se manipule pas.** Ni glissement, ni molette, ni boutons de
 *    zoom. Le cadrage est calculé une fois sur le rayon relevé, et il est le
 *    même pour tout le monde : une carte qu'on peut déplacer est une carte
 *    qu'on peut imprimer décentrée, sur un document qui porte l'en-tête de
 *    l'agence. C'est aussi ce qui la rend inoffensive au clic pendant la
 *    relecture du rapport.
 *
 * ── L'impression ne passe pas par Leaflet ────────────────────────────────
 *
 * Elle y passait, et la carte sortait vide de l'imprimante.
 *
 * Le raisonnement tenait : la feuille est plus étroite que l'écran, on prévient
 * du basculement par `matchMedia('print')`, on recadre, c'est réglé. Il manquait
 * un maillon — recadrer change le niveau de zoom, un niveau de zoom demande
 * d'autres dalles, et le navigateur les demande au réseau pendant qu'il compose
 * l'aperçu, sans les attendre. Les dalles déjà chargées étaient celles du
 * cadrage d'avant ; celles du cadrage d'après n'arrivaient jamais à temps. Le
 * PDF portait un cadre gris au milieu de la page des commodités.
 *
 * Ce qui s'imprime est donc une **image**, rendue d'un bloc par le WMS de la
 * Géoplateforme sur exactement le même cadrage (voir `cadrePlan` dans
 * `ign.js`), avec les pastilles posées dessus en positionnement absolu. Elle est
 * chargée avec la page, bien avant qu'on imprime, et ne dépend plus de rien au
 * moment de l'aperçu.
 *
 * Les trois couches sont superposées en permanence, et c'est ce qui rend
 * l'image fiable : elle est dans la page, mise en page, chargée — simplement
 * recouverte à l'écran par les dalles opaques de Leaflet. Une image en
 * `display: none` serait bien téléchargée par les navigateurs, mais rien ne
 * l'oblige ; celle-ci n'a pas à être téléchargée, elle est déjà là.
 *
 * Si le WMS ne répond pas, on retombe sur l'ancien comportement plutôt que sur
 * rien : Leaflet reprend la feuille, avec son défaut connu, et c'est toujours
 * mieux qu'un cadre blanc.
 */

/**
 * Couleurs des catégories — palette Barnes, reprise de `tailwind.config.js`.
 *
 * Trois teintes franchement distinctes, et distinctes aussi en niveaux de gris :
 * un rapport imprimé sur une imprimante noir et blanc doit rester lisible.
 *
 * La mise en charte a resserré la palette de tout l'outil sur trois couleurs,
 * ce qui menaçait précisément cette carte : le doré et le corail devenaient le
 * même rouge, et deux des trois catégories auraient été indiscernables. Le
 * troisième ton est donc pris dans la charte elle-même — `--grey-500` (#808080),
 * la teinte de navigation du site. Encre, gris moyen et rouge : trois valeurs
 * nettement séparées, sur écran comme en noir et blanc.
 */
const COULEURS = {
  transports: '#3C3C3C', // encre
  ecoles: '#808080', // ardoise
  commerces: '#B4002F', // rouge Barnes
}

/** Teinte des catégories qu'une évolution d'`poi.js` ajouterait sans passer ici. */
const COULEUR_PAR_DEFAUT = '#ABABAB'

export const couleurCategorie = (id) => COULEURS[id] ?? COULEUR_PAR_DEFAUT

/**
 * Format de la carte — et c'est le format, plus que la taille, qui a changé.
 *
 * Elle occupait toute la largeur de la page sur 250 px de haut : un bandeau
 * trois fois plus large que haut. Or le cadrage se cale sur le disque relevé,
 * qui est aussi haut que large ; c'est donc la hauteur qui commandait, et le
 * relevé n'occupait qu'un tiers de la largeur disponible. Les pastilles se
 * rassemblaient au centre d'une carte essentiellement vide, et le quartier
 * qu'elles décrivent ne se lisait plus.
 *
 * La carte est maintenant presque carrée et centrée : le disque y remplit près
 * de neuf dixièmes du cadre. Elle est plus petite en surface qu'un bandeau
 * pleine largeur, et pourtant le relevé y est deux fois plus grand.
 *
 * Les valeurs sont les maximums que la feuille A4 permette. Au-delà, la page
 * déborde sur une seconde — ce que la quatrième ligne de chaque catégorie a
 * déjà payé une fois (voir `MAX_PAR_CATEGORIE` dans `src/lib/poi.js`).
 */
const HAUTEUR = 265
const LARGEUR_MAX = '23rem'
/** La même largeur, en pixels : l'image figée se demande en pixels, pas en rem. */
const LARGEUR_PX = 368

/**
 * Cadrage : le disque interrogé, plus une marge.
 *
 * On cadre sur le rayon relevé plutôt que sur les points eux-mêmes. Un quartier
 * qui n'aurait qu'une école à 480 m ferait sinon une carte aussi large que
 * celle d'un centre-ville, et les deux ne se compareraient plus. Ici, toutes les
 * cartes du même rayon ont la même échelle.
 */
const MARGE_PX = 12

export function CarteCommodites({ carte, source }) {
  const containerRef = useRef(null)
  // Provenance du fond réellement affiché : l'attribution imprimée sous la
  // carte doit nommer celui qu'on voit, pas celui qu'on avait demandé.
  const [fond, setFond] = useState(IGN_ATTRIBUTION)
  // L'image figée a-t-elle abouti ? Elle seule décide qui imprime : elle si
  // elle est là, Leaflet sinon. Optimiste au départ — le cas courant est
  // qu'elle charge, et un état pessimiste ferait clignoter la classe
  // `print:hidden` le temps du chargement.
  const [statique, setStatique] = useState(true)

  const { lat, lon, rayonM } = carte ?? {}
  // Les points sont reconstruits à chaque rendu du rapport (le modèle est pur,
  // voir `rapportModele.js`) : c'est leur contenu, pas leur identité, qui doit
  // décider d'un remontage de la carte. Sans cela, la moindre correction saisie
  // dans une tout autre page reconstruirait la couche.
  const signature = (carte?.points ?? [])
    .map((point) => `${point.categorie}:${point.lat},${point.lon}`)
    .join('|')

  useEffect(() => {
    const container = containerRef.current
    if (!container || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined

    const map = L.map(container, {
      center: [lat, lon],
      zoom: 15,
      // Zoom fractionnaire. Leaflet arrondit par défaut au niveau entier
      // inférieur, et le cadre de cette carte est un bandeau trois fois plus
      // large que haut : le disque relevé n'y tenait qu'à un niveau de trop, si
      // bien qu'il occupait cent quarante pixels dans une hauteur de deux cent
      // cinquante. Les points se rassemblaient au milieu d'une carte
      // essentiellement vide, et le quartier qu'ils décrivent ne se lisait
      // plus. Sans arrondi, le cadrage épouse exactement le disque.
      zoomSnap: 0,
      attributionControl: false,
      zoomControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
      touchZoom: false,
      // La carte est une illustration : elle ne doit pas capter le geste d'un
      // agent qui fait défiler son rapport sur une tablette.
      tap: false,
    })

    const plan = L.tileLayer(PLAN_TILE_URL, {
      maxNativeZoom: PLAN_MAX_NATIVE_ZOOM,
      maxZoom: 19,
    }).addTo(map)

    // Bascule sur OpenStreetMap au premier échec de dalle, et une seule fois :
    // `tileerror` se déclenche par dalle, et il y en a une douzaine à l'écran.
    // La couche IGN est retirée dans la foulée — superposée, elle laisserait
    // les dalles qu'elle a su charger par-dessus celles du repli, et la carte
    // sortirait en damier.
    let bascule = false
    plan.on('tileerror', () => {
      if (bascule) return
      bascule = true
      map.removeLayer(plan)
      L.tileLayer(OSM_TILE_URL, { maxNativeZoom: 19, maxZoom: 19 }).addTo(map)
      setFond(OSM_ATTRIBUTION_FOND)
    })

    // Le disque parcouru, tracé avant les points pour rester sous eux.
    const disque = L.circle([lat, lon], {
      radius: rayonM ?? 500,
      color: '#3C3C3C',
      weight: 1,
      opacity: 0.35,
      dashArray: '4 4',
      fillColor: '#3C3C3C',
      fillOpacity: 0.04,
      interactive: false,
    }).addTo(map)

    for (const point of carte?.points ?? []) {
      if (!Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue

      L.circleMarker([point.lat, point.lon], {
        radius: 4.5,
        color: '#FFFFFF',
        weight: 1.5,
        opacity: 0.9,
        fillColor: couleurCategorie(point.categorie),
        fillOpacity: 1,
        interactive: false,
      }).addTo(map)
    }

    // Le bien, posé en dernier : il passe devant tout le reste. Losange rouge
    // cerné d'encre — la même signalétique que le repère d'adresse de la carte
    // de repérage, en plus affirmé, parce qu'il doit se distinguer d'une
    // vingtaine de pastilles.
    L.marker([lat, lon], {
      interactive: false,
      keyboard: false,
      icon: L.divIcon({
        className: '',
        html:
          '<span style="display:block;width:14px;height:14px;transform:rotate(45deg);' +
          'background:#B4002F;border:2px solid #3C3C3C;box-shadow:0 0 0 2px rgba(255,255,255,0.9)"></span>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    }).addTo(map)

    const cadrer = () => {
      // Cadre de taille nulle : c'est ce que voit l'observateur quand la couche
      // glissante passe en `display: none` à l'impression. `fitBounds` sur une
      // carte sans surface calcule un niveau de zoom infini et laisse la carte
      // dans un état dont elle ne revient pas.
      if (container.clientWidth === 0 || container.clientHeight === 0) return

      map.invalidateSize({ animate: false })
      map.fitBounds(disque.getBounds(), { padding: [MARGE_PX, MARGE_PX], animate: false })
    }

    cadrer()

    // Leaflet ne mesure son conteneur qu'à l'initialisation, et la page du
    // rapport se pose pendant une transition d'étape : on recadre une fois la
    // mise en page stabilisée, puis à chaque changement de gabarit.
    const observer = new ResizeObserver(cadrer)
    observer.observe(container)

    // Aucun écouteur d'impression : c'est l'image figée qui part sur la feuille,
    // et Leaflet n'a plus à s'y adapter (voir le commentaire de tête). Les
    // trois écouteurs qui tenaient ici — `matchMedia('print')`, `beforeprint`,
    // `afterprint` — recadraient la carte au moment de l'aperçu, ce qui est
    // précisément ce qui la vidait.

    return () => {
      observer.disconnect()
      map.remove()
    }
    // `signature` tient lieu de `carte.points` dans les dépendances : la liste
    // est reconstruite à chaque rendu du modèle, son identité ne dit donc rien
    // de son contenu.
  }, [lat, lon, rayonM, signature])

  // Seul un centre manquant empêche la carte : un relevé sans un point en
  // produit une valide — le bien, son disque de recherche, et les rues autour.
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  // Le cadrage de l'image figée, calculé sur les mêmes valeurs que celui de
  // Leaflet — même disque, même marge, même rapport de forme. C'est ce qui fait
  // que l'écran et la feuille montrent la même carte et non deux vues voisines.
  const plan = cadrePlan({
    lat,
    lon,
    rayonM,
    largeurPx: LARGEUR_PX,
    hauteurPx: HAUTEUR,
    margePx: MARGE_PX,
  })

  return (
    <figure className="m-0">
      <div
        role="img"
        aria-label="Carte des commodités relevées autour du bien, par catégorie"
        style={{ height: `${HAUTEUR}px`, maxWidth: LARGEUR_MAX }}
        className="rapport-carte relative mx-auto w-full overflow-hidden rounded-lg border border-marine/12 bg-marine/[0.03]"
      >
        {/* Couche 1 — le plan figé. Recouvert à l'écran, seul sur la feuille.

            `object-cover` : le cadre garde ses proportions à l'impression (70 mm
            de haut pour une largeur plafonnée à 23 rem), mais pas au pixel près
            selon la largeur de colonne disponible ; un recadrage centré vaut
            mieux qu'une image étirée, et ce que la marge perd est du fond de
            plan, jamais une pastille — elles vivent toutes dans le disque. */}
        {plan ? (
          <img
            src={plan.url}
            alt=""
            aria-hidden="true"
            onError={() => setStatique(false)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        {/* Couche 2 — les pastilles de l'image figée, en pourcentages de cadre.
            Elles doublent celles de Leaflet, et c'est voulu : à l'écran elles
            sont dessous, invisibles ; sur la feuille elles sont tout ce qui
            reste. */}
        {plan ? (
          <div aria-hidden="true" className="absolute inset-0">
            {(carte?.points ?? []).map((point, index) => {
              const place = plan.position(point.lat, point.lon)
              if (!place) return null
              return (
                <span
                  key={`${point.categorie}-${index}`}
                  style={{
                    left: `${place.gauche}%`,
                    top: `${place.haut}%`,
                    backgroundColor: couleurCategorie(point.categorie),
                  }}
                  className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-[1.5px] ring-white/90"
                />
              )
            })}

            {/* Le bien, losange rouge cerné d'encre — même signalétique que sur
                la carte glissante. */}
            {plan.position(lat, lon) ? (
              <span
                style={{
                  left: `${plan.position(lat, lon).gauche}%`,
                  top: `${plan.position(lat, lon).haut}%`,
                }}
                className="absolute h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-[#3C3C3C] bg-barnes shadow-[0_0_0_2px_rgba(255,255,255,0.9)]"
              />
            ) : null}
          </div>
        ) : null}

        {/* Couche 3 — la carte glissante. Elle couvre les deux autres à l'écran
            et se retire de la feuille, sauf si l'image figée a échoué : mieux
            vaut alors son ancien défaut qu'un cadre blanc. */}
        <div
          ref={containerRef}
          className={`absolute inset-0 ${plan && statique ? 'print:hidden' : ''}`}
        />
      </div>

      {/* Légende et provenances sur la même ligne, sous la carte.
          Les attributions avaient leur paragraphe en pied de page ; sur une
          feuille A4 où chaque millimètre est disputé, deux lignes de mentions
          à cinq millimètres du bord valaient un cinquième de la hauteur de la
          carte. Elles disent la même chose ici, à côté de ce qu'elles
          attribuent. */}
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
        <Legende carte={carte} />
        <span className="font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
          {source ? `Relevé ${source} · ` : ''}Fond de plan{' '}
          {/* Les deux fonds diffèrent dans un seul cas : les dalles IGN sont
              tombées à l'écran (repli OpenStreetMap) mais le WMS, lui, a rendu
              son image. La feuille porte alors le plan IGN et l'écran non — et
              une attribution qui n'en nommerait qu'un serait fausse sur l'autre. */}
          {plan && statique && fond !== IGN_ATTRIBUTION
            ? `${fond} à l’écran, ${IGN_ATTRIBUTION} à l’impression`
            : fond}
        </span>
      </figcaption>
    </figure>
  )
}

/**
 * Légende — une pastille par catégorie, avec son décompte.
 *
 * Elle porte les mêmes chiffres que les sections du dessous, et c'est voulu :
 * la carte doit pouvoir se lire seule, sans que l'œil ait à redescendre chercher
 * à quoi correspond le bleu.
 */
function Legende({ carte }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {(carte?.legende ?? []).map((entree) => (
        <li key={entree.id} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            style={{ backgroundColor: couleurCategorie(entree.id) }}
            className="h-2 w-2 rounded-full ring-1 ring-white"
          />
          <span className="font-mono text-[0.55rem] uppercase tracking-micro text-marine/55">
            {entree.label}
            {entree.total > 0 ? ` · ${entree.total}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}
