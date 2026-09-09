import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Check, MapPin } from 'lucide-react'
import { GoldFrame, Shine } from '../ui/GoldFrame'
import { PriceReveal } from './PriceReveal'
import { EstimationChatPanel, QUESTION_COUNT } from './EstimationChatPanel'
import { EstimationResultConfirmation } from './EstimationResultConfirmation'
import { formatEuros, priceRange } from '../../lib/format'
import { MONACO_RANGE_PCT } from '../../lib/monaco'
import { EASE } from '../../lib/motion'

/**
 * Écran 5 — l'estimation est prête, mais le montant reste flouté tant que les
 * coordonnées n'ont pas été renseignées.
 *
 * Trois temps sur le même écran, sans navigation entre eux :
 * 1. **Repos** — carte centrée, prix flouté (déjà avec son premier chiffre
 *    net), CTA « Voir mon estimation ».
 * 2. **Conversation** — au clic sur ce CTA, l'écran bascule en deux colonnes :
 *    le prix à gauche (toujours visible, qui se déflégère très légèrement à
 *    mesure des réponses), la conversation de capture à droite, agrandie.
 * 3. **Confirmation** — une fois les informations recueillies, le prix se
 *    déflégère intégralement en colonne gauche pendant que la conversation,
 *    en colonne droite, cède la place à l'écran de remerciement — toujours
 *    sur ce même écran, jamais de redirection.
 *
 * Le floutage est ici purement visuel : le montant affiché est une valeur de
 * démonstration, et le vrai calcul n'est pas branché. Le jour où il le sera,
 * le montant ne devra plus descendre dans la page avant la capture des
 * coordonnées — un flou CSS se contourne en trois clics dans un inspecteur.
 *
 * `onProgress` remonte l'avancement local (0 avant le clic sur le CTA, la
 * fraction de conversation complétée, puis 1 une fois la confirmation
 * affichée) à la barre de progression globale du parcours, portée par
 * `Estimer.jsx`. `onDone` signale cette même bascule finale au parent — sans
 * quitter cet écran, voir `finishChat` dans `Estimer.jsx`.
 */
