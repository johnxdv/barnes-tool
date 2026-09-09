import { AnimatePresence, motion } from 'framer-motion'

/**
 * Illustrations animées des champs chiffrés du formulaire de caractéristiques.
 *
 * Une par champ, et volontairement pas la même : le curseur de surface
 * habitable et ses cinq silhouettes (`HouseIllustration`) donnent le langage —
 * un dessin qui réagit à la valeur, pas une décoration — mais recopier la même
 * maison partout ferait de dix champs distincts une seule ligne répétée. Chaque
 * illustration raconte donc sa donnée : le terrain s'étend, l'immeuble prend
 * des étages, la rangée de voitures s'allonge, le bâtiment change d'époque.
 *
 * Toutes partagent le même cadre (`VIEW_BOX`) et la même ligne de sol : posées
 * l'une sous l'autre dans une colonne, elles se lisent comme une même série.
 *
 * La couleur vient de `currentColor`, donc de la colonne qui les accueille —
 * marine à gauche, corail à droite. Seules Brass (toitures, mobilier) et Bottle
 * Green (végétal, eau) sont fixes.
 *
 * Ce fichier n'exporte que des composants : c'est la condition du
 * rafraîchissement à chaud de Vite, qu'un export de données ferait retomber sur
 * un rechargement complet de la page à chaque retouche d'un dessin.
 */

const VIEW_BOX = '0 0 240 88'

/** Ligne de sol commune, en coordonnées locales de `Scene` (sol = 0). */
const GROUND_Y = 74

/**
 * Deux ressorts, et deux seulement.
 *
 * `SPRING` porte ce qui se déforme continûment sous le doigt — largeurs,
 * hauteurs, échelles : amorti franc, aucun rebond parasite pendant un
 * glissement. `POP` porte ce qui apparaît d'un coup au clic — une voiture, un
 * lit, une pièce : plus raide et plus rebondissant, c'est lui qui rend le
 * « + » satisfaisant.
 */
const SPRING = { type: 'spring', stiffness: 210, damping: 26, mass: 0.7 }
const POP = { type: 'spring', stiffness: 380, damping: 24, mass: 0.6 }

const clamp01 = (value) => Math.min(1, Math.max(0, value))

/**
 * Cadre commun : `viewBox` partagée, et un repère translaté dont l'origine
 * verticale est la ligne de sol. Les dessins s'écrivent alors en hauteurs
 * négatives — « 24 au-dessus du sol » plutôt que « à l'ordonnée 50 » — ce qui
 * rend les glyphes lisibles et les origines de transformation triviales.
 */
function Scene({ children, ground = true }) {
  return (
    <svg viewBox={VIEW_BOX} role="presentation" aria-hidden="true" className="h-full w-full">
      <g transform={`translate(0 ${GROUND_Y})`}>
        {ground ? (
          <path
            d="M14 0 H226"
            stroke="currentColor"
            strokeOpacity="0.16"
            strokeWidth="2"
            strokeLinecap="round"
          />
        ) : null}
        {children}
      </g>
    </svg>
  )
}

/**
 * `<rect>` dont la position ou la largeur s'anime.
 *
 * Deux pièges de Framer Motion sur les formes SVG sont réglés ici, une fois
 * pour toutes :
 *
 * — `x` et `y` sont des noms de transformation. Demandés à un `<rect>`, ils
 *   sont ignorés sans rien dire (un `<g>`, lui, se translate bien) ; ce sont
 *   `attrX` et `attrY` qui visent les attributs.
 * — les attributs ne sont écrits qu'après le montage. Au premier rendu, React
 *   poserait un `width="undefined"` que le moteur SVG refuse bruyamment. Les
 *   valeurs de départ sont donc figées dans une ref : React les écrit au
 *   montage et n'y revient jamais — aucun conflit avec l'animation, qui prend
 *   le relais dès la première image.
 */
function AnimatedRect({ x, y, width, animate, initial, transition = SPRING, ...rest }) {
  const geometrie = {
    ...(x === undefined ? null : { attrX: x }),
    ...(y === undefined ? null : { attrY: y }),
    ...(width === undefined ? null : { width }),
  }

  // La géométrie est répétée dans `initial` : c'est elle qui peuple le premier
  // rendu. Sans elle, React écrirait un `width="undefined"` le temps d'une
  // image, et le moteur SVG le signalerait bruyamment en console.
  //
  // Elle ne doit surtout pas être posée en attribut JSX (`width={...}`) : le
  // moteur de rendu SVG de Framer Motion revendique alors la propriété et n'en
  // écrit plus aucune valeur. C'est par les états, et par eux seuls.
  return (
    <motion.rect
      initial={{ ...geometrie, ...initial }}
      animate={{ ...geometrie, ...animate }}
      transition={transition}
      {...rest}
    />
  )
}

/**
 * Rangée d'objets identiques qui s'allonge.
 *
 * Trois mouvements se composent : l'objet qui arrive tombe et rebondit (`POP`),
 * ceux déjà en place glissent vers leur nouvelle position (la rangée reste
 * centrée), et l'ensemble se réduit quand il déborde du cadre — la rangée
 * s'allonge donc tout en tenant toujours dans la même boîte.
 *
 * `transformOrigin` est posé explicitement partout : sans lui, un `<g>` SVG se
 * met à l'échelle autour du centre de la `viewBox`, et la rangée décollerait du
 * sol en rétrécissant.
 */
