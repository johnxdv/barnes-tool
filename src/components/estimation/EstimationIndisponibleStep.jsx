import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, MapPin, RotateCcw, TriangleAlert } from 'lucide-react'
import { GoldFrame, Shine } from '../ui/GoldFrame'
import { EASE } from '../../lib/motion'

/**
 * Écran servi quand le moteur d'estimation n'a pas pu répondre.
 *
 * POURQUOI CET ÉCRAN EXISTE. Jusqu'au portage du moteur, une panne de la source
 * DVF ne se voyait pas : le calcul repliait en silence sur la médiane du
 * département entier, puis sur un prix de référence, et affichait le résultat
 * comme une estimation de quartier. Sur une maison marseillaise, cela faisait
 * 403 000 € au lieu de 489 000 € — un écart de 86 000 € qu'aucun écran, aucun
 * journal et aucun champ de réponse ne signalait. L'agent le présentait au
 * vendeur sans savoir qu'il ne reposait sur rien.
 *
 * Le serveur sait désormais répondre « je ne sais pas » (503, voir
 * `api/estimation.js`), et c'est cet écran-là. Il ne s'affiche que pour une
 * panne technique — une source injoignable, un budget dépassé —, c'est-à-dire
 * pour les seuls cas qu'une nouvelle tentative peut corriger. Un secteur
 * réellement dépourvu de ventes ne passe pas par ici.
 *
 * Volontairement sobre, et c'est le seul écart assumé à la charte du parcours :
 * le cadre doré, l'écusson et le dévoilé du montant accompagnent l'annonce d'un
 * prix. Il n'y en a pas ici, et les garder reviendrait à mettre les ornements de
 * la bonne nouvelle autour d'une panne. Seul le bouton conserve la facture
 * Barnes — c'est une action, pas une annonce.
 */
export function EstimationIndisponibleStep({ address, onRetry, onBack }) {
  const reduce = useReducedMotion()

  return (
    <div className="relative z-10 w-full max-w-lg">
      <button
        type="button"
        onClick={onBack}
        className="group mb-8 inline-flex touch-manipulation items-center gap-2 font-mono text-[0.7rem] uppercase tracking-micro text-ink/45 transition-colors hover:text-ink"
      >
        <ArrowLeft
          className="h-4 w-4 transition-transform duration-300 ease-plan group-hover:-translate-x-1"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        Modifier ma sélection
      </button>

      <div className="text-center">
        <motion.div
          initial={{ opacity: 0, scale: reduce ? 1 : 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduce ? 0.2 : 0.5, ease: EASE }}
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ink/5"
        >
          <TriangleAlert className="h-7 w-7 text-brass" strokeWidth={1.75} aria-hidden="true" />
        </motion.div>

        <h1 className="mt-7 font-display text-[1.7rem] font-semibold leading-tight text-ink sm:text-[2rem]">
          Estimation momentanément indisponible
        </h1>

        {address?.label ? (
          <p className="mx-auto mt-4 flex max-w-md flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center text-[0.85rem] leading-snug text-ink/60">
            <MapPin className="h-4 w-4 shrink-0 text-brass" strokeWidth={1.75} aria-hidden="true" />
            {address.label}
          </p>
        ) : null}

        <div className="mx-auto mt-8 max-w-md rounded-xl bg-ink/5 px-6 py-7 sm:px-8">
          {/* Dire la vérité sans la détailler : la base publique des ventes est
              momentanément injoignable. Ce qu'il ne faut surtout pas faire, c'est
              annoncer un montant de consolation — c'est précisément ce que
              faisait la version précédente. */}
          <p className="text-[0.95rem] leading-relaxed text-ink/75">
            La base publique des ventes immobilières ne répond pas pour le moment. Plutôt qu’un
            montant approximatif, nous préférons ne rien annoncer.
          </p>

          <p className="mx-auto mt-4 max-w-sm text-[0.8rem] leading-relaxed text-ink/55">
            Votre sélection est conservée : une nouvelle tentative ne vous demandera rien de plus.
          </p>

          <div className="relative mt-7">
            <GoldFrame className="-inset-[2px] rounded-[0.87rem]" />
            <motion.button
              type="button"
              onClick={onRetry}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="group relative flex w-full touch-manipulation items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-ink px-5 py-4 shadow-[0_8px_20px_-10px_rgba(60,60,60,0.55),0_0_10px_-5px_rgba(176,141,87,0.7)] transition-shadow duration-300 ease-plan hover:shadow-[0_10px_24px_-10px_rgba(60,60,60,0.6),0_0_14px_-4px_rgba(176,141,87,0.85)]"
            >
              <Shine width="w-1/5" tint="via-brass/40" />
              <RotateCcw
                className="relative h-3.5 w-3.5 text-white"
                strokeWidth={2}
                aria-hidden="true"
              />
              <span className="relative font-mono text-[0.7rem] uppercase tracking-micro text-white">
                Réessayer
              </span>
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  )
}
