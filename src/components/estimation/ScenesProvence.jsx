import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Touche, Trait } from './encre'

/**
 * Les dix planches de l'écran d'assemblage — des scènes dessinées à l'encre,
 * tirées au sort deux par deux, qui se tracent de part et d'autre du module
 * pendant que le rapport se monte.
 *
 * ── Le dispositif ─────────────────────────────────────────────────────────
 *
 * Dix secondes, deux temps de cinq :
 *
 *  - **0 à 5 s** — une scène se dessine dans la colonne de gauche.
 *  - **5 à 10 s** — une seconde scène, tirée dans le même lot mais jamais la
 *    même, se dessine dans la colonne de droite.
 *
 * Le second temps n'est pas un décalage de délais : la planche de droite est
 * **montée cinq secondes plus tard** (voir `DuoProvence`). C'est ce qui permet
 * d'écrire chaque scène avec ses propres retards, de zéro à cinq secondes, sans
 * avoir à propager un décalage dans deux cents tracés.
 *
 * La planche de droite est la même géométrie, retournée (`scale(-1, 1)`) : la
 * pointe y court de droite à gauche, et la scène se penche vers le module
 * comme celle de gauche s'y penche. Aucune scène ne porte de texte ni
 * d'écusson, précisément pour que ce retournement reste indolore.
 *
 * ── Le tirage ─────────────────────────────────────────────────────────────
 *
 * Deux scènes distinctes parmi dix, tirées une fois par rapport. Un agent fait
 * passer cet écran plusieurs fois par jour, sous les yeux de vendeurs
 * différents : une planche unique deviendrait, dès la troisième estimation,
 * l'écran d'attente qu'on ne regarde plus. Dix scènes tirées deux à deux, c'est
 * quatre-vingt-dix couples possibles — l'agent lui-même met des semaines à en
 * revoir un.
 *
 * Le tirage se fait à la construction de l'état (`useState` avec fonction
 * d'initialisation), jamais dans le corps du composant : posé là, il
 * redistribuerait les scènes à chaque rendu de l'écran, c'est-à-dire à chaque
 * étape d'assemblage qui s'allume.
 *
 * ── Le style ──────────────────────────────────────────────────────────────
 *
 * Le même que partout ailleurs dans le parcours, sans exception : le trait
 * d'encre de `encre.jsx`, qui sort de son point de départ et court jusqu'au
 * bout. Rien d'autre — pas de masse de couleur, pas d'aplat de fond, pas de
 * cadre. Le papier reste le papier.
 *
 * Ces planches ont d'abord été écrites à la gouache, avec leur propre boîte à
 * outils : des lavis de couleur posés en passes de brosse. Elles se lisaient
 * comme une image importée et plaquée au bord de l'écran — un corps étranger au
 * milieu d'un parcours qui, lui, se dessine. Le geste compte davantage que la
 * matière : une planche qui se trace appartient à l'outil, une planche qui se
 * remplit de couleur n'y appartient pas.
 *
 * L'ordre de tracé reste celui d'un dessinateur, et c'est lui qui fait que la
 * chose n'a pas l'air « animée » mais dessinée : l'horizon, les lointains, les
 * masses moyennes, le bâti, les toits, la végétation, le premier plan, et les
 * ombres en dernier. Jamais un détail avant sa masse.
 */

/** Cadre commun — portrait, à la proportion d'une colonne de bord d'écran. */
const VUE = '0 0 300 560'

// --- Motifs partagés -------------------------------------------------------

/**
 * L'horizon — le premier trait de presque toute planche.
 *
 * Jamais rigoureusement droit : une horizontale parfaite trahit le vecteur plus
 * sûrement que n'importe quel aplat, et la main n'en pose pas.
 */
function Horizon({ y, retard = 0.2, duree = 1.2, opacite = 0.45, largeur = 1.3 }) {
  return (
    <Trait
      d={`M 0 ${y} C 78 ${y - 4}, 166 ${y + 5}, 300 ${y - 2}`}
      duree={duree}
      retard={retard}
      largeur={largeur}
      opacite={opacite}
    />
  )
}

/**
 * Le sol du premier plan — une ligne de terrain et, au besoin, quelques brins.
 *
 * Les touffes arrivent après la ligne, jamais avant : l'herbe pousse sur un sol,
 * elle ne le précède pas.
 */
function Sol({ y, retard, touffes = true, brins = [26, 88, 152, 212, 274] }) {
  return (
    <>
      <Trait
        d={`M 0 ${y} C 74 ${y - 9}, 168 ${y + 8}, 300 ${y - 5}`}
        duree={1.1}
        retard={retard}
        largeur={1.7}
      />
      {touffes
        ? brins.map((x, rang) => (
            <Trait
              key={x}
              d={`M ${x - 8} ${y + 9} q 4 -13 8 -3 q 4 -12 8 -1`}
              duree={0.35}
              retard={retard + 0.55 + rang * 0.09}
              largeur={0.9}
              opacite={0.4}
            />
          ))
        : null}
    </>
  )
}

/**
 * Une couronne d'arbre — le contour lobé d'un feuillage vu de loin.
 *
 * Un feuillage n'est pas une ellipse : c'est une suite de bouquets qui
 * débordent les uns des autres. Le contour est donc construit en tournant
 * autour d'un centre, un arc par bouquet, chacun poussé vers l'extérieur à
 * mi-chemin — d'où le renflement. Une ellipse fermée, à la place, donne un
 * champignon, et c'est exactement ce qu'on voyait avant.
 *
 * `lobes` impair de préférence : un nombre pair aligne les bouquets deux à deux
 * en vis-à-vis, et la couronne redevient symétrique, donc mécanique.
 */
function couronne(cx, cy, rx, ry, lobes = 7, saillie = 1.26) {
  const point = (angle, k) =>
    `${(cx + Math.cos(angle) * rx * k).toFixed(1)} ${(cy + Math.sin(angle) * ry * k).toFixed(1)}`
  let d = `M ${point(-Math.PI / 2, 0.82)} `

  for (let rang = 0; rang < lobes; rang += 1) {
    const depart = (rang / lobes) * Math.PI * 2 - Math.PI / 2
    const arrivee = ((rang + 1) / lobes) * Math.PI * 2 - Math.PI / 2
    d += `Q ${point((depart + arrivee) / 2, saillie)} ${point(arrivee, 0.82)} `
  }

  return `${d}Z`
}

/**
 * Un cyprès — le fuseau qui signe un paysage du Midi.
 *
 * Étroit (moins d'un dixième de sa hauteur) et le plus large au tiers bas : ce
 * sont ces deux proportions qui font un cyprès. Plus large, ou renflé au
 * milieu, on obtient une feuille posée debout.
 */