function Row({ count, itemWidth, gap, maxWidth = 198, renderItem }) {
  const total = count * itemWidth + Math.max(0, count - 1) * gap
  const scale = total > maxWidth ? maxWidth / total : 1
  const left = 120 - total / 2

  return (
    <motion.g
      style={{ transformOrigin: '120px 0px' }}
      animate={{ scale }}
      transition={SPRING}
    >
      <AnimatePresence initial={false}>
        {Array.from({ length: count }, (_, index) => (
          <motion.g
            key={index}
            style={{ transformOrigin: `${itemWidth / 2}px 0px` }}
            initial={{ opacity: 0, y: -16, scale: 0.6 }}
            animate={{ opacity: 1, y: 0, scale: 1, x: left + index * (itemWidth + gap) }}
            exit={{ opacity: 0, y: 10, scale: 0.5 }}
            transition={{ ...POP, x: SPRING }}
          >
            {renderItem(index)}
          </motion.g>
        ))}
      </AnimatePresence>
    </motion.g>
  )
}

/**
 * Repli des rangées à zéro : un exemplaire fantôme, très pâle et centré.
 *
 * Un cadre vide ne dirait rien ; la silhouette, elle, annonce ce que le champ
 * va dessiner — un lit, une voiture, un immeuble — avant même qu'on y touche.
 * Elle sert aux deux états à zéro, le non renseigné et le zéro déclaré : c'est
 * l'opacité de la carte entière, et la mention en vis-à-vis du libellé, qui les
 * distinguent (voir `FieldCard`).
 */
function Ghost({ width, children }) {
  return (
    <g opacity="0.22" transform={`translate(${120 - width / 2} 0)`}>
      {children}
    </g>
  )
}

/* ------------------------------------------------------------------ terrain */

/**
 * Surface du terrain — la parcelle s'élargit sous la maison, et se boise.
 *
 * La maison ne bouge pas d'un pixel : c'est l'étalon qui rend l'agrandissement
 * lisible. Sans elle, une bande verte qui s'allonge ne dirait rien d'une
 * surface. Les arbres arrivent par paliers, aux extrémités d'abord — la
 * parcelle se remplit du bord vers le centre, comme un terrain réellement
 * planté.
 */
export function TerrainIllustration({ value = 0, max = 5000 }) {
  const ratio = clamp01(value / max)
  const width = 46 + ratio * 164
  const trees = Math.min(7, Math.floor(value / 620))

  // Emplacements en fraction de largeur, dans l'ordre d'apparition. Le centre
  // (0,5) est laissé à la maison : aucune position n'y tombe.
  const spots = [0.09, 0.91, 0.24, 0.78, 0.03, 0.97, 0.33]

  return (
    <Scene>
      <AnimatedRect
        x={120 - width / 2}
        y={-6}
        width={width}
        height="12"
        rx="6"
        fill="#1F3B2E"
        fillOpacity="0.16"
        stroke="#1F3B2E"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />

      <AnimatePresence initial={false}>
        {spots.slice(0, trees).map((spot, index) => {
          const x = 120 - width / 2 + spot * width
          return (
            <motion.g
              key={spot}
              style={{ transformOrigin: '0px -6px' }}
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: 1, scale: 1, x }}
              exit={{ opacity: 0, scale: 0.2 }}
              transition={{ ...POP, x: SPRING, delay: index * 0.03 }}
            >
              <rect x="-1.5" y="-14" width="3" height="9" fill="currentColor" fillOpacity="0.65" />
              <circle cy="-17" r="6.5" fill="#1F3B2E" fillOpacity="0.85" />
              <circle cx="-3.5" cy="-13" r="4.5" fill="#1F3B2E" fillOpacity="0.6" />
              <circle cx="3.5" cy="-13" r="4" fill="#1F3B2E" fillOpacity="0.7" />
            </motion.g>
          )
        })}
      </AnimatePresence>

      {/* Maison-étalon, immobile au centre. */}
      <g transform="translate(120 0)">
        <rect x="-13" y="-22" width="26" height="22" fill="currentColor" />
        <path d="M-17 -21 L0 -34 L17 -21 Z" fill="#B08D57" />
        <rect x="-4" y="-13" width="8" height="13" rx="1" fill="#EDEAE3" />
        <rect x="-10" y="-18" width="5" height="5" rx="1" fill="#EDEAE3" />
        <rect x="5" y="-18" width="5" height="5" rx="1" fill="#EDEAE3" />
      </g>
    </Scene>
  )
}

/* --------------------------------------------------------------- terrasse */

/** Seuils d'ameublement de la terrasse, en m². */
const TERRASSE_CHAISE = 6
const TERRASSE_TABLE = 16
const TERRASSE_PARASOL = 38
const TERRASSE_TRANSAT = 75

/**
 * Surface de la terrasse — un platelage qui pousse contre la façade et se
 * meuble.
 *
 * L'échelle est dix fois plus courte que celle du terrain : une terrasse se
 * compte en dizaines de m², pas en milliers. Le mobilier fait le reste du
 * travail — c'est lui, plus que la largeur du platelage, qui dit à quoi
 * ressemble une terrasse de 15 m² face à une de 80.
 */
