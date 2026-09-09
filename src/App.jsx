import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { EstimationAddressStep } from './components/estimation/EstimationAddressStep'
import { EstimationBuildingStep } from './components/estimation/EstimationBuildingStep'
import { EstimationLoadingStep } from './components/estimation/EstimationLoadingStep'
import { EstimationResultStep } from './components/estimation/EstimationResultStep'
import { requestEstimation } from './lib/estimation'
import { EASE } from './lib/motion'

/**
 * Étapes majeures du parcours, dans l'ordre — base de la barre de progression
 * globale. L'écran résultat couvre à la fois le repos, la conversation de
 * capture et la confirmation finale : les trois se jouent sur le même écran.
 */
const STAGES = ['adresse', 'batiment', 'analyse', 'resultat']

/**
 * Outil d'estimation — parcours en écrans successifs dans une même page (aucune
 * navigation d'URL entre les étapes) : saisie de l'adresse, repérage du
 * bâtiment sur photo aérienne, analyse, puis résultat flouté avec conversation
 * de capture intégrée qui se conclut sur la confirmation et le déblocage du
 * prix.
 *
 * Le montant est calculé pour de bon : le clic sur « Obtenir une estimation
 * instantanée » lance la requête au moteur (`api/estimation.js`, base DVF) en
 * même temps que l'animation d'analyse, et le résultat est appliqué à la fin
 * de celle-ci.
 */
export default function App() {
  const [step, setStep] = useState('adresse')
  const [address, setAddress] = useState(null)
  // Sélection confirmée sur la carte : bâtiment, coordonnées, emprise, type
  // détecté, parcelle et fiche BDNB. Charge utile du calcul, conservée ici pour
  // n'avoir pas à être redemandée.
  const [selection, setSelection] = useState(null)
  const [price, setPrice] = useState(null)
  // Calcul en cours, conservé comme promesse : démarre avec l'animation
  // d'analyse et n'est lu qu'à la fin de celle-ci.
  const pendingEstimate = useRef(null)
  const reduce = useReducedMotion()

  // Avancement à l'intérieur de l'étape courante (0 à 1) — les sous-écrans qui
  // en ont un le remontent via `onProgress`.
  const [stageProgress, setStageProgress] = useState(0)

  const goToStep = useCallback((nextStep, localProgress = 0) => {
    setStageProgress(localProgress)
    setStep(nextStep)
  }, [])

  const goToBuilding = useCallback(
    (confirmed) => {
      setAddress(confirmed)
      goToStep('batiment')
    },
    [goToStep],
  )

  // Le calcul est lancé une seule fois, au démarrage de l'écran d'analyse, et
  // court en arrière-plan de l'animation — laquelle garde son déroulé complet.
  const startAnalysis = useCallback(
    (confirmedSelection) => {
      setSelection(confirmedSelection)
      setPrice(null)
      pendingEstimate.current = requestEstimation(confirmedSelection)
      goToStep('analyse')
    },
    [goToStep],
  )

  // Fin de l'animation : le montant est très largement calculé à ce stade.
  // `requestEstimation` ne rejette jamais.
  const showResult = useCallback(async () => {
    setPrice(await pendingEstimate.current)
    goToStep('resultat')
  }, [goToStep])

  // La conversation vient de se conclure : `EstimationResultStep` bascule en
  // interne vers son écran de confirmation, sans quitter cette étape.
  const finishChat = useCallback(() => setStageProgress(1), [])

  // Fin du parcours — on repart de l'étape adresse pour une nouvelle estimation.
  const restart = useCallback(() => {
    setAddress(null)
    setSelection(null)
    setPrice(null)
    pendingEstimate.current = null
    goToStep('adresse')
  }, [goToStep])

  // Le module carte est chargé à la demande (Leaflet ne sert qu'aux étapes
  // suivantes). On l'amorce dès la saisie de l'adresse.
  useEffect(() => {
    if (step !== 'adresse') return
    import('./components/estimation/BuildingMap')
  }, [step])

  const stageIndex = STAGES.indexOf(step)
  const globalPct = Math.round(((stageIndex + stageProgress) / STAGES.length) * 100)

  const variants = {
    enter: { opacity: 0, x: reduce ? 0 : 24 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: reduce ? 0 : -24 },
  }

  return (
    <>
      {/* Barre de progression globale — persistante du premier écran à la
          confirmation finale, logée en haut de la fenêtre. Reste au-dessus des
          fenêtres modales du parcours (z-[60]) : z-[70]. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={globalPct}
        aria-label="Progression du parcours d’estimation"
        className="fixed inset-x-0 top-0 z-[70] h-2 bg-ink/10"
      >
        <div
          className="h-full bg-gradient-to-r from-ink via-ink/80 to-brass transition-[width] duration-500 ease-plan"
          style={{ width: `${globalPct}%` }}
        />
      </div>

      <section className="flex min-h-screen items-center justify-center bg-stone px-5 py-20 sm:px-8 sm:py-24">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: reduce ? 0.2 : 0.4, ease: EASE }}
            className="flex w-full justify-center"
          >
            {step === 'adresse' ? (
              <EstimationAddressStep onConfirm={goToBuilding} />
            ) : null}

            {step === 'batiment' && address ? (
              <EstimationBuildingStep
                address={address}
                onBack={() => goToStep('adresse')}
                onEstimate={startAnalysis}
                onProgress={setStageProgress}
              />
            ) : null}

            {step === 'analyse' ? (
              <EstimationLoadingStep onDone={showResult} onProgress={setStageProgress} />
            ) : null}

            {step === 'resultat' && address ? (
              <EstimationResultStep
                address={address}
                price={price}
                onBack={() => goToStep('batiment')}
                onDone={finishChat}
                onProgress={setStageProgress}
                onClose={restart}
              />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </section>
    </>
  )
}
