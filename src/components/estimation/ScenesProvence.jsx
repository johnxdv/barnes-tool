import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Coup, Lavis, PALETTE, Pave, Reprise, Touche, bruit } from './gouache'

/**
 * Les dix planches de l'écran d'assemblage — des scènes peintes à la gouache,
 * tirées au sort deux par deux, qui se construisent sur les côtés de l'écran
 * pendant que le rapport se monte.
 *
 * ── Le dispositif ─────────────────────────────────────────────────────────
 *
 * Dix secondes, deux temps de cinq :
 *
 *  - **0 à 5 s** — une scène se peint en émergeant du bord gauche de l'écran.
 *  - **5 à 10 s** — une seconde scène, tirée dans le même lot mais jamais la
 *    même, se peint en émergeant du bord droit.
 *
 * Le second temps n'est pas un décalage de délais : la planche de droite est
 * **montée cinq secondes plus tard** (voir `DuoProvence`). C'est ce qui permet
 * d'écrire chaque scène avec ses propres retards, de zéro à cinq secondes, sans
 * avoir à propager un décalage dans deux cents tracés.
 *
 * La planche de droite est la même géométrie, retournée
 * (`scale(-1, 1)`) : la brosse y balaie donc de droite à gauche, et la scène
 * pousse depuis le bord droit exactement comme l'autre pousse depuis le gauche.
 * Aucune scène ne porte de texte ni d'écusson, précisément pour que ce
 * retournement reste indolore.
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
 * Gouache et aquarelle de facture provençale : masses posées à la brosse, bords
 * jamais nets, tons naturels (sauge, ocre, bleu délavé, terre), reprise au trait
 * par-dessus une fois la couleur sèche. C'est une manière, pas une citation —
 * aucune de ces planches ne reprend une œuvre ni un auteur.
 *
 * L'ordre de peinture est celui d'un vrai atelier, et c'est lui qui fait que la
 * chose n'a pas l'air « animée » mais peinte : le ciel, les lointains, les
 * masses moyennes, le bâti, les toits, la végétation, le premier plan, les
 * ombres, et le trait en dernier. Jamais un détail avant sa masse.
 */

/** Cadre commun — portrait, à la proportion d'une colonne de bord d'écran. */
const VUE = '0 0 300 560'

// --- Motifs partagés -------------------------------------------------------

/**
 * Le ciel — la première masse de toute planche, et la plus large.
 *
 * Quatre passes de brosse : c'est le nombre qu'il faut pour couvrir un tiers de
 * la feuille sans que les passes se voient une à une, et pas une de plus (une
 * brosse qui repasse dix fois lisse la couleur et tue le geste).
 *
 * Son bord bas n'est jamais droit — c'est là que le ciel rencontre le paysage,
 * et une horizontale parfaite à cet endroit trahit le vecteur plus sûrement que
 * n'importe quel aplat.
 */
function Ciel({ bas = 300, couleur = PALETTE.cielHaut, opacite = 0.42, retard = 0 }) {
  return (
    <Lavis
      d={`M 0 0 L 300 0 L 300 ${bas - 10} C 226 ${bas + 8}, 138 ${bas - 16}, 62 ${bas + 4} C 40 ${bas + 9}, 18 ${bas - 2}, 0 ${bas + 6} Z`}
      boite={[0, 0, 300, bas + 10]}
      couleur={couleur}
      opacite={opacite}
      passes={4}
      retard={retard}
      duree={1.2}
      graine={3}
    />
  )
}

/** Un cyprès — le fuseau sombre qui signe un paysage du Midi. */
function Cypres({ x, base, hauteur, retard, couleur = PALETTE.olivePro, opacite = 0.72 }) {
  const demi = hauteur * 0.11

  return (
    <g>
      <Lavis
        d={`M ${x} ${base} C ${x - demi} ${base - hauteur * 0.32}, ${x - demi * 0.78} ${base - hauteur * 0.74}, ${x - demi * 0.1} ${base - hauteur} C ${x + demi * 0.8} ${base - hauteur * 0.7}, ${x + demi * 1.05} ${base - hauteur * 0.3}, ${x} ${base} Z`}
        boite={[x - demi * 1.2, base - hauteur, demi * 2.4, hauteur]}
        couleur={couleur}
        opacite={opacite}
        passes={2}
        retard={retard}
        duree={0.6}
        graine={x}
      />
      {/* Deux touches sèches sur le flanc éclairé : un cyprès n'est pas une
          masse uniforme, il a une face au soleil. */}
      <Coup
        d={`M ${x + demi * 0.35} ${base - hauteur * 0.25} C ${x + demi * 0.5} ${base - hauteur * 0.5}, ${x + demi * 0.3} ${base - hauteur * 0.62}, ${x + demi * 0.1} ${base - hauteur * 0.82}`}
        couleur={PALETTE.sauge}
        largeur={2}
        opacite={0.4}
        retard={retard + 0.45}
        duree={0.35}
      />
    </g>
  )
}

/** Un pin parasol — trois masses de feuillage sur un tronc penché. */
function PinParasol({ x, base, hauteur, retard, echelle = 1 }) {
  const cime = base - hauteur

  return (
    <g>
      <Coup
        d={`M ${x} ${base} C ${x + 4 * echelle} ${base - hauteur * 0.4}, ${x - 5 * echelle} ${base - hauteur * 0.6}, ${x + 2 * echelle} ${cime + 8 * echelle}`}
        couleur={PALETTE.encre}
        largeur={3.2 * echelle}
        opacite={0.55}
        retard={retard}
        duree={0.45}
      />
      {[
        [-22, 4, 26, 11, -8],
        [14, -2, 24, 10, 6],
        [-4, -12, 22, 9, 0],
      ].map(([dx, dy, rx, ry, rot], rang) => (
        <Touche
          key={rang}
          cx={x + dx * echelle}
          cy={cime + dy * echelle}
          rx={rx * echelle}
          ry={ry * echelle}
          rotation={rot}
          couleur={rang === 2 ? PALETTE.sauge : PALETTE.olive}
          opacite={0.62}
          retard={retard + 0.3 + rang * 0.12}
          duree={0.4}
        />
      ))}
    </g>
  )
}

