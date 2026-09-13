/**
 * Source unique de l'écusson Barnes.
 *
 * Le fichier est servi depuis `public/` plutôt qu'inséré en JSX, et c'est le
 * point important : l'écusson est un actif de marque figé, que personne n'a à
 * retoucher ni à recolorer. Le remplacer par le fichier officiel se fait en
 * déposant celui-ci sur `public/barnes-logo.svg` — l'écran d'adresse, le
 * formulaire et les onze pages du rapport le reprennent au rendu suivant, sans
 * qu'une ligne de code change.
 *
 * D'où l'absence de toute propriété de couleur ici : aucun `fill`, aucun
 * `filter`, aucune variante sombre. Ce qui est réglable est la taille, la
 * position et le mouvement — rien d'autre.
 */
export const LOGO_BARNES_SRC = '/barnes-logo.svg'

/**
 * Mouvements disponibles, et l'écart entre eux est délibéré.
 *
 * `saut` est le sautillement franc de l'écran d'adresse : le logo y est seul en
 * haut d'une page vide, il peut avoir du ressort. `saut-doux` est celui du
 * formulaire de caractéristiques, où le même geste, au-dessus d'un titre et de
 * quinze cartes de saisie, passerait du charme au tic — il est donc deux fois
 * plus lent et trois fois moins ample.
 *
 * Les deux passent l'essentiel de leur cycle immobiles : le rebond n'occupe que
 * le dernier tiers (voir `logo-bounce` dans `tailwind.config.js`). C'est ce qui
 * le rend remarquable plutôt que continu — un logo qui sautille sans arrêt
 * cesse d'être vu au bout de dix secondes.
 *
 * `arrivee` ajoute la chute initiale de l'écran d'adresse, que le sautillement
 * enchaîne sans rupture : les deux animations finissent à `translateY(0)`.
 */
const MOUVEMENTS = {
  aucun: '',
  saut: 'animate-logo-bounce',
  'saut-doux': 'animate-logo-bounce-soft',
}

export function LogoBarnes({
  className = '',
  mouvement = 'aucun',
  arrivee = false,
  alt = 'Barnes International',
}) {
  // La chute et le sautillement ne peuvent pas cohabiter sur le même élément —
  // une seule `animation` par nœud, et la seconde écraserait la première. Deux
  // couches : l'enveloppe joue l'arrivée, l'image la boucle.
  const boucle = MOUVEMENTS[mouvement] ?? ''

  return (
    <span className={`block ${arrivee ? 'animate-logo-drop' : ''} ${className}`}>
      <img
        src={LOGO_BARNES_SRC}
        alt={alt}
        className={`h-full w-full select-none ${boucle}`}
        draggable="false"
        // L'écusson est décoratif partout où il est posé ; il ne doit jamais
        // retarder ce qu'il accompagne.
        loading="eager"
        decoding="async"
      />
    </span>
  )
}

/**
 * Tampon de certification — la coche qui se trace à côté de l'écusson, à
 * l'arrivée sur le formulaire de caractéristiques.
 *
 * Même technique que la scène d'encre de l'écran d'analyse (`.trace-encre`,
 * voir `index.css`) : le cercle est un tracé qu'on parcourt, la coche un second
 * qui part une fois le premier bouclé. C'est ce qui lui donne l'air d'être
 * apposé plutôt qu'affiché — un tampon se pose, il n'apparaît pas.
 *
 * Il ne joue qu'une fois, au montage de l'écran, et reste ensuite en place :
 * une certification qui se rejouerait en boucle cesserait d'être une
 * certification pour devenir un élément de décor.
 *
 * Lecture : `aria-hidden`. Le tampon ne certifie rien qu'un lecteur d'écran
 * doive entendre — c'est un ornement de marque, pas une information sur le
 * bien, et l'annoncer laisserait croire à une validation officielle.
 */
export function CocheCertification({ className = '' }) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
      {/* Le cercle, décrit en deux demi-arcs : une `<circle>` n'a pas de point
          de départ, donc rien à parcourir. */}
      <path
        d="M 20 3.5 A 16.5 16.5 0 1 1 19.98 3.5"
        pathLength="1"
        className="trace-encre"
        style={{ '--duree': '0.65s', '--retard': '0.25s' }}
        stroke="#B4002F"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M 12 20.4 L 17.6 26 L 28.4 14.6"
        pathLength="1"
        className="trace-encre"
        style={{ '--duree': '0.45s', '--retard': '0.9s' }}
        stroke="#B4002F"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
