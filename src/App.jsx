import { useCallback, useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { EstimationAddressStep } from './components/estimation/EstimationAddressStep'
import { EstimationBuildingStep } from './components/estimation/EstimationBuildingStep'
import { EstimationLoadingStep } from './components/estimation/EstimationLoadingStep'
import { EstimationCharacteristicsStep } from './components/estimation/EstimationCharacteristicsStep'
// EstimationResultStep n'est plus dans l'enchaînement — le fichier est conservé,
// il sera rebranché quand l'affichage du prix reviendra après « caractéristiques ».
import { AUCUNE_DETECTION, requestEstimation } from './lib/estimation'

/**
 * Étapes majeures du parcours, dans l'ordre — base de la barre de progression
 * globale : adresse → bâtiment → analyse → caractéristiques.
 *
 * L'étape `resultat` (affichage du prix) est temporairement retirée : l'analyse
 * enchaîne désormais sur le formulaire de caractéristiques, qui n'a encore rien
 * après lui (écran « à suivre »).
 */
const STAGES = ['adresse', 'batiment', 'analyse', 'caracteristiques']

/**
 * Outil d'estimation — parcours en écrans successifs dans une même page (aucune
 * navigation d'URL entre les étapes) : saisie de l'adresse, repérage du
 * bâtiment sur photo aérienne, analyse, puis saisie des caractéristiques
 * détaillées du bien.
 *
 * Le montant est tout de même calculé : `requestEstimation` part au lancement
 * de l'analyse (`api/estimation.js`, base DVF) et son résultat est conservé
 * dans l'état (`price`) pour être réutilisé plus tard — l'écran qui l'affiche
 * n'est simplement plus branché pour l'instant.
 *
 * Le même appel rapporte au passage ce que les bases savaient déjà du bien
 * (`detection`) : la chaîne cadastre → BDNB qu'il déroule pour reconstituer la
 * surface croise de toute façon la vocation du bâtiment et son diagnostic
 * énergétique. Cet état-là, contrairement au prix, sert dès l'étape suivante.
 */
export default function App() {
  const [step, setStep] = useState('adresse')
  const [address, setAddress] = useState(null)
  // Sélection confirmée sur la carte : bâtiment, coordonnées, emprise, type
  // détecté, parcelle et fiche BDNB. Charge utile du calcul, conservée ici pour
  // n'avoir pas à être redemandée.
  const [selection, setSelection] = useState(null)
  // Montant renvoyé par le moteur : calculé pendant l'analyse, gardé pour un
  // usage ultérieur même si aucun écran ne l'affiche encore.
  const [price, setPrice] = useState(null)
  // Caractéristiques que les bases connaissaient déjà du bien — type et classe
  // énergie — rapportées par le même appel que le montant. Elles arrivent donc
  // avant que le formulaire de caractéristiques s'affiche, ce qui est la seule
  // condition qui compte : c'est lui qui s'en sert, pour ne pas redemander ce
  // qui est déjà su.
  const [detection, setDetection] = useState(AUCUNE_DETECTION)
  // Caractéristiques détaillées saisies à l'étape `caracteristiques`. Les
  // champs laissés de côté y valent `null` — à distinguer d'un zéro déclaré au
  // moment de les restituer.
  const [characteristics, setCharacteristics] = useState(null)
  // Calcul en cours, conservé comme promesse : démarre avec l'animation
  // d'analyse et n'est lu qu'à la fin de celle-ci.
  const pendingEstimate = useRef(null)

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
      setDetection(AUCUNE_DETECTION)
      pendingEstimate.current = requestEstimation(confirmedSelection)
      goToStep('analyse')
    },
    [goToStep],
  )

  // Fin de l'animation d'analyse : on récupère le montant (il ne sera pas
  // affiché pour l'instant, seulement mémorisé) et ce que les bases ont su dire
  // du bien, puis on passe au formulaire de caractéristiques.
  // `requestEstimation` ne rejette jamais.
  //
  // Les deux `set` précèdent le changement d'étape dans le même traitement,
  // donc dans le même rendu : le formulaire naît avec la détection déjà en
  // main, et non pas vide puis rempli après coup — ce qui lui ferait afficher
  // un champ pour le retirer sous les yeux de l'agent.
  const proceedToCharacteristics = useCallback(async () => {
    const estimate = await pendingEstimate.current
    setPrice(estimate?.price ?? null)
    setDetection(estimate?.detection ?? AUCUNE_DETECTION)
    goToStep('caracteristiques')
  }, [goToStep])

  // Formulaire validé : on stocke les valeurs et on affiche l'écran « à suivre »
  // — rien n'est encore branché sur le calcul de prix ni sur un export.
  const saveCharacteristics = useCallback(
    (values) => {
      setCharacteristics(values)
      goToStep('suite')
    },
    [goToStep],
  )

  // Repart de l'étape adresse pour une nouvelle estimation.
  const restart = useCallback(() => {
    setAddress(null)
    setSelection(null)
    setPrice(null)
    setDetection(AUCUNE_DETECTION)
    setCharacteristics(null)
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
  const globalPct =
    step === 'suite'
      ? 100
      : Math.round(((stageIndex + stageProgress) / STAGES.length) * 100)


  return (
    <>
      {/* Barre de progression globale — persistante du premier écran au dernier,
          logée en haut de la fenêtre. Reste au-dessus des fenêtres modales du
          parcours (z-[60]) : z-[70]. */}
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

      {/* Colonne flex + `my-auto` sur l'enfant : les marges automatiques sur
          l'axe principal (vertical) centrent le contenu quand il tient dans la
          fenêtre et retombent à zéro quand il déborde — le haut reste alors
          défilable (le formulaire de caractéristiques dépasse la hauteur
          d'écran). `items-center` seul, ou des marges auto sur l'axe
          transversal, rendraient le haut inatteignable. */}
      <section className="flex min-h-screen flex-col items-center bg-stone px-5 py-20 sm:px-8 sm:py-24">
        {/* Transition entre étapes sans animation au niveau de la page : chaque
            écran garde ses propres animations Framer Motion internes, mais un
            wrapper animé ici se figeait par intermittence (écran d'analyse à
            animations en boucle + minuteurs, rendu du formulaire lourd). `key`
            force le remontage propre à chaque changement d'étape. */}
        <div key={step} className="my-auto flex w-full justify-center">
          <>
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
              <EstimationLoadingStep onDone={proceedToCharacteristics} onProgress={setStageProgress} />
            ) : null}

            {step === 'caracteristiques' ? (
              <EstimationCharacteristicsStep
                detection={detection}
                onBack={() => goToStep('batiment')}
                onValidate={saveCharacteristics}
              />
            ) : null}

            {step === 'suite' ? <NextStepPlaceholder onRestart={restart} /> : null}
          </>
        </div>
      </section>
    </>
  )
}

/**
 * Écran d'attente provisoire, affiché après la validation du formulaire de
 * caractéristiques — il n'y a encore rien après (affichage du prix, export…).
 */
function NextStepPlaceholder({ onRestart }) {
  return (
    <div className="w-full max-w-md text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-bottle text-white">
        <Check className="h-7 w-7" strokeWidth={2.25} aria-hidden="true" />
      </span>
      <h1 className="mt-6 font-display text-[1.8rem] font-semibold leading-tight text-ink sm:text-[2.1rem]">
        À suivre
      </h1>
      <p className="mx-auto mt-4 max-w-sm text-[0.95rem] leading-relaxed text-ink/55">
        Vos caractéristiques sont enregistrées. La suite du parcours — estimation
        détaillée, restitution — reste à construire.
      </p>
      <button
        type="button"
        onClick={onRestart}
        className="mt-8 inline-flex touch-manipulation items-center gap-1.5 font-mono text-[0.66rem] uppercase tracking-micro text-ink/45 underline-offset-4 transition-colors hover:text-ink hover:underline"
      >
        Nouvelle estimation
      </button>
    </div>
  )
}
