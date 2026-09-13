import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { EASE } from '../../lib/motion'
import { LOGO_BARNES_SRC } from '../ui/LogoBarnes'

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

/**
 * L'assemblage, en image — les feuilles du rapport qui viennent se ranger
 * autour de l'écusson.
 *
 * L'écran portait une icône de document dans une pastille sombre, cerclée d'un
 * cadre en rotation. C'était l'illustration d'un fichier, pas d'un assemblage,
 * et rien n'y était Barnes. Ce qui la remplace tient en trois éléments :
 *
 *  - **Les feuilles**, une par étape annoncée à gauche. Elles arrivent
 *    décalées, se redressent et se rangent en pile — c'est littéralement ce
 *    que la fonction serverless est en train de faire.
 *  - **Le cercle d'encre**, tracé une fois autour de la pile : le même geste
 *    que le tampon de certification du formulaire (voir `CocheCertification`),
 *    et il dit la même chose — quelque chose se scelle.
 *  - **L'écusson**, au centre et par-dessus tout : c'est lui qui signe le
 *    document qu'on assemble.
 *
 * Le mouvement ne boucle pas et ne se répète pas : chaque feuille arrive une
 * fois, à son tour. Un écran d'attente qui tourne en rond donne le sentiment
 * que rien n'avance ; celui-ci se remplit.
 */
function AssemblageBarnes({ etape, reduce }) {
  return (
    <div className="relative mx-auto h-40 w-40">
      {/* Les feuilles, de la plus lointaine à la plus proche. L'ordre du tableau
          est celui de la profondeur, et l'indice sert des deux côtés : il place
          la feuille et décide du moment où elle arrive. */}
      {[
        { rotation: -13, x: -30, y: -6 },
        { rotation: 8, x: 26, y: -12 },
        { rotation: -3, x: -2, y: 6 },
      ].map((feuille, index) => (
        <motion.span
          key={index}
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 block h-24 w-[4.5rem] rounded-[3px] border border-barnes/25 bg-white shadow-[0_6px_16px_-10px_rgba(60,60,60,0.6)]"
          initial={{ opacity: 0, x: '-50%', y: '-50%', rotate: 0, scale: 0.7 }}
          animate={
            index <= etape
              ? {
                  opacity: 1,
                  x: `calc(-50% + ${feuille.x}px)`,
                  y: `calc(-50% + ${feuille.y}px)`,
                  rotate: feuille.rotation,
                  scale: 1,
                }
              : { opacity: 0, x: '-50%', y: '-50%', rotate: 0, scale: 0.7 }
          }
          transition={
            reduce
              ? { duration: 0.15 }
              : { type: 'spring', stiffness: 210, damping: 22, mass: 0.8 }
          }
        >
          {/* Trois lignes de texte suggérées, et un filet rouge en tête : à
              cette échelle, c'est tout ce qu'il faut pour qu'une carte blanche
              se lise comme une page de rapport. */}
          <span className="ml-2 mt-2.5 block h-[2px] w-5 rounded-full bg-barnes/70" />
          <span className="mt-2 block space-y-1.5 px-2">
            {[100, 78, 88, 62].map((largeur) => (
              <span
                key={largeur}
                className="block h-[1.5px] rounded-full bg-ink/12"
                style={{ width: `${largeur}%` }}
              />
            ))}
          </span>
        </motion.span>
      ))}

      {/* Le cercle d'encre, tracé une fois autour de la pile. */}
      <svg viewBox="0 0 160 160" className="absolute inset-0 h-full w-full" aria-hidden="true">
        {/* Décrit en un arc plutôt qu'en `<circle>` : un cercle n'a pas de point
            de départ, donc rien à parcourir. */}
        <path
          d="M 80 8 A 72 72 0 1 1 79.9 8"
          pathLength="1"
          className="trace-encre"
          style={{ '--duree': '1.6s', '--retard': '0.3s' }}
          fill="none"
          stroke="#B4002F"
          strokeWidth="1.4"
          strokeOpacity="0.5"
          strokeLinecap="round"
        />
      </svg>

      {/* L'écusson, par-dessus la pile. Il respire lentement — assez pour qu'on
          voie que l'écran est vivant, pas assez pour qu'on le regarde. */}
      <motion.img
        src={LOGO_BARNES_SRC}
        alt=""
        aria-hidden="true"
        draggable="false"
        className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 select-none"
        animate={reduce ? undefined : { scale: [1, 1.06, 1] }}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
      />
    </div>
  )
}

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
      <AssemblageBarnes etape={etape} reduce={reduce} />

      <h1 className="mt-7 font-display text-[1.7rem] font-semibold leading-tight text-ink sm:text-[2rem]">
        Assemblage du rapport
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