function Cypres({ x, base, hauteur, retard, opacite = 1 }) {
  const demi = hauteur * 0.085

  return (
    <>
      <Trait
        d={`M ${x - demi * 0.45} ${base} C ${x - demi} ${base - hauteur * 0.4}, ${x - demi * 0.74} ${base - hauteur * 0.8}, ${x} ${base - hauteur} C ${x + demi * 0.74} ${base - hauteur * 0.8}, ${x + demi} ${base - hauteur * 0.4}, ${x + demi * 0.45} ${base}`}
        duree={0.9}
        retard={retard}
        largeur={1.5}
        opacite={opacite}
      />
      {/* Deux nervures courtes, décalées : ce qu'il faut pour que le fuseau ait
          un dedans, et pas une de plus — un cyprès de loin ne montre rien. */}
      {[0.28, 0.52].map((part, rang) => (
        <Trait
          key={part}
          d={`M ${x + demi * 0.22} ${base - hauteur * part} C ${x + demi * 0.36} ${base - hauteur * (part + 0.14)}, ${x + demi * 0.14} ${base - hauteur * (part + 0.2)}, ${x - demi * 0.1} ${base - hauteur * (part + 0.3)}`}
          duree={0.35}
          retard={retard + 0.5 + rang * 0.1}
          largeur={0.9}
          opacite={0.3}
        />
      ))}
    </>
  )
}

/**
 * Un pin parasol — un tronc penché et une couronne large et plate.
 *
 * C'est la platitude de la couronne qui fait le pin parasol : haute, elle
 * devient un feuillu quelconque. Elle est donc dessinée deux fois plus large
 * que haute, et débordée d'un second bouquet décalé pour qu'elle ne se lise pas
 * comme un seul bloc.
 */
function PinParasol({ x, base, hauteur, retard, echelle = 1 }) {
  const cime = base - hauteur

  return (
    <>
      <Trait
        d={`M ${x} ${base} C ${x + 6 * echelle} ${base - hauteur * 0.4}, ${x - 7 * echelle} ${base - hauteur * 0.6}, ${x + 2 * echelle} ${cime + 32 * echelle}`}
        duree={0.6}
        retard={retard}
        largeur={1.8}
      />
      {/* Les deux charpentières, avant la couronne : un pin parasol s'ouvre en
          candélabre sous son feuillage. Sans elles, le tronc monte tout droit
          jusqu'à un nuage posé dessus, et l'arbre devient un réverbère. */}
      {[-1, 1].map((sens) => (
        <Trait
          key={sens}
          d={`M ${x + 2 * echelle} ${cime + 34 * echelle} C ${x + sens * 14 * echelle} ${cime + 22 * echelle}, ${x + sens * 26 * echelle} ${cime + 16 * echelle}, ${x + sens * 34 * echelle} ${cime + 2 * echelle}`}
          duree={0.4}
          retard={retard + 0.25}
          largeur={1.5}
        />
      ))}
      {[
        [0, -4, 48, 16, 7],
        [-22, -17, 26, 11, 5],
      ].map(([dx, dy, rx, ry, lobes], rang) => (
        <Trait
          key={rang}
          d={couronne(x + dx * echelle, cime + dy * echelle, rx * echelle, ry * echelle, lobes)}
          duree={0.6}
          retard={retard + 0.45 + rang * 0.18}
          largeur={1.4}
          opacite={rang ? 0.55 : 0.85}
        />
      ))}
    </>
  )
}

/** Un sapin — le zigzag d'une pointe qui descend en s'élargissant. */
function Sapin({ x, base, hauteur, retard, enneige = false }) {
  const demi = hauteur * 0.26

  return (
    <>
      <Trait
        d={`M ${x} ${base - hauteur} L ${x + demi * 0.5} ${base - hauteur * 0.6} L ${x + demi * 0.3} ${base - hauteur * 0.62} L ${x + demi * 0.8} ${base - hauteur * 0.28} L ${x + demi * 0.55} ${base - hauteur * 0.3} L ${x + demi} ${base} L ${x - demi} ${base} L ${x - demi * 0.55} ${base - hauteur * 0.3} L ${x - demi * 0.8} ${base - hauteur * 0.28} L ${x - demi * 0.3} ${base - hauteur * 0.62} L ${x - demi * 0.5} ${base - hauteur * 0.6} Z`}
        duree={0.9}
        retard={retard}
        largeur={1.3}
        opacite={0.8}
      />
      {/* La neige : les horizontales que la branche retient. Rien de blanc à
          poser — au trait, la neige est ce qu'on souligne. */}
      {enneige
        ? [0.6, 0.28].map((part, rang) => (
            <Trait
              key={part}
              d={`M ${x - demi * (0.55 + rang * 0.25)} ${base - hauteur * part} L ${x + demi * (0.55 + rang * 0.25)} ${base - hauteur * part}`}
              duree={0.25}
              retard={retard + 0.7 + rang * 0.1}
              largeur={1.6}
              opacite={0.35}
            />
          ))
        : null}
    </>
  )
}

/** Un arbre rond — olivier de prairie ou marronnier taillé de trottoir. */
function Olivier({ x, base, rayon, retard }) {
  const cy = base - rayon * 1.5

  return (
    <>
      <Trait
        d={`M ${x} ${base} C ${x - 3} ${base - rayon * 0.4}, ${x + 3} ${base - rayon * 0.7}, ${x} ${base - rayon}`}
        duree={0.4}
        retard={retard}
        largeur={1.8}
      />
      <Trait
        d={couronne(x, cy, rayon, rayon * 0.88, 7)}
        duree={0.9}
        retard={retard + 0.25}
        largeur={1.4}
      />
      {/* Deux branches qui montent dans le feuillage : sans elles, la couronne
          est posée sur le tronc au lieu d'en sortir. */}
      {[-1, 1].map((sens) => (
        <Trait
          key={sens}
          d={`M ${x} ${base - rayon * 0.9} C ${x + sens * rayon * 0.2} ${cy + rayon * 0.4}, ${x + sens * rayon * 0.42} ${cy + rayon * 0.2}, ${x + sens * rayon * 0.5} ${cy - rayon * 0.1}`}
          duree={0.35}
          retard={retard + 0.65}
          largeur={0.9}
          opacite={0.35}
        />
      ))}
    </>
  )
}