export function EstimationResultStep({ address, price, onBack, onDone, onProgress, onClose }) {
  const reduce = useReducedMotion()
  const [started, setStarted] = useState(false)
  // Nombre de questions déjà répondues dans la conversation (0 à
  // `QUESTION_COUNT`) — pilote
  // le déflouttage progressif du prix, voir `PriceReveal`.
  const [revealStage, setRevealStage] = useState(0)
  // Les informations recueillies : la conversation cède alors la place à
  // l'écran de confirmation, et le prix se déflégère intégralement.
  const [contact, setContact] = useState(null)
  const formatted = formatEuros(price)
  const finished = contact !== null
  // La fourchette n'existe qu'à la révélation finale : elle s'affiche dans une
  // carte à part, sous le montant, jamais avant que celui-ci ne soit
  // intégralement net.
  //
  // ± 5 % autour d'une estimation française, adossée à des ventes voisines
  // ; quatre fois plus large en Principauté, où le montant ne repose que sur
  // une moyenne nationale et où l'écart d'un quartier à l'autre est sans
  // commune mesure (voir `src/lib/monaco.js`). Annoncer la même précision dans
  // les deux cas reviendrait à surjouer le second.
  const range = finished ? priceRange(price, address.monaco ? MONACO_RANGE_PCT : undefined) : null
  const showRange = range != null

  useEffect(() => {
    onProgress?.(finished ? 1 : started ? revealStage / QUESTION_COUNT : 0)
  }, [started, revealStage, finished, onProgress])

  const handleChatDone = (collected) => {
    setContact(collected)
    onDone?.(collected)
  }

  if (!started) {
    return (
      <div className="w-full max-w-lg">
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
          Modifier ma sélection
        </button>

        <motion.div
          initial={{ opacity: 0, scale: reduce ? 1 : 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduce ? 0.2 : 0.5, ease: EASE }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-bottle shadow-lg shadow-bottle/25"
        >
          <Check className="h-8 w-8 text-white" strokeWidth={2.25} aria-hidden="true" />
        </motion.div>

        <h1 className="mt-7 text-center font-display text-[1.7rem] font-semibold leading-tight text-ink sm:text-[2rem]">
          Votre estimation est prête
        </h1>

        {/* Rappel de l'adresse estimée : sans le montant, c'est tout ce qui
            rattache l'écran au bien de l'utilisateur. */}
        <p className="mx-auto mt-4 flex max-w-md flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center text-[0.85rem] leading-snug text-ink/55">
          <MapPin className="h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden="true" />
          {address.label}
        </p>

        <div className="relative mt-8">
          <GoldFrame className="-inset-[2px] rounded-[1.05rem]" spin="animate-border-spin-slow" />

          <div className="relative overflow-hidden rounded-2xl border border-ink/10 bg-white px-6 py-8 text-center shadow-[0_22px_54px_-18px_rgba(16,20,28,0.3)] sm:px-8">
            <p className="font-mono text-[0.6rem] uppercase tracking-micro text-ink/40">
              Estimation de votre bien
            </p>

            {/* Le montant domine délibérément l'écran — au point d'aiguiser la
                curiosité plutôt que de simplement l'informer. Le premier
                chiffre est net dès cet écran ; le reste se déflégera très
                progressivement au fil de la conversation qui suit. */}
            <div className="mt-5 flex items-center justify-center">
              <PriceReveal
                formatted={formatted ?? '— €'}
                revealStage={0}
                className="whitespace-nowrap font-display text-[clamp(2.75rem,15vw,4.25rem)] font-semibold leading-none text-ink sm:text-[6.5rem]"
              />
            </div>

            <p className="mt-7 font-display text-lg font-semibold text-ink sm:text-xl">
              Résultats détaillés disponibles
            </p>
            <p className="mx-auto mt-3 max-w-sm text-[0.9rem] leading-relaxed text-ink/55">
              Un expert va finaliser votre étude et vous présenter les meilleures options
              pour votre projet.
            </p>

            <div className="relative mx-auto mt-7 max-w-[15rem]">
              <GoldFrame className="-inset-[2px] rounded-[0.87rem]" />

              <button
                type="button"
                onClick={() => setStarted(true)}
                className="group relative flex w-full touch-manipulation items-center justify-center overflow-hidden rounded-xl bg-ink px-6 py-4 shadow-[0_8px_20px_-10px_rgba(16,20,28,0.55),0_0_10px_-5px_rgba(176,141,87,0.7)] transition-shadow duration-300 ease-plan hover:shadow-[0_10px_24px_-10px_rgba(16,20,28,0.6),0_0_14px_-4px_rgba(176,141,87,0.85)]"
              >
                <Shine width="w-1/5" tint="via-brass/40" />
                <span className="relative font-mono text-[0.72rem] uppercase tracking-micro text-white">
                  Voir mon estimation
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl">
      <button
        type="button"
        onClick={onBack}
        className="group mb-6 inline-flex touch-manipulation items-center gap-2 font-mono text-[0.68rem] uppercase tracking-micro text-ink/45 transition-colors hover:text-ink"
      >
        <ArrowLeft
          className="h-4 w-4 transition-transform duration-300 ease-plan group-hover:-translate-x-1"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        Modifier ma sélection
      </button>

      {/* Bascule en deux colonnes à partir du gabarit tablette (768 px) : en
          deçà, la conversation a besoin de toute la largeur pour rester
          confortable au clavier. Le prix reste visible en tête sur mobile,
          juste au-dessus de la conversation plutôt qu'à côté. */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-start md:gap-8">
        <div className="md:sticky md:top-28 md:col-span-5">
          <div className="relative">
            <GoldFrame className="-inset-[2px] rounded-[1.05rem]" spin="animate-border-spin-slow" />

            <div className="relative overflow-hidden rounded-2xl border border-ink/10 bg-white px-6 py-7 text-center shadow-[0_22px_54px_-18px_rgba(16,20,28,0.3)] sm:px-8">
              <p className="mx-auto flex max-w-xs items-center justify-center gap-2 text-[0.78rem] leading-snug text-ink/50">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-brass" strokeWidth={1.75} aria-hidden="true" />
                {address.label}
              </p>

              <p className="mt-5 font-mono text-[0.6rem] uppercase tracking-micro text-ink/40">
                Estimation de votre bien
              </p>

              <div className="mt-4 flex items-center justify-center">
                <PriceReveal
                  formatted={formatted ?? '— €'}
                  revealStage={finished ? 5 : revealStage}
                  className="whitespace-nowrap font-display text-[clamp(2.5rem,13vw,3.5rem)] font-semibold leading-none text-ink md:text-[3.25rem]"
                />
              </div>

              {!finished && (
                <p className="mx-auto mt-5 max-w-xs text-[0.85rem] leading-relaxed text-ink/55">
                  Un expert va finaliser votre étude et vous présenter les meilleures options
                  pour votre projet.
                </p>
              )}
            </div>
          </div>

          {/* Carte distincte, sous le montant : elle n'apparaît qu'une fois
              l'estimation intégralement défloutée, en fondu montant accordé au
              reste des transitions de l'écran. */}
          {showRange && (
            <motion.div
              initial={{ opacity: 0, y: reduce ? 0 : 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0.2 : 0.5, ease: EASE }}
              className="mt-4"
            >
              <div className="rounded-2xl border border-ink/10 bg-white px-4 py-5 shadow-[0_14px_36px_-20px_rgba(16,20,28,0.28)] sm:px-6">
                {/* Les deux bornes restent côte à côte jusqu'aux plus petits
                    écrans : les montants passent à une taille légèrement
                    réduite en dessous de 640 px plutôt que de s'empiler. */}
                <div className="grid grid-cols-2 divide-x divide-ink/10">
                  <div className="px-2 text-center">
                    <p className="font-mono text-[0.58rem] uppercase tracking-micro text-ink/40">
                      Estimation basse
                    </p>
                    <p className="mt-2 whitespace-nowrap font-display text-[1.25rem] font-semibold leading-none text-ink sm:text-[1.55rem]">
                      {formatEuros(range.low)}
                    </p>
                  </div>

                  <div className="px-2 text-center">
                    <p className="font-mono text-[0.58rem] uppercase tracking-micro text-ink/40">
                      Estimation haute
                    </p>
                    <p className="mt-2 whitespace-nowrap font-display text-[1.25rem] font-semibold leading-none text-ink sm:text-[1.55rem]">
                      {formatEuros(range.high)}
                    </p>
                  </div>
                </div>
              </div>

              <p className="mx-auto mt-3 max-w-xs text-center text-[0.7rem] leading-relaxed text-ink/40">
                Prix soumis à expertise, hors estimation du terrain
              </p>
            </motion.div>
          )}
        </div>

        <div className="md:col-span-7">
          {finished ? (
            <EstimationResultConfirmation contact={contact} onClose={onClose} />
          ) : (
            <EstimationChatPanel onDone={handleChatDone} onProgress={setRevealStage} />
          )}
        </div>
      </div>
    </div>
  )
}
