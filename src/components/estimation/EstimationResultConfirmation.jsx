import { motion, useReducedMotion } from 'framer-motion'
import { Check, PhoneCall, X } from 'lucide-react'
import { CALLBACK_SLOTS } from '../../data/estimation'
import { GoldFrame } from '../ui/GoldFrame'
import { EASE } from '../../lib/motion'

/**
 * Écran de confirmation final — remplace la conversation
 * ([EstimationChatPanel](./EstimationChatPanel.jsx)) dans la colonne droite
 * du split-screen une fois les informations recueillies. Contrairement à
 * l'ancienne fenêtre modale, ce n'est qu'un panneau de plus sur le même
 * écran : pas de fond assombri, pas de piège à focus, pas de navigation — le
 * prix reste visible et se déflégère à côté, en colonne gauche
 * ([EstimationResultStep](./EstimationResultStep.jsx)).
 *
 * Purement une confirmation d'interface : aucune donnée n'a été envoyée
 * nulle part, `contact` ne vit que dans le state de la page. Le vrai envoi
 * fera l'objet d'un lot séparé.
 */
export function EstimationResultConfirmation({ contact, onClose }) {
  const reduce = useReducedMotion()
  const slot = CALLBACK_SLOTS.find((s) => s.id === contact?.creneau)

  return (
    <motion.div
      initial={{ opacity: 0, y: reduce ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.2 : 0.4, ease: EASE }}
      className="relative w-full"
    >
      <GoldFrame className="-inset-[2px] rounded-[1.05rem]" spin="animate-border-spin-slow" />

      <div className="relative flex h-[26rem] flex-col items-center justify-center overflow-hidden rounded-2xl border border-ink/10 bg-white px-6 py-8 text-center shadow-[0_22px_54px_-18px_rgba(16,20,28,0.3)] sm:h-[32rem] sm:px-10 lg:h-[36rem]">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer et revenir à l’accueil"
          className="absolute right-3 top-3 flex h-9 w-9 touch-manipulation items-center justify-center rounded-full text-ink/40 transition-colors hover:bg-stone hover:text-ink"
        >
          <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>

        {/* Cercle vert clair : variante douce du badge de confirmation (fond
            plein) utilisé ailleurs dans le parcours — l'écran final appelle
            un ton plus apaisé qu'une simple étape validée. */}
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-bottle/12">
          <Check className="h-8 w-8 text-bottle" strokeWidth={2.5} aria-hidden="true" />
        </span>

        <h2 className="mt-6 font-display text-[1.5rem] font-semibold leading-tight text-ink sm:text-[1.75rem]">
          Merci {contact?.prenom}&nbsp;!
        </h2>

        <p className="mt-4 text-[1.05rem] leading-relaxed text-ink/70">
          Votre demande a été enregistrée.
        </p>
        <p className="mt-1.5 text-[0.95rem] leading-relaxed text-ink/55">
          Un expert vous contactera {slot?.phrase}.
        </p>

        {/* Substitut du bleu clair demandé — hors palette du site. Une teinte
            Ink très légère lui correspond visuellement (froide, discrète)
            sans introduire de couleur étrangère à la charte. */}
        <div className="mt-7 flex max-w-sm items-start gap-3 rounded-xl bg-ink/5 px-5 py-4 text-left">
          <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-ink/50" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-[0.85rem] leading-relaxed text-ink/70">
            <strong className="font-semibold text-ink">Prochaine étape&nbsp;:</strong> gardez votre
            téléphone à portée de main, notre expert vous appellera pour discuter de votre projet
            en détail.
          </p>
        </div>
      </div>
    </motion.div>
  )
}