/** Un palmier — un stipe courbe et cinq palmes qui retombent. */
function Palmier({ x, base, hauteur, retard, inclinaison = 6 }) {
  const cime = base - hauteur
  const tete = x + inclinaison

  return (
    <>
      <Trait
        d={`M ${x} ${base} C ${x + inclinaison * 0.4} ${base - hauteur * 0.45}, ${x + inclinaison * 0.8} ${base - hauteur * 0.75}, ${tete} ${cime}`}
        duree={0.7}
        retard={retard}
        largeur={2.2}
      />
      {[-46, -26, 0, 26, 46].map((ecart, rang) => (
        <Trait
          key={ecart}
          d={`M ${tete} ${cime} C ${tete + ecart * 0.55} ${cime - 16}, ${tete + ecart * 0.9} ${cime - 6}, ${tete + ecart} ${cime + 16 + Math.abs(ecart) * 0.18}`}
          duree={0.35}
          retard={retard + 0.4 + rang * 0.07}
          largeur={1.3}
          opacite={0.75}
        />
      ))}
    </>
  )
}

/**
 * Un toit — sa pente, puis ses rangs de tuiles.
 *
 * Les rangs sont toujours posés après la pente et jamais au-delà d'elle : c'est
 * la pente qui contient le toit, pas l'inverse.
 */
function Toit({ d, retard, rangs = [], largeur = 1.6 }) {
  return (
    <>
      <Trait d={d} duree={0.7} retard={retard} largeur={largeur} />
      {rangs.map((rang, index) => (
        <Trait
          key={rang}
          d={rang}
          duree={0.35}
          retard={retard + 0.35 + index * 0.08}
          largeur={0.9}
          opacite={0.35}
        />
      ))}
    </>
  )
}

/**
 * Des fenêtres — un aplat léger et son encadrement.
 *
 * L'aplat se pose (`Touche`), l'encadrement se trace : en dessous de vingt
 * unités, un cadre parcouru vaut mieux qu'un rectangle qui clignote, et
 * l'aplat seul n'aurait pas de menuiserie.
 */
function Fenetres({ liste, retard, pas = 0.06, opacite = 0.14 }) {
  return liste.map(([x, y, l, h], rang) => (
    <g key={`${x}-${y}`}>
      <Touche
        x={x}
        y={y}
        largeur={l}
        hauteur={h}
        retard={retard + rang * pas}
        duree={0.35}
        opacite={opacite}
        rx={1}
      />
      <Trait
        d={`M ${x} ${y + h} L ${x} ${y} L ${x + l} ${y} L ${x + l} ${y + h} Z`}
        duree={0.4}
        retard={retard + 0.12 + rang * pas}
        largeur={1}
        opacite={0.6}
      />
    </g>
  ))
}

// --- 1. Le paysage de montagne --------------------------------------------

/**
 * Trois plans, et c'est tout ce qui fait la montagne : la chaîne lointaine, la
 * crête intermédiaire, l'alpage au premier plan. Au trait, la profondeur ne
 * vient pas de la valeur mais de l'épaisseur — chaque plan est tracé d'une
 * pointe un peu plus appuyée que celui qui est derrière lui.
 */
function Montagne() {
  return (
    <>
      <Trait
        d="M 0 268 L 46 176 L 84 214 L 132 138 L 176 198 L 214 162 L 258 210 L 300 178"
        duree={1.6}
        retard={0.2}
        largeur={1.4}
        opacite={0.5}
      />
      {/* Les névés — quelques hachures sous les sommets. Le blanc du papier
          fait la neige ; le trait ne fait que dire où elle s'arrête. */}
      {[
        [132, 138, 22],
        [214, 162, 16],
        [46, 176, 14],
      ].map(([x, y, l], rang) => (
        <Trait
          key={x}
          d={`M ${x - l} ${y + l * 0.9} L ${x} ${y + 3} L ${x + l * 0.9} ${y + l}`}
          duree={0.4}
          retard={1.5 + rang * 0.12}
          largeur={1}
          opacite={0.3}
        />
      ))}

      <Trait
        d="M 0 300 C 58 254, 108 286, 158 250 C 204 218, 246 262, 300 238"
        duree={1.4}
        retard={1.9}
        largeur={1.7}
      />

      <Sol y={352} retard={2.5} brins={[24, 82, 224, 284]} />

      {/* Le chalet, posé au creux de l'alpage — petit, et c'est ce qui donne
          l'échelle à tout ce qui est derrière. */}
      <Trait d="M 108 462 L 108 412 L 196 412 L 196 462" duree={0.8} retard={3.05} largeur={1.7} />
      <Toit
        d="M 96 414 L 152 382 L 208 414"
        retard={3.4}
        rangs={['M 106 408 L 198 408', 'M 118 400 L 186 400']}
      />
      <Fenetres
        liste={[
          [122, 426, 16, 14],
          [166, 426, 16, 14],
          [144, 440, 14, 22],
        ]}
        retard={3.95}
      />

      {[48, 244, 268].map((x, rang) => (
        <Sapin key={x} x={x} base={430 + rang * 12} hauteur={96 - rang * 10} retard={3.4 + rang * 0.2} />
      ))}

      {/* Les ombres portées, en dernier — deux traits couchés au pied du
          chalet, et la pente qui file. */}
      <Trait d="M 104 464 C 140 470, 178 468, 202 462" duree={0.5} retard={4.45} largeur={1.2} opacite={0.3} />
      <Trait d="M 0 358 C 72 348, 152 364, 300 350" duree={0.7} retard={4.55} largeur={0.9} opacite={0.25} />
    </>
  )
}

// --- 2. La villa au bord de la mer ----------------------------------------

/**
 * La mer occupe le tiers haut, et elle n'est faite que de ses creux : cinq
 * traits couchés, de plus en plus espacés vers le bas. Une mer hachurée d'un
 * bord à l'autre deviendrait un aplat rayé.
 */
function VillaMer() {
  return (
    <>
      <Horizon y={182} retard={0.2} />

      {[
        [214, 22, 148],
        [244, 132, 288],
        [274, 40, 232],
      ].map(([y, x1, x2], rang) => (
        <Trait
          key={y}
          d={`M ${x1} ${y} q ${(x2 - x1) / 4} -5 ${(x2 - x1) / 2} 0 t ${(x2 - x1) / 2} 0`}
          duree={0.55}
          retard={1.1 + rang * 0.3}
          largeur={1}
          opacite={0.3}
        />
      ))}

      {/* Le rivage rocheux — une seule ligne qui mord dans l'eau. */}
      <Trait
        d="M 0 306 C 62 290, 128 306, 192 294 C 244 284, 272 300, 300 292"
        duree={1.1}
        retard={2.1}
        largeur={1.6}
      />

      <Sol y={340} retard={2.6} brins={[20, 76, 252]} />

      {/* La villa — un corps unique et sa terrasse basse face au large. */}
      <Trait d="M 74 448 L 74 368 L 214 368 L 214 448" duree={0.9} retard={3} largeur={1.8} />
      <Toit
        d="M 62 370 L 144 340 L 226 370"
        retard={3.4}
        rangs={['M 74 364 L 216 364', 'M 92 356 L 198 356']}
      />
      <Fenetres
        liste={[
          [92, 386, 22, 26],
          [132, 386, 22, 26],
          [172, 386, 22, 26],
          [110, 424, 26, 24],
          [158, 424, 26, 24],
        ]}
        retard={3.85}
      />
      <Trait d="M 58 452 L 232 451" duree={0.5} retard={4.2} largeur={1.8} />
      {[70, 96, 122, 148, 174, 200, 224].map((x, rang) => (
        <Trait
          key={x}
          d={`M ${x} 451 L ${x} 440`}
          duree={0.2}
          retard={4.35 + rang * 0.03}
          largeur={1}
          opacite={0.5}
        />
      ))}

      {/* Le pin, planté au niveau de la terrasse et non du talus : son tronc
          partait de mi-hauteur et n'était plus qu'un mât surmonté d'un nuage. */}
      <PinParasol x={258} base={450} hauteur={134} retard={3.4} echelle={1.1} />
      <Cypres x={34} base={452} hauteur={118} retard={3.65} />
    </>
  )
}