export function TerrasseIllustration({ value = 0, max = 200 }) {
  const ratio = clamp01(value / max)
  const width = 40 + ratio * 148
  const left = 42
  const planks = Math.max(2, Math.round(width / 13))

  return (
    <Scene>
      {/* Façade : la terrasse est adossée à quelque chose, elle ne flotte pas. */}
      <rect x="16" y="-52" width="26" height="52" fill="currentColor" fillOpacity="0.9" />
      <rect x="22" y="-44" width="14" height="20" rx="1" fill="#EDEAE3" />

      <AnimatedRect
        x={left}
        y={-9}
        width={width}
        height="9"
        rx="2"
        fill="#B08D57"
        fillOpacity="0.55"
      />

      <AnimatePresence initial={false}>
        {Array.from({ length: planks }, (_, index) => (
          <AnimatedRect
            key={index}
            x={left + 6 + index * 13}
            y={-9}
            width={1}
            height="9"
            fill="currentColor"
            fillOpacity="0.25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
        ))}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {value >= TERRASSE_CHAISE ? (
          <Furniture key="chaise" x={left + 16}>
            <rect x="-5" y="-9" width="10" height="2.5" rx="1" fill="currentColor" />
            <rect x="-5" y="-17" width="2.5" height="9" rx="1" fill="currentColor" />
            <rect x="-4" y="-7" width="1.5" height="7" fill="currentColor" fillOpacity="0.6" />
            <rect x="2.5" y="-7" width="1.5" height="7" fill="currentColor" fillOpacity="0.6" />
          </Furniture>
        ) : null}

        {value >= TERRASSE_TABLE ? (
          <Furniture key="table" x={left + 44}>
            <ellipse cy="-16" rx="13" ry="3" fill="currentColor" />
            <rect x="-1.5" y="-16" width="3" height="16" fill="currentColor" fillOpacity="0.7" />
            <rect x="-8" y="-4" width="16" height="1.5" rx="0.75" fill="currentColor" fillOpacity="0.4" />
          </Furniture>
        ) : null}

        {value >= TERRASSE_PARASOL ? (
          <Furniture key="parasol" x={left + 44}>
            <rect x="-1" y="-46" width="2" height="30" fill="currentColor" fillOpacity="0.8" />
            <path d="M-19 -40 Q0 -54 19 -40 Q0 -35 -19 -40 Z" fill="#B08D57" />
          </Furniture>
        ) : null}

        {value >= TERRASSE_TRANSAT ? (
          <Furniture key="transat" x={left + 92}>
            <path d="M-14 -6 H8 L14 -18 H-8 Z" fill="#B08D57" fillOpacity="0.85" />
            <rect x="-14" y="-6" width="24" height="2.5" rx="1" fill="currentColor" />
            <rect x="-12" y="-4" width="1.5" height="4" fill="currentColor" fillOpacity="0.6" />
            <rect x="7" y="-4" width="1.5" height="4" fill="currentColor" fillOpacity="0.6" />
          </Furniture>
        ) : null}
      </AnimatePresence>
    </Scene>
  )
}

/**
 * Meuble de terrasse : arrive du sol en rebondissant, repart en se tassant.
 *
 * La mise en place est un `<g>` ordinaire, à l'extérieur : Framer Motion écrit
 * lui-même l'attribut `transform` du groupe qu'il anime, et un `transform`
 * statique posé sur le même élément est purement et simplement écrasé — tout le
 * mobilier se retrouvait alors empilé à l'origine.
 */
function Furniture({ x, children }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <motion.g
        style={{ transformOrigin: '0px 0px' }}
        initial={{ opacity: 0, scale: 0.4, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.4, y: 6 }}
        transition={POP}
      >
        {children}
      </motion.g>
    </g>
  )
}

/* ----------------------------------------------------------------- époque */

/**
 * Année de construction — le bâtiment change de style, pas de taille.
 *
 * Six architectures, une par grande période du bâti français. C'est le seul
 * champ où la valeur ne se traduit pas en quantité : 1900 n'est pas « plus »
 * que 1850, c'est autre chose. Le fondu enchaîné le dit mieux qu'une
 * déformation continue — le curseur traverse un siècle et demi de façades.
 *
 * Les six dessins sont montés en permanence et superposés : rien n'est monté ni
 * démonté au franchissement d'un seuil, ce qui permet de traverser toute
 * l'échelle d'un geste sans à-coup.
 */
