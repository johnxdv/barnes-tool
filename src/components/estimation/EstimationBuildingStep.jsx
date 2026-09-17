import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, MapPin } from 'lucide-react'
// Leaflet et la carte ne servent qu'ici : les charger à la demande évite
// d'alourdir de ~150 ko toutes les autres pages du site. Le module est
// préchargé dès l'étape adresse (voir la page Estimer), si bien que le repli
// ci-dessous n'apparaît qu'en cas de réseau très lent.
const BuildingMap = lazy(() =>
  import('./BuildingMap').then((module) => ({ default: module.BuildingMap })),
)
import { detectPropertyType } from '../../lib/typeBien'

/**
 * Délai au-delà duquel un repérage part sans attendre la détection du type.
 *
 * Le type du bien est une commodité, pas une condition : le moteur
 * d'estimation sait le retrouver lui-même, et rien ne justifie d'immobiliser le
 * parcours sur une réponse qui tarde.
 *
 * Ce minuteur portait naguère le nom du cadastre, et c'était le dire deux fois
 * faux. La détection enchaîne deux appels de vitesses sans rapport : l'API
 * Carto rend la parcelle en 100 à 300 ms — mesuré sur Paris, Marseille, Nice,
 * Aix, Cassis, Lourmarin : jamais au-delà —, puis la BDNB rend les fiches du
 * bâtiment en 0,8 à 10 s. Le minuteur ne coupait donc jamais le cadastre : il
 * coupait la BDNB, une fois sur deux, et emportait au passage une parcelle
 * acquise depuis dix fois le temps qu'il mesure. D'où deux champs vides dans le
 * rapport — parcelle et contenance cadastrales — pour une source qui avait
 * répondu, et répondu vite.
 *
 * La parcelle ne dépend donc plus de lui : elle arrive par `onParcelle` (voir
 * `detectPropertyType`) dès que le cadastre a parlé, et le minuteur ne décide
 * plus que du type.
 */
const ATTENTE_DETECTION_MS = 2500

/**
 * Étape 3 — repérage du bien sur la photo aérienne.
 *
 * Le clic sur la carte est le dernier geste de l'étape : bâtiment ou repérage
 * libre, l'écran d'analyse s'enchaîne directement, sans fenêtre intermédiaire.
 * Plus rien n'est demandé ici — surtout pas la surface habitable, qui se règle
 * désormais au formulaire de caractéristiques, après l'analyse
 * (`EstimationCharacteristicsStep`).
 *
 * La détection du type (cadastre puis BDNB) part au même instant et se joue
 * derrière l'animation d'analyse plutôt qu'après elle ; on attend seulement sa
 * réponse — ou `ATTENTE_DETECTION_MS` — avant de basculer, pour transmettre au
 * moteur la parcelle et la fiche déjà obtenues.
 *
 * Rien de tout cela ne transparaît à l'écran : `onEstimate` remonte la
 * sélection enrichie du type, de sa confiance, de la parcelle et de la fiche,
 * sans que l'utilisateur ait eu à s'en préoccuper.
 */