/** Un sapin — le zigzag d'une brosse qui descend en s'élargissant. */
function Sapin({ x, base, hauteur, retard, enneige = false }) {
  const demi = hauteur * 0.26

  return (
    <g>
      <Lavis
        d={`M ${x} ${base - hauteur} L ${x + demi * 0.5} ${base - hauteur * 0.6} L ${x + demi * 0.3} ${base - hauteur * 0.62} L ${x + demi * 0.8} ${base - hauteur * 0.28} L ${x + demi * 0.55} ${base - hauteur * 0.3} L ${x + demi} ${base} L ${x - demi} ${base} L ${x - demi * 0.55} ${base - hauteur * 0.3} L ${x - demi * 0.8} ${base - hauteur * 0.28} L ${x - demi * 0.3} ${base - hauteur * 0.62} L ${x - demi * 0.5} ${base - hauteur * 0.6} Z`}
        boite={[x - demi, base - hauteur, demi * 2, hauteur]}
        couleur={PALETTE.olivePro}
        opacite={0.7}
        passes={2}
        retard={retard}
        duree={0.55}
        graine={x + hauteur}
      />
      {enneige
        ? [0.35, 0.62, 0.85].map((part, rang) => (
            <Coup
              key={part}
              d={`M ${x - demi * (1 - part) * 1.1} ${base - hauteur * part} q ${demi * (1 - part) * 1.1} ${-4} ${demi * (1 - part) * 2.2} 1`}
              couleur={PALETTE.craie}
              largeur={3}
              opacite={0.85}
              retard={retard + 0.5 + rang * 0.08}
              duree={0.3}
            />
          ))
        : null}
    </g>
  )
}

/** Un olivier — boule de feuillage argenté sur un tronc court et tordu. */
function Olivier({ x, base, rayon, retard }) {
  return (
    <g>
      <Coup
        d={`M ${x} ${base} C ${x - 3} ${base - rayon * 0.5}, ${x + 4} ${base - rayon * 0.7}, ${x} ${base - rayon}`}
        couleur={PALETTE.encre}
        largeur={3}
        opacite={0.5}
        retard={retard}
        duree={0.35}
      />
      {[
        [-rayon * 0.5, -rayon * 1.1, 0.95],
        [rayon * 0.45, -rayon * 1.2, 0.85],
        [0, -rayon * 1.55, 0.8],
      ].map(([dx, dy, k], rang) => (
        <Touche
          key={rang}
          cx={x + dx}
          cy={base + dy}
          rx={rayon * k}
          ry={rayon * k * 0.78}
          couleur={rang === 1 ? PALETTE.saugeClair : PALETTE.sauge}
          opacite={0.6}
          retard={retard + 0.2 + rang * 0.1}
          duree={0.38}
        />
      ))}
    </g>
  )
}

/** Un palmier — un tronc arqué et six palmes lancées depuis la même main. */
function Palmier({ x, base, hauteur, retard, inclinaison = 6 }) {
  const cime = base - hauteur

  return (
    <g>
      <Coup
        d={`M ${x} ${base} C ${x + inclinaison} ${base - hauteur * 0.45}, ${x + inclinaison * 1.6} ${base - hauteur * 0.75}, ${x + inclinaison * 1.4} ${cime}`}
        couleur={PALETTE.terre}
        largeur={3.4}
        opacite={0.6}
        retard={retard}
        duree={0.5}
      />
      {[-34, -22, -8, 10, 24, 34].map((ecart, rang) => (
        <Coup
          key={ecart}
          d={`M ${x + inclinaison * 1.4} ${cime} q ${ecart * 0.55} ${-9 + Math.abs(ecart) * 0.16} ${ecart} ${12 + Math.abs(ecart) * 0.22}`}
          couleur={rang % 2 ? PALETTE.olive : PALETTE.sauge}
          largeur={3}
          opacite={0.62}
          retard={retard + 0.32 + rang * 0.06}
          duree={0.32}
        />
      ))}
    </g>
  )
}

/** Un toit de tuiles — la masse, puis les rangs griffés dessus. */
function ToitTuiles({ d, boite, retard, rangs = [] }) {
  return (
    <g>
      <Lavis
        d={d}
        boite={boite}
        couleur={PALETTE.tuile}
        opacite={0.62}
        passes={2}
        retard={retard}
        duree={0.55}
        graine={boite[0]}
      />
      {rangs.map((rang, index) => (
        <Coup
          key={index}
          d={rang}
          couleur={PALETTE.terre}
          largeur={1.2}
          opacite={0.45}
          retard={retard + 0.45 + index * 0.07}
          duree={0.3}
        />
      ))}
    </g>
  )
}

/** Une rangée de fenêtres — des touches sombres, jamais des rectangles nets. */
function Fenetres({ liste, couleur = PALETTE.bleuProfond, opacite = 0.5, retard, pas = 0.05 }) {
  // Un pavé peint, et non une ellipse : une fenêtre est un percement
  // rectangulaire, et des pastilles régulières sur une façade donnent des pois.
  // Le pavé n'a pas un angle droit — c'est ce qui lui évite de retomber dans le
  // vecteur qu'on cherche justement à éviter.
  return liste.map(([x, y, l, h], rang) => (
    <Pave
      key={`${x}-${y}`}
      x={x}
      y={y}
      largeur={l}
      hauteur={h}
      couleur={couleur}
      opacite={opacite}
      graine={x + y}
      retard={retard + rang * pas}
      duree={0.28}
    />
  ))
}

/** Le sol du premier plan — la masse qui ferme la planche par le bas. */
function PremierPlan({ haut, couleur = PALETTE.sauge, opacite = 0.5, retard, touffes = true }) {
  return (
    <g>
      <Lavis
        d={`M 0 ${haut + 8} C 74 ${haut - 10}, 168 ${haut + 12}, 300 ${haut - 6} L 300 560 L 0 560 Z`}
        boite={[0, haut - 12, 300, 560 - haut + 14]}
        couleur={couleur}
        opacite={opacite}
        passes={3}
        retard={retard}
        duree={0.9}
        graine={haut}
      />
      {touffes
        ? Array.from({ length: 9 }, (_, rang) => {
            const x = 12 + rang * 34 + bruit(rang, 14)
            const y = haut + 26 + bruit(rang + 7, 60)
            // Trois brins qui montent du sol, et non un chevron : un chevron
            // posé dans une prairie se lit comme un oiseau, ce qu'on a vérifié
            // à ses dépens.
            return (
              <Coup
                key={rang}
                d={`M ${x} ${y} C ${x - 2} ${y - 6}, ${x - 3} ${y - 8}, ${x - 4} ${y - 12} M ${x + 5} ${y + 1} C ${x + 5} ${y - 6}, ${x + 6} ${y - 9}, ${x + 6} ${y - 14} M ${x + 10} ${y} C ${x + 12} ${y - 5}, ${x + 13} ${y - 8}, ${x + 15} ${y - 11}`}
                couleur={PALETTE.olive}
                largeur={1.6}
                opacite={0.34}
                retard={retard + 0.55 + rang * 0.05}
                duree={0.3}
              />
            )
          })
        : null}
    </g>
  )
}

// --- 1. Le paysage de montagne --------------------------------------------

/**
 * Trois plans, et c'est tout ce qui fait la montagne : la chaîne lointaine
 * presque bleue, la crête intermédiaire, l'alpage au premier plan. La
 * profondeur ne vient pas du dessin mais de la valeur — chaque plan est plus
 * sombre et plus contrasté que celui qui est derrière lui.
 */
