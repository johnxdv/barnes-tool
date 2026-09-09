// Arc doré unique sur le pourtour : le reste du tour est transparent, ce qui
// donne une lumière qui tourne plutôt qu'un contour permanent. Le cœur de l'arc
// monte jusqu'à un doré franc (#F5E3BC) — toujours entre Brass et Warm Stone,
// donc dans la charte — pour rester lisible sur fond clair comme sur fond sombre.
const GOLD_ARC =
  'bg-[conic-gradient(from_0deg,transparent_0%,transparent_28%,#B08D57_46%,#E8C88A_64%,#F5E3BC_73%,#E8C88A_82%,#B08D57_92%,transparent_100%)]'

/**
 * Liseré doré tournant, à poser derrière un élément opaque : le cadre est
 * clippé, l'arc conique tourne à l'intérieur, et le fond de l'élément ne laisse
 * dépasser qu'un filet sur le pourtour.
 *
 * `className` porte l'inset, le rayon et l'éventuel filet sombre de contraste —
 * en classes littérales, car Tailwind ne génère pas de valeurs arbitraires
 * construites dynamiquement. Exemple : `-inset-[3px] rounded-[0.95rem]`.
 *
 * Seule une rotation `transform` est animée : composite GPU, aucun reflow.
 */
export function GoldFrame({ className = '', spin = 'animate-border-spin' }) {
  return (
    <span aria-hidden="true" className={`pointer-events-none absolute overflow-hidden ${className}`}>
      <span className={`absolute inset-[-200%] will-change-transform ${spin} ${GOLD_ARC}`} />
    </span>
  )
}

/**
 * Reflet diagonal qui balaie un bouton, un passage par cycle. À placer avant le
 * contenu, dans un conteneur `overflow-hidden` ; le contenu doit être positionné
 * (`relative`) pour rester au-dessus et ne jamais perdre en lisibilité.
 *
 * `width` s'ajuste à la largeur du bouton : une même fraction donne un reflet
 * discret sur un bouton étroit et une large nappe sur un bouton pleine largeur.
 */
export function Shine({ width = 'w-1/3', tint = 'via-brass/30' }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-y-0 left-0 ${width} animate-shine bg-gradient-to-r from-transparent to-transparent ${tint}`}
    />
  )
}