// --- 3. L'immeuble d'avenue -----------------------------------------------

/**
 * Un immeuble de pierre de taille sur une avenue plantée — l'esprit d'un
 * haussmannien de prestige. Il tient dans le cadre parce qu'il est vu d'en bas
 * et cadré serré : de face et en entier, il redeviendrait une façade plate.
 */
function ImmeubleAvenue() {
  const etages = [406, 356, 306, 256]

  return (
    <>
      {/* Le toit de zinc en premier, parce qu'il est le plus loin — et la
          façade ensuite, montée du sol vers lui. */}
      <Trait d="M 46 206 L 70 158 L 236 158 L 258 206" duree={1.2} retard={0.2} largeur={1.5} />
      <Trait d="M 40 470 L 46 206 L 258 206 L 264 470" duree={1.6} retard={1.1} largeur={1.9} />

      {/* Les travées : cinq baies par étage, et un balcon filant à l'étage
          noble — c'est lui, et lui seul, qui dit « immeuble de standing ». */}
      {etages.map((y, rang) => (
        <g key={y}>
          <Fenetres liste={[62, 104, 146, 188, 226].map((x) => [x, y, 22, 34])} retard={2.2 + rang * 0.24} />
          <Trait
            d={`M ${48 + rang} ${y + 40} L ${256 - rang} ${y + 40}`}
            duree={0.4}
            retard={2.5 + rang * 0.24}
            largeur={1.3}
            opacite={0.45}
          />
        </g>
      ))}
      {[52, 76, 100, 124, 148, 172, 196, 220, 244].map((x, rang) => (
        <Trait
          key={x}
          d={`M ${x} 394 L ${x} 376`}
          duree={0.2}
          retard={3.35 + rang * 0.03}
          largeur={0.9}
          opacite={0.45}
        />
      ))}

      {/* La porte cochère et sa marquise de verre. */}
      <Trait d="M 130 470 L 130 424 Q 152 404 174 424 L 174 470" duree={0.6} retard={3.6} largeur={1.6} />
      <Trait d="M 112 418 C 152 406, 152 406, 192 418" duree={0.4} retard={3.85} largeur={1.4} opacite={0.6} />

      <Sol y={470} retard={3.9} touffes={false} />

      {/* Les marronniers taillés du trottoir, coupés par le bord du cadre :
          c'est ce recouvrement qui donne la rue. */}
      <Olivier x={14} base={506} rayon={34} retard={4} />
      <Olivier x={288} base={512} rayon={30} retard={4.15} />
    </>
  )
}

// --- 4. La tour Eiffel -----------------------------------------------------

/**
 * La tour est tracée en trois temps (les piliers, le fût, la flèche) et non
 * d'un seul contour : c'est ainsi qu'on la dessine, et c'est ce qui évite le
 * pictogramme. Les croisillons sont quatre chevrons, pas une résille.
 */
function TourEiffel() {
  return (
    <>
      {/* Les quatre piliers, d'un seul tenant : une base large — un peu plus du
          tiers de la hauteur, comme la vraie — qui se referme en courbe jusqu'à
          la première plateforme. C'est cette évasée qui fait la tour ; tracée
          droite, on obtient un pylône, et tracée étroite, une flèche. */}
      <Trait
        d="M 88 460 C 108 398, 128 352, 136 300"
        duree={1}
        retard={0.2}
        largeur={2}
      />
      <Trait
        d="M 212 460 C 192 398, 172 352, 164 300"
        duree={1}
        retard={0.35}
        largeur={2}
      />
      <Trait d="M 136 300 L 140 200 M 164 300 L 160 200" duree={0.7} retard={1.35} largeur={1.7} />
      <Trait d="M 140 200 L 146 126 M 160 200 L 154 126" duree={0.55} retard={1.9} largeur={1.4} />
      <Trait d="M 150 126 L 150 100" duree={0.25} retard={2.35} largeur={1.6} />

      {/* Les deux plateformes et l'arche du premier étage — les seules
          horizontales de la tour, et elles suffisent à la faire reconnaître. */}
      <Trait d="M 92 356 L 208 354" duree={0.4} retard={2.45} largeur={2.4} />
      <Trait d="M 128 300 L 172 299" duree={0.3} retard={2.6} largeur={2} />
      <Trait d="M 134 200 L 166 199" duree={0.25} retard={2.7} largeur={1.6} />
      <Trait d="M 100 452 C 122 402, 178 402, 200 452" duree={0.5} retard={2.8} largeur={1.5} opacite={0.6} />

      {/* Les croisillons — une charpente dessinée maille à maille devient un
          plan d'ingénieur ; quatre chevrons suffisent à la dire. */}
      {[
        'M 100 448 L 150 408 L 200 448',
        'M 112 396 L 150 364 L 188 396',
        'M 136 288 L 150 262 L 164 288',
        'M 140 188 L 150 168 L 160 188',
      ].map((d, rang) => (
        <Trait key={d} d={d} duree={0.3} retard={2.95 + rang * 0.1} largeur={0.9} opacite={0.35} />
      ))}

      <Sol y={460} retard={3.4} brins={[36, 96, 206, 264]} />

      {/* Le bassin du Champ-de-Mars, au pied : un tour de pointe et deux
          reflets couchés. */}
      <Trait
        d="M 56 524 C 120 512, 186 516, 248 526 C 190 542, 112 542, 56 524 Z"
        duree={0.8}
        retard={4}
        largeur={1.4}
      />
      <Trait d="M 92 528 L 148 526" duree={0.3} retard={4.5} largeur={1} opacite={0.35} />
      <Trait d="M 118 534 L 196 532" duree={0.3} retard={4.6} largeur={1} opacite={0.28} />

      <Olivier x={24} base={498} rayon={30} retard={3.65} />
      <Olivier x={278} base={504} rayon={28} retard={3.85} />
    </>
  )
}

