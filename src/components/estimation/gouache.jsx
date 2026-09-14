import { useId } from 'react'

/**
 * Le pinceau chargé — brique commune des scènes peintes de l'écran
 * d'assemblage (voir `ScenesProvence`).
 *
 * ── Pourquoi une seconde boîte à outils ───────────────────────────────────
 *
 * `encre.jsx` sait faire une chose, et la fait bien : un trait qui se trace.
 * C'est le geste du dessinateur — une pointe, une ligne, du blanc autour. Les
 * scènes d'assemblage demandent l'autre geste, celui du peintre : une masse de
 * couleur qu'on étale, un lavis qui se dépose en deux ou trois passes de
 * brosse, une touche sèche par-dessus quand c'est presque sec.
 *
 * Les deux cohabitent — une scène de gouache se termine au trait, comme une
 * vraie planche : les masses d'abord, le dessin ensuite.
 *
 * ── Comment une masse peut « se peindre » ─────────────────────────────────
 *
 * Un aplat qui apparaît en fondu n'a jamais l'air peint : il n'a pas de sens de
 * lecture, pas de geste, pas de bord humide. Le procédé retenu est celui du
 * masque balayé :
 *
 *  1. la masse n'est pas un aplat : c'est **une suite de passes de brosse**,
 *     deux à quatre allers-retours ondulants, chacun peint à opacité partielle ;
 *  2. la forme ne sert qu'à découper ce qui dépasse (`clipPath`) ;
 *  3. chaque passe se dévoile avec `.trace-encre` (voir `index.css`), l'une
 *     après l'autre, c'est-à-dire en avançant.
 *
 * Le résultat : la couleur arrive par passes, de gauche à droite, et se charge
 * là où deux passes se recouvrent. On voit la main, et on voit le papier là où
 * la brosse a manqué. C'est le seul point du fichier qui compte vraiment ; tout
 * le reste en découle.
 *
 * ── Ce qui n'est pas fait, et pourquoi ────────────────────────────────────
 *
 * Pas de `feTurbulence` ni de `feDisplacementMap` pour trembler les bords. Le
 * rendu serait plus riche d'un cran, et coûterait un recalcul de filtre sur
 * toute la surface à chaque image pendant dix secondes — sur un écran d'attente,
 * donc précisément là où une saccade se remarque. L'irrégularité est écrite à la
 * main dans les tracés eux-mêmes : aucun bord n'est droit, aucune passe n'a la
 * même amplitude, et deux masses voisines ne se recouvrent jamais exactement.
 *
 * ── Le mode « moins d'animations » ────────────────────────────────────────
 *
 * Couvert sans condition par le filet global d'`index.css` : toute durée tombe à
 * 0,001 ms en gardant `forwards`, et les scènes s'affichent d'emblée peintes.
 */

/**
 * La palette — des tons naturels de Provence, et rien d'autre.
 *
 * Aucun noir, aucun blanc pur, aucune couleur saturée : une gouache posée sur
 * papier n'atteint ni l'un ni l'autre, et c'est ce qui la distingue d'un
 * aplat vectoriel. Le plus sombre est un brun d'ombre (`encre`), le plus clair
 * un blanc cassé (`craie`).
 *
 * Le rouge Barnes n'y figure pas. Il est la couleur du trait d'encre du reste du
 * parcours ; posé dans un paysage à la gouache, il n'aurait été qu'une tache.
 */
export const PALETTE = {
  /** Ciels et lointains — bleu délavé, celui d'un ciel du Midi en fin de matinée. */
  cielHaut: '#A8C4D4',
  cielBas: '#D6E2E6',
  bleu: '#7C9FB5',
  bleuProfond: '#5A7E96',
  /** Le bleu d'ombre sur la neige — le seul froid clair de la palette. */
  bleuPale: '#C4D6DF',
  /** Végétation — du vert sauge au vert olive des cyprès. */
  sauge: '#93A88A',
  saugeClair: '#B4C3A6',
  olive: '#6E7F5E',
  olivePro: '#4F5E44',
  /** Terres, pierres et façades. */
  ocre: '#C99B55',
  ocreClair: '#E3C68D',
  pierre: '#DCCBA8',
  pierreOmbre: '#BFA87F',
  terre: '#B47A52',
  tuile: '#BF6B4C',
  /** Ombres et dessin. Un brun profond, jamais un noir. */
  encre: '#5C5344',
  encreClaire: '#8A7F6C',
  /** Blanc cassé — neige, embruns, papier réservé. */
  craie: '#F2ECE0',
}

