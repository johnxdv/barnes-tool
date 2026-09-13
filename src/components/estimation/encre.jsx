/**
 * Le pinceau — brique commune à tous les dessins à l'encre du parcours.
 *
 * Trois scènes s'en servent : la tour de l'écran d'adresse (`TourEncre`), la
 * planche de l'écran d'analyse (`SceneEncre`) et les vignettes qui
 * l'accompagnent (`ScenesLaterales`). Chacune définissait son propre `Trait`,
 * au mot près ; la troisième a rendu la copie insoutenable.
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

/** Un trait : sa forme, son épaisseur, et le moment où le pinceau le pose. */
export function Trait({ d, duree, retard, largeur = 1.6, opacite = 1, couleur = ENCRE }) {
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
      style={{ '--retard': `${retard}s`, '--duree': `${duree}s` }}
    />
  )
}