// --- 5. L'agence dans la rue ----------------------------------------------

/**
 * Une devanture d'agence, vue de face depuis le trottoir d'en face : store,
 * vitrine, affiches en montre, et l'immeuble qui monte au-dessus.
 *
 * Les affiches sont des aplats cernés, jamais du texte : une planche dessinée
 * n'écrit pas, et la scène est par ailleurs retournée une fois sur deux (voir
 * l'en-tête) — le moindre caractère s'y lirait à l'envers.
 */
function AgenceBarnes() {
  return (
    <>
      <Trait d="M 30 434 L 34 128 L 268 128 L 272 434" duree={1.7} retard={0.2} largeur={1.9} />

      {[176, 226].map((y, rang) => (
        <g key={y}>
          <Fenetres liste={[62, 122, 182, 222].map((x) => [x, y, 24, 32])} retard={1.7 + rang * 0.28} />
          <Trait
            d={`M 40 ${y + 38} L 262 ${y + 38}`}
            duree={0.4}
            retard={1.95 + rang * 0.28}
            largeur={1.2}
            opacite={0.4}
          />
        </g>
      ))}

      {/* Le bandeau d'enseigne, puis le store en toile : les deux traits qui
          transforment un rez-de-chaussée en boutique. */}
      <Trait d="M 26 322 L 276 318 L 276 348 L 26 352 Z" duree={0.8} retard={2.5} largeur={1.7} />
      <Trait
        d="M 20 352 L 282 348 C 278 372, 276 378, 274 388 C 200 394, 108 394, 28 388 C 26 376, 22 366, 20 352 Z"
        duree={1}
        retard={2.9}
        largeur={1.6}
      />
      {[52, 84, 116, 148, 180, 212, 244].map((x, rang) => (
        <Trait
          key={x}
          d={`M ${x} 350 C ${x + 1} 366, ${x + 1} 378, ${x} 391`}
          duree={0.25}
          retard={3.35 + rang * 0.03}
          largeur={0.9}
          opacite={0.4}
        />
      ))}

      {/* La vitrine et les quatre affiches en montre. */}
      <Trait d="M 34 480 L 34 396 L 268 396 L 268 480" duree={0.8} retard={3.5} largeur={1.6} />
      {[52, 104, 198, 232].map((x, rang) => (
        <g key={x}>
          <Touche x={x} y={416} largeur={38} hauteur={54} retard={3.9 + rang * 0.08} duree={0.3} opacite={0.1} rx={1.5} />
          <Trait
            d={`M ${x} 470 L ${x} 416 L ${x + 38} 416 L ${x + 38} 470 Z`}
            duree={0.4}
            retard={4 + rang * 0.08}
            largeur={1.1}
          />
          <Trait
            d={`M ${x + 6} 450 L ${x + 30} 450 M ${x + 8} 458 L ${x + 26} 458`}
            duree={0.25}
            retard={4.2 + rang * 0.05}
            largeur={0.9}
            opacite={0.4}
          />
        </g>
      ))}
      {/* La porte, entre les deux paires d'affiches, et sa poignée. */}
      <Trait d="M 148 480 L 148 400 L 190 400 L 190 480" duree={0.5} retard={4.35} largeur={1.5} />
      <Trait d="M 182 438 L 182 450" duree={0.2} retard={4.6} largeur={1.3} opacite={0.7} />

      <Sol y={480} retard={4.4} touffes={false} />
      <Olivier x={286} base={506} rayon={22} retard={4.5} />
    </>
  )
}

// --- 6. Les grands monuments ----------------------------------------------

/**
 * Une composition — pas une vue. Un arc de triomphe au premier plan, un dôme et
 * une tour de château derrière : trois silhouettes que tout le monde reconnaît,
 * posées comme sur une affiche de compagnie de chemins de fer.
 *
 * Les plans arrière sont tracés d'une pointe plus légère et sans détail : c'est
 * ce qui empêche l'assemblage de se lire comme une erreur de perspective.
 */
function MonumentsFrance() {
  return (
    <>
      {/* Le dôme, à gauche et au fond : son tambour, sa calotte, sa lanterne.
          Une calotte posée à même le sol ne serait qu'une bosse — c'est le
          tambour droit qui la hisse et en fait un dôme. */}
      <Trait d="M 14 322 L 14 278 L 82 278 L 82 322" duree={0.8} retard={0.2} largeur={1.2} opacite={0.55} />
      <Trait
        d="M 16 278 C 16 228, 80 228, 80 278"
        duree={0.8}
        retard={0.85}
        largeur={1.3}
        opacite={0.6}
      />
      <Trait d="M 40 240 L 40 224 L 56 224 L 56 240" duree={0.3} retard={1.5} largeur={1} opacite={0.5} />
      <Trait d="M 48 224 L 48 208" duree={0.2} retard={1.7} largeur={1.1} opacite={0.5} />
      <Trait d="M 10 280 L 86 279" duree={0.3} retard={1.6} largeur={1.1} opacite={0.45} />

      {/* La tour de château, à droite, avec son toit en poivrière. */}
      <Trait d="M 232 322 L 232 244 L 282 244 L 282 322" duree={0.9} retard={1.3} largeur={1.2} opacite={0.55} />
      <Trait d="M 226 246 L 257 190 L 288 246 Z" duree={0.6} retard={1.85} largeur={1.2} opacite={0.55} />

      {/* L'arc, au centre et devant : le seul élément tracé à pleine pointe. */}
      <Trait d="M 76 452 L 76 252 L 226 252 L 226 452" duree={1.3} retard={2.2} largeur={2} />
      <Trait
        d="M 118 452 L 118 356 C 118 310, 184 310, 184 356 L 184 452"
        duree={0.9}
        retard={2.9}
        largeur={1.6}
      />
      <Trait d="M 70 268 L 232 266" duree={0.4} retard={3.3} largeur={1.8} />
      <Trait d="M 84 300 L 218 298" duree={0.35} retard={3.45} largeur={1.1} opacite={0.45} />
      {/* Les deux hauts-reliefs, de part et d'autre de la voûte. */}
      {[92, 196].map((x, rang) => (
        <g key={x}>
          <Touche x={x - 5} y={320} largeur={26} hauteur={56} retard={3.6 + rang * 0.1} duree={0.35} opacite={0.12} rx={1} />
          <Trait
            d={`M ${x - 5} 376 L ${x - 5} 320 L ${x + 21} 320 L ${x + 21} 376 Z`}
            duree={0.4}
            retard={3.72 + rang * 0.1}
            largeur={1}
            opacite={0.55}
          />
        </g>
      ))}

      <Sol y={452} retard={3.95} brins={[58, 150, 244]} />
      <Cypres x={22} base={498} hauteur={104} retard={4.2} />
      <Olivier x={280} base={506} rayon={26} retard={4.35} />
    </>
  )
}