/** Désordre reproductible : le même index rend toujours le même écart. */
export const bruit = (index, amplitude = 1) =>
  ((Math.sin(index * 12.9898) * 43758.5453) % 1) * amplitude

/**
 * Le trajet de la brosse sur une surface — un serpentin en aller-retour, rendu
 * passe par passe.
 *
 * C'est la matière de tous les lavis. Les passes ondulent (une brosse chargée ne
 * tient pas la ligne), s'arrêtent chacune à un endroit différent et alternent de
 * sens : c'est le geste réel de quelqu'un qui couvre une surface, et il commence
 * toujours par la gauche.
 *
 * `pathLength="1"` sur le tracé rend la cadence indépendante de la taille : une
 * masse de ciel et un volet de fenêtre se peignent avec les mêmes durées.
 */
export function passesDeBrosse(x, y, largeur, hauteur, passes = 3, graine = 0) {
  const pas = hauteur / passes
  // La brosse s'arrête **en deçà** du bord de la masse, et jamais au même
  // endroit d'une passe à l'autre. C'est ce qui donne les flancs : ce qu'on voit
  // s'arrête sur des bouts de brosse ronds, décalés, qui découpent le bord. Une
  // brosse qui déborderait laisserait au contraire l'arête vive du vecteur.
  const retrait = pas * 0.12
  const trajets = []

  for (let rang = 0; rang < passes; rang += 1) {
    const cy = y + pas * (rang + 0.5)
    // L'amplitude de dérive est ce qui fait le bord peint : à 0,1 pas, la passe
    // est droite et la masse redevient un rectangle ; à 0,5, elle ondule assez
    // pour laisser des manques en haut et en bas, là où la brosse n'a pas porté.
    const derive = bruit(rang + graine, pas * 0.5) - pas * 0.12
    const gauche = x + retrait + bruit(rang + graine + 11, pas * 0.55)
    const droite = x + largeur - retrait - bruit(rang + graine + 23, pas * 0.55)
    const [depart, arrivee] = rang % 2 === 0 ? [gauche, droite] : [droite, gauche]
    const course = arrivee - depart

    trajets.push(
      `M ${depart.toFixed(1)} ${(cy + derive).toFixed(1)} ` +
        `C ${(depart + course * 0.34).toFixed(1)} ${(cy - pas * 0.24 + derive).toFixed(1)}, ` +
        `${(depart + course * 0.67).toFixed(1)} ${(cy + pas * 0.22 + derive).toFixed(1)}, ` +
        `${arrivee.toFixed(1)} ${(cy + derive * 0.4).toFixed(1)}`,
    )
  }

  return trajets
}

/**
 * Un lavis — une masse de couleur déposée en quelques passes de brosse.
 *
 * `d` est la forme, `boite` l'emprise que la brosse doit couvrir : les passes
 * sont calculées depuis celle-ci, ce qui évite de décrire deux fois chaque
 * masse. Une boîte un peu plus large que la forme ne coûte rien — le débord est
 * découpé par la forme ; une boîte trop courte laisse un bord non peint, ce qui
 * se voit immédiatement.
 *
 * ── Pourquoi les passes sont peintes et non masquées ──────────────────────
 *
 * La première version posait la forme en couleur pleine et la révélait derrière
 * un masque en forme de serpentin. Le geste y était — la couleur arrivait en
 * balayant — mais le résultat était un aplat : un masque est binaire, et deux
 * passages de brosse au même endroit donnaient exactement la même densité qu'un
 * seul.
 *
 * Ici, **chaque passe est réellement peinte**, à opacité partielle, et la forme
 * ne sert plus qu'à découper ce qui dépasse (`clipPath`). Là où deux passes se
 * recouvrent, la couleur double ; là où la brosse a manqué, le papier reste nu.
 * C'est toute la différence entre une gouache et un aplat vectoriel, et elle
 * tient dans ce seul choix.
 *
 * `passes` est le nombre d'allers-retours : deux pour une petite masse, trois ou
 * quatre pour un ciel. Au-delà, la brosse devient un aérographe et le geste
 * disparaît.
 */
