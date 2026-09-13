import { LOGO_BARNES_SRC } from '../ui/LogoBarnes'

/**
 * Scène d'attente de l'écran d'analyse — un dessin à l'encre qui se fait sous
 * les yeux, à la place de l'ancienne pastille d'icônes en rotation.
 *
 * Le principe est celui du sumi-e : rien n'apparaît, tout se trace. Chaque
 * contour est un `<path>` dont le tiret masque la longueur puis la libère (voir
 * `.trace-encre` dans `index.css`) — le trait sort de son point de départ et
 * court jusqu'au bout, comme une pointe qui avance sur le papier. Un fondu
 * aurait donné le même dessin au bout du compte ; il n'aurait pas donné le
 * geste, et c'est le geste qu'on regarde pendant douze secondes d'attente.
 *
 * Le sens de chaque tracé est choisi, pas subi : la tour se dessine du sol vers
 * le ciel (`M` posé en bas), les murs de la maison montent, le bassin se creuse
 * d'un tour de pinceau. Inverser un seul `M` fait descendre le bâtiment dans le
 * sol au lieu de l'en faire sortir.
 *
 * ── Chorégraphie ──────────────────────────────────────────────────────────
 *
 * Les délais ci-dessous sont l'ensemble de la mise en scène ; il n'y a aucune
 * minuterie JavaScript derrière, donc rien à nettoyer ni à resynchroniser si
 * l'onglet passe en arrière-plan.
 *
 *   0,2 s  la ligne d'horizon
 *   0,8 s  la tour sort du sol
 *   2,3 s  ses planchers, du bas vers le haut
 *   3,4 s  le monogramme « B » se pose au sommet
 *   2,6 s  la maison — toit puis murs — en parallèle, comme demandé
 *   4,2 s  le bassin se creuse devant elle
 *   5,4 s  l'écusson se pose au fond du bassin
 *   5,6 s  l'eau se met à onduler, et c'est le seul élément qui boucle
 *
 * Soit un dessin achevé à six secondes, sur une analyse qui en dure douze
 * (`ANALYSIS_STEPS`) : la seconde moitié se regarde comme une estampe finie,
 * l'eau seule y bougeant encore.
 *
 * `pathLength="1"` sur chaque tracé : l'attribut renormalise les longueurs, ce
 * qui permet à une façade de vingt unités et à un bassin de trois cents d'être
 * pilotés par les mêmes valeurs de tiret. Sans lui, il faudrait mesurer chaque
 * chemin au rendu et réécrire les constantes à la moindre retouche du dessin.
 *
 * L'accessibilité tient dans le `role="img"` et son titre : ce qui se passe
 * réellement pendant ce temps-là est annoncé ailleurs, par la liste d'étapes en
 * `aria-live` de l'écran d'analyse. Un lecteur d'écran n'a pas à suivre un
 * pinceau.
 *
 * Le mode « moins d'animations » est couvert sans condition ici : le filet
 * global d'`index.css` ramène toute durée à 0,001 ms en gardant `forwards` —
 * la scène s'affiche donc d'emblée terminée, ce qui est exactement ce qu'on
 * veut d'un dessin dont on refuse le mouvement.
 */

/** Rouge Barnes, décliné en trois intensités — l'encre plus ou moins chargée. */
const ENCRE = '#B4002F'

