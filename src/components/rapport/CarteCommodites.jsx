import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { IGN_ATTRIBUTION, PLAN_MAX_NATIVE_ZOOM, PLAN_TILE_URL } from '../../lib/ign'

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
 * un rapport imprimé sur une imprimante noir et blanc doit rester lisible, et
 * le marine, le doré et le corail s'y séparent par leur valeur autant que par
 * leur teinte.
 */
const COULEURS = {
  transports: '#12294A', // marine
  ecoles: '#B08D57', // brass
  commerces: '#D24B3E', // corail
}

/** Teinte des catégories qu'une évolution d'`poi.js` ajouterait sans passer ici. */
const COULEUR_PAR_DEFAUT = '#5A6478'

export const couleurCategorie = (id) => COULEURS[id] ?? COULEUR_PAR_DEFAUT

/** Hauteur de la carte, à l'écran comme sur la feuille. Voir `index.css`. */
const HAUTEUR = 250

/**
 * Cadrage : le disque interrogé, plus une marge.
 *
 * On cadre sur le rayon relevé plutôt que sur les points eux-mêmes. Un quartier
 * qui n'aurait qu'une école à 480 m ferait sinon une carte aussi large que
 * celle d'un centre-ville, et les deux ne se compareraient plus. Ici, toutes les
 * cartes du même rayon ont la même échelle.
 */
const MARGE_PX = 12

export function CarteCommodites({ carte }) {
  const containerRef = useRef(null)

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

    L.tileLayer(PLAN_TILE_URL, { maxNativeZoom: PLAN_MAX_NATIVE_ZOOM, maxZoom: 19 }).addTo(map)

    // Le disque parcouru, tracé avant les points pour rester sous eux.
    const disque = L.circle([lat, lon], {
      radius: rayonM ?? 500,
      color: '#12294A',
      weight: 1,
      opacity: 0.35,
      dashArray: '4 4',
      fillColor: '#12294A',
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

    // Le bien, posé en dernier : il passe devant tout le reste. Losange doré
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
          'background:#B08D57;border:2px solid #10141C;box-shadow:0 0 0 2px rgba(255,255,255,0.9)"></span>',
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

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

  return (
    <figure className="m-0">
      <div
        ref={containerRef}
        role="img"
        aria-label="Carte des commodités relevées autour du bien, par catégorie"
        style={{ height: `${HAUTEUR}px` }}
        className="rapport-carte w-full overflow-hidden rounded-lg border border-marine/12 bg-marine/[0.03]"
      />

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5">
        <Legende carte={carte} />
        <span className="font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
          Fond de plan {IGN_ATTRIBUTION}
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
