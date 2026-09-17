/**
 * Le pinceau — brique commune à tous les dessins à l'encre du parcours.
 *
 * Quatre scènes s'en servent : la demeure de l'écran d'adresse (`MaisonEncre`),
 * la planche de l'écran d'analyse (`SceneEncre`), les vignettes qui
 * l'accompagnent (`ScenesLaterales`) et les dix planches de l'écran
 * d'assemblage (`ScenesProvence`). Chacune définissait son propre `Trait`, au
 * mot près ; la troisième a rendu la copie insoutenable.
 *
 * Les planches d'assemblage ont un temps fait exception, avec leur propre boîte
 * à outils de masses de couleur. Elles sont revenues au trait : une scène qui se
 * remplit de couleur ne se lit pas comme le reste du parcours, elle se lit comme
 * une image qu'on y aurait collée.
 *
 * Le principe est celui du sumi-e : rien n'apparaît, tout se trace. `.trace-encre`
 * (voir `index.css`) masque la longueur du tracé puis la libère, si bien que le
 * trait sort de son point de départ et court jusqu'au bout, comme une pointe
 * qui avance sur le papier. Un fondu donnerait le même dessin au bout du
 * compte ; il ne donnerait pas le geste.
 *
 * `pathLength="1"` renormalise les longueurs : une arête de vingt unités et une
 * façade de trois cents se pilotent alors avec les mêmes durées, et retoucher
 * un dessin ne demande pas de remesurer ses chemins.
 *
 * Le sens de chaque tracé est un choix, pas un détail : un mur se dessine du
 * sol vers le haut, un horizon de gauche à droite, un bassin d'un tour de
 * pinceau. Inverser un seul `M` fait descendre un bâtiment dans le sol.
 */

/** Rouge Barnes — l'encre, et la seule couleur de tous ces dessins. */
export const ENCRE = '#B4002F'

/**
 * La cadence — le facteur par lequel une planche entière ralentit ou accélère.
 *
 * Durées et retards sont écrits en `calc(… * var(--cadence, 1))` : poser
 * `--cadence` sur un ancêtre (le `<svg>` d'une planche, par exemple) étire toute
 * sa chorégraphie sans toucher à un seul de ses tracés. Sans défaut à 1, il
 * faudrait la déclarer partout ; avec, aucune scène existante ne bouge.
 *
 * C'est ce qui permet aux deux planches de l'écran d'assemblage de durer sept et
 * huit secondes alors qu'elles sont écrites sur cinq (voir `ScenesProvence`) :
 * elles se dessinent plus lentement, pas plus tard.
 */
const cadence = (secondes) => `calc(${secondes}s * var(--cadence, 1))`

/** Un trait : sa forme, son épaisseur, et le moment où le pinceau le pose. */
export function Trait({ d, duree, retard, largeur = 1.6, opacite = 1, couleur = ENCRE }) {
  return (
    <path
      d={d}
      pathLength="1"
      className="trace-encre"
      style={{ '--duree': cadence(duree), '--retard': cadence(retard) }}
      fill="none"
      stroke={couleur}
      strokeWidth={largeur}
      strokeOpacity={opacite}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

/**
 * Un aplat qui se pose — à employer là où il n'y a pas de contour à parcourir.
 *
 * En dessous de quelques unités, un carré n'a pas de trajet : le tracer revient
 * à le faire clignoter. `pose-encre` le fait apparaître d'un geste, ce qui est
 * la façon dont on poserait une touche de pinceau chargé.
 */
export function Touche({ x, y, largeur, hauteur, retard, duree = 0.45, opacite = 0.16, rx = 0.5 }) {
  return (
    <rect
      x={x}
      y={y}
      width={largeur}
      height={hauteur}
      rx={rx}
      fill={ENCRE}
      fillOpacity={opacite}
      className="pose-encre"
      style={{ '--retard': cadence(retard), '--duree': cadence(duree) }}
    />
  )
}