export function EpoqueIllustration({ value = 1970 }) {
  const active = EPOQUES.findIndex((epoque) => value < epoque.max)
  const index = active === -1 ? EPOQUES.length - 1 : active

  return (
    <div className="relative h-full w-full">
      {EPOQUES.map(({ id, Dessin }, position) => (
        <motion.div
          key={id}
          className="absolute inset-0"
          initial={false}
          animate={{
            opacity: position === index ? 1 : 0,
            scale: position === index ? 1 : 0.92,
          }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <Scene>
            <Dessin />
          </Scene>
        </motion.div>
      ))}
    </div>
  )
}

/** Avant 1850 — bastide de pierre : volume trapu, toit de tuiles, chaînages. */
function BatiAncien() {
  return (
    <g transform="translate(120 0)">
      <rect x="-34" y="-38" width="68" height="38" fill="currentColor" />
      <path d="M-40 -37 L0 -58 L40 -37 Z" fill="#B08D57" />
      <rect x="-34" y="-38" width="6" height="38" fill="currentColor" fillOpacity="0.55" />
      <rect x="28" y="-38" width="6" height="38" fill="currentColor" fillOpacity="0.55" />
      <rect x="-6" y="-20" width="12" height="20" rx="1" fill="#EDEAE3" />
      <rect x="-24" y="-30" width="9" height="11" rx="1" fill="#EDEAE3" />
      <rect x="15" y="-30" width="9" height="11" rx="1" fill="#EDEAE3" />
      <rect x="14" y="-70" width="8" height="14" fill="currentColor" />
    </g>
  )
}

/** 1850–1913 — haussmannien : façade haute, balcon filant, toit mansardé. */
function BatiHaussmannien() {
  return (
    <g transform="translate(120 0)">
      <path d="M-32 -52 L-26 -66 L26 -66 L32 -52 Z" fill="#B08D57" />
      <rect x="-32" y="-52" width="64" height="52" fill="currentColor" />
      <rect x="-32" y="-34" width="64" height="1.6" fill="#B08D57" fillOpacity="0.9" />
      {[-24, -8, 8].map((x) => (
        <rect key={`h${x}`} x={x} y="-48" width="10" height="12" rx="1" fill="#EDEAE3" />
      ))}
      {[-24, -8, 8].map((x) => (
        <rect key={`b${x}`} x={x} y="-28" width="10" height="12" rx="1" fill="#EDEAE3" />
      ))}
      <rect x="20" y="-48" width="6" height="12" rx="1" fill="#EDEAE3" fillOpacity="0.7" />
      <rect x="20" y="-28" width="6" height="12" rx="1" fill="#EDEAE3" fillOpacity="0.7" />
      <path d="M-30 -60 h8" stroke="#EDEAE3" strokeOpacity="0.6" strokeWidth="2" />
      <rect x="-7" y="-13" width="14" height="13" rx="1" fill="#EDEAE3" />
    </g>
  )
}

/** 1914–1948 — art déco : volume à redans, verticales marquées. */
function BatiArtDeco() {
  return (
    <g transform="translate(120 0)">
      <rect x="-30" y="-44" width="60" height="44" fill="currentColor" />
      <rect x="-20" y="-54" width="40" height="12" fill="currentColor" fillOpacity="0.92" />
      <rect x="-10" y="-62" width="20" height="10" fill="currentColor" fillOpacity="0.85" />
      <rect x="-2" y="-70" width="4" height="9" fill="#B08D57" />
      {[-24, -13, 9, 20].map((x) => (
        <rect key={x} x={x} y="-40" width="7" height="26" rx="1" fill="#EDEAE3" />
      ))}
      <rect x="-6" y="-50" width="12" height="8" rx="1" fill="#EDEAE3" fillOpacity="0.75" />
      <rect x="-30" y="-12" width="60" height="1.8" fill="#B08D57" fillOpacity="0.8" />
      <rect x="-7" y="-11" width="14" height="11" rx="1" fill="#EDEAE3" />
    </g>
  )
}

/** 1949–1980 — la barre : toit plat, trame de fenêtres, béton. */
function BatiModerne() {
  return (
    <g transform="translate(120 0)">
      <rect x="-48" y="-42" width="96" height="42" fill="currentColor" />
      <rect x="-51" y="-45" width="102" height="4" rx="1" fill="currentColor" fillOpacity="0.65" />
      {[0, 1, 2].map((row) =>
        [0, 1, 2, 3, 4, 5].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={-43 + col * 15}
            y={-37 + row * 11}
            width="10"
            height="7"
            fill="#EDEAE3"
            fillOpacity={0.9 - row * 0.12}
          />
        )),
      )}
      <rect x="-6" y="-11" width="12" height="11" rx="0.5" fill="#EDEAE3" />
    </g>
  )
}

/** 1981–2005 — le pavillon : toit à quatre pentes, garage accolé. */
function BatiPavillon() {
  return (
    <g transform="translate(120 0)">
      <rect x="20" y="-24" width="30" height="24" fill="currentColor" fillOpacity="0.85" />
      <path d="M16 -23 L35 -34 L54 -23 Z" fill="#B08D57" fillOpacity="0.85" />
      <rect x="25" y="-19" width="20" height="19" rx="1" fill="#EDEAE3" fillOpacity="0.75" />
      <rect x="-46" y="-32" width="66" height="32" fill="currentColor" />
      <path d="M-52 -31 L-36 -46 L4 -46 L20 -31 Z" fill="#B08D57" />
      <rect x="-20" y="-18" width="13" height="18" rx="1" fill="#EDEAE3" />
      <rect x="-40" y="-26" width="12" height="11" rx="1" fill="#EDEAE3" />
      <rect x="0" y="-26" width="12" height="11" rx="1" fill="#EDEAE3" />
    </g>
  )
}

