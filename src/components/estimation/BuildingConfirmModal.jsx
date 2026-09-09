import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Check, Minus, Plus } from 'lucide-react'
import { GoldFrame, Shine } from '../ui/GoldFrame'
import { HouseIllustration } from './HouseIllustration'
import { PriceReveal } from './PriceReveal'
import { formatEuros } from '../../lib/format'
import { fetchPrixM2 } from '../../lib/prixSecteur'
import { MONACO_PRICE_PER_M2 } from '../../lib/monaco'
import { EASE } from '../../lib/motion'

/** Éléments focusables du panneau, pour le maintien du focus à l'intérieur. */
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Bornes du curseur. Le pas de 5 m² tient l'échelle entière en 159 crans :
 * assez fin pour qu'on tombe sur sa surface, assez large pour que la valeur
 * ne tremble pas sous le doigt.
 *
 * La borne haute est un plafond d'affichage, pas une limite du parc : au-delà,
 * le curseur reste en butée et la valeur s'écrit « 800+ ».
 */
const SURFACE_MIN = 10
const SURFACE_MAX = 800
const SURFACE_STEP = 5

/**
 * Pas des boutons « − » et « + », en m².
 *
 * Le glissement garde son pas de 5 : c'est ce qui l'empêche de trembler sous
 * le doigt. Les boutons, eux, visent l'ajustement final — 5 m² d'écart sur un
 * deux-pièces, ce n'est pas rien. Les deux gestes ne s'excluent pas : on
 * traverse l'échelle au curseur, puis on affine au bouton.
 */
const SURFACE_FINE_STEP = 1

/** Ramène une valeur quelconque à un entier de m² dans les bornes du curseur. */
const clampSurface = (value) =>
  Math.min(Math.max(Math.round(value), SURFACE_MIN), SURFACE_MAX)

/**
 * Types proposés en Principauté, faute de cadastre où lire la réponse. Deux
 * suffisent : le curseur ne recueille qu'une surface habitable, un terrain nu
 * n'aurait rien à y déclarer.
 */
const MONACO_TYPES = [
  { id: 'appartement', label: 'Appartement' },
  { id: 'maison', label: 'Maison / villa' },
]

/**
 * Valeur d'ouverture. Volontairement médiane : ouvrir à 10 m² obligerait tout
 * le monde à traverser l'échelle, et laisserait croire que le parcours part du
 * plus petit. 100 m² est l'ordre de grandeur d'une maison française.
 */
const SURFACE_DEFAULT = 100

/**
 * Le montant d'aperçu est arrondi au millier, comme celui du moteur : un ordre
 * de grandeur affiché à l'euro près afficherait une précision qu'il n'a pas.
 */
const roundPrice = (value) => Math.round(value / 1000) * 1000

/**
 * Fenêtre de saisie de la surface habitable.
 *
 * Vraie fenêtre modale, et non un calque posé sur la carte : le fond assombri
 * et flouté couvre toute la page, le panneau s'ouvre au centre de l'écran.
 *
 * Le positionnement `fixed` fonctionne ici sans portail parce que Framer Motion
 * laisse `transform: none` sur l'étape au repos. Pendant la transition vers
 * l'écran suivant, l'étape reprend un `transform` et la fenêtre glisse alors
 * avec la page — exactement l'enchaînement recherché.
 *
 * En France, elle n'est ouverte que pour un bâtiment : un terrain n'a pas de
 * surface habitable à déclarer, sa contenance cadastrale est déjà connue et
 * l'étape suivante s'enchaîne sans rien demander (voir
 * `EstimationBuildingStep`). En Principauté, où aucune contenance n'est
 * publiée, elle s'ouvre pour tout repérage — le curseur y est la seule source
 * de surface (voir `EstimationMonacoStep`).
 *
 * Le type de bien détecté n'est volontairement pas affiché : la détection tourne
 * en arrière-plan pour le futur calcul d'estimation, elle n'a rien à dire à
 * l'utilisateur à ce stade.
 *
 * `monaco` bascule la fenêtre dans sa variante monégasque : le prix au m² n'est
 * plus demandé au réseau mais lu dans une constante, et le type de bien — que
 * plus aucune base ne peut deviner — est demandé à l'utilisateur en tête de
 * panneau. `onEstimate` reçoit alors ce type en second argument ; il vaut
 * `null` dans le parcours français, où la détection s'en charge.
 */