function Montagne() {
  return (
    <>
      <Ciel bas={268} couleur={PALETTE.cielBas} opacite={0.5} retard={0} />

      <Lavis
        d="M 0 268 L 46 176 L 84 214 L 132 138 L 176 198 L 214 162 L 258 210 L 300 178 L 300 286 L 0 296 Z"
        boite={[0, 132, 300, 166]}
        couleur={PALETTE.bleuProfond}
        opacite={0.34}
        passes={3}
        retard={0.95}
        duree={1}
        graine={2}
      />
      {/* Les névés, en réserve claire sur les sommets : posés après la masse,
          comme on garde le blanc du papier pour la neige. */}
      {[
        [132, 138, 22],
        [214, 162, 16],
        [46, 176, 14],
      ].map(([x, y, l], rang) => (
        <Coup
          key={x}
          d={`M ${x - l} ${y + l * 0.9} L ${x} ${y + 3} L ${x + l * 0.9} ${y + l}`}
          couleur={PALETTE.craie}
          largeur={5}
          opacite={0.75}
          retard={1.7 + rang * 0.1}
          duree={0.35}
        />
      ))}

      <Lavis
        d="M 0 300 C 58 254, 108 286, 158 250 C 204 218, 246 262, 300 238 L 300 352 L 0 360 Z"
        boite={[0, 218, 300, 142]}
        couleur={PALETTE.olive}
        opacite={0.42}
        passes={3}
        retard={2}
        duree={0.9}
        graine={5}
      />

      <PremierPlan haut={352} couleur={PALETTE.sauge} opacite={0.5} retard={2.5} />

      {/* Le chalet, posé au creux de l'alpage — petit, et c'est ce qui donne
          l'échelle à tout ce qui est derrière. */}
      <Lavis
        d="M 108 462 L 108 412 L 196 412 L 196 462 Z"
        boite={[106, 410, 92, 54]}
        couleur={PALETTE.terre}
        opacite={0.6}
        passes={2}
        retard={3.1}
        duree={0.5}
        graine={9}
      />
      <ToitTuiles
        d="M 96 414 L 152 382 L 208 414 Z"
        boite={[94, 380, 116, 36]}
        retard={3.45}
        rangs={['M 106 408 L 198 408', 'M 118 400 L 186 400']}
      />
      <Fenetres
        liste={[
          [122, 426, 16, 14],
          [166, 426, 16, 14],
          [144, 440, 14, 22],
        ]}
        retard={3.9}
      />

      {[48, 244, 268].map((x, rang) => (
        <Sapin key={x} x={x} base={430 + rang * 12} hauteur={96 - rang * 10} retard={3.5 + rang * 0.18} />
      ))}

      <Reprise d="M 96 414 L 152 382 L 208 414" largeur={1.2} opacite={0.4} retard={4.3} />
      <Reprise d="M 0 356 C 70 344, 150 362, 300 346" largeur={1} opacite={0.25} retard={4.45} />
    </>
  )
}

// --- 2. La villa au bord de la mer ----------------------------------------

/**
 * La mer occupe le tiers haut et elle est peinte à plat, en une seule valeur :
 * tout l'effet tient aux trois reflets clairs posés dessus une fois la masse
 * sèche. Une mer dégradée aurait l'air d'un fond d'écran.
 */
function VillaMer() {
  return (
    <>
      <Ciel bas={182} couleur={PALETTE.cielBas} opacite={0.45} retard={0} />

      <Lavis
        d="M 0 182 L 300 176 L 300 300 C 214 310, 92 296, 0 306 Z"
        boite={[0, 176, 300, 134]}
        couleur={PALETTE.bleu}
        opacite={0.46}
        passes={3}
        retard={0.9}
        duree={1}
        graine={4}
      />
      {[
        ['M 22 214 C 68 210, 96 218, 148 212', 0.55],
        ['M 132 244 C 178 238, 214 248, 288 240', 0.5],
        ['M 40 274 C 96 268, 150 280, 232 270', 0.45],
      ].map(([d, opacite], rang) => (
        <Coup
          key={d}
          d={d}
          couleur={PALETTE.craie}
          largeur={3.4}
          opacite={opacite}
          retard={1.85 + rang * 0.12}
          duree={0.4}
        />
      ))}

      {/* Les rochers du rivage, en une masse chaude : c'est la couleur qui
          sépare la roche de l'eau, pas le contour. */}
      <Lavis
        d="M 0 306 C 62 290, 128 306, 192 294 C 244 284, 272 300, 300 292 L 300 336 L 0 344 Z"
        boite={[0, 284, 300, 62]}
        couleur={PALETTE.pierreOmbre}
        opacite={0.5}
        passes={2}
        retard={2.05}
        duree={0.7}
        graine={8}
      />

      <PremierPlan haut={336} couleur={PALETTE.sauge} opacite={0.45} retard={2.5} />

      {/* La villa — deux volumes, le principal et sa terrasse basse. */}
      <Lavis
        d="M 74 448 L 74 368 L 214 368 L 214 448 Z"
        boite={[72, 366, 144, 84]}
        couleur={PALETTE.pierre}
        opacite={0.72}
        passes={2}
        retard={3}
        duree={0.6}
        graine={11}
      />
      <ToitTuiles
        d="M 62 370 L 144 340 L 226 370 Z"
        boite={[60, 338, 168, 34]}
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
        retard={3.8}
      />
      {/* La terrasse et sa balustrade, face à la mer. */}
      <Coup d="M 58 452 L 232 452" couleur={PALETTE.pierreOmbre} largeur={5} opacite={0.6} retard={4.05} duree={0.4} />
      {[70, 96, 122, 148, 174, 200, 224].map((x, rang) => (
        <Coup
          key={x}
          d={`M ${x} 452 L ${x} 440`}
          couleur={PALETTE.pierreOmbre}
          largeur={2}
          opacite={0.5}
          retard={4.15 + rang * 0.03}
          duree={0.2}
        />
      ))}

      <PinParasol x={256} base={428} hauteur={128} retard={3.5} />
      <Cypres x={34} base={452} hauteur={118} retard={3.75} />

      <Reprise d="M 62 370 L 144 340 L 226 370" largeur={1.2} opacite={0.4} retard={4.4} />
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
      <Ciel bas={150} couleur={PALETTE.cielBas} opacite={0.4} retard={0} />

      {/* Le toit de zinc, en premier parce qu'il est le plus loin. */}
      <Lavis
        d="M 46 206 L 70 158 L 236 158 L 258 206 Z"
        boite={[44, 156, 216, 52]}
        couleur={PALETTE.bleuProfond}
        opacite={0.42}
        passes={2}
        retard={0.9}
        duree={0.6}
        graine={6}
      />
      <Lavis
        d="M 40 470 L 46 206 L 258 206 L 264 470 Z"
        boite={[38, 204, 228, 268]}
        couleur={PALETTE.pierre}
        opacite={0.72}
        passes={4}
        retard={1.35}
        duree={1.1}
        graine={1}
      />

      {/* Les travées : cinq baies par étage, et un balcon filant à l'étage
          noble — c'est lui, et lui seul, qui dit « immeuble de standing ». */}
      {etages.map((y, rang) => (
        <g key={y}>
          <Fenetres
            liste={[62, 104, 146, 188, 226].map((x) => [x, y, 22, 34])}
            couleur={PALETTE.encre}
            opacite={0.42}
            retard={2.1 + rang * 0.22}
          />
          <Coup
            d={`M ${48 + rang} ${y + 40} L ${256 - rang} ${y + 40}`}
            couleur={PALETTE.pierreOmbre}
            largeur={2.4}
            opacite={0.5}
            retard={2.3 + rang * 0.22}
            duree={0.4}
          />
        </g>
      ))}
      {[52, 76, 100, 124, 148, 172, 196, 220, 244].map((x, rang) => (
        <Coup
          key={x}
          d={`M ${x} 394 L ${x} 376`}
          couleur={PALETTE.encre}
          largeur={1.6}
          opacite={0.45}
          retard={3.2 + rang * 0.03}
          duree={0.2}
        />
      ))}

      {/* La porte cochère et sa marquise de verre. */}
      <Lavis
        d="M 130 470 L 130 424 Q 152 404 174 424 L 174 470 Z"
        boite={[128, 402, 48, 70]}
        couleur={PALETTE.encre}
        opacite={0.45}
        passes={2}
        retard={3.4}
        duree={0.45}
        graine={13}
      />
      <Coup d="M 112 418 C 152 408, 152 408, 192 418" couleur={PALETTE.bleu} largeur={4} opacite={0.5} retard={3.6} duree={0.35} />

      <PremierPlan haut={470} couleur={PALETTE.pierreOmbre} opacite={0.4} retard={3.7} touffes={false} />

      {/* Les marronniers taillés du trottoir, au premier plan et coupés par le
          bord : c'est ce recouvrement qui donne la rue. */}
      <Olivier x={14} base={506} rayon={34} retard={3.9} />
      <Olivier x={288} base={512} rayon={30} retard={4.1} />

      <Reprise d="M 46 206 L 70 158 L 236 158 L 258 206" largeur={1.2} opacite={0.35} retard={4.4} />
      <Reprise d="M 40 470 L 46 206 M 264 470 L 258 206" largeur={1} opacite={0.3} retard={4.5} />
    </>
  )
}

