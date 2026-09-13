/**
 * Motifs graphiques du rapport — la part du document qui ne dit rien.
 *
 * Tout le reste des pages est de l'information : un chiffre, un libellé, une
 * carte. Ce fichier porte ce qui n'en est pas — arcs, hachures, filets, angles
 * — et qui fait pourtant la différence entre une sortie de programme et un
 * document d'agence. Une couverture blanche avec une adresse au milieu est
 * lisible ; elle n'est pas présentable à un vendeur qui confie un bien à deux
 * millions d'euros.
 *
 * ── Quatre règles, et elles tiennent tout le fichier ──────────────────────
 *
 *  1. **Une seule couleur.** Le rouge Barnes, décliné en opacités. Pas de
 *     seconde teinte décorative : la charte du site n'en a pas, et un motif
 *     inventerait une couleur de marque que personne n'a validée.
 *
 *  2. **Du SVG, jamais d'image.** Le rapport s'imprime. Un aplat rasterisé
 *     sort crénelé d'une imprimante à 600 points par pouce ; un arc vectoriel
 *     sort net. C'est aussi ce qui permet aux motifs de ne rien peser.
 *
 *  3. **Jamais sous du texte lisible.** Les motifs vivent dans les marges, les
 *     angles, les bandeaux — pas derrière un paragraphe. Un fond à 4 %
 *     d'opacité à l'écran devient un gris franc sur certaines imprimantes, et
 *     le texte par-dessus perd son contraste.
 *
 *  4. **`aria-hidden` partout.** Rien ici ne s'annonce à un lecteur d'écran :
 *     ce sont des ornements, et les décrire reviendrait à lire la mise en page
 *     à voix haute.
 */

const BARNES = '#B4002F'

/**
 * Trame de hachures obliques — le fond de la couverture.
 *
 * Un `<pattern>` plutôt que trente lignes posées à la main : il se répète tout
 * seul quelle que soit la surface couverte, et le SVG reste à quelques
 * centaines d'octets. L'identifiant est fixe et donc unique dans le document,
 * la trame n'étant employée qu'une fois.
 */
function TrameObliques({ id, pas = 7, opacite = 0.5 }) {
  return (
    <pattern id={id} width={pas} height={pas} patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
      <line x1="0" y1="0" x2="0" y2={pas} stroke={BARNES} strokeWidth="0.9" strokeOpacity={opacite} />
    </pattern>
  )
}

/**
 * Composition de couverture — arcs, trame et bandeau, posés en fond de page.
 *
 * Le dessin reprend le geste de l'écusson : des cercles concentriques, coupés
 * par le bord de la feuille. Il en sort deux masses — une en haut à droite,
 * une en bas à gauche — qui encadrent le bloc de titre sans jamais passer
 * dessous, et qui donnent à la page une diagonale que le seul texte ne lui
 * donnait pas.
 *
 * `preserveAspectRatio="none"` : la composition doit épouser la feuille, quel
 * que soit son format d'affichage. Les arcs s'en trouvent légèrement ovalisés,
 * ce qui est sans conséquence — ce sont des masses, pas des cercles à mesurer.
 */
export function MotifCouverture() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 210 297"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <defs>
        <TrameObliques id="trame-couverture" />
        <linearGradient id="voile-couverture" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BARNES} stopOpacity="0.14" />
          <stop offset="100%" stopColor={BARNES} stopOpacity="0" />
        </linearGradient>
        {/* Le quart de disque du coin supérieur droit sert deux fois : une fois
            comme aplat dégradé, une fois comme fenêtre par laquelle la trame
            apparaît. Un masque évite de décrire deux fois la même forme. */}
        <clipPath id="coin-couverture">
          <path d="M 210 0 L 210 118 A 118 118 0 0 0 92 0 Z" />
        </clipPath>
      </defs>

      <g clipPath="url(#coin-couverture)">
        <rect x="92" y="0" width="118" height="118" fill="url(#voile-couverture)" />
        <rect x="92" y="0" width="118" height="118" fill="url(#trame-couverture)" opacity="0.55" />
      </g>

      {/* Les arcs concentriques, tracés par-dessus la masse : ils la relient au
          reste de la page au lieu de la laisser flotter dans son angle. */}
      {[128, 150, 172].map((rayon, index) => (
        <path
          key={rayon}
          d={`M ${210 - rayon} 0 A ${rayon} ${rayon} 0 0 0 210 ${rayon}`}
          fill="none"
          stroke={BARNES}
          strokeWidth={index === 0 ? 0.9 : 0.5}
          strokeOpacity={0.5 - index * 0.13}
        />
      ))}

      {/* Contrepoids en bas à gauche — trois quarts d'arc, plus discrets : la
          page se lit de haut en bas, et une masse aussi forte en pied
          rivaliserait avec le titre. */}
      {[46, 62, 78].map((rayon, index) => (
        <path
          key={rayon}
          d={`M 0 ${297 - rayon} A ${rayon} ${rayon} 0 0 0 ${rayon} 297`}
          fill="none"
          stroke={BARNES}
          strokeWidth={index === 0 ? 0.8 : 0.45}
          strokeOpacity={0.4 - index * 0.1}
        />
      ))}

      {/* Le pied de page : un bandeau plein, seul aplat franc du document. Il
          ferme la feuille et rappelle le filet de tête, qui fait un millimètre
          quand celui-ci en fait cinq. */}
      <rect x="0" y="292" width="210" height="5" fill={BARNES} />
      <rect x="0" y="289.6" width="70" height="1.2" fill={BARNES} opacity="0.45" />
    </svg>
  )
}

/**
 * Angle décoratif — deux traits en équerre, posés dans un coin de bloc.
 *
 * Sert à signer un encadré sans lui donner une bordure complète : la ligne
 * fermée enferme, l'équerre désigne. Employé sur les blocs de chiffres des
 * pages de marché et d'estimation.
 */
export function AngleBarnes({ className = '', taille = 14 }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${taille} ${taille}`}
      width={taille}
      height={taille}
      className={`pointer-events-none absolute ${className}`}
    >
      <path
        d={`M 0 ${taille} L 0 0 L ${taille} 0`}
        fill="none"
        stroke={BARNES}
        strokeWidth="1.4"
        strokeOpacity="0.55"
      />
    </svg>
  )
}

/**
 * Bandeau d'en-tête de page — la bande oblique qui court derrière le surtitre.
 *
 * Discrète au point d'être presque invisible page par page, et c'est le but :
 * ce qu'on doit remarquer, c'est que les onze feuilles appartiennent au même
 * document. Un motif qui se voit sur une page se voit onze fois.
 */
export function TrameEntete({ className = '' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 24"
      preserveAspectRatio="none"
      className={`pointer-events-none ${className}`}
    >
      <defs>
        <TrameObliques id="trame-entete" pas={5} opacite={0.35} />
        <linearGradient id="fondu-entete" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        <mask id="masque-entete">
          <rect width="120" height="24" fill="url(#fondu-entete)" />
        </mask>
      </defs>
      <rect width="120" height="24" fill="url(#trame-entete)" mask="url(#masque-entete)" />
    </svg>
  )
}
