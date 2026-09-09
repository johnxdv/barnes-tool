// Variants partagés + courbe d'accélération « plan ».
export const EASE = [0.22, 1, 0.36, 1]

export const revealItem = {
  hidden: { opacity: 0, y: 22 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: EASE },
  },
}

export const staggerParent = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.09, delayChildren: 0.04 },
  },
}

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.8, ease: EASE } },
}

// Réglage commun du déclenchement au scroll.
// `amount: 'some'` (et non une fraction) : un seuil fractionnaire (ex. 0.25)
// devient inatteignable pour les grilles plus hautes que 4× l'écran (mobile,
// une colonne) → la révélation ne se déclenchait jamais. « some » se déclenche
// dès qu'une partie entre dans le cadre, quelle que soit la hauteur.
export const viewportOnce = { once: true, amount: 'some', margin: '0px 0px -8% 0px' }