// --- 4. La tour Eiffel -----------------------------------------------------

/**
 * La tour est peinte en trois masses (les piliers, le fût, la flèche) et non en
 * un seul contour : c'est ainsi qu'on la peint, et c'est ce qui évite le
 * pictogramme. Les croisillons sont sept coups de brosse, pas une résille.
 */
function TourEiffel() {
  return (
    <>
      <Ciel bas={330} couleur={PALETTE.cielBas} opacite={0.46} retard={0} />

      {/* Les quatre piliers, d'un seul tenant : une base large — un peu plus du
          tiers de la hauteur, comme la vraie — qui se referme en courbe jusqu'à
          la première plateforme. C'est cette évasée qui fait la tour ; tracée
          droite, on obtient un pylône, et tracée étroite, une flèche. */}
      <Lavis
        d="M 88 460 C 108 398, 128 352, 136 300 L 164 300 C 172 352, 192 398, 212 460 Z"
        boite={[86, 298, 128, 164]}
        couleur={PALETTE.encreClaire}
        opacite={0.5}
        passes={3}
        retard={0.95}
        duree={0.8}
        graine={7}
      />
      <Lavis
        d="M 134 300 L 140 200 L 160 200 L 166 300 Z"
        boite={[132, 198, 36, 104]}
        couleur={PALETTE.encreClaire}
        opacite={0.5}
        passes={2}
        retard={1.55}
        duree={0.55}
        graine={12}
      />
      <Lavis
        d="M 141 200 L 146 126 L 154 126 L 159 200 Z"
        boite={[139, 124, 22, 78]}
        couleur={PALETTE.encreClaire}
        opacite={0.52}
        passes={2}
        retard={1.95}
        duree={0.45}
        graine={15}
      />
      <Coup d="M 150 126 L 150 100" couleur={PALETTE.encre} largeur={2.4} opacite={0.55} retard={2.3} duree={0.25} />

      {/* Les deux plateformes et l'arche du premier étage — les seules
          horizontales de la tour, et elles suffisent à la faire reconnaître. */}
      <Coup d="M 92 356 L 208 354" couleur={PALETTE.encre} largeur={4.5} opacite={0.55} retard={2.4} duree={0.4} />
      <Coup d="M 128 300 L 172 299" couleur={PALETTE.encre} largeur={3.6} opacite={0.55} retard={2.55} duree={0.3} />
      <Coup d="M 134 200 L 166 199" couleur={PALETTE.encre} largeur={2.8} opacite={0.5} retard={2.65} duree={0.25} />
      <Coup
        d="M 100 452 C 122 402, 178 402, 200 452"
        couleur={PALETTE.encre}
        largeur={2.8}
        opacite={0.45}
        retard={2.75}
        duree={0.45}
      />

      {/* Les croisillons — trois chevrons, pas une résille. Une charpente
          peinte se suggère ; dessinée maille à maille, elle devient un plan. */}
      {[
        'M 100 448 L 150 408 L 200 448',
        'M 112 396 L 150 364 L 188 396',
        'M 136 288 L 150 262 L 164 288',
        'M 140 188 L 150 168 L 160 188',
      ].map((d, rang) => (
        <Coup key={d} d={d} couleur={PALETTE.encre} largeur={1.5} opacite={0.3} retard={2.9 + rang * 0.1} duree={0.3} />
      ))}

      <PremierPlan haut={460} couleur={PALETTE.sauge} opacite={0.5} retard={3.35} />

      {/* Le bassin du Champ-de-Mars, au pied : un lavis bleu et deux reflets. */}
      <Lavis
        d="M 56 524 C 120 512, 186 516, 248 526 C 190 542, 112 542, 56 524 Z"
        boite={[54, 510, 196, 36]}
        couleur={PALETTE.bleu}
        opacite={0.5}
        passes={2}
        retard={3.95}
        duree={0.5}
        graine={17}
      />
      <Coup d="M 92 528 L 148 526" couleur={PALETTE.craie} largeur={2.4} opacite={0.6} retard={4.35} duree={0.3} />

      <Olivier x={24} base={498} rayon={30} retard={3.7} />
      <Olivier x={278} base={504} rayon={28} retard={3.9} />
      <Reprise d="M 88 460 C 108 398, 132 348, 140 200 L 146 126" largeur={1} opacite={0.28} retard={4.45} />
      <Reprise d="M 212 460 C 192 398, 168 348, 160 200 L 154 126" largeur={1} opacite={0.28} retard={4.55} />
    </>
  )
}

// --- 5. L'agence dans la rue ----------------------------------------------