/** Un trait : sa forme, son épaisseur, et le moment où le pinceau le pose. */
function Trait({ d, duree, retard, largeur = 1.6, opacite = 1, couleur = ENCRE }) {
  return (
    <path
      d={d}
      pathLength="1"
      className="trace-encre"
      style={{ '--duree': `${duree}s`, '--retard': `${retard}s` }}
      fill="none"
      stroke={couleur}
      strokeWidth={largeur}
      strokeOpacity={opacite}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

export function SceneEncre({ className = '' }) {
  return (
    <svg
      viewBox="0 0 340 200"
      className={className}
      role="img"
      aria-label="Dessin à l’encre d’un immeuble et d’une maison avec piscine, en cours de tracé"
    >
      {/* Ligne d'horizon — le sol d'où tout sort. Tracée de gauche à droite,
          d'un seul geste, et volontairement pas droite : deux légères inflexions
          suffisent à lui ôter l'air d'un trait de règle. */}
      <Trait
        d="M 12 142 C 90 139.5, 170 144, 246 141 S 316 142.5, 328 141.5"
        duree={1.1}
        retard={0.2}
        largeur={1.3}
        opacite={0.42}
      />

      {/* --- La tour ------------------------------------------------------
          Un seul tracé, parti du pied droit : il monte la façade droite,
          traverse le toit, redescend la façade gauche et revient au sol. Le
          bâtiment sort donc du sol en montant, puis se referme — ce qui se lit
          comme une construction, là où quatre traits indépendants se liraient
          comme un assemblage. */}
      <Trait
        d="M 248 142 L 247 46 L 224 34 L 199 46 L 200 142"
        duree={1.5}
        retard={0.8}
        largeur={2}
      />

      {/* Planchers, du bas vers le haut — l'immeuble se remplit après s'être
          élevé. Décalés de 0,16 s l'un de l'autre : l'œil suit la montée. */}
      {[130, 112, 94, 76, 58].map((y, index) => (
        <Trait
          key={y}
          d={`M ${201.5 + index * 0.4} ${y} L ${245.5 - index * 0.4} ${y - 0.6}`}
          duree={0.34}
          retard={2.3 + index * 0.16}
          largeur={1.1}
          opacite={0.5}
        />
      ))}

      {/* Quelques fenêtres, posées à l'encre pleine plutôt que tracées : sur un
          dessin de cette échelle, un carré de 5 unités n'a pas de contour à
          parcourir — il a une valeur. */}
      {[
        [209, 118],
        [230, 100],
        [213, 82],
        [234, 64],
      ].map(([x, y], index) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="6"
          height="7"
          rx="0.5"
          fill={ENCRE}
          fillOpacity="0.16"
          className="pose-encre"
          style={{ '--retard': `${3 + index * 0.12}s`, '--duree': '0.45s' }}
        />
      ))}

      {/* Le monogramme, une fois la tour debout. En Prata — la fonte est
          chargée par la page, et ce SVG est incorporé au document (non appelé
          par une balise `img`), donc elle s'applique ici. */}
      <text
        x="224"
        y="26"
        textAnchor="middle"
        fontFamily="Prata, Georgia, serif"
        fontSize="24"
        fill={ENCRE}
        className="pose-encre"
        style={{ '--retard': '3.4s', '--duree': '0.8s' }}
      >
        B
      </text>

      {/* --- La maison ----------------------------------------------------
          Toit d'abord, d'un versant à l'autre en passant par le faîte ; puis
          les murs, montés depuis le sol de part et d'autre. */}
      <Trait d="M 34 106 L 82 74 L 130 106" duree={0.85} retard={2.6} largeur={2} />
      <Trait d="M 44 142 L 44 102" duree={0.5} retard={3.3} largeur={1.7} />
      <Trait d="M 120 142 L 120 102" duree={0.5} retard={3.45} largeur={1.7} />
      <Trait d="M 44 142 L 120 142" duree={0.5} retard={3.6} largeur={1.7} />

      {/* Porte et fenêtre — le détail qui fait qu'on lit « maison » et non
          « triangle sur rectangle ». */}
      <Trait d="M 74 142 L 74 118 L 92 118 L 92 142" duree={0.55} retard={3.9} largeur={1.2} opacite={0.65} />
      <Trait d="M 54 112 L 68 112 L 68 126 L 54 126 Z" duree={0.5} retard={4.05} largeur={1.1} opacite={0.5} />

      {/* --- Le bassin ----------------------------------------------------
          Creusé d'un seul tour de pinceau, en deux arcs de cercle qui se
          referment : c'est le geste qu'on ferait à la main, et il se lit mieux
          qu'une `<ellipse>` — laquelle ne se trace pas, faute de point de
          départ. Le tracé part de la gauche et fait le tour par le bas. */}
      <Trait
        d="M 52 168 A 48 13 0 0 0 148 168 A 48 13 0 0 0 52 168 Z"
        duree={1.2}
        retard={4.2}
        largeur={1.8}
      />

      {/* L'écusson au fond de l'eau. Aplati verticalement — il repose à plat
          sous la surface, et une rondelle parfaite dans un bassin vu en
          perspective flotterait au-dessus. L'échelle verticale est portée par
          l'image, l'animation par le groupe : `pose-encre` écrit elle-même un
          `transform`, et les deux s'écraseraient sur un même nœud. */}
      <g
        className="pose-encre"
        style={{ '--retard': '5.4s', '--duree': '0.9s' }}
        opacity="0.75"
      >
        <image
          href={LOGO_BARNES_SRC}
          x="-15"
          y="-15"
          width="30"
          height="30"
          transform="translate(100 168) scale(1 0.56)"
        />
      </g>

      {/* La surface. Deux traits d'eau qui s'étirent et se rétractent en
          décalé — seule boucle de la scène, et la seule chose qui bouge encore
          une fois le dessin achevé.

          L'apparition est portée par le groupe, l'ondulation par les traits :
          une boucle infinie n'a pas d'état « avant », elle rendrait ses traits
          visibles dès le premier rendu, sous une maison qui n'est pas encore
          dessinée. Le groupe, lui, part d'une opacité nulle et ne s'ouvre qu'à
          5,6 s. Les deux ondes, elles, tournent depuis le début derrière ce
          rideau — ce qui les fait arriver déjà désynchronisées. */}
      <g className="pose-encre" style={{ '--retard': '5.6s', '--duree': '0.6s' }}>
        <path
          d="M 60 161 q 7 -3 14 0 t 14 0"
          fill="none"
          stroke={ENCRE}
          strokeWidth="1"
          strokeLinecap="round"
          className="onde-bassin"
        />
        <path
          d="M 112 175 q 7 -3 14 0 t 14 0"
          fill="none"
          stroke={ENCRE}
          strokeWidth="1"
          strokeLinecap="round"
          className="onde-bassin"
          style={{ '--retard': '0.8s' }}
        />
      </g>
    </svg>
  )
}