export function BuildingConfirmModal({ selection, onClose, onEstimate, monaco = false }) {
  const panelRef = useRef(null)
  const reduce = useReducedMotion()

  const [surface, setSurface] = useState(SURFACE_DEFAULT)

  // Type déclaré, en Principauté uniquement. L'appartement par défaut : c'est
  // l'essentiel du parc monégasque, et le choix reste à un clic.
  const [monacoType, setMonacoType] = useState(MONACO_TYPES[0].id)

  // Prix indicatif au m² du secteur, demandé une seule fois à l'ouverture.
  // Tout le reste — le montant qui suit le curseur — se calcule ici même, sans
  // repasser par le réseau : un appel par mouvement de doigt saturerait la
  // liaison pour un chiffre qui n'est de toute façon qu'un aperçu.
  //
  // À Monaco, il n'y a rien à demander : aucune base de mutations n'y est
  // publiée, la constante de référence est tout ce dont on dispose — et elle
  // sert aussi bien à l'aperçu qu'au calcul final (voir `src/lib/monaco.js`).
  const [pricePerM2, setPricePerM2] = useState(monaco ? MONACO_PRICE_PER_M2 : null)

  useEffect(() => {
    if (monaco) return undefined

    const controller = new AbortController()

    fetchPrixM2(selection, { signal: controller.signal })
      .then(setPricePerM2)
      .catch(() => {
        // Annulation à la fermeture : il n'y a plus rien à afficher.
      })

    return () => controller.abort()
  }, [selection, monaco])

  // Fermeture au clavier + maintien du focus dans la fenêtre, sans quoi la
  // tabulation repartirait dans la navigation, derrière le fond assombri.
  useEffect(() => {
    const previouslyFocused = document.activeElement
    panelRef.current?.focus()

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const targets = panelRef.current?.querySelectorAll(FOCUSABLE)
      if (!targets?.length) return

      const first = targets[0]
      const last = targets[targets.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  // Blocage du défilement de la page. La largeur de l'ascenseur est compensée :
  // sans cela, le contenu du fond saute latéralement à l'ouverture, et le
  // décalage se voit d'autant plus que ce fond reste visible sous le flou.
  useEffect(() => {
    const { body, documentElement } = document
    const scrollbar = window.innerWidth - documentElement.clientWidth
    const previousOverflow = body.style.overflow
    const previousPadding = body.style.paddingRight

    body.style.overflow = 'hidden'
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`

    return () => {
      body.style.overflow = previousOverflow
      body.style.paddingRight = previousPadding
    }
  }, [])

  const atMin = surface <= SURFACE_MIN
  const atMax = surface >= SURFACE_MAX
  const surfaceLabel = `${atMax ? `${SURFACE_MAX}+` : surface} m²`
  const formatted = pricePerM2 ? formatEuros(roundPrice(pricePerM2 * surface)) : null

  // Part remplie de la piste, passée au CSS : un `input[type=range]` ne colore
  // pas son parcours de lui-même sur les moteurs WebKit. Elle suit la valeur
  // réelle, au m² près — pas la position crantée de la pastille.
  const fill = ((surface - SURFACE_MIN) / (SURFACE_MAX - SURFACE_MIN)) * 100

  // Le curseur, lui, garde son pas de 5 : un `input[type=range]` recale de
  // toute façon toute valeur hors cran, et la pastille se figerait entre deux
  // clics de bouton. On lui donne donc la valeur crantée la plus proche — au
  // pire 2 m² d'écart, soit un quart de pixel sur la piste — pendant que le
  // chiffre affiché, l'illustration et le montant suivent la valeur exacte.
  // `SURFACE_MIN` et `SURFACE_MAX` étant tous deux multiples du pas, l'arrondi
  // ne peut pas sortir des bornes.
  const sliderValue = Math.round(surface / SURFACE_STEP) * SURFACE_STEP

  const adjust = (delta) => setSurface((current) => clampSurface(current + delta))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.28, ease: EASE }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-ink/45 px-5 py-10 backdrop-blur-md"
    >
      {/* Le fond ferme la fenêtre ; le panneau, posé au-dessus, retient le clic. */}
      <button
        type="button"
        aria-label="Fermer"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default"
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="surface-habitable-titre"
        tabIndex={-1}
        initial={{ opacity: 0, y: reduce ? 0 : 16, scale: reduce ? 1 : 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduce ? 0 : 8, scale: reduce ? 1 : 0.98 }}
        transition={{ duration: reduce ? 0.15 : 0.34, ease: EASE }}
        className="relative my-auto w-full max-w-sm outline-none"
      >
        <GoldFrame className="-inset-[2px] rounded-[1.05rem]" spin="animate-border-spin-slow" />

        <div className="relative rounded-2xl border border-ink/10 bg-white px-6 py-8 text-center shadow-[0_28px_64px_-18px_rgba(16,20,28,0.55)] sm:px-8">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-bottle shadow-lg shadow-bottle/25">
            <Check className="h-8 w-8 text-white" strokeWidth={2.25} aria-hidden="true" />
          </span>

          <h2
            id="surface-habitable-titre"
            className="mt-5 font-display text-[1.75rem] font-semibold leading-tight text-ink sm:text-[2.1rem]"
          >
            Votre surface habitable
          </h2>

          {/* Choix du type, en Principauté seulement : le cadastre s'arrête à
              la frontière, il n'y a personne pour répondre à notre place. */}
          {monaco ? (
            <fieldset className="mx-auto mt-5 max-w-[17rem]">
              <legend className="sr-only">Type de bien</legend>
              <div className="flex gap-1.5 rounded-xl border border-ink/10 bg-stone/60 p-1.5">
                {MONACO_TYPES.map(({ id, label }) => {
                  const active = monacoType === id
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setMonacoType(id)}
                      className={[
                        'flex-1 touch-manipulation rounded-lg px-3 py-2.5 font-mono text-[0.64rem] uppercase tracking-micro transition-colors duration-300 ease-plan',
                        active
                          ? 'bg-ink text-white shadow-sm shadow-ink/20'
                          : 'text-ink/50 hover:text-ink',
                      ].join(' ')}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          ) : null}

          <PricePreview formatted={formatted} surface={surface} />

          {/* Valeur en cours, au-dessus du curseur : elle suit le doigt sans
              attendre le relâchement. `tabular-nums` fige la largeur des
              chiffres — sans quoi le nombre danserait pendant le glissement. */}
          <p className="mt-1 font-display text-[2rem] font-semibold leading-none text-ink tabular-nums sm:text-[2.25rem]">
            {surfaceLabel}
          </p>

          <div className="mt-3">
            {/* Curseur encadré de ses deux boutons : le glissement pour
                traverser l'échelle, les boutons pour tomber juste. */}
            <div className="flex items-center gap-2 sm:gap-3">
              <StepButton
                icon={Minus}
                label="Retirer un mètre carré"
                disabled={atMin}
                onClick={() => adjust(-SURFACE_FINE_STEP)}
              />

              <div className="min-w-0 flex-1">
                <input
                  type="range"
                  min={SURFACE_MIN}
                  max={SURFACE_MAX}
                  step={SURFACE_STEP}
                  value={sliderValue}
                  onChange={(event) => setSurface(clampSurface(Number(event.target.value)))}
                  aria-label="Surface habitable, en mètres carrés"
                  aria-valuetext={surfaceLabel}
                  style={{ '--fill': `${fill}%` }}
                  className="surface-slider"
                />
              </div>

              <StepButton
                icon={Plus}
                label="Ajouter un mètre carré"
                disabled={atMax}
                onClick={() => adjust(SURFACE_FINE_STEP)}
              />
            </div>

            {/* Les bornes se calent sous les extrémités de la piste, pas du
                bloc : largeur d'un bouton plus la gouttière, de chaque côté. */}
            <div className="flex justify-between px-[3.25rem] font-mono text-[0.62rem] uppercase tracking-micro text-ink/35 sm:px-[3.5rem]">
              <span>{SURFACE_MIN} m²</span>
              <span>{SURFACE_MAX}+ m²</span>
            </div>
          </div>

          <div className="relative mx-auto mt-6 max-w-[19rem]">
            <GoldFrame className="-inset-[2px] rounded-[0.87rem]" />

            <button
              type="button"
              onClick={() => onEstimate(surface, monaco ? monacoType : null)}
              className="group relative flex w-full touch-manipulation items-center justify-center overflow-hidden rounded-xl bg-ink px-5 py-4 shadow-[0_8px_20px_-10px_rgba(16,20,28,0.55),0_0_10px_-5px_rgba(176,141,87,0.7)] transition-shadow duration-300 ease-plan hover:shadow-[0_10px_24px_-10px_rgba(16,20,28,0.6),0_0_14px_-4px_rgba(176,141,87,0.85)]"
            >
              <Shine width="w-1/5" tint="via-brass/40" />
              <span className="relative font-mono text-[0.7rem] uppercase tracking-micro text-white">
                Obtenir une estimation instantanée
              </span>
            </button>
          </div>

          {/* Seule sortie visible depuis le retrait de la croix — délibérément
              en retrait, mais nommée : « Modifier ma sélection » dit ce qui va
              se passer là où une croix laissait deviner. La flèche reprend le
              même retour visuel que les boutons « Retour » des autres étapes.
              Même libellé en Principauté : depuis que l'étape monégasque a sa
              propre carte, on y revient au repérage comme partout ailleurs. */}
          <button
            type="button"
            onClick={onClose}
            className="group mt-4 inline-flex touch-manipulation items-center gap-1.5 text-[0.8rem] text-ink/40 underline-offset-4 transition-colors hover:text-ink/70 hover:underline"
          >
            <ArrowLeft
              className="h-3.5 w-3.5 transition-transform duration-300 ease-plan group-hover:-translate-x-1"
              strokeWidth={2}
              aria-hidden="true"
            />
            Modifier ma sélection
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/**
 * Bouton d'ajustement au mètre carré près.
 *
 * 2,75 rem de côté — la cible tactile recommandée (44 px), la même que celle
 * qui a déjà dicté la taille de la pastille du curseur. Un bouton plus discret
 * tiendrait mieux dans la maquette et se raterait au pouce.
 *
 * En butée, il est désactivé plutôt que masqué : une commande qui disparaît
 * déplace l'autre, et le curseur avec.
 */
function StepButton({ icon: Icon, label, disabled, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-ink/15 bg-white text-ink transition-colors duration-300 ease-plan hover:border-ink/40 hover:bg-stone/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-ink/25 disabled:hover:bg-white"
    >
      <Icon className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
    </button>
  )
}

/**
 * Aperçu du montant, au-dessus de la maison et sous le même halo.
 *
 * Ce n'est pas l'estimation : seulement le prix moyen au m² du secteur
 * multiplié par la surface au curseur, recalculé dans le navigateur à chaque
 * mouvement. Il est flouté selon la règle du parcours — premier chiffre net,
 * le reste sous un flou d'intensité fixe (voir `PriceReveal`) — et le montant
 * réel le remplacera à l'écran de résultat.
 *
 * Montant et silhouette sont empilés dans un même bloc, sous un même halo, et
 * se chevauchent de quelques pixels : le toit monte juste derrière le chiffre,
 * assez pour que les deux se lisent comme une seule image, pas assez pour que
 * la maison passe sur les chiffres — un montant à moitié couvert par un
 * pignon n'aurait plus rien d'un aperçu.
 *
 * Les hauteurs sont fixes et se somment exactement à celle du bloc : ni
 * l'arrivée du prix, ni le changement de palier, ni le passage de trois à sept
 * chiffres ne déplacent le curseur qui suit.
 */
function PricePreview({ formatted, surface }) {
  return (
    <div className="relative mx-auto mt-4 flex h-[11.5rem] w-full max-w-[17rem] flex-col">
      {/* Halo diffus : détache le montant du blanc de la carte. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-2 h-12 animate-cta-breath rounded-full bg-brass/30 blur-2xl"
      />

      <div className="relative flex h-16 shrink-0 items-center justify-center">
        {formatted ? (
          <PriceReveal
            formatted={formatted}
            className="font-display text-[1.9rem] font-semibold leading-none text-ink tabular-nums sm:text-[2.1rem]"
          />
        ) : (
          // Attente de l'aperçu : trois blocs neutres au découpage d'un
          // montant, pour que la place soit tenue sans rien laisser deviner.
          <span aria-hidden="true" className="flex animate-pulse items-center gap-2">
            <span className="h-6 w-14 rounded-md bg-ink/10" />
            <span className="h-6 w-16 rounded-md bg-ink/10" />
            <span className="h-6 w-5 rounded-md bg-brass/25" />
          </span>
        )}
      </div>

      {/* La marge négative fait remonter le faîtage derrière le montant.
          64 + 128 − 8 = 184 px, soit exactement la hauteur du bloc. */}
      <HouseIllustration surfaceM2={surface} className="-mt-2 h-32 shrink-0" />
    </div>
  )
}