/**
 * Une devanture d'agence, vue de face depuis le trottoir d'en face : store,
 * vitrine, affiches en montre, et l'immeuble qui monte au-dessus.
 *
 * Les affiches sont des masses claires cernées, jamais du texte : une planche
 * peinte n'écrit pas, et la scène est par ailleurs retournée une fois sur deux
 * (voir l'en-tête) — le moindre caractère s'y lirait à l'envers.
 */
function AgenceBarnes() {
  return (
    <>
      <Ciel bas={120} couleur={PALETTE.cielBas} opacite={0.38} retard={0} />

      <Lavis
        d="M 30 434 L 34 128 L 268 128 L 272 434 Z"
        boite={[28, 126, 246, 310]}
        couleur={PALETTE.pierre}
        opacite={0.7}
        passes={4}
        retard={0.85}
        duree={1.2}
        graine={2}
      />
      {[176, 226].map((y, rang) => (
        <g key={y}>
          <Fenetres
            liste={[62, 122, 182, 222].map((x) => [x, y, 24, 32])}
            couleur={PALETTE.encre}
            opacite={0.4}
            retard={1.8 + rang * 0.25}
          />
          <Coup
            d={`M 40 ${y + 38} L 262 ${y + 38}`}
            couleur={PALETTE.pierreOmbre}
            largeur={2.2}
            opacite={0.45}
            retard={2 + rang * 0.25}
            duree={0.4}
          />
        </g>
      ))}

      {/* Le bandeau d'enseigne, puis le store en toile : les deux masses qui
          transforment un rez-de-chaussée en boutique. */}
      <Lavis
        d="M 26 322 L 276 318 L 276 348 L 26 352 Z"
        boite={[24, 316, 254, 38]}
        couleur={PALETTE.encre}
        opacite={0.6}
        passes={2}
        retard={2.45}
        duree={0.5}
        graine={21}
      />
      <Lavis
        d="M 20 352 L 282 348 C 278 372, 276 378, 274 388 C 200 394, 108 394, 28 388 C 26 376, 22 366, 20 352 Z"
        boite={[18, 346, 266, 50]}
        couleur={PALETTE.tuile}
        opacite={0.5}
        passes={2}
        retard={2.8}
        duree={0.6}
        graine={23}
      />
      {[52, 84, 116, 148, 180, 212, 244].map((x, rang) => (
        <Coup
          key={x}
          d={`M ${x} 350 C ${x + 1} 366, ${x + 1} 378, ${x} 391`}
          couleur={PALETTE.terre}
          largeur={1.4}
          opacite={0.4}
          retard={3.25 + rang * 0.03}
          duree={0.25}
        />
      ))}

      {/* La vitrine, sombre, et les quatre affiches éclairées dedans. */}
      <Lavis
        d="M 34 480 L 34 396 L 268 396 L 268 480 Z"
        boite={[32, 394, 238, 88]}
        couleur={PALETTE.bleuProfond}
        opacite={0.34}
        passes={3}
        retard={3.4}
        duree={0.6}
        graine={27}
      />
      {[
        [52, 416],
        [104, 416],
        [198, 416],
        [232, 416],
      ].map(([x, y], rang) => (
        <g key={x}>
          <Pave
            x={x}
            y={y}
            largeur={38}
            hauteur={54}
            couleur={PALETTE.craie}
            opacite={0.85}
            graine={x}
            retard={3.85 + rang * 0.08}
            duree={0.3}
          />
          <Coup
            d={`M ${x + 6} ${y + 34} L ${x + 30} ${y + 34} M ${x + 8} ${y + 42} L ${x + 26} ${y + 42}`}
            couleur={PALETTE.encreClaire}
            largeur={1.4}
            opacite={0.45}
            retard={4.05 + rang * 0.05}
            duree={0.25}
          />
        </g>
      ))}
      {/* La porte, entre les deux paires d'affiches. */}
      <Coup d="M 148 480 L 148 400 L 190 400 L 190 480" couleur={PALETTE.encre} largeur={2.2} opacite={0.5} retard={4.2} duree={0.45} />

      <PremierPlan haut={480} couleur={PALETTE.pierreOmbre} opacite={0.42} retard={4.3} touffes={false} />
      <Olivier x={286} base={506} rayon={22} retard={4.45} />
      <Reprise d="M 26 322 L 276 318" largeur={1.2} opacite={0.35} retard={4.6} />
    </>
  )
}

// --- 6. Les grands monuments ----------------------------------------------

/**
 * Une composition — pas une vue. Un arc de triomphe au premier plan, un dôme et
 * une tour de château derrière : trois silhouettes que tout le monde reconnaît,
 * posées comme sur une affiche de compagnie de chemins de fer.
 *
 * Les plans arrière sont volontairement plus pâles et moins détaillés : c'est ce
 * qui empêche l'assemblage de se lire comme une erreur de perspective.
 */
function MonumentsFrance() {
  return (
    <>
      <Ciel bas={300} couleur={PALETTE.cielBas} opacite={0.5} retard={0} />

      {/* Le dôme, à gauche et au fond. */}
      <Lavis
        d="M 18 322 L 18 268 C 18 236, 78 236, 78 268 L 78 322 Z"
        boite={[16, 234, 64, 90]}
        couleur={PALETTE.ocre}
        opacite={0.4}
        passes={2}
        retard={0.95}
        duree={0.6}
        graine={3}
      />
      <Coup d="M 48 236 L 48 214" couleur={PALETTE.ocre} largeur={2.6} opacite={0.5} retard={1.5} duree={0.25} />

      {/* La tour de château, à droite, avec son toit en poivrière. */}
      <Lavis
        d="M 232 322 L 232 244 L 282 244 L 282 322 Z"
        boite={[230, 242, 54, 82]}
        couleur={PALETTE.pierreOmbre}
        opacite={0.4}
        passes={2}
        retard={1.25}
        duree={0.55}
        graine={9}
      />
      <Lavis
        d="M 226 246 L 257 190 L 288 246 Z"
        boite={[224, 188, 66, 60]}
        couleur={PALETTE.bleuProfond}
        opacite={0.38}
        passes={2}
        retard={1.65}
        duree={0.5}
        graine={14}
      />

      {/* L'arc, au centre et devant : le seul élément peint à pleine valeur. */}
      <Lavis
        d="M 76 452 L 76 252 L 226 252 L 226 452 Z"
        boite={[74, 250, 154, 204]}
        couleur={PALETTE.pierre}
        opacite={0.74}
        passes={3}
        retard={2}
        duree={0.95}
        graine={18}
      />
      <Lavis
        d="M 118 452 L 118 356 C 118 310, 184 310, 184 356 L 184 452 Z"
        boite={[116, 308, 70, 146]}
        couleur={PALETTE.encre}
        opacite={0.4}
        passes={2}
        retard={2.75}
        duree={0.6}
        graine={22}
      />
      <Coup d="M 70 268 L 232 266" couleur={PALETTE.pierreOmbre} largeur={5} opacite={0.55} retard={3.2} duree={0.4} />
      <Coup d="M 84 300 L 218 298" couleur={PALETTE.pierreOmbre} largeur={2.4} opacite={0.45} retard={3.35} duree={0.35} />
      {/* Les deux hauts-reliefs, de part et d'autre de la voûte. */}
      {[92, 196].map((x, rang) => (
        <Pave
          key={x}
          x={x - 5}
          y={320}
          largeur={26}
          hauteur={56}
          couleur={PALETTE.pierreOmbre}
          opacite={0.5}
          graine={x}
          retard={3.5 + rang * 0.1}
          duree={0.35}
        />
      ))}

      <PremierPlan haut={452} couleur={PALETTE.sauge} opacite={0.45} retard={3.8} />
      <Cypres x={22} base={498} hauteur={104} retard={4.1} />
      <Olivier x={280} base={506} rayon={26} retard={4.25} />

      <Reprise d="M 76 452 L 76 252 L 226 252 L 226 452" largeur={1.1} opacite={0.35} retard={4.5} />
      <Reprise d="M 118 452 L 118 356 C 118 310, 184 310, 184 356 L 184 452" largeur={1} opacite={0.3} retard={4.6} />
    </>
  )
}

