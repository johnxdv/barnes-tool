import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { FileText } from 'lucide-react'
import { GoldFrame } from '../ui/GoldFrame'
import { EASE } from '../../lib/motion'

/**
 * Écran d'assemblage — le temps que `api/rapport.js` réunisse les pages.
 *
 * Le formulaire validé, il reste une poignée de secondes de données à aller
 * chercher : les ventes du secteur, le quartier, les commodités, les taux. Cet
 * écran les couvre.
 *
 * Il ne mesure rien et n'affiche aucune barre : les étapes défilent à leur
 * propre rythme, comme celles de l'écran d'analyse (voir `ANALYSIS_STEPS`).
 * Une progression sincère supposerait que le serveur rende compte de son
 * avancement, ce qu'il ne fait pas — et une barre qui reste bloquée à 80 %
 * inquiète bien davantage qu'une liste qui avance.
 *
 * En revanche, il ne ment pas sur la fin : `pret` commande la sortie, et
 * l'écran attend le rapport même si ses lignes sont toutes cochées. Il impose
 * seulement une durée plancher (`PLANCHER_MS`) pour qu'un assemblage servi
 * depuis le cache ne le fasse pas clignoter.
 */

const ETAPES = [
  'Relevé des ventes du secteur…',
  'Profil du quartier et commodités…',
  'Mise en page du rapport…',
]

/** Cadence d'affichage des étapes. */
const ETAPE_MS = 1100

/** Durée minimale de l'écran — en deçà, il n'apparaîtrait qu'en un clin d'œil. */
const PLANCHER_MS = 2600

export function EstimationRapportStep({ pret, onDone }) {
  const reduce = useReducedMotion()
  const [etape, setEtape] = useState(0)
  const [plancherAtteint, setPlancherAtteint] = useState(false)

  useEffect(() => {
    const minuteur = setInterval(() => {
      setEtape((courante) => Math.min(courante + 1, ETAPES.length - 1))
    }, ETAPE_MS)

    const plancher = setTimeout(() => setPlancherAtteint(true), PLANCHER_MS)

    return () => {
      clearInterval(minuteur)
      clearTimeout(plancher)
    }
  }, [])

  useEffect(() => {
    if (pret && plancherAtteint) onDone?.()
  }, [pret, plancherAtteint, onDone])

  return (
    <div className="w-full max-w-md text-center">
      <div className="relative mx-auto h-16 w-16">
        <GoldFrame className="-inset-[3px] rounded-[1.15rem]" spin="animate-border-spin-slow" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-ink text-brass">
          <FileText className="h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </div>

      <h1 className="mt-7 font-display text-[1.7rem] font-semibold leading-tight text-ink sm:text-[2rem]">
        Assemblage de votre rapport
      </h1>

      <ul className="mx-auto mt-7 max-w-xs space-y-2.5 text-left" aria-live="polite">
        {ETAPES.map((label, index) => (
          <motion.li
            key={label}
            initial={{ opacity: 0, y: reduce ? 0 : 6 }}
            animate={{ opacity: index <= etape ? 1 : 0.3, y: 0 }}
            transition={{ duration: reduce ? 0.15 : 0.4, ease: EASE }}
            className="flex items-center gap-3 text-[0.85rem] leading-snug text-ink/60"
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-500 ${
                index <= etape ? 'bg-brass' : 'bg-ink/20'
              }`}
            />
            {label}
          </motion.li>
        ))}
      </ul>
    </div>
  )
}