// --- 7. La prairie, la maison et la piscine -------------------------------

/**
 * Le bien tel qu'on le rêve : une grande maison posée dans une prairie, et son
 * bassin au premier plan. Le bassin est tracé en dernier et c'est le seul
 * élément fermé d'un tour complet — donc celui où l'œil se pose.
 */
function PrairiePiscine() {
  return (
    <>
      <Trait
        d="M 0 224 C 66 198, 148 216, 208 198 C 250 186, 276 200, 300 194"
        duree={1.3}
        retard={0.2}
        largeur={1.2}
        opacite={0.5}
      />
      <Sol y={272} retard={1.3} brins={[34, 268]} />

      {/* La maison — un corps long et bas, l'inverse exact de la tour de
          l'écran d'adresse : ici c'est la largeur qui dit le standing. */}
      <Trait d="M 48 404 L 48 330 L 252 330 L 252 404" duree={1.1} retard={2} largeur={1.9} />
      <Toit
        d="M 36 332 L 150 292 L 264 332"
        retard={2.7}
        rangs={['M 52 326 L 250 326', 'M 74 316 L 226 316', 'M 96 308 L 204 308']}
      />
      <Fenetres
        liste={[
          [66, 348, 26, 30],
          [110, 348, 26, 30],
          [164, 348, 26, 30],
          [208, 348, 26, 30],
        ]}
        retard={3.25}
      />
      <Trait d="M 136 404 L 136 356 L 166 356 L 166 404" duree={0.45} retard={3.5} largeur={1.5} />

      {/* Le bassin, et les deux reflets qui le font bouger. */}
      <Trait
        d="M 42 512 C 116 492, 196 492, 268 510 C 198 540, 112 540, 42 512 Z"
        duree={1.1}
        retard={3.7}
        largeur={1.6}
      />
      <Trait d="M 74 512 C 108 506, 140 510, 166 506" duree={0.35} retard={4.4} largeur={1} opacite={0.35} />
      <Trait d="M 116 524 C 154 520, 186 524, 222 518" duree={0.35} retard={4.52} largeur={1} opacite={0.28} />

      <Cypres x={22} base={470} hauteur={140} retard={3.4} />
      <Cypres x={44} base={476} hauteur={112} retard={3.6} />
      <Cypres x={278} base={474} hauteur={128} retard={3.8} />
      {/* Deux transats au bord de l'eau — deux traits chacun, et pas un de
          plus : à cette taille, le dossier suffit à les asseoir. */}
      {[196, 228].map((x, rang) => (
        <Trait
          key={x}
          d={`M ${x} 478 L ${x + 16} 478 M ${x + 4} 478 L ${x + 12} 466`}
          duree={0.25}
          retard={4.25 + rang * 0.08}
          largeur={1.2}
        />
      ))}
    </>
  )
}

// --- 8. Le village perché --------------------------------------------------

/**
 * Des maisons empilées sur un éperon, et le clocher au sommet. La scène tient à
 * une règle : chaque maison est un peu plus petite et un peu plus légère que
 * celle d'en dessous. C'est un empilement, pas une perspective — et c'est
 * exactement ainsi qu'on dessine un village perché.
 */
function VillagePerche() {
  const maisons = [
    [38, 452, 72, 62],
    [116, 444, 64, 58],
    [186, 452, 76, 60],
    [66, 384, 66, 58],
    [146, 378, 72, 60],
    [96, 322, 64, 54],
    [170, 318, 58, 52],
  ]

  return (
    <>
      {/* L'éperon rocheux, en un geste : le village n'est pas posé sur la
          colline, il en sort. */}
      <Trait
        d="M 0 330 C 54 290, 104 262, 168 258 C 224 254, 268 286, 300 322"
        duree={1.5}
        retard={0.2}
        largeur={1.7}
      />

      {maisons.map(([x, y, l, h], rang) => (
        <g key={`${x}-${y}`}>
          <Trait
            d={`M ${x} ${y} L ${x} ${y - h} L ${x + l} ${y - h} L ${x + l} ${y}`}
            duree={0.55}
            retard={1.4 + rang * 0.26}
            largeur={1.6 - rang * 0.06}
          />
          <Toit
            d={`M ${x - 6} ${y - h + 2} L ${x + l / 2} ${y - h - 16} L ${x + l + 6} ${y - h + 2}`}
            retard={1.62 + rang * 0.26}
            largeur={1.4 - rang * 0.05}
          />
          <Fenetres
            liste={[
              [x + l * 0.2, y - h * 0.62, 11, 15],
              [x + l * 0.62, y - h * 0.62, 11, 15],
              [x + l * 0.4, y - h * 0.3, 11, 15],
            ]}
            retard={1.88 + rang * 0.26}
            opacite={0.12}
          />
        </g>
      ))}

      {/* Le clocher, au sommet et en dernier : c'est le point haut du village
          comme du regard. */}
      <Trait d="M 122 266 L 122 206 L 160 206 L 160 266" duree={0.6} retard={3.3} largeur={1.6} />
      <Trait d="M 116 208 L 141 172 L 166 208" duree={0.5} retard={3.7} largeur={1.5} />
      <Trait d="M 141 172 L 141 158" duree={0.2} retard={4.05} largeur={1.2} opacite={0.7} />
      <Trait
        d="M 132 246 C 132 230, 150 230, 150 246 Z"
        duree={0.35}
        retard={4.15}
        largeur={1.2}
        opacite={0.6}
      />

      <Cypres x={22} base={470} hauteur={124} retard={3.85} />
      <Cypres x={276} base={486} hauteur={106} retard={4} />
      <Olivier x={244} base={534} rayon={26} retard={4.2} />
      <Olivier x={62} base={540} rayon={24} retard={4.35} />
    </>
  )
}

// --- 9. Le chalet sous la neige --------------------------------------------

/**
 * La seule planche d'hiver du lot. Au trait, la neige ne se pose pas : elle se
 * réserve. Toits et sol ne sont que des lignes qui laissent le papier nu en
 * dessous, et les rondins du chalet s'arrêtent là où elle commence.
 */