export function Lavis({
  d,
  boite,
  couleur,
  opacite = 0.55,
  passes = 3,
  retard = 0,
  duree = 0.9,
  graine = 0,
}) {
  // `useId` par lavis : deux planches peuvent être à l'écran en même temps, et
  // un identifiant de découpe dupliqué ferait peindre la seconde dans la forme
  // de la première. Les deux-points que React y met sont retirés — ils sont
  // légaux dans un `id`, mais pas dans tous les outils qui liront ce DOM.
  const id = `lavis${useId().replace(/:/g, '')}`
  const [bx, by, bl, bh] = boite
  const trajets = passesDeBrosse(bx, by, bl, bh, passes, graine)
  // Chaque passe prend une part de la durée totale et part quand la précédente
  // s'achève presque : la main ne lève pas la brosse entre deux allers-retours.
  const dureePasse = (duree / passes) * 1.25

  return (
    <g>
      <clipPath id={id}>
        <path d={d} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        {trajets.map((trajet, rang) => (
          <path
            key={rang}
            d={trajet}
            pathLength="1"
            className="trace-encre"
            style={{
              '--duree': `${dureePasse}s`,
              '--retard': `${retard + (rang * duree) / passes}s`,
            }}
            fill="none"
            stroke={couleur}
            // Les passes se recouvrent d'un tiers, et l'opacité est calculée
            // pour que ce tiers soit visible : c'est là que la couleur se
            // charge, comme sur le papier.
            strokeOpacity={opacite * 0.62}
            strokeWidth={(bh / passes) * 1.42}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </g>
    </g>
  )
}

/**
 * Un coup de brosse — la trace elle-même, sans forme à remplir.
 *
 * Sert à tout ce qui *est* un geste plutôt qu'une masse : une branche, un reflet
 * sur l'eau, l'ombre portée d'un mur, un rang de vigne. `largeur` est le calibre
 * de la brosse ; au-delà d'une dizaine d'unités on ne peint plus, on remplit —
 * c'est alors un lavis qu'il faut.
 */
export function Coup({ d, couleur, largeur = 3, opacite = 0.7, retard = 0, duree = 0.5 }) {
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
 * Une touche posée — la brosse qui descend, marque, et remonte.
 *
 * Pour ce qui est trop petit pour avoir un trajet : une tuile, un feuillage
 * d'olivier, une fenêtre éclairée, un caillou. `pose-encre` (voir `index.css`)
 * la fait arriver d'un geste, avec le très léger dépassement d'échelle d'une
 * brosse qui appuie puis se relève.
 */
export function Touche({ cx, cy, rx, ry, couleur, opacite = 0.6, rotation = 0, retard = 0, duree = 0.4 }) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={rx}
      ry={ry}
      fill={couleur}
      fillOpacity={opacite}
      transform={rotation ? `rotate(${rotation} ${cx} ${cy})` : undefined}
      className="pose-encre"
      style={{ '--retard': `${retard}s`, '--duree': `${duree}s` }}
    />
  )
}


/**
 * Un pavé — le rectangle peint à main levée.
 *
 * Aucun de ses quatre angles n'est à sa place, et c'est tout l'objet : une
 * fenêtre, un volet, une affiche posés au vecteur se repèrent immédiatement dans
 * une planche où rien d'autre n'est droit. Le désordre est reproductible
 * (`graine`) — deux rendus successifs de la même scène donnent le même
 * dessin, sans quoi la planche « bougerait » à chaque rendu de l'écran.
 *
 * Il se pose (`pose-encre`) au lieu de se tracer : à cette taille, la brosse
 * n'a pas de trajet, elle appuie.
 */
export function Pave({ x, y, largeur, hauteur, couleur, opacite = 0.5, retard = 0, duree = 0.32, graine = 0 }) {
  const ecart = (index, amplitude) => bruit(index + graine, amplitude) - amplitude / 2
  const d =
    `M ${x + ecart(1, 2.4)} ${y + ecart(2, 2)} ` +
    `L ${x + largeur + ecart(3, 2)} ${y + ecart(4, 2.4)} ` +
    `L ${x + largeur + ecart(5, 2.4)} ${y + hauteur + ecart(6, 2)} ` +
    `L ${x + ecart(7, 2)} ${y + hauteur + ecart(8, 2.4)} Z`

  return (
    <path
      d={d}
      fill={couleur}
      fillOpacity={opacite}
      className="pose-encre"
      style={{ '--retard': `${retard}s`, '--duree': `${duree}s` }}
    />
  )
}

/**
 * Le trait de reprise — le dessin qu'on remet par-dessus la couleur sèche.
 *
 * Toujours en dernier dans une scène, toujours en `encre` ou `encreClaire`, et
 * toujours fin. C'est ce qui fait tenir une gouache : sans reprise, les masses
 * flottent ; avec une reprise trop appuyée, on a colorié un dessin au lieu
 * d'avoir peint.
 */
export function Reprise({ d, largeur = 1, opacite = 0.55, retard = 0, duree = 0.45, couleur = PALETTE.encre }) {
  return <Coup d={d} couleur={couleur} largeur={largeur} opacite={opacite} retard={retard} duree={duree} />
}
