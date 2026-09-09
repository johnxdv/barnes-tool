import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2, TriangleAlert } from 'lucide-react'
import {
  IGN_ATTRIBUTION,
  ORTHO_MAX_NATIVE_ZOOM,
  ORTHO_TILE_URL,
  fetchBuildings,
} from '../../lib/ign'
import { BUILDINGS_RADIUS_M, boundingBox, footprintAreaM2 } from '../../lib/geo'
import { useMediaQuery } from '../../lib/useMediaQuery'

// Zoom d'ouverture : à ce niveau l'orthophoto est à sa résolution native (~20 cm
// par pixel) et un bâtiment isolé tient dans la carte — échelle de la parcelle,
// pas du quartier. Le plancher garde la vue à l'intérieur de la zone dont les
// bâtiments ont été chargés ; le plafond autorise un agrandissement au-delà de
// la dalle native, que Leaflet obtient en étirant celle du niveau 19.
const INITIAL_ZOOM = 19
const MIN_ZOOM = 18
const MAX_ZOOM = 20

// Teintes du liseré doré de la charte : Brass au repos, or clair pour la mise
// en avant. Aucune couleur hors palette.
const RESTING_STYLE = {
  color: '#F5E3BC',
  weight: 1,
  opacity: 0.5,
  fillColor: '#B08D57',
  fillOpacity: 0.08,
}

const HOVER_STYLE = {
  color: '#F5E3BC',
  weight: 2,
  opacity: 0.95,
  fillColor: '#E8C88A',
  fillOpacity: 0.32,
}

const ACTIVE_STYLE = {
  color: '#F5E3BC',
  weight: 3,
  opacity: 1,
  fillColor: '#F5E3BC',
  fillOpacity: 0.48,
}

/**
 * Emprise des dalles orthophoto : métropole et DROM, rien au-delà. La
 * Principauté y figure — l'IGN photographie la bande frontalière, et Monaco
 * tient tout entier dedans : le parcours monégasque partage donc ce fond.
 */
const ORTHO_COVERAGE = L.latLngBounds([-22.5, -63.5], [51.5, 56])

const featureIdOf = (layer) => layer?.feature?.id ?? null

/**
 * Carte satellite IGN centrée sur l'adresse, emprises bâties cliquables
 * par-dessus.
 *
 * `selection` est piloté par le parent (`{ kind: 'batiment' | 'point', … }` ou
 * `null`) : la carte ne décide pas de la suite du parcours, elle remonte le
 * choix via `onSelect` et se contente de refléter l'état reçu — annuler côté
 * parent la remet donc en état de survol.
 *
 * Leaflet est piloté impérativement plutôt que re-rendu : survoler un bâtiment
 * ne doit ni déclencher un rendu React ni reconstruire la couche vecteur.
 */
