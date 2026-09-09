import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, MapPin } from 'lucide-react'
import { EstimationLoadingStep } from './components/estimation/EstimationLoadingStep'
import { PROPERTY_ADDRESS } from './config/property'
import { EASE } from './lib/motion'

// Leaflet et la carte pèsent ~150 ko : chargés à la demande.
const BuildingMap = lazy(() =>
  import('./components/estimation/BuildingMap').then((m) => ({ default: m.BuildingMap })),
)

/**
 * Parcours réduit à trois écrans successifs dans une même page, sans navigation
 * d'URL :
 *
 *   1. `batiment` — vue satellite IGN centrée sur l'adresse fixée en dur
 *      (`src/config/property.js`), sélection du bâtiment sur la photo aérienne.
 *   2. `analyse`  — écran de chargement d'une durée fixe (~12 s), purement
 *      visuel : aucun backend n'est appelé.
 *   3. `suite`    — point d'accroche pour la suite du parcours, à coder ensuite.
 */
const STEPS = ['batiment', 'analyse', 'suite']

export default function App() {
  const [step, setStep] = useState('batiment')
  const [selection, setSelection] = useState(null)

  const goToAnalyse = useCallback(() => setStep('analyse'), [])
  const goToSuite = useCallback(() => setStep('suite'), [])

  // Préchargement du module carte dès le montage.
  useEffect(() => {
    import('./components/estimation/BuildingMap')
  }, [])

  const globalPct = Math.round((STEPS.indexOf(step) / (STEPS.length - 1)) * 100)

  return (
    <div className="flex min-h-screen flex-col bg-stone">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={globalPct}
        aria-label="Progression du parcours"
        className="fixed inset-x-0 top-0 z-[70] h-2 bg-ink/10"
      >
        <div
          className="h-full bg-gradient-to-r from-ink via-ink/80 to-brass transition-[width] duration-500 ease-plan"
          style={{ width: `${globalPct}%` }}
        />
      </div>

      <section className="flex min-h-screen items-center justify-center px-5 py-20 sm:px-8 sm:py-24">
        {step === 'batiment' ? (
          <BuildingStep
            selection={selection}
            onSelect={setSelection}
            onContinue={goToAnalyse}
          />
        ) : null}

        {step === 'analyse' ? <EstimationLoadingStep onDone={goToSuite} /> : null}

        {step === 'suite' ? <NextStepPlaceholder /> : null}
      </section>
    </div>
  )
}

/**
 * Étape 1 — repérage du bien sur la photo aérienne.
 *
 * L'adresse est affichée en clair mais n'est ni modifiable ni recherchable :
 * elle vient de `PROPERTY_ADDRESS`. Sélectionner un bâtiment (ou, si les
 * contours manquent, un point sur la photo) débloque le passage à l'analyse.
 */
function BuildingStep({ selection, onSelect, onContinue }) {
  const { label, lat, lon } = PROPERTY_ADDRESS

  return (
    <div className="w-full max-w-3xl">
      <h1 className="text-center font-display text-[1.6rem] font-semibold leading-tight text-ink sm:text-[2rem]">
        Cliquez sur votre bien
      </h1>
      <p className="mx-auto mt-4 max-w-md text-center text-[0.95rem] leading-relaxed text-ink/55">
        Sur la vue aérienne, sélectionnez le bâtiment concerné.
      </p>

      {/* Rappel de l'adresse — figée, ni champ ni bouton. */}
      <p className="mx-auto mt-6 flex max-w-xl items-center justify-center gap-2.5 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-center text-[0.8rem] leading-snug text-ink/70 sm:text-sm">
        <MapPin className="h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden="true" />
        {label}
      </p>

      <div className="mt-6">
        <Suspense fallback={<MapPlaceholder />}>
          <BuildingMap
            lat={lat}
            lon={lon}
            addressLabel={label}
            selection={selection}
            onSelect={onSelect}
          />
        </Suspense>
      </div>

      <AnimatePresence>
        {selection ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="mt-6 flex flex-col items-center gap-3"
          >
            <button
              type="button"
              onClick={onContinue}
              className="rounded-xl bg-ink px-6 py-4 font-mono text-[0.7rem] uppercase tracking-micro text-white shadow-[0_8px_20px_-10px_rgba(16,20,28,0.55)] transition-shadow duration-300 ease-plan hover:shadow-[0_10px_24px_-10px_rgba(16,20,28,0.6)]"
            >
              Lancer l’analyse
            </button>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="text-[0.8rem] text-ink/40 underline-offset-4 transition-colors hover:text-ink/70 hover:underline"
            >
              Modifier ma sélection
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function MapPlaceholder() {
  return (
    <div className="flex h-[62vh] max-h-[560px] min-h-[340px] w-full items-center justify-center overflow-hidden rounded-2xl border border-ink/10 bg-ink shadow-[0_22px_54px_-18px_rgba(16,20,28,0.45)] sm:h-[480px]">
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

/**
 * Fin du chargement — point d'accroche pour la suite du parcours (résultat,
 * capture de contact…), qui sera codée ensuite.
 */
function NextStepPlaceholder() {
  return (
    <div className="w-full max-w-md text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-brass">
        <MapPin className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <h1 className="mt-6 font-display text-[1.8rem] font-semibold leading-tight text-ink sm:text-[2.1rem]">
        À suivre
      </h1>
      <p className="mx-auto mt-4 max-w-sm text-[0.95rem] leading-relaxed text-ink/55">
        L’analyse est terminée. La suite du parcours reste à construire.
      </p>
    </div>
  )
}