// --- 7. La prairie, la maison et la piscine -------------------------------

/**
 * Le bien tel qu'on le rêve : une grande maison posée dans une prairie, et son
 * bassin au premier plan. La piscine est peinte en dernier et en pleine valeur —
 * c'est le point le plus clair et le plus saturé de la planche, donc celui où
 * l'œil se pose.
 */
function PrairiePiscine() {
  return (
    <>
      <Ciel bas={210} couleur={PALETTE.cielBas} opacite={0.45} retard={0} />

      <Lavis
        d="M 0 224 C 66 198, 148 216, 208 198 C 250 186, 276 200, 300 194 L 300 268 L 0 276 Z"
        boite={[0, 184, 300, 94]}
        couleur={PALETTE.sauge}
        opacite={0.38}
        passes={2}
        retard={0.9}
        duree={0.8}
        graine={4}
      />
      <PremierPlan haut={268} couleur={PALETTE.saugeClair} opacite={0.44} retard={1.4} />

      {/* La maison — un corps long et bas, l'inverse exact de la tour de
          l'écran d'adresse : ici c'est la largeur qui dit le standing. */}
      <Lavis
        d="M 48 404 L 48 330 L 252 330 L 252 404 Z"
        boite={[46, 328, 208, 78]}
        couleur={PALETTE.pierre}
        opacite={0.72}
        passes={3}
        retard={2}
        duree={0.75}
        graine={10}
      />
      <ToitTuiles
        d="M 36 332 L 150 292 L 264 332 Z"
        boite={[34, 290, 232, 44]}
        retard={2.6}
        rangs={['M 52 326 L 250 326', 'M 74 316 L 226 316', 'M 96 308 L 204 308']}
      />
      <Fenetres
        liste={[
          [66, 348, 26, 30],
          [110, 348, 26, 30],
          [164, 348, 26, 30],
          [208, 348, 26, 30],
        ]}
        retard={3.15}
      />
      <Coup d="M 136 404 L 136 356 L 166 356 L 166 404" couleur={PALETTE.encre} largeur={2.2} opacite={0.5} retard={3.35} duree={0.4} />

      {/* Le bassin, et les trois reflets qui le font bouger. */}
      <Lavis
        d="M 42 512 C 116 492, 196 492, 268 510 C 198 540, 112 540, 42 512 Z"
        boite={[40, 490, 230, 52]}
        couleur={PALETTE.bleu}
        opacite={0.55}
        passes={3}
        retard={3.6}
        duree={0.75}
        graine={25}
      />
      {[
        ['M 74 512 C 108 506, 140 510, 166 506', 0.6],
        ['M 116 524 C 154 520, 186 524, 222 518', 0.5],
      ].map(([d, o], rang) => (
        <Coup key={d} d={d} couleur={PALETTE.craie} largeur={3} opacite={o} retard={4.25 + rang * 0.12} duree={0.35} />
      ))}

      <Cypres x={22} base={470} hauteur={140} retard={3.5} />
      <Cypres x={44} base={476} hauteur={112} retard={3.65} />
      <Cypres x={278} base={474} hauteur={128} retard={3.8} />
      {/* Deux transats au bord de l'eau — deux coups de brosse chacun. */}
      {[196, 228].map((x, rang) => (
        <Coup
          key={x}
          d={`M ${x} 478 L ${x + 16} 478 M ${x + 4} 478 L ${x + 12} 466`}
          couleur={PALETTE.craie}
          largeur={2.6}
          opacite={0.8}
          retard={4.1 + rang * 0.08}
          duree={0.25}
        />
      ))}

      <Reprise d="M 36 332 L 150 292 L 264 332" largeur={1.2} opacite={0.4} retard={4.5} />
    </>
  )
}

// --- 8. Le village perché --------------------------------------------------

/**
 * Des maisons empilées sur un éperon, et le clocher au sommet. La scène tient à
 * une règle : chaque maison est un peu plus petite et un peu plus pâle que celle
 * d'en dessous. C'est un empilement, pas une perspective — et c'est exactement
 * ainsi qu'on peint un village perché.
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
      <Ciel bas={268} couleur={PALETTE.cielBas} opacite={0.46} retard={0} />

      {/* L'éperon rocheux, en une masse chaude : le village n'est pas posé sur
          la colline, il en sort. */}
      <Lavis
        d="M 0 330 C 54 290, 104 262, 168 258 C 224 254, 268 286, 300 322 L 300 520 L 0 528 Z"
        boite={[0, 252, 300, 278]}
        couleur={PALETTE.ocre}
        opacite={0.34}
        passes={4}
        retard={0.85}
        duree={1.1}
        graine={6}
      />

      {maisons.map(([x, y, l, h], rang) => (
        <g key={`${x}-${y}`}>
          <Lavis
            d={`M ${x} ${y} L ${x} ${y - h} L ${x + l} ${y - h} L ${x + l} ${y} Z`}
            boite={[x - 2, y - h - 2, l + 4, h + 4]}
            couleur={rang > 4 ? PALETTE.ocreClair : PALETTE.pierre}
            opacite={0.68 - rang * 0.02}
            passes={2}
            retard={1.5 + rang * 0.24}
            duree={0.5}
            graine={x + y}
          />
          <ToitTuiles
            d={`M ${x - 6} ${y - h + 2} L ${x + l / 2} ${y - h - 16} L ${x + l + 6} ${y - h + 2} Z`}
            boite={[x - 8, y - h - 18, l + 16, 22]}
            retard={1.72 + rang * 0.24}
          />
          <Fenetres
            liste={[
              [x + l * 0.2, y - h * 0.62, 11, 15],
              [x + l * 0.62, y - h * 0.62, 11, 15],
              [x + l * 0.4, y - h * 0.3, 11, 15],
            ]}
            couleur={PALETTE.encre}
            opacite={0.42}
            retard={1.95 + rang * 0.24}
          />
        </g>
      ))}

      {/* Le clocher, au sommet et en dernier : c'est le point haut du village
          comme du regard. */}
      <Lavis
        d="M 122 266 L 122 206 L 160 206 L 160 266 Z"
        boite={[120, 204, 42, 64]}
        couleur={PALETTE.ocreClair}
        opacite={0.7}
        passes={2}
        retard={3.35}
        duree={0.5}
        graine={31}
      />
      <Lavis
        d="M 116 208 L 141 172 L 166 208 Z"
        boite={[114, 170, 54, 40]}
        couleur={PALETTE.terre}
        opacite={0.55}
        passes={2}
        retard={3.7}
        duree={0.4}
        graine={33}
      />
      <Touche cx={141} cy={234} rx={9} ry={12} couleur={PALETTE.encre} opacite={0.45} retard={4} duree={0.3} />

      <Cypres x={22} base={470} hauteur={124} retard={3.9} />
      <Cypres x={276} base={486} hauteur={106} retard={4.05} />
      <Olivier x={244} base={534} rayon={26} retard={4.2} />
      <Olivier x={62} base={540} rayon={24} retard={4.35} />

      <Reprise d="M 116 208 L 141 172 L 166 208" largeur={1.2} opacite={0.4} retard={4.55} />
    </>
  )
}