export function BuildingMap({ lat, lon, addressLabel, selection, onSelect }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const buildingsLayerRef = useRef(null)
  const fallbackMarkerRef = useRef(null)

  const [tilesReady, setTilesReady] = useState(false)
  // 'loading' | 'ready' | 'empty' | 'error'
  const [buildingsStatus, setBuildingsStatus] = useState('loading')
  const [buildings, setBuildings] = useState(null)
  const [armedId, setArmedId] = useState(null)

  // Sans survol (tactile), un premier appui présélectionne et un second
  // confirme : sur ces écrans le clic est le seul geste disponible, il ne peut
  // pas à la fois désigner et valider.
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)')

  const selectedBuildingId = selection?.kind === 'batiment' ? selection.id : null
  const highlightedId = selectedBuildingId ?? armedId

  // Le repli ne s'ouvre que si les emprises manquent : tant qu'elles sont là,
  // un clic dans le vide ne doit rien valider par mégarde.
  const fallbackEnabled = buildingsStatus === 'empty' || buildingsStatus === 'error'

  // Miroirs des valeurs lues depuis les gestionnaires Leaflet : ceux-ci vivent
  // plus longtemps qu'un rendu et captureraient sinon des valeurs périmées.
  const onSelectRef = useRef(onSelect)
  const canHoverRef = useRef(canHover)
  const highlightedIdRef = useRef(highlightedId)
  const armedIdRef = useRef(armedId)
  const fallbackEnabledRef = useRef(fallbackEnabled)

  useEffect(() => {
    onSelectRef.current = onSelect
    canHoverRef.current = canHover
    highlightedIdRef.current = highlightedId
    armedIdRef.current = armedId
    fallbackEnabledRef.current = fallbackEnabled
  })

  // --- Carte + fond orthophoto --------------------------------------------
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined

    const box = boundingBox(lat, lon, BUILDINGS_RADIUS_M)
    const map = L.map(container, {
      center: [lat, lon],
      zoom: INITIAL_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      attributionControl: false,
      // Le déplacement reste dans la zone dont les bâtiments ont été chargés :
      // au-delà, la carte montrerait un bâti absent, donc non sélectionnable.
      maxBounds: L.latLngBounds([box.south, box.west], [box.north, box.east]),
      maxBoundsViscosity: 1,
    })

    L.tileLayer(ORTHO_TILE_URL, {
      maxNativeZoom: ORTHO_MAX_NATIVE_ZOOM,
      maxZoom: MAX_ZOOM,
      bounds: ORTHO_COVERAGE,
    })
      .on('load', () => setTilesReady(true))
      .addTo(map)

    // Repère de l'adresse géocodée — non interactif : il oriente sans capter le clic.
    L.circleMarker([lat, lon], {
      radius: 5,
      color: '#10141C',
      weight: 2,
      fillColor: '#B08D57',
      fillOpacity: 1,
      interactive: false,
    }).addTo(map)

    map.on('click', (event) => {
      if (fallbackEnabledRef.current) {
        onSelectRef.current?.({ kind: 'point', lat: event.latlng.lat, lon: event.latlng.lng })
        return
      }
      // Tap ailleurs pendant qu'un bâtiment clignote (tactile) : l'utilisateur
      // change d'avis, on désarme sans rien sélectionner.
      if (armedIdRef.current !== null) setArmedId(null)
    })

    mapRef.current = map

    // La carte est montée pendant la transition d'étape, et Leaflet ne mesure
    // son conteneur qu'à l'initialisation : il faut le relancer une fois la
    // mise en page stabilisée, puis à chaque changement de gabarit (points de
    // rupture, rotation de l'écran).
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)

    return () => {
      observer.disconnect()
      map.remove()
      mapRef.current = null
      buildingsLayerRef.current = null
      fallbackMarkerRef.current = null
    }
  }, [lat, lon])

  // --- Emprises bâties -----------------------------------------------------
  useEffect(() => {
    const controller = new AbortController()

    setBuildingsStatus('loading')
    setBuildings(null)

    fetchBuildings(lat, lon, { signal: controller.signal })
      .then((collection) => {
        setBuildings(collection)
        setBuildingsStatus(collection.features.length > 0 ? 'ready' : 'empty')
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setBuildings(null)
        setBuildingsStatus('error')
      })

    return () => controller.abort()
  }, [lat, lon])

  // --- Couche vecteur cliquable -------------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map || !buildings) return undefined

    // Le point remonté sert à retrouver la parcelle cadastrale : on préfère
    // l'endroit réellement cliqué, toujours dans le polygone, au centre de sa
    // boîte englobante — qui tombe hors des bâtiments en L. Au clavier, il n'y
    // a pas de point de clic : le centre fait alors l'affaire.
    const commit = (feature, featureLayer, latlng) => {
      const point = latlng ?? featureLayer.getBounds().getCenter()

      onSelectRef.current?.({
        kind: 'batiment',
        id: feature.id,
        properties: feature.properties ?? {},
        lat: point.lat,
        lon: point.lng,
        areaM2: footprintAreaM2(feature.geometry),
      })
    }

    // Le survol ne doit pas écraser une mise en avant déjà décidée
    // (présélection tactile ou bâtiment confirmé).
    const isIdle = () => highlightedIdRef.current === null

    const layer = L.geoJSON(buildings, {
      style: () => RESTING_STYLE,
      // Sans cela le clic sur un bâtiment remonterait aussi à la carte et
      // déclencherait le repli en plus de la sélection.
      bubblingMouseEvents: false,
      onEachFeature: (feature, featureLayer) => {
        featureLayer.on({
          mouseover: () => {
            if (canHoverRef.current && isIdle()) featureLayer.setStyle(HOVER_STYLE)
          },
          mouseout: () => {
            if (canHoverRef.current && isIdle()) featureLayer.setStyle(RESTING_STYLE)
          },
          click: (event) => {
            // Souris (survol disponible) : comportement d'origine — le clic
            // vaut confirmation immédiate, sans étape intermédiaire.
            if (canHoverRef.current) {
              commit(feature, featureLayer, event.latlng)
              return
            }
            // Tactile : premier appui armement (clignotement), second appui sur
            // le même bâtiment confirmation. Taper un autre bâtiment pendant
            // qu'un premier clignote le réarme sur celui-ci.
            if (armedIdRef.current === feature.id) {
              commit(feature, featureLayer, event.latlng)
              return
            }
            setArmedId(feature.id)
          },
          keydown: (event) => {
            const key = event.originalEvent?.key
            if (key !== 'Enter' && key !== ' ') return
            event.originalEvent.preventDefault()
            commit(feature, featureLayer, null)
          },
        })
      },
    })

    layer.addTo(map)
    buildingsLayerRef.current = layer

    // Les polygones sont des `<path>` SVG : Leaflet ne les rend ni focusables
    // ni annonçables, on complète nous-mêmes le contrat « bouton ». `focus` et
    // `blur` ne se propagent pas et ne figurent pas parmi les événements que
    // Leaflet relaie aux couches — ils sont donc écoutés nativement.
    const total = buildings.features.length
    const cleanups = []
    let index = 0

    layer.eachLayer((featureLayer) => {
      index += 1
      const path = featureLayer.getElement?.()
      if (!path) return

      path.setAttribute('tabindex', '0')
      path.setAttribute('role', 'button')
      path.setAttribute('aria-label', `Sélectionner le bâtiment ${index} sur ${total}`)

      // Focus clavier : même mise en avant que le survol, pour que la
      // tabulation reste lisible sur une photo aérienne.
      const onFocus = () => {
        if (isIdle()) featureLayer.setStyle(HOVER_STYLE)
      }
      const onBlur = () => {
        if (isIdle()) featureLayer.setStyle(RESTING_STYLE)
      }

      path.addEventListener('focus', onFocus)
      path.addEventListener('blur', onBlur)
      cleanups.push(() => {
        path.removeEventListener('focus', onFocus)
        path.removeEventListener('blur', onBlur)
      })
    })

    return () => {
      cleanups.forEach((off) => off())
      layer.remove()
      buildingsLayerRef.current = null
    }
  }, [buildings])

  // --- Reflet de l'état sélectionné sur la couche --------------------------
  useEffect(() => {
    const layer = buildingsLayerRef.current
    if (!layer) return

    layer.eachLayer((featureLayer) => {
      const active = featureIdOf(featureLayer) === highlightedId
      featureLayer.setStyle(active ? ACTIVE_STYLE : RESTING_STYLE)
      if (active) featureLayer.bringToFront()
    })
  }, [highlightedId, buildings])

  // --- Clignotement du bâtiment armé, en attente de confirmation ----------
  // Tant que la sélection n'est pas commitée, le bâtiment tout juste cliqué
  // clignote pour signaler qu'un second geste est attendu. Le clignotement
  // s'arrête dès que la sélection est actée (la fenêtre de confirmation prend
  // alors le relais) ou désarmée.
  useEffect(() => {
    const layer = buildingsLayerRef.current
    if (!layer) return

    layer.eachLayer((featureLayer) => {
      const path = featureLayer.getElement?.()
      if (!path) return
      const isArmed = selection === null && featureIdOf(featureLayer) === armedId
      path.classList.toggle('animate-building-blink', isArmed)
    })
  }, [armedId, selection, buildings])

  // Annulation côté parent : la présélection tactile doit retomber avec elle.
  useEffect(() => {
    if (selection === null) setArmedId(null)
  }, [selection])

  // --- Repère du repli « point libre » ------------------------------------
  useEffect(() => {
    const map = mapRef.current
    if (!map) return undefined

    fallbackMarkerRef.current?.remove()
    fallbackMarkerRef.current = null

    if (selection?.kind !== 'point') return undefined

    fallbackMarkerRef.current = L.circleMarker([selection.lat, selection.lon], {
      radius: 9,
      color: '#F5E3BC',
      weight: 3,
      fillColor: '#B08D57',
      fillOpacity: 0.65,
      interactive: false,
    }).addTo(map)

    return undefined
  }, [selection])

  // Affiché uniquement sur tactile : à la souris le clic confirme d'emblée,
  // `armedId` n'y est donc jamais posé.
  const showArmedHint = armedId !== null && selection === null

  return (
    <div className="relative overflow-hidden rounded-2xl border border-ink/10 bg-ink shadow-[0_22px_54px_-18px_rgba(16,20,28,0.45)]">
      {/* `relative z-0` isole la pile d'empilement de Leaflet : ses panneaux
          internes (jusqu'à z-index 1000 pour les contrôles) restent ainsi sous
          les calques posés au-dessus de la carte, voile de confirmation compris. */}
      <div
        ref={containerRef}
        role="application"
        aria-label={`Vue satellite de ${addressLabel}. Sélectionnez le bâtiment concerné.`}
        className="relative z-0 h-[62vh] max-h-[560px] min-h-[340px] w-full sm:h-[480px]"
      />

      {/* Chargement du fond : voile plein plutôt qu'un damier gris en formation. */}
      {!tilesReady ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-ink">
          <span className="inline-flex items-center gap-3 font-mono text-[0.62rem] uppercase tracking-micro text-stone/60">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
            Chargement de la vue satellite
          </span>
        </div>
      ) : null}

      {/* État des emprises : bandeau haut, discret, jamais bloquant. */}
      {tilesReady && buildingsStatus === 'loading' ? (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center gap-2.5 bg-ink/75 px-4 py-2.5 font-mono text-[0.6rem] uppercase tracking-micro text-stone/75 backdrop-blur-sm"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden="true" />
          Chargement des bâtiments
        </p>
      ) : null}

      {tilesReady && fallbackEnabled ? (
        <p
          role="status"
          className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-center gap-2.5 bg-ink/80 px-4 py-2.5 text-center text-[0.72rem] leading-relaxed text-stone/80 backdrop-blur-sm sm:text-xs"
        >
          <TriangleAlert
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brass"
            strokeWidth={2}
            aria-hidden="true"
          />
          {buildingsStatus === 'empty'
            ? 'Aucun contour de bâtiment n’est disponible ici. Désignez directement l’emplacement de votre bien sur la photo.'
            : 'Les contours de bâtiments sont momentanément indisponibles. Désignez directement l’emplacement de votre bien sur la photo.'}
        </p>
      ) : null}

      {/* Bâtiment armé : rappel du second geste attendu. Pastille centrée
          plutôt qu'un bandeau plein largeur — celui-ci recouvrait autrefois
          l'attribution posée en bas à droite, les deux textes se
          superposant. */}
      {showArmedHint ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-4">
          <p
            role="status"
            className="inline-flex items-center gap-2 rounded-full bg-ink/80 px-4 py-2 text-center font-mono text-[0.6rem] uppercase tracking-micro text-brass shadow-lg shadow-ink/30 backdrop-blur-sm"
          >
            Appuyez à nouveau pour confirmer
          </p>
        </div>
      ) : null}

      {/* Attribution — obligation de la licence ouverte Etalab pour le fond
          orthophoto et les contours BD TOPO®. */}
      <p className="pointer-events-none absolute bottom-2 right-2 rounded-md bg-ink/55 px-2 py-1 font-mono text-[0.55rem] uppercase tracking-[0.12em] text-stone/55 backdrop-blur-sm">
        {IGN_ATTRIBUTION}
      </p>
    </div>
  )
}