/** 2006 et après — contemporain : cubes décalés, grandes baies, panneau. */
function BatiContemporain() {
  return (
    <g transform="translate(120 0)">
      <rect x="-46" y="-28" width="46" height="28" fill="currentColor" fillOpacity="0.85" />
      <rect x="-49" y="-31" width="52" height="3.5" rx="1" fill="currentColor" />
      <rect x="-2" y="-50" width="48" height="50" fill="currentColor" />
      <rect x="-5" y="-53" width="54" height="3.5" rx="1" fill="currentColor" />
      <rect x="4" y="-44" width="34" height="16" rx="1" fill="#EDEAE3" />
      <rect x="4" y="-22" width="16" height="22" rx="1" fill="#EDEAE3" />
      <rect x="-40" y="-22" width="30" height="14" rx="1" fill="#EDEAE3" fillOpacity="0.85" />
      <path d="M6 -57 L26 -57 L22 -63 L2 -63 Z" fill="#B08D57" />
      <circle cx="-24" cy="-4" r="3.5" fill="#1F3B2E" fillOpacity="0.7" />
    </g>
  )
}

/**
 * Bornes hautes exclues, dans l'ordre. La dernière absorbe tout ce qui suit —
 * un bâtiment de 2026 est contemporain, et le restera.
 */
const EPOQUES = [
  { id: 'ancien', max: 1850, Dessin: BatiAncien },
  { id: 'haussmannien', max: 1914, Dessin: BatiHaussmannien },
  { id: 'deco', max: 1949, Dessin: BatiArtDeco },
  { id: 'moderne', max: 1981, Dessin: BatiModerne },
  { id: 'pavillon', max: 2006, Dessin: BatiPavillon },
  { id: 'contemporain', max: Infinity, Dessin: BatiContemporain },
]

/* ----------------------------------------------------------------- pièces */

/**
 * Nombre de pièces — un plan qui se cloisonne.
 *
 * Le contour ne bouge jamais : ce sont les cloisons qui divisent un même
 * logement. C'est ainsi qu'on lit un plan, et cela distingue franchement ce
 * champ des trois curseurs de surface, où c'est l'enveloppe qui grandit.
 */
export function PiecesIllustration({ count = 0, max = 12 }) {
  const total = Math.min(count, max)
  const cells = PLAN_CELLS.slice(0, total)

  return (
    <Scene ground={false}>
      <rect
        x="52"
        y="-62"
        width="136"
        height="60"
        rx="2"
        fill="currentColor"
        fillOpacity="0.04"
        stroke="currentColor"
        strokeOpacity="0.5"
        strokeWidth="2.5"
      />
      {/* Porte d'entrée : l'entaille qui donne au plan son sens de lecture. */}
      <path d="M64 -2 h16" stroke="#ffffff" strokeWidth="3.5" />
      <path
        d="M64 -2 a16 16 0 0 1 16 -16"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="1.2"
      />

      {/* Le rebond est porté par un `<g>`, jamais par le `<rect>` : Framer Motion
          ne pose de transform que sur les groupes, une échelle demandée à une
          forme SVG est silencieusement ignorée. */}
      <AnimatePresence initial={false}>
        {cells.map(({ x, y, w, h }, index) => (
          <motion.g
            key={`${x}-${y}`}
            style={{ transformOrigin: `${x + w / 2}px ${y + h / 2}px` }}
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.3 }}
            transition={POP}
          >
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx="1.5"
              fill="currentColor"
              fillOpacity={0.16 + Math.min(index, 8) * 0.055}
            />
          </motion.g>
        ))}
      </AnimatePresence>
    </Scene>
  )
}

/**
 * Douze cellules dans l'ordre de cloisonnement — trame de 4 × 3 à l'intérieur
 * du contour, marges comprises. Le plan se remplit par rangées, de l'entrée
 * vers le fond.
 */
const PLAN_CELLS = Array.from({ length: 12 }, (_, index) => {
  const col = index % 4
  const row = Math.floor(index / 4)
  return { x: 56 + col * 33, y: -58 + row * 19, w: 29, h: 15 }
})

/* --------------------------------------------------------------- chambres */

/** Nombre de chambres — une rangée de lits qui s'allonge et se resserre. */
export function ChambresIllustration({ count = 0 }) {
  const lit = (
    <g>
      <rect x="0" y="-26" width="6" height="26" rx="1.5" fill="currentColor" />
      <rect x="4" y="-12" width="38" height="10" rx="2" fill="currentColor" fillOpacity="0.22" />
      <rect x="16" y="-16" width="26" height="5" rx="2" fill="#B08D57" />
      <rect
        x="7"
        y="-16"
        width="10"
        height="5"
        rx="2"
        fill="#ffffff"
        stroke="currentColor"
        strokeOpacity="0.35"
      />
      <rect x="5" y="-2" width="2.5" height="2" fill="currentColor" fillOpacity="0.5" />
      <rect x="38" y="-2" width="2.5" height="2" fill="currentColor" fillOpacity="0.5" />
    </g>
  )

  return (
    <Scene>
      {count <= 0 ? (
        <Ghost width={42}>{lit}</Ghost>
      ) : (
        <Row count={count} itemWidth={42} gap={9} renderItem={() => lit} />
      )}
    </Scene>
  )
}

/* --------------------------------------------------------- salles de bain */