export function EstimationBuildingStep({ address, onBack, onEstimate, onProgress }) {
  const [selection, setSelection] = useState(null)
  // Résultat complet de la détection, et pas seulement le type : la parcelle
  // cadastrale et la fiche BDNB obtenues au passage évitent au moteur
  // d'estimation de refaire la même chaîne d'appels quelques secondes plus tard.
  const [detection, setDetection] = useState(null)
  // La parcelle, dès que le cadastre a répondu et sans attendre le reste de la
  // détection. Dans une `ref` et non dans un état : rien ne l'affiche, et un
  // rendu de plus relancerait le minuteur ci-dessous au moment même où elle
  // arrive — le repérage attendrait alors 2,5 s de plus pour rien.
  const parcelleTot = useRef(null)

  // Changer d'adresse (retour puis nouvelle saisie) doit repartir d'une carte vierge.
  useEffect(() => {
    setSelection(null)
  }, [address.id, address.lat, address.lon])

  // Avancement local remonté à la barre globale : la moitié dès qu'un bien est
  // sélectionné et en route vers l'analyse, le reste n'arrive qu'au passage à
  // l'étape suivante.
  useEffect(() => {
    onProgress?.(selection ? 0.5 : 0)
  }, [selection, onProgress])

  // Détection du type : relancée à chaque nouvelle sélection, annulée si
  // l'utilisateur en choisit une autre avant la réponse. Rien n'en transparaît
  // à l'écran — ni attente, ni résultat.
  useEffect(() => {
    // Remise à zéro à chaque changement de sélection : sans elle, la détection
    // du bâtiment précédent resterait valide le temps que la nouvelle
    // aboutisse, et pourrait partir au calcul à la place de la bonne.
    setDetection(null)
    parcelleTot.current = null
    if (!selection) return undefined

    const controller = new AbortController()

    detectPropertyType(selection, {
      signal: controller.signal,
      onParcelle: (parcelle) => {
        parcelleTot.current = parcelle
      },
    })
      .then(setDetection)
      .catch((error) => {
        if (error.name === 'AbortError') return
        // La chaîne ne lève qu'en cas d'annulation ; ce repli couvre l'imprévu.
        setDetection(null)
      })

    return () => controller.abort()
  }, [selection])

  // La détection peut n'avoir pas abouti quand on bascule : l'écran suivant ne
  // doit donc rien prendre pour acquis — le moteur d'estimation sait retrouver
  // lui-même ce qui lui manque.
  //
  // `surfaceM2` part systématiquement à `null` : plus personne ne la déclare à
  // ce stade. Le moteur la reconstitue de son côté (BDNB, cadastre, emprise),
  // et le formulaire de caractéristiques la reprendra plus tard, au curseur.
  const startEstimate = useCallback(() => {
    onEstimate?.({
      ...selection,
      surfaceM2: null,
      type: detection?.type ?? null,
      // La confiance accompagne le type jusqu'au moteur, qui la renvoie ensuite
      // au formulaire de caractéristiques : elle seule y décide si le type est
      // repris tel quel ou redemandé. Un type détecté au jugé sert au calcul
      // sans avoir à être montré ; un type lu dans une base peut, lui, tenir
      // lieu de réponse.
      typeConfiance: detection?.confiance ?? null,
      // La parcelle du cadastre, que la détection ait abouti ou non : c'est
      // elle qui porte les deux champs cadastraux du rapport, et elle n'a
      // aucune raison de tomber avec une BDNB lente. Les deux valeurs sont le
      // même objet quand la détection a eu le temps de finir.
      parcelle: detection?.parcelle ?? parcelleTot.current ?? null,
      fiche: detection?.fiche ?? null,
    })
  }, [onEstimate, selection, detection])

  // Aucune fenêtre, aucune question : le clic sur la carte suffit. On attend
  // seulement que la détection ait abouti pour transmettre type et fiche au
  // moteur, ce qui lui épargne d'aller les chercher ; passé le délai, on part
  // sans, et il s'en charge. La parcelle, elle, ne se perd plus dans cette
  // attente — voir `ATTENTE_DETECTION_MS`.
  useEffect(() => {
    if (!selection) return undefined

    if (detection) {
      startEstimate()
      return undefined
    }

    const timer = setTimeout(startEstimate, ATTENTE_DETECTION_MS)
    return () => clearTimeout(timer)
  }, [selection, detection, startEstimate])

  return (
    <div className="w-full max-w-3xl">
      <button
        type="button"
        onClick={onBack}
        className="group mb-8 inline-flex touch-manipulation items-center gap-2 font-mono text-[0.68rem] uppercase tracking-micro text-ink/45 transition-colors hover:text-ink"
      >
        <ArrowLeft
          className="h-4 w-4 transition-transform duration-300 ease-plan group-hover:-translate-x-1"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        Modifier l’adresse
      </button>

      <h1 className="text-center font-display text-[1.6rem] font-semibold leading-tight text-ink sm:text-[2rem]">
        Cliquez sur le bien.
      </h1>
      <p className="mx-auto mt-4 max-w-md text-center text-[0.95rem] leading-relaxed text-ink/55">
        Sur la vue aérienne, sélectionnez le bâtiment concerné.
      </p>

      {/* Rappel de l'adresse : l'utilisateur n'a rien validé explicitement pour
          arriver ici, il doit pouvoir vérifier d'un coup d'œil où il a atterri. */}
      <p className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2.5 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-center text-[0.8rem] leading-snug text-ink/70 sm:text-sm">
        <MapPin className="h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden="true" />
        {address.label}
      </p>

      <div className="mt-6">
        <Suspense fallback={<MapPlaceholder />}>
          <BuildingMap
            lat={address.lat}
            lon={address.lon}
            addressLabel={address.label}
            selection={selection}
            onSelect={setSelection}
          />
        </Suspense>
      </div>
    </div>
  )
}

/**
 * Cadre d'attente du module carte — mêmes dimensions et même habillage que
 * `BuildingMap`, pour que la mise en page ne bouge pas à son arrivée.
 */
function MapPlaceholder() {
  return (
    <div className="flex h-[62vh] max-h-[560px] min-h-[340px] w-full items-center justify-center overflow-hidden rounded-2xl border border-ink/10 bg-ink shadow-[0_22px_54px_-18px_rgba(60,60,60,0.45)] sm:h-[480px]">
      <span
        role="status"
        className="inline-flex items-center gap-3 font-mono text-[0.62rem] uppercase tracking-micro text-stone/60"
      >
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden="true" />
        Chargement de la vue satellite
      </span>
    </div>
  )
}