// --- 9. Le chalet sous la neige --------------------------------------------

/**
 * La seule planche froide du lot, et la seule où le blanc est une couleur qu'on
 * pose plutôt qu'un papier qu'on réserve : la neige des toits et du sol est
 * peinte en craie par-dessus les masses, comme elle s'est posée dessus.
 */
function ChaletNeige() {
  return (
    <>
      <Ciel bas={250} couleur={PALETTE.bleuPale} opacite={0.4} retard={0} />

      <Lavis
        d="M 0 250 L 58 162 L 116 206 L 168 132 L 226 196 L 300 150 L 300 288 L 0 296 Z"
        boite={[0, 128, 300, 168]}
        couleur={PALETTE.bleuProfond}
        opacite={0.3}
        passes={3}
        retard={0.9}
        duree={1}
        graine={5}
      />
      {[
        [58, 162, 18],
        [168, 132, 24],
        [226, 196, 14],
      ].map(([x, y, l], rang) => (
        <Coup
          key={x}
          d={`M ${x - l} ${y + l} L ${x} ${y + 2} L ${x + l * 0.9} ${y + l * 0.95}`}
          couleur={PALETTE.craie}
          largeur={6}
          opacite={0.85}
          retard={1.65 + rang * 0.1}
          duree={0.35}
        />
      ))}

      <PremierPlan haut={310} couleur={PALETTE.craie} opacite={0.55} retard={2.1} touffes={false} />
      <Coup d="M 0 360 C 88 344, 190 366, 300 348" couleur={PALETTE.bleuPale} largeur={4} opacite={0.25} retard={2.7} duree={0.6} />

      {/* Le chalet : bois sombre, toit très débordant, et la neige dessus. */}
      <Lavis
        d="M 66 470 L 66 388 L 234 388 L 234 470 Z"
        boite={[64, 386, 172, 86]}
        couleur={PALETTE.terre}
        opacite={0.62}
        passes={3}
        retard={2.9}
        duree={0.7}
        graine={19}
      />
      {[400, 420, 440, 458].map((y, rang) => (
        <Coup
          key={y}
          d={`M 70 ${y} L 230 ${y + 1}`}
          couleur={PALETTE.encre}
          largeur={1.2}
          opacite={0.3}
          retard={3.5 + rang * 0.05}
          duree={0.3}
        />
      ))}
      <Lavis
        d="M 44 392 L 150 336 L 256 392 Z"
        boite={[42, 334, 216, 60]}
        couleur={PALETTE.encre}
        opacite={0.5}
        passes={2}
        retard={3.35}
        duree={0.6}
        graine={26}
      />
      <Coup
        d="M 40 394 C 92 366, 108 356, 150 334 C 192 356, 210 366, 260 394"
        couleur={PALETTE.craie}
        largeur={7}
        opacite={0.9}
        retard={3.85}
        duree={0.55}
      />
      <Fenetres
        liste={[
          [92, 406, 26, 24],
          [182, 406, 26, 24],
          [132, 434, 34, 36],
        ]}
        couleur={PALETTE.ocreClair}
        opacite={0.8}
        retard={4.1}
      />
      {/* La fumée de la cheminée — trois coups de plus en plus pâles. */}
      <Coup d="M 206 344 C 214 326, 200 314, 210 296" couleur={PALETTE.craie} largeur={4} opacite={0.55} retard={4.35} duree={0.5} />

      {[26, 268, 292].map((x, rang) => (
        <Sapin key={x} x={x} base={480 + rang * 10} hauteur={116 - rang * 14} retard={3 + rang * 0.2} enneige />
      ))}

      <Reprise d="M 44 392 L 150 336 L 256 392" largeur={1.2} opacite={0.35} retard={4.55} />
    </>
  )
}

// --- 10. Le port de la Riviera --------------------------------------------

/**
 * Le quai, ses façades ocre et les coques blanches devant. L'eau est peinte en
 * deux temps — la masse, puis les reflets verticaux des mâts — et c'est le
 * second qui fait le port : sans reflets, des bateaux posés sur du bleu.
 */