/** Nombre de salles de bain — des baignoires, eau comprise. */
export function SdbIllustration({ count = 0 }) {
  const baignoire = (
    <g>
      {/* Robinetterie, dessinée avant la cuve : elle passe derrière. */}
      <path
        d="M5 -28 V-34 h9"
        fill="none"
        stroke="#B08D57"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M2 -28 H38 V-12 a7 7 0 0 1 -7 7 H9 a7 7 0 0 1 -7 -7 Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="2"
      />
      <path
        d="M5 -24 H35 V-13 a5 5 0 0 1 -5 5 H10 a5 5 0 0 1 -5 -5 Z"
        fill="#1F3B2E"
        fillOpacity="0.45"
      />
      <path
        d="M8 -21 q4 -2.5 8 0 t8 0 t8 0"
        fill="none"
        stroke="#EDEAE3"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <rect x="6" y="-5" width="3" height="5" rx="1" fill="currentColor" fillOpacity="0.55" />
      <rect x="31" y="-5" width="3" height="5" rx="1" fill="currentColor" fillOpacity="0.55" />
    </g>
  )

  return (
    <Scene>
      {count <= 0 ? (
        <Ghost width={40}>{baignoire}</Ghost>
      ) : (
        <Row count={count} itemWidth={40} gap={10} renderItem={() => baignoire} />
      )}
    </Scene>
  )
}

/* ----------------------------------------------------------- salles d'eau */

/**
 * Nombre de salles d'eau — des douches, et c'est l'eau qui les distingue des
 * baignoires : trois gouttes tombent en boucle sous chaque pomme. Le fantôme,
 * lui, reste sec — une animation en boucle sur un champ à zéro n'attirerait
 * l'œil que pour ne rien dire.
 */
export function SalleEauIllustration({ count = 0 }) {
  const cabine = (mouille) => (
    <g>
      <rect
        x="2"
        y="-52"
        width="32"
        height="52"
        rx="2"
        fill="currentColor"
        fillOpacity="0.07"
        stroke="currentColor"
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />
      <rect x="16.5" y="-52" width="3" height="8" fill="currentColor" fillOpacity="0.8" />
      <path d="M10 -44 H26 L23 -40 H13 Z" fill="#B08D57" />
      {mouille
        ? [0, 1, 2].map((drop) => (
            <motion.circle
              key={drop}
              cx={13 + drop * 5}
              r="1.7"
              fill="#1F3B2E"
              fillOpacity="0.55"
              initial={false}
              animate={{ cy: [-36, -12], opacity: [0, 1, 0] }}
              transition={{
                duration: 1.15,
                repeat: Infinity,
                ease: 'easeIn',
                delay: drop * 0.28,
              }}
            />
          ))
        : null}
      <rect x="6" y="-6" width="24" height="6" rx="2" fill="currentColor" fillOpacity="0.28" />
    </g>
  )

  return (
    <Scene>
      {count <= 0 ? (
        <Ghost width={36}>{cabine(false)}</Ghost>
      ) : (
        <Row count={count} itemWidth={36} gap={12} renderItem={() => cabine(true)} />
      )}
    </Scene>
  )
}

/* ---------------------------------------------------------------- niveaux */

const ETAGE_H = 11
const IMMEUBLE_W = 54

/**
 * Un niveau : bandeau plein, trois ouvertures — porte au rez-de-chaussée.
 *
 * `fillOpacity` n'est forcée que par `EtageIllustration`, qui éteint la pile
 * entière pour n'en rallumer qu'un niveau ; ailleurs, le dégradé par rang
 * suffit à donner du relief à l'immeuble.
 */
function Etage({ index, y, fillOpacity }) {
  return (
    <>
      <rect
        x={120 - IMMEUBLE_W / 2}
        y={y}
        width={IMMEUBLE_W}
        height={ETAGE_H}
        fill="currentColor"
        fillOpacity={fillOpacity ?? 0.92 - Math.min(index, 6) * 0.07}
      />
      {index === 0 ? (
        <>
          <rect x="115" y={y + 3} width="10" height={ETAGE_H - 3} rx="1" fill="#EDEAE3" />
          <rect x="99" y={y + 3} width="9" height="5" fill="#EDEAE3" fillOpacity="0.8" />
          <rect x="132" y={y + 3} width="9" height="5" fill="#EDEAE3" fillOpacity="0.8" />
        </>
      ) : (
        [99, 115.5, 132].map((x) => (
          <rect key={x} x={x} y={y + 3} width="9" height="5" fill="#EDEAE3" fillOpacity="0.85" />
        ))
      )}
    </>
  )
}

/**
 * Nombre de niveaux — l'immeuble monte.
 *
 * Chaque niveau arrive par le haut et pousse le toit devant lui ; passé cinq
 * étages, l'ensemble se réduit pour rester dans le cadre, exactement comme les
 * rangées se resserrent. Le rez-de-chaussée garde sa porte : c'est ce qui
 * empêche l'immeuble de se lire à l'envers.
 */
