import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, Lightbulb, Loader2 } from 'lucide-react'
import { ANALYSIS_STEPS, DID_YOU_KNOW } from '../../data/estimation'
import { EASE } from '../../lib/motion'
import { SceneEncre } from './SceneEncre'

const TOTAL_MS = ANALYSIS_STEPS.reduce((sum, step) => sum + step.durationMs, 0)

/** Intervalle de rotation de l'encart « Le saviez-vous ? ». */
const FACT_ROTATE_MS = 4000

/**
 * Écran 2 — analyse simulée.
 *
 * Aucun calcul ne tourne derrière : les durées viennent de `ANALYSIS_STEPS` et
 * n'ont qu'une fonction d'habillage, en attendant le vrai enchaînement DVF.
 * Le composant se contente d'égrener les étapes puis d'appeler `onDone`.
 */
export function EstimationLoadingStep({ onDone, onProgress }) {
  const [completed, setCompleted] = useState(0)
  const [barFilled, setBarFilled] = useState(false)
  const reduce = useReducedMotion()

  // Avancement local remonté à la barre globale : les 3 étapes de l'analyse
  // sont son seul repère fiable — la grande barre ci-dessous se remplit en
  // continu par transition CSS, sans état React intermédiaire à observer.
  useEffect(() => {
    onProgress?.(completed / ANALYSIS_STEPS.length)
  }, [completed, onProgress])

  // Les faits tournent en boucle toutes les 4 s, avec un fondu enchaîné
  // (voir plus bas) plutôt qu'un remplacement sec qui donnerait un encart qui
  // clignote.
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * DID_YOU_KNOW.length))

  useEffect(() => {
    if (reduce) return undefined
    const interval = setInterval(() => {
      setFactIndex((index) => (index + 1) % DID_YOU_KNOW.length)
    }, FACT_ROTATE_MS)
    return () => clearInterval(interval)
  }, [reduce])

  const fact = DID_YOU_KNOW[factIndex]

  useEffect(() => {
    // Minuteurs en cascade plutôt qu'un intervalle : chaque étape a sa propre
    // durée, et tout se nettoie d'un bloc si l'utilisateur quitte l'écran.
    const timers = []
    let elapsed = 0

    ANALYSIS_STEPS.forEach((step, index) => {
      elapsed += step.durationMs
      timers.push(setTimeout(() => setCompleted(index + 1), elapsed))
    })

    timers.push(setTimeout(() => onDone?.(), elapsed + 450))

    // La barre est lancée sur toute la durée en une seule transition, plutôt
    // que par paliers : elle se remplit sans à-coups pendant que les étapes se
    // cochent. Un tick de décalage suffit pour que le navigateur enregistre la
    // largeur de départ et anime la suite.
    timers.push(setTimeout(() => setBarFilled(true), 50))

    return () => timers.forEach(clearTimeout)
  }, [onDone])

  const current = Math.min(completed, ANALYSIS_STEPS.length - 1)
  // Valeur annoncée aux technologies d'assistance : les étapes réellement
  // franchies, pas la position de la barre — un pourcentage qui glisse en
  // continu n'a rien à dire à un lecteur d'écran.
  const progress = Math.round((completed / ANALYSIS_STEPS.length) * 100)

  return (
    <div className="w-full max-w-lg">
      {/* Le dessin à l'encre, à la place de la pastille d'icônes en rotation
          qu'affichait cet écran. Il tient seul la première moitié de l'attente
          — une tour qui sort du sol, une maison, un bassin où l'écusson vient
          se poser — et il est muet : ce qui se passe réellement pendant ce
          temps-là est annoncé juste en dessous, par la liste d'étapes en
          `aria-live`. Voir `SceneEncre` pour la chorégraphie. */}
      <SceneEncre className="mx-auto h-40 w-full max-w-[26rem] sm:h-48" />

      <h1 className="mt-2 text-center font-display text-[1.8rem] font-semibold leading-tight text-ink sm:text-[2.25rem]">
        Analyse personnalisée en cours…
      </h1>

      <p
        role="status"
        aria-live="polite"
        className="mt-3 text-center font-mono text-[0.72rem] uppercase tracking-micro text-brass"
      >
        {Math.min(completed + 1, ANALYSIS_STEPS.length)}/{ANALYSIS_STEPS.length} —{' '}
        {completed >= ANALYSIS_STEPS.length ? 'Analyse terminée' : ANALYSIS_STEPS[current].label}
      </p>

      {/* Barre de progression : la largeur est animée en CSS, pas image par
          image — la transition survit à un onglet en arrière-plan. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Progression de l’analyse"
        className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-ink/10"
      >
        {/* En mode « moins d'animations », le filet CSS global neutralise toutes
            les transitions : la barre sauterait d'un coup à 100 %. On repasse
            alors aux paliers, qui restent lisibles sans rien animer. */}
        <div
          className="h-full rounded-full bg-gradient-to-r from-ink via-ink/80 to-brass"
          style={
            reduce
              ? { width: `${progress}%` }
              : { width: barFilled ? '100%' : '0%', transition: `width ${TOTAL_MS}ms linear` }
          }
        />
      </div>

      <ol className="mt-8 space-y-3">
        {ANALYSIS_STEPS.map((step, index) => {
          const isDone = index < completed
          const isCurrent = index === completed

          return (
            <motion.li
              key={step.id}
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0.15 : 0.4, ease: EASE, delay: index * 0.08 }}
              className={[
                'flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors duration-500 ease-plan',
                isDone
                  ? 'border-bottle/20 bg-bottle/5'
                  : isCurrent
                    ? 'border-ink/15 bg-white'
                    : 'border-ink/5 bg-white/50',
              ].join(' ')}
            >
              <span
                className={[
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors duration-500',
                  isDone ? 'bg-bottle' : 'bg-ink/10',
                ].join(' ')}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden="true" />
                ) : isCurrent ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-ink/50" strokeWidth={2.5} aria-hidden="true" />
                ) : null}
              </span>

              <span
                className={[
                  'text-[0.95rem] leading-snug transition-colors duration-500',
                  isDone ? 'text-ink/70' : isCurrent ? 'text-ink' : 'text-ink/35',
                ].join(' ')}
              >
                {isDone ? step.done : step.label}
              </span>
            </motion.li>
          )
        })}
      </ol>

      {/* Encart d'attente : occupe le regard sans promettre quoi que ce soit
          sur le résultat en cours de calcul. */}
      <motion.aside
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0.2 : 0.6, ease: EASE, delay: 0.5 }}
        className="mt-8 flex items-start gap-3 rounded-xl border border-ink/5 bg-stone/70 px-4 py-4 sm:px-5"
      >
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden="true" />
        <span>
          <span className="block font-mono text-[0.66rem] uppercase tracking-micro text-ink/45">
            Le saviez-vous&nbsp;?
          </span>
          <AnimatePresence mode="wait">
            <motion.span
              key={factIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0.15 : 0.35, ease: EASE }}
              className="mt-1.5 block text-[0.95rem] leading-relaxed text-ink/65"
            >
              {fact}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.aside>
    </div>
  )
}