function ChaletNeige() {
  return (
    <>
      <Trait
        d="M 0 250 L 58 162 L 116 206 L 168 132 L 226 196 L 300 150"
        duree={1.5}
        retard={0.2}
        largeur={1.4}
        opacite={0.5}
      />
      {[
        [58, 162, 18],
        [168, 132, 24],
        [226, 196, 14],
      ].map(([x, y, l], rang) => (
        <Trait
          key={x}
          d={`M ${x - l} ${y + l} L ${x} ${y + 2} L ${x + l * 0.9} ${y + l * 0.95}`}
          duree={0.35}
          retard={1.45 + rang * 0.12}
          largeur={1.7}
          opacite={0.28}
        />
      ))}

      {/* Le manteau de neige — deux lignes molles, sans un brin d'herbe :
          c'est ce qui le distingue d'une prairie. */}
      <Sol y={310} retard={2} touffes={false} />
      <Trait d="M 0 360 C 88 344, 190 366, 300 348" duree={0.8} retard={2.6} largeur={1} opacite={0.25} />

      {/* Le chalet : un corps de rondins, un toit très débordant, et la neige
          qui passe par-dessus la pente sans la suivre tout à fait. */}
      <Trait d="M 66 470 L 66 388 L 234 388 L 234 470" duree={1} retard={2.9} largeur={1.8} />
      {[400, 420, 440, 458].map((y, rang) => (
        <Trait
          key={y}
          d={`M 70 ${y} L 230 ${y + 1}`}
          duree={0.3}
          retard={3.5 + rang * 0.06}
          largeur={0.9}
          opacite={0.3}
        />
      ))}
      <Trait d="M 44 392 L 150 336 L 256 392" duree={0.8} retard={3.3} largeur={1.8} />
      <Trait
        d="M 40 394 C 92 366, 108 356, 150 334 C 192 356, 210 366, 260 394"
        duree={0.6}
        retard={3.9}
        largeur={1.4}
        opacite={0.5}
      />
      <Fenetres
        liste={[
          [92, 406, 26, 24],
          [182, 406, 26, 24],
          [132, 434, 34, 36],
        ]}
        retard={4.15}
        opacite={0.18}
      />
      {/* La fumée de la cheminée — un trait qui hésite en montant. */}
      <Trait
        d="M 206 344 C 214 326, 200 314, 210 296"
        duree={0.5}
        retard={4.45}
        largeur={1.1}
        opacite={0.4}
      />

      {[26, 268, 292].map((x, rang) => (
        <Sapin key={x} x={x} base={480 + rang * 10} hauteur={116 - rang * 14} retard={2.9 + rang * 0.22} enneige />
      ))}
    </>
  )
}

// --- 10. Le port de la Riviera --------------------------------------------

/**
 * Le quai, ses façades serrées et les coques devant. L'eau est dessinée en deux
 * temps — les creux couchés, puis les reflets verticaux des mâts — et c'est le
 * second qui fait le port : sans reflets, des bateaux posés sur des rayures.
 */
function PortRiviera() {
  const facades = [
    [14, 300, 62, 96],
    [80, 300, 54, 110],
    [138, 300, 60, 100],
    [202, 300, 50, 116],
    [256, 300, 44, 92],
  ]

  return (
    <>
      {facades.map(([x, base, l, h], rang) => (
        <g key={x}>
          <Trait
            d={`M ${x} ${base} L ${x} ${base - h} L ${x + l} ${base - h} L ${x + l} ${base}`}
            duree={0.6}
            retard={0.2 + rang * 0.22}
            largeur={1.6}
          />
          <Toit
            d={`M ${x - 5} ${base - h + 2} L ${x + l / 2} ${base - h - 14} L ${x + l + 5} ${base - h + 2}`}
            retard={0.45 + rang * 0.22}
          />
          <Fenetres
            liste={[
              [x + l * 0.18, base - h * 0.76, 12, 17],
              [x + l * 0.58, base - h * 0.76, 12, 17],
              [x + l * 0.18, base - h * 0.46, 12, 17],
              [x + l * 0.58, base - h * 0.46, 12, 17],
            ]}
            retard={0.75 + rang * 0.22}
            opacite={0.12}
          />
        </g>
      ))}

      {/* Le quai, puis l'eau — trois creux, de plus en plus espacés vers le
          bas, exactement comme la mer de la villa. */}
      <Trait d="M 0 306 L 300 302" duree={0.7} retard={2.4} largeur={2.2} />
      {[
        [340, 16, 128],
        [492, 84, 284],
        [534, 32, 224],
      ].map(([y, x1, x2], rang) => (
        <Trait
          key={y}
          d={`M ${x1} ${y} q ${(x2 - x1) / 4} -5 ${(x2 - x1) / 2} 0 t ${(x2 - x1) / 2} 0`}
          duree={0.55}
          retard={2.8 + rang * 0.22}
          largeur={1}
          opacite={0.26}
        />
      ))}

      {/* Les coques et les mâts. La coque est un seul trait creusé : un bateau
          vu de loin n'est rien d'autre. */}
      {[
        [66, 404, 44, 1.1],
        [150, 452, 52, 1.25],
        [238, 398, 40, 1],
      ].map(([x, y, l, k], rang) => (
        <g key={x}>
          {/* La coque — le pont légèrement relevé vers l'avant, et le fond
              creusé. Une lentille symétrique donnait une soucoupe. */}
          <Trait
            d={`M ${x - l} ${y - 2} L ${x + l} ${y - 10} C ${x + l * 0.5} ${y + 11 * k}, ${x - l * 0.5} ${y + 11 * k}, ${x - l} ${y - 2} Z`}
            duree={0.5}
            retard={3.5 + rang * 0.2}
            largeur={1.5}
          />
          {/* Le mât et son foc. C'est la voile, et elle seule, qui fait lire un
              bateau : le mât nu, planté au milieu d'une coque, faisait un
              parasol. Le mât s'arrête aussi bien en dessous du quai — monté
              jusqu'à lui, il s'y raccordait et la coque pendait au bout. */}
          <Trait
            d={`M ${x - l * 0.25} ${y - 5} L ${x - l * 0.2} ${y - 54 * k}`}
            duree={0.3}
            retard={3.7 + rang * 0.2}
            largeur={1.2}
          />
          <Trait
            d={`M ${x - l * 0.2} ${y - 52 * k} L ${x + l * 0.82} ${y - 9} L ${x - l * 0.22} ${y - 7}`}
            duree={0.45}
            retard={3.85 + rang * 0.2}
            largeur={1}
            opacite={0.6}
          />
          {/* Le reflet du mât — bien plus court que lui, et tremblé. Tiré aussi
              loin que le mât est haut, il tirait le bateau vers le fond. */}
          <Trait
            d={`M ${x - 5} ${y + 11 * k} C ${x - 9} ${y + 19 * k}, ${x - 1} ${y + 23 * k}, ${x - 6} ${y + 29 * k}`}
            duree={0.35}
            retard={4.15 + rang * 0.2}
            largeur={1}
            opacite={0.28}
          />
        </g>
      ))}

      <Palmier x={20} base={300} hauteur={118} retard={2.6} />
      <Palmier x={276} base={302} hauteur={98} retard={2.85} inclinaison={-6} />
    </>
  )
}