export function NiveauxIllustration({ count = 0 }) {
  if (count <= 0) {
    return (
      <Scene>
        <g opacity="0.22">
          <Etage index={0} y={-ETAGE_H} />
          <rect
            x={120 - IMMEUBLE_W / 2 - 4}
            y={-ETAGE_H - 5}
            width={IMMEUBLE_W + 8}
            height="5"
            rx="1.5"
            fill="#B08D57"
          />
        </g>
      </Scene>
    )
  }

  const height = count * ETAGE_H + 5
  const scale = height > 60 ? 60 / height : 1

  return (
    <Scene>
      <motion.g style={{ transformOrigin: '120px 0px' }} animate={{ scale }} transition={SPRING}>
        <AnimatePresence initial={false}>
          {Array.from({ length: count }, (_, index) => {
            const y = -(index + 1) * ETAGE_H
            return (
              <motion.g
                key={index}
                style={{ transformOrigin: `120px ${y + ETAGE_H / 2}px` }}
                initial={{ opacity: 0, y: -20, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -14, scale: 0.7 }}
                transition={POP}
              >
                <Etage index={index} y={y} />
              </motion.g>
            )
          })}
        </AnimatePresence>

        {/* Toiture : elle ne fait que suivre le sommet de la pile. */}
        <AnimatedRect
          x={120 - IMMEUBLE_W / 2 - 4}
          y={-(count * ETAGE_H) - 5}
          width={IMMEUBLE_W + 8}
          height="5"
          rx="1.5"
          fill="#B08D57"
        />
      </motion.g>
    </Scene>
  )
}

/* ------------------------------------------------------------------ étage */

/**
 * Étage d'un appartement — l'immeuble reste, c'est le niveau qui s'allume.
 *
 * Le champ ne compte rien : il désigne. La pile ne grandit donc pas à chaque
 * pas comme celle des niveaux, elle s'éteint tout entière et un seul bandeau
 * garde la couleur, qui glisse d'un cran à l'autre — on lit sa hauteur dans
 * l'immeuble, ce qu'un chiffre seul ne dit pas. L'immeuble ne pousse que
 * lorsqu'il le faut, deux étages au-dessus du niveau retenu, pour qu'un
 * troisième étage n'ait jamais l'air d'être le dernier.
 */
export function EtageIllustration({ value = 0 }) {
  const etage = Math.min(Math.max(value, 0), 12)
  const niveaux = Math.max(etage + 3, 5)
  const hauteur = niveaux * ETAGE_H + 5
  const scale = hauteur > 62 ? 62 / hauteur : 1

  return (
    <Scene>
      <motion.g style={{ transformOrigin: '120px 0px' }} animate={{ scale }} transition={SPRING}>
        {Array.from({ length: niveaux }, (_, index) => (
          <Etage key={index} index={index} y={-(index + 1) * ETAGE_H} fillOpacity={0.17} />
        ))}

        <AnimatedRect
          x={120 - IMMEUBLE_W / 2 - 4}
          y={-niveaux * ETAGE_H - 5}
          width={IMMEUBLE_W + 8}
          height="5"
          rx="1.5"
          fill="#B08D57"
          fillOpacity="0.4"
        />

        {/* Le niveau retenu, dessiné une fois au rez puis translaté : sa porte
            n'apparaît donc qu'au rez-de-chaussée, où elle a un sens. */}
        <motion.g
          initial={false}
          animate={{ y: -etage * ETAGE_H }}
          transition={SPRING}
        >
          <Etage index={etage} y={-ETAGE_H} fillOpacity={0.95} />
          <rect
            x={120 - IMMEUBLE_W / 2 - 13}
            y={-ETAGE_H + 3.5}
            width="9"
            height="4"
            rx="2"
            fill="#B08D57"
          />
        </motion.g>
      </motion.g>
    </Scene>
  )
}

/* ------------------------------------------------------------ voiture(s) */

/**
 * Silhouette de voiture, partagée par les deux champs de stationnement — c'est
 * le décor autour qui les distingue, pas le véhicule.
 */
function Voiture() {
  return (
    <g>
      <path d="M6 -13 L10 -21 H24 L29 -13 Z" fill="currentColor" fillOpacity="0.55" />
      <path d="M11.5 -14.5 L14 -19 H22.5 L25.5 -14.5 Z" fill="#EDEAE3" fillOpacity="0.9" />
      <rect x="0" y="-14" width="36" height="9" rx="3.5" fill="currentColor" />
      <circle cx="9" cy="-4" r="3.4" fill="#10141C" />
      <circle cx="27" cy="-4" r="3.4" fill="#10141C" />
      <circle cx="9" cy="-4" r="1.2" fill="#EDEAE3" fillOpacity="0.7" />
      <circle cx="27" cy="-4" r="1.2" fill="#EDEAE3" fillOpacity="0.7" />
      <rect x="32" y="-12" width="4" height="2.5" rx="1" fill="#B08D57" />
    </g>
  )
}

/** Séparateur de place, en pointillé — posé entre deux voitures seulement. */
function Marquage({ hauteur }) {
  return (
    <path
      d={`M-4 0 V-${hauteur}`}
      stroke="currentColor"
      strokeOpacity="0.26"
      strokeWidth="1.5"
      strokeDasharray="3 3"
    />
  )
}

/**
 * Stationnements extérieurs — les voitures sont à ciel ouvert : marquage au
 * sol, un nuage, rien au-dessus. C'est l'absence de toit qui fait tout le sens
 * du champ, opposée trait pour trait à la version intérieure.
 */