function PortRiviera() {
  const facades = [
    [14, 300, 62, 96, PALETTE.ocreClair],
    [80, 300, 54, 110, PALETTE.pierre],
    [138, 300, 60, 100, PALETTE.ocre],
    [202, 300, 50, 116, PALETTE.pierre],
    [256, 300, 44, 92, PALETTE.ocreClair],
  ]

  return (
    <>
      <Ciel bas={196} couleur={PALETTE.cielBas} opacite={0.44} retard={0} />

      {facades.map(([x, base, l, h, couleur], rang) => (
        <g key={x}>
          <Lavis
            d={`M ${x} ${base} L ${x} ${base - h} L ${x + l} ${base - h} L ${x + l} ${base} Z`}
            boite={[x - 2, base - h - 2, l + 4, h + 4]}
            couleur={couleur}
            opacite={0.66}
            passes={2}
            retard={0.9 + rang * 0.2}
            duree={0.55}
            graine={x}
          />
          <ToitTuiles
            d={`M ${x - 5} ${base - h + 2} L ${x + l / 2} ${base - h - 14} L ${x + l + 5} ${base - h + 2} Z`}
            boite={[x - 7, base - h - 16, l + 14, 20]}
            retard={1.12 + rang * 0.2}
          />
          <Fenetres
            liste={[
              [x + l * 0.18, base - h * 0.76, 12, 17],
              [x + l * 0.58, base - h * 0.76, 12, 17],
              [x + l * 0.18, base - h * 0.46, 12, 17],
              [x + l * 0.58, base - h * 0.46, 12, 17],
            ]}
            couleur={PALETTE.encre}
            opacite={0.4}
            retard={1.35 + rang * 0.2}
          />
        </g>
      ))}

      {/* Le quai, puis l'eau — la masse la plus large de la planche. */}
      <Coup d="M 0 306 L 300 302" couleur={PALETTE.pierreOmbre} largeur={9} opacite={0.55} retard={2.5} duree={0.6} />
      <Lavis
        d="M 0 314 L 300 310 L 300 560 L 0 560 Z"
        boite={[0, 308, 300, 254]}
        couleur={PALETTE.bleu}
        opacite={0.5}
        passes={4}
        retard={2.7}
        duree={1.1}
        graine={29}
      />

      {/* Les coques et les mâts. La coque est une seule touche allongée : un
          bateau vu de loin n'est rien d'autre. */}
      {[
        [66, 376, 44, 1.1],
        [150, 402, 52, 1.25],
        [236, 372, 40, 1],
      ].map(([x, y, l, k], rang) => (
        <g key={x}>
          <Touche
            cx={x}
            cy={y}
            rx={l}
            ry={9 * k}
            couleur={PALETTE.craie}
            opacite={0.88}
            retard={3.5 + rang * 0.18}
            duree={0.35}
          />
          <Coup
            d={`M ${x - 6} ${y - 8} L ${x - 4} ${y - 70 * k}`}
            couleur={PALETTE.encreClaire}
            largeur={2}
            opacite={0.6}
            retard={3.7 + rang * 0.18}
            duree={0.3}
          />
          <Coup
            d={`M ${x - 5} ${y + 10} L ${x - 5} ${y + 46 * k}`}
            couleur={PALETTE.craie}
            largeur={2.4}
            opacite={0.4}
            retard={4.15 + rang * 0.1}
            duree={0.35}
          />
        </g>
      ))}
      {['M 28 452 C 96 446, 178 456, 272 448', 'M 48 512 C 128 506, 202 516, 286 508'].map((d, rang) => (
        <Coup key={d} d={d} couleur={PALETTE.craie} largeur={3} opacite={0.45} retard={4.3 + rang * 0.12} duree={0.4} />
      ))}

      <Palmier x={20} base={300} hauteur={118} retard={2.9} />
      <Palmier x={276} base={302} hauteur={98} retard={3.1} inclinaison={-6} />

      <Reprise d="M 0 306 L 300 302" largeur={1} opacite={0.3} retard={4.55} />
    </>
  )
}

/**
 * Le lot des dix planches.
 *
 * Le libellé n'est pas décoratif : c'est le texte alternatif de la scène. Un
 * lecteur d'écran n'a rien à faire du pinceau, mais il doit pouvoir dire ce qui
 * est peint si on le lui demande.
 */
const SCENES = [
  { id: 'montagne', Dessin: Montagne, titre: 'Gouache d’un paysage de montagne et d’un chalet dans l’alpage' },
  { id: 'villa-mer', Dessin: VillaMer, titre: 'Gouache d’une villa surplombant la mer' },
  { id: 'avenue', Dessin: ImmeubleAvenue, titre: 'Gouache d’un immeuble de prestige sur une avenue plantée' },
  { id: 'tour-eiffel', Dessin: TourEiffel, titre: 'Gouache de la tour Eiffel vue du Champ-de-Mars' },
  { id: 'agence', Dessin: AgenceBarnes, titre: 'Gouache de la devanture d’une agence, ses affiches en vitrine' },
  { id: 'monuments', Dessin: MonumentsFrance, titre: 'Gouache d’une composition de grands monuments français' },
  { id: 'prairie', Dessin: PrairiePiscine, titre: 'Gouache d’une demeure dans sa prairie, avec sa piscine' },
  { id: 'village', Dessin: VillagePerche, titre: 'Gouache d’un village provençal perché et de son clocher' },
  { id: 'chalet', Dessin: ChaletNeige, titre: 'Gouache d’un chalet de montagne sous la neige' },
  { id: 'port', Dessin: PortRiviera, titre: 'Gouache d’un port de la Riviera et de ses bateaux à quai' },
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
 * Une planche, peinte dans son cadre, éventuellement retournée.
 *
 * `miroir` retourne la géométrie : la brosse balaie alors de droite à gauche, et
 * la scène pousse depuis le bord droit de l'écran. C'est une transformation de
 * dessin, pas de mise en page — le cadre, lui, ne bouge pas.
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
 * Les deux sont fixées aux bords de la fenêtre, et non au module central : c'est
 * du bord de l'écran qu'elles doivent émerger. Elles disparaissent sous 1280 px
 * — en deçà, elles mordraient sur la colonne d'étapes, qui est ce que
 * l'utilisateur doit lire.
 *
 * `aria-hidden` sur l'ensemble : ce qui se passe réellement est annoncé au
 * centre, en `aria-live`. Une planche peinte n'est pas une information sur
 * l'avancement.
 */
export function DuoProvence() {
  const reduce = useReducedMotion()
  const [duo] = useState(tirerDeux)
  const [second, setSecond] = useState(false)

  useEffect(() => {
    // Mouvement refusé : les deux planches arrivent ensemble, déjà peintes (le
    // filet d'`index.css` annule durées et retards). Les faire attendre cinq
    // secondes ne montrerait rien de plus — seulement une apparition sèche au
    // milieu de l'écran d'attente.
    const minuteur = setTimeout(() => setSecond(true), reduce ? 0 : ACTE_MS)
    return () => clearTimeout(minuteur)
  }, [reduce])

  const [gauche, droite] = duo

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 hidden xl:block">
      {/* Le centrage vertical est porté par une enveloppe ordinaire, et le
          glissement d'entrée par la couche Framer Motion à l'intérieur. Les deux
          écrivent `transform` : posés sur le même nœud, la valeur animée efface
          le `-translate-y-1/2` de la classe et la planche tombe d'une
          demi-hauteur sous le centre de la fenêtre. */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2">
        <motion.div
          initial={{ opacity: 0, x: reduce ? 0 : -28 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: reduce ? 0.2 : 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <Planche scene={gauche} className="h-[82vh] max-h-[42rem] w-[26vw] max-w-[22rem]" />
        </motion.div>
      </div>

      {second ? (
        <div className="absolute right-0 top-1/2 -translate-y-1/2">
          <motion.div
            initial={{ opacity: 0, x: reduce ? 0 : 28 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: reduce ? 0.2 : 1.1, ease: [0.22, 1, 0.36, 1] }}
          >
            <Planche scene={droite} miroir className="h-[82vh] max-h-[42rem] w-[26vw] max-w-[22rem]" />
          </motion.div>
        </div>
      ) : null}
    </div>
  )
}