/**
 * Le lot des dix planches.
 *
 * Le libellé n'est pas décoratif : c'est le texte alternatif de la scène. Un
 * lecteur d'écran n'a rien à faire de la pointe, mais il doit pouvoir dire ce
 * qui est dessiné si on le lui demande.
 */
const SCENES = [
  { id: 'montagne', Dessin: Montagne, titre: 'Dessin à l’encre d’un paysage de montagne et d’un chalet dans l’alpage' },
  { id: 'villa-mer', Dessin: VillaMer, titre: 'Dessin à l’encre d’une villa surplombant la mer' },
  { id: 'avenue', Dessin: ImmeubleAvenue, titre: 'Dessin à l’encre d’un immeuble de prestige sur une avenue plantée' },
  { id: 'tour-eiffel', Dessin: TourEiffel, titre: 'Dessin à l’encre de la tour Eiffel vue du Champ-de-Mars' },
  { id: 'agence', Dessin: AgenceBarnes, titre: 'Dessin à l’encre de la devanture d’une agence, ses affiches en vitrine' },
  { id: 'monuments', Dessin: MonumentsFrance, titre: 'Dessin à l’encre d’une composition de grands monuments français' },
  { id: 'prairie', Dessin: PrairiePiscine, titre: 'Dessin à l’encre d’une demeure dans sa prairie, avec sa piscine' },
  { id: 'village', Dessin: VillagePerche, titre: 'Dessin à l’encre d’un village provençal perché et de son clocher' },
  { id: 'chalet', Dessin: ChaletNeige, titre: 'Dessin à l’encre d’un chalet de montagne sous la neige' },
  { id: 'port', Dessin: PortRiviera, titre: 'Dessin à l’encre d’un port de la Riviera et de ses bateaux à quai' },
]

/** Deux scènes distinctes, tirées au sort — jamais deux fois la même planche. */
function tirerDeux() {
  const premier = Math.floor(Math.random() * SCENES.length)
  // Le second est tiré parmi les neuf restants, puis replacé dans l'ordre du
  // lot : c'est la façon la plus courte d'obtenir deux indices distincts sans
  // boucle de rejet, dont rien ne garantit la terminaison.
  const second = (premier + 1 + Math.floor(Math.random() * (SCENES.length - 1))) % SCENES.length
  return [SCENES[premier], SCENES[second]]
}

/** Durée d'un acte — la planche de droite démarre quand celle de gauche finit. */
export const ACTE_MS = 5000

/**
 * Une planche, dessinée dans son cadre, éventuellement retournée.
 *
 * `miroir` retourne la géométrie : la pointe court alors de droite à gauche, et
 * la scène se penche vers le module depuis la droite. C'est une transformation
 * de dessin, pas de mise en page — le cadre, lui, ne bouge pas.
 */
function Planche({ scene, miroir = false, className = '' }) {
  const { Dessin, titre } = scene

  return (
    <svg viewBox={VUE} className={className} role="img" aria-label={titre} preserveAspectRatio="xMidYMid meet">
      <g transform={miroir ? 'translate(300, 0) scale(-1, 1)' : undefined}>
        <Dessin />
      </g>
    </svg>
  )
}

/**
 * Le diptyque de l'écran d'assemblage — dix secondes, deux planches.
 *
 * La seconde est **montée** au bout de cinq secondes plutôt que retardée : les
 * scènes sont écrites avec des retards de zéro à cinq secondes, et les décaler
 * supposerait de faire descendre un offset dans chacun de leurs tracés. Un
 * montage différé donne le même résultat pour une ligne de code, et il a un
 * avantage de plus : le travail de rendu de la seconde planche ne pèse pas sur
 * l'arrivée de la première.
 *
 * ── Où elles se posent ────────────────────────────────────────────────────
 *
 * Chacune occupe la bande libre entre le module et le bord de la fenêtre, et
 * s'y centre. C'est le seul placement qui tienne aux deux extrémités : collées
 * au bord, elles se lisaient comme deux images rognées par la fenêtre ; collées
 * au module, elles mordraient sur ce qu'il faut lire. Centrées dans leur bande,
 * elles gardent la même marge des deux côtés quelle que soit la largeur de
 * l'écran — et la planche ne dépasse jamais 20 rem, faute de quoi un très grand
 * écran la transformerait en affiche.
 *
 * La bande est calculée sur 30 rem, soit les 28 rem du module et un peu d'air :
 * c'est ce léger surplus qui garantit qu'aucune planche ne vient frôler le
 * texte, même quand le module est à sa largeur maximale.
 *
 * Elles disparaissent sous 1280 px — en deçà, la bande n'a plus de quoi loger
 * un dessin sans l'écraser contre la colonne d'étapes.
 *
 * `aria-hidden` sur l'ensemble : ce qui se passe réellement est annoncé au
 * centre, en `aria-live`. Une planche dessinée n'est pas une information sur
 * l'avancement.
 */
export function DuoProvence() {
  const reduce = useReducedMotion()
  const [duo] = useState(tirerDeux)
  const [second, setSecond] = useState(false)

  useEffect(() => {
    // Mouvement refusé : les deux planches arrivent ensemble, déjà dessinées (le
    // filet d'`index.css` annule durées et retards). Les faire attendre cinq
    // secondes ne montrerait rien de plus — seulement une apparition sèche au
    // milieu de l'écran d'attente.
    const minuteur = setTimeout(() => setSecond(true), reduce ? 0 : ACTE_MS)
    return () => clearTimeout(minuteur)
  }, [reduce])

  const [gauche, droite] = duo

  /** La bande libre d'un côté du module, et la planche centrée dedans. */
  const bande =
    'pointer-events-none fixed inset-y-0 hidden w-[calc((100vw-30rem)/2)] items-center justify-center xl:flex'
  const planche = 'h-[76vh] max-h-[38rem] w-[74%] max-w-[20rem]'

  return (
    <div aria-hidden="true" className="z-0">
      <div className={`${bande} left-0`}>
        <motion.div
          initial={{ opacity: 0, x: reduce ? 0 : -22 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reduce ? 0.2 : 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="w-full"
        >
          <Planche scene={gauche} className={`mx-auto ${planche}`} />
        </motion.div>
      </div>

      {second ? (
        <div className={`${bande} right-0`}>
          <motion.div
            initial={{ opacity: 0, x: reduce ? 0 : 22 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduce ? 0.2 : 1.1, ease: [0.22, 1, 0.36, 1] }}
            className="w-full"
          >
            <Planche scene={droite} miroir className={`mx-auto ${planche}`} />
          </motion.div>
        </div>
      ) : null}
    </div>
  )
}
