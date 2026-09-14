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

/**
 * L'encre des cachets — le rouge Barnes, celui de tous les tracés du parcours
 * (`ENCRE` dans `estimation/encre.jsx`). Il est redit ici plutôt qu'importé :
 * les composants d'interface ne dépendent pas des scènes dessinées, et
 * l'inverse non plus.
 */
const ENCRE_TAMPON = '#B4002F'

/**
 * Tampon d'approbation — l'écusson Barnes apposé au bout d'un cachet d'encre,
 * pendant l'analyse.
 *
 * ── Ce qu'il dit, et ce qu'il ne dit pas ──────────────────────────────────
 *
 * C'est un cachet en train d'être apposé, pas un cachet apposé : il met six
 * secondes à se faire, sur un écran qui en dure douze, et rien ne le rejoue
 * ensuite. Une validation qui se rejouerait en boucle cesserait d'être une
 * validation pour devenir un élément de décor — même raison que pour
 * `CocheCertification`, dont il reprend l'esprit à plus grande échelle.
 *
 * Il est muet pour les lecteurs d'écran (`aria-hidden`), et c'est délibéré :
 * l'outil n'agrée rien, il estime. Annoncer un tampon laisserait entendre une
 * validation officielle du bien, ce qui serait faux.
 *
 * ── L'ordre des gestes ────────────────────────────────────────────────────
 *
 * Celui d'un vrai cachet, et c'est lui qui fait la lenteur habitée plutôt que
 * l'attente vide :
 *
 *  1. **le cercle extérieur** (0,2 → 1,8 s), d'un seul tour de pointe ;
 *  2. **le filet intérieur** (1,1 → 2,5 s), parti du bas pour que les deux
 *     tours ne se superposent pas — deux traits lancés du même point au même
 *     instant se lisent comme un seul trait épais ;
 *  3. **les deux repères** (2,5 s), à trois et neuf heures : la marque de
 *     calage d'un tampon de caoutchouc, et le seul ornement de la couronne ;
 *  4. **l'écusson** (2,9 s), qui ne se trace pas mais se pose — c'est un actif
 *     de marque, il n'a pas à être redessiné à la main (voir l'en-tête) ;
 *  5. **la coche** (4,6 → 5,9 s), en dernier et d'une pointe plus large : c'est
 *     elle qui fait le tampon d'approbation, et elle n'a de sens qu'une fois le
 *     reste en place.
 *
 * ── Ce qui a été essayé et retiré ─────────────────────────────────────────
 *
 * Une couronne de vingt-quatre dents entre les deux cercles. Elle avait l'air
 * d'un cadran d'horloge : à intervalle régulier, sur un cercle, un trait radial
 * n'est plus un crénelage, c'est une graduation. L'écusson porte déjà son
 * propre anneau de lettres — un troisième cercle chargé faisait trois anneaux
 * concentriques, et un cachet de luxe n'en a jamais tant.
 */
export function TamponBarnes({ className = '' }) {
  return (
    <span className={`relative block ${className}`} aria-hidden="true">
      <svg viewBox="0 0 120 120" className="h-full w-full" fill="none">
        {/* Les deux cercles, décrits en arcs plutôt qu'en `<circle>` : un cercle
            n'a pas de point de départ, donc rien à parcourir. */}
        <path
          d="M 60 4.5 A 55.5 55.5 0 1 1 59.9 4.5"
          pathLength="1"
          className="trace-encre"
          style={{ '--duree': '1.6s', '--retard': '0.2s' }}
          stroke={ENCRE_TAMPON}
          strokeWidth="1.6"
          strokeOpacity="0.85"
          strokeLinecap="round"
        />
        <path
          d="M 60 110.5 A 50.5 50.5 0 1 1 60.1 110.5"
          pathLength="1"
          className="trace-encre"
          style={{ '--duree': '1.4s', '--retard': '1.1s' }}
          stroke={ENCRE_TAMPON}
          strokeWidth="0.7"
          strokeOpacity="0.35"
          strokeLinecap="round"
        />

        {/* Les repères de calage, à trois et neuf heures. */}
        {[
          'M 4.6 60 L 9.4 60',
          'M 110.6 60 L 115.4 60',
        ].map((d) => (
          <path
            key={d}
            d={d}
            pathLength="1"
            className="trace-encre"
            style={{ '--duree': '0.25s', '--retard': '2.5s' }}
            stroke={ENCRE_TAMPON}
            strokeWidth="1.3"
            strokeOpacity="0.5"
            strokeLinecap="round"
          />
        ))}

        {/* La coche, apposée en dernier et d'une pointe plus large : sur un
            tampon, c'est la seule marque qui décide de quelque chose. */}
        <path
          d="M 47 93 L 56 102 L 75 83"
          pathLength="1"
          className="trace-encre"
          style={{ '--duree': '1.3s', '--retard': '4.6s' }}
          stroke={ENCRE_TAMPON}
          strokeWidth="2.2"
          strokeOpacity="0.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* L'écusson, au centre de la couronne. Deux couches, comme dans
          `LogoBarnes` : l'enveloppe porte le placement, l'image porte la pose —
          `.pose-encre` écrit `transform`, et posée sur le même nœud elle
          effacerait le `-translate-x-1/2` qui centre l'écusson.

          Il est remonté au-dessus du centre (`top` à 14 %) : la coche occupe le
          bas de la couronne, et un écusson centré la recevrait en travers. */}
      <span className="absolute left-1/2 top-[14%] w-[54%] -translate-x-1/2">
        <img
          src={LOGO_BARNES_SRC}
          alt=""
          draggable="false"
          className="pose-encre block w-full select-none"
          style={{ '--retard': '2.9s', '--duree': '0.9s' }}
          loading="eager"
          decoding="async"
        />
      </span>
    </span>
  )
}