export function ParkingExtIllustration({ count = 0 }) {
  return (
    <Scene>
      {/* Ciel : un nuage suffit à dire « dehors ». */}
      <g fill="currentColor" fillOpacity="0.13">
        <circle cx="188" cy="-62" r="8" />
        <circle cx="199" cy="-64" r="10" />
        <circle cx="211" cy="-61" r="7" />
        <rect x="188" y="-62" width="23" height="8" />
      </g>

      {count <= 0 ? (
        <Ghost width={38}>
          <rect x="0" y="-1" width="38" height="4" rx="1" fill="currentColor" fillOpacity="0.25" />
          <g transform="translate(1 0)">
            <Voiture />
          </g>
        </Ghost>
      ) : (
        <Row
          count={count}
          itemWidth={38}
          gap={8}
          renderItem={(index) => (
            <g>
              <rect
                x="0"
                y="-1"
                width="38"
                height="4"
                rx="1"
                fill="currentColor"
                fillOpacity="0.09"
              />
              {index > 0 ? <Marquage hauteur={24} /> : null}
              <g transform="translate(1 0)">
                <Voiture />
              </g>
            </g>
          )}
        />
      )}
    </Scene>
  )
}

/**
 * Stationnements intérieurs — mêmes voitures, mais sous dalle : une couverture
 * franchit toute la rangée et s'allonge avec elle, portée par deux poteaux.
 */
export function ParkingIntIllustration({ count = 0 }) {
  const itemWidth = 38
  const gap = 8

  if (count <= 0) {
    return (
      <Scene>
        <Ghost width={itemWidth + 22}>
          <rect x="0" y="-40" width="6" height="40" fill="currentColor" fillOpacity="0.35" />
          <rect x={itemWidth + 16} y="-40" width="6" height="40" fill="currentColor" fillOpacity="0.35" />
          <rect x="0" y="-46" width={itemWidth + 22} height="7" rx="2" fill="currentColor" />
          <g transform="translate(12 0)">
            <Voiture />
          </g>
        </Ghost>
      </Scene>
    )
  }

  const total = count * itemWidth + Math.max(0, count - 1) * gap
  const scale = total > 186 ? 186 / total : 1
  const span = total + 22

  return (
    <Scene>
      <motion.g style={{ transformOrigin: '120px 0px' }} animate={{ scale }} transition={SPRING}>
        {/* Poteaux, puis dalle : la couverture passe par-dessus. */}
        <AnimatedRect
          x={120 - span / 2}
          y={-40}
          width={6}
          height="40"
          fill="currentColor"
          fillOpacity="0.35"
        />
        <AnimatedRect
          x={120 + span / 2 - 6}
          y={-40}
          width={6}
          height="40"
          fill="currentColor"
          fillOpacity="0.35"
        />
        <AnimatedRect
          x={120 - span / 2}
          y={-46}
          width={span}
          height="7"
          rx="2"
          fill="currentColor"
        />
        <AnimatedRect
          x={120 - span / 2 + 6}
          y={-38}
          width={Math.max(0, span - 12)}
          height="1.5"
          fill="#B08D57"
          fillOpacity="0.6"
        />

        <AnimatePresence initial={false}>
          {Array.from({ length: count }, (_, index) => (
            <motion.g
              key={index}
              style={{ transformOrigin: `${itemWidth / 2}px 0px` }}
              initial={{ opacity: 0, y: -14, scale: 0.6 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                x: 120 - total / 2 + index * (itemWidth + gap),
              }}
              exit={{ opacity: 0, y: 10, scale: 0.5 }}
              transition={{ ...POP, x: SPRING }}
            >
              {index > 0 ? <Marquage hauteur={30} /> : null}
              <g transform="translate(1 0)">
                <Voiture />
              </g>
            </motion.g>
          ))}
        </AnimatePresence>
      </motion.g>
    </Scene>
  )
}

/* ---------------------------------------------------------------- piscine */

/**
 * Bassin — la seule illustration qui ne compte rien : elle s'ouvre et se
 * remplit à « Oui », se rétracte et s'assèche à « Non ». Les vagues n'ondulent
 * que quand le bassin est déclaré : une boucle d'animation sur un champ que
 * personne n'a touché n'attirerait l'œil que pour ne rien dire.
 */
export function PiscineIllustration({ active }) {
  return (
    <svg viewBox="0 0 240 56" role="presentation" aria-hidden="true" className="h-full w-full">
      <AnimatedRect
        x={active ? 62 : 92}
        y={14}
        width={active ? 116 : 56}
        height="30"
        rx="8"
        fill="currentColor"
        fillOpacity="0.14"
        stroke="currentColor"
        strokeOpacity="0.4"
        strokeWidth="2"
      />
      <AnimatedRect
        x={active ? 67 : 97}
        y={19}
        width={active ? 106 : 46}
        height="20"
        rx="5"
        fill="#1F3B2E"
        animate={{ fillOpacity: active ? 0.6 : 0.12 }}
      />
      {active
        ? [0, 1].map((wave) => (
            <motion.path
              key={wave}
              d={`M76 ${28 + wave * 7} q7 -3.5 14 0 t14 0 t14 0 t14 0 t14 0`}
              fill="none"
              stroke="#EDEAE3"
              strokeOpacity={0.55 - wave * 0.2}
              strokeWidth="1.6"
              strokeLinecap="round"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: [0, 14, 0] }}
              transition={{
                opacity: { duration: 0.3 },
                x: { duration: 3.2 + wave, repeat: Infinity, ease: 'easeInOut' },
              }}
            />
          ))
        : null}
    </svg>
  )
}
