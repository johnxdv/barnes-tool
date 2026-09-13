import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { IGN_ATTRIBUTION, PLAN_MAX_NATIVE_ZOOM, PLAN_TILE_URL } from '../../lib/ign'

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
 * L'impression, justement, est le point délicat : Leaflet compose ses tuiles
 * pour la taille du conteneur à l'écran, et la feuille A4 est plus étroite
 * (~673 px contre ~744 px). Sans rien faire, la carte s'imprimerait rognée à
 * droite. `matchMedia('print')` prévient du basculement, et l'on recadre alors
 * — c'est le seul moment où la carte bouge. Les dalles, elles, sont déjà
 * chargées : le rapport a été lu avant d'être imprimé.
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
      map.invalidateSize({ animate: false })
      map.fitBounds(disque.getBounds(), { padding: [MARGE_PX, MARGE_PX], animate: false })
    }

    cadrer()

    // Leaflet ne mesure son conteneur qu'à l'initialisation, et la page du
    // rapport se pose pendant une transition d'étape : on recadre une fois la
    // mise en page stabilisée, puis à chaque changement de gabarit.
    const observer = new ResizeObserver(cadrer)
    observer.observe(container)

    // Bascule vers la feuille : la largeur utile passe de ~744 à ~673 px, et la
    // carte s'imprimerait rognée sans ce recadrage. `matchMedia` prévient avant
    // que le navigateur compose l'aperçu ; `beforeprint` double la mise pour
    // les navigateurs qui ne relaient pas le premier.
    const media = window.matchMedia('print')
    const surImpression = () => cadrer()
    media.addEventListener?.('change', surImpression)
    window.addEventListener('beforeprint', surImpression)
    window.addEventListener('afterprint', surImpression)

    return () => {
      observer.disconnect()
      media.removeEventListener?.('change', surImpression)
      window.removeEventListener('beforeprint', surImpression)
      window.removeEventListener('afterprint', surImpression)
      map.remove()
    }
    // `signature` tient lieu de `carte.points` dans les dépendances : la liste
    // est reconstruite à chaque rendu du modèle, son identité ne dit donc rien
    // de son contenu.
  }, [lat, lon, rayonM, signature])

  // Seul un centre manquant empêche la carte : un relevé sans un point en
  // produit une valide — le bien, son disque de recherche, et les rues autour.
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return (
    <figure className="m-0">
      <div
        ref={containerRef}
        role="img"
        aria-label="Carte des commodités relevées autour du bien, par catégorie"
        style={{ height: `${HAUTEUR}px`, maxWidth: LARGEUR_MAX }}
        className="rapport-carte mx-auto w-full overflow-hidden rounded-lg border border-marine/12 bg-marine/[0.03]"
      />

      {/* Légende et provenances sur la même ligne, sous la carte.
          Les attributions avaient leur paragraphe en pied de page ; sur une
          feuille A4 où chaque millimètre est disputé, deux lignes de mentions
          à cinq millimètres du bord valaient un cinquième de la hauteur de la
          carte. Elles disent la même chose ici, à côté de ce qu'elles
          attribuent. */}
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-5 gap-y-1">
        <Legende carte={carte} />
        <span className="font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
          {source ? `Relevé ${source} · ` : ''}Fond de plan {fond}
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
