import { ENCRE, Trait } from './encre'

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
 *   2,6 s  la villa — dalles, puis volumes, en parallèle de la tour
 *   3,9 s  ses vitrages et ses poteaux
 *   4,4 s  le bassin à débordement se creuse devant elle
 *   5,3 s  les cyprès
 *   5,6 s  l'eau se met à onduler, et c'est le seul élément qui boucle
 *
 * Soit un dessin achevé à six secondes, sur une analyse qui en dure douze
 * (`ANALYSIS_STEPS`) : la seconde moitié se regarde comme une estampe finie,
 * l'eau seule y bougeant encore.
 *
 * ── Ce qui a changé, et pourquoi ──────────────────────────────────────────
 *
 * La maison était un pignon triangulaire sur un rectangle, avec une porte et
 * une fenêtre — le dessin qu'on fait à cinq ans. Sur un outil qui estime des
 * biens de prestige, à côté d'une tour à degrés, elle tirait toute la scène
 * vers le bas. Elle a cédé la place à une villa contemporaine : deux volumes
 * décalés, un étage en porte-à-faux sur poteaux, des baies toute hauteur, une
 * terrasse et un bassin à débordement.
 *
 * Le bassin, justement, était une ellipse au fond de laquelle se posait
 * l'écusson. Les deux sont partis. L'écusson d'abord : un logo au fond de
 * l'eau ne se lit pas comme une signature, il se lit comme un objet tombé
 * dedans — et il faisait doublon avec celui qui coiffe la tour, à quinze
 * centimètres de là. L'ellipse ensuite : un bassin de villa contemporaine est
 * rectangulaire, et le trapèze en perspective se lit mieux qu'un ovale posé à
 * plat.
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

export function SceneEncre({ className = '' }) {
  return (
    <svg
      viewBox="0 0 340 200"
      className={className}
      role="img"
      aria-label="Dessin à l’encre d’une tour Barnes et d’une villa contemporaine avec bassin, en cours de tracé"
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

      {/* --- La villa ------------------------------------------------------
          Deux volumes décalés plutôt qu'un pignon sur un rectangle. L'ordre du
          tracé est celui du chantier : la dalle basse, les murs du rez, la
          dalle intermédiaire qui déborde en porte-à-faux, le volume de
          l'étage, la toiture-terrasse. Chaque dalle est tracée de gauche à
          droite, chaque mur du sol vers le haut. */}

      {/* Dalle basse et terrasse — elle dépasse largement les murs des deux
          côtés : c'est ce débord qui fait lire « terrasse » et non « socle ». */}
      <Trait d="M 20 142 L 146 142.6" duree={0.7} retard={2.6} largeur={1.9} />

      {/* Volume du rez-de-chaussée, en retrait à droite pour laisser voir les
          poteaux de l'étage. */}
      <Trait d="M 34 142 L 34 102" duree={0.5} retard={3.05} largeur={1.8} />
      <Trait d="M 110 142 L 110 102" duree={0.5} retard={3.15} largeur={1.6} opacite={0.8} />

      {/* Dalle intermédiaire — la plus longue du dessin, et celle qui donne sa
          silhouette à la villa : elle sort de vingt unités au-delà du volume du
          bas, en porte-à-faux au-dessus de la terrasse. */}
      <Trait d="M 26 102 L 140 102.5" duree={0.75} retard={3.3} largeur={2} />

      {/* Volume de l'étage, décalé vers la droite par rapport au rez : c'est ce
          décalage qui remplace la symétrie du pignon. */}
      <Trait d="M 48 102 L 48 64" duree={0.5} retard={3.55} largeur={1.8} />
      <Trait d="M 136 102 L 136 64" duree={0.5} retard={3.62} largeur={1.8} />
      <Trait d="M 42 64 L 144 64.4" duree={0.6} retard={3.7} largeur={2} />

      {/* Poteaux du porte-à-faux — deux traits fins qui descendent de la dalle
          jusqu'à la terrasse. Sans eux, l'étage flotte. */}
      <Trait d="M 122 102 L 122 142" duree={0.4} retard={3.9} largeur={0.9} opacite={0.6} />
      <Trait d="M 133 102 L 133 142" duree={0.4} retard={3.96} largeur={0.9} opacite={0.6} />

      {/* Les baies : des meneaux verticaux plutôt que des carreaux, parce que
          c'est ainsi qu'on dessine une façade toute hauteur — et parce que
          quatre traits valent mieux que douze petits rectangles à cette
          échelle. */}
      {[46, 60, 74, 88, 102].map((x, index) => (
        <Trait
          key={`rez-${x}`}
          d={`M ${x} 138 L ${x} 107`}
          duree={0.28}
          retard={3.95 + index * 0.05}
          largeur={0.8}
          opacite={0.4}
        />
      ))}
      {[60, 76, 92, 108, 124].map((x, index) => (
        <Trait
          key={`etage-${x}`}
          d={`M ${x} 98 L ${x} 70`}
          duree={0.26}
          retard={4.1 + index * 0.05}
          largeur={0.8}
          opacite={0.4}
        />
      ))}

      {/* Le garde-corps de la terrasse haute, et la rambarde du porte-à-faux —
          deux filets horizontaux qui posent l'échelle du bâtiment. */}
      <Trait d="M 26 96 L 44 96" duree={0.3} retard={4.2} largeur={0.9} opacite={0.5} />
      <Trait d="M 42 60 L 144 60.3" duree={0.5} retard={4.25} largeur={0.9} opacite={0.45} />

      {/* --- Le bassin à débordement ---------------------------------------
          Un trapèze plutôt qu'une ellipse : vu depuis la terrasse, un bassin
          rectangulaire fuit vers le fond, et c'est cette fuite qui donne sa
          profondeur à la scène. Tracé d'un seul geste, en partant de l'angle
          proche gauche. */}
      <Trait
        d="M 26 186 L 48 152 L 128 152 L 158 186 Z"
        duree={1.1}
        retard={4.4}
        largeur={1.8}
      />

      {/* La margelle du débordement, un filet parallèle au bord lointain : elle
          suffit à faire lire « débordement » plutôt que « trou d'eau ». */}
      <Trait d="M 51 148 L 125 148" duree={0.45} retard={5.05} largeur={1} opacite={0.5} />

      {/* --- Les cyprès -----------------------------------------------------
          Deux fuseaux, montés du sol. Ils donnent l'échelle de la villa et
          plantent la scène en Provence — une villa contemporaine sans un arbre
          pourrait être n'importe où. */}
      <Trait
        d="M 12 142 C 4 116, 9 88, 13 76 C 18 92, 22 118, 16 142"
        duree={0.6}
        retard={5.3}
        largeur={1.2}
        opacite={0.7}
      />
      <Trait
        d="M 158 142 C 152 120, 156 100, 160 90 C 165 102, 168 122, 163 142"
        duree={0.55}
        retard={5.45}
        largeur={1.1}
        opacite={0.55}
      />

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
          d="M 62 164 q 7 -3 14 0 t 14 0"
          fill="none"
          stroke={ENCRE}
          strokeWidth="1"
          strokeLinecap="round"
          className="onde-bassin"
        />
        <path
          d="M 104 176 q 7 -3 14 0 t 14 0"
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
