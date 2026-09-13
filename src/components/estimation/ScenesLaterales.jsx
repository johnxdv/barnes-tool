import { useState } from 'react'
import { ENCRE, Touche, Trait } from './encre'

/**
 * Les vignettes de l'écran d'analyse — une scène à l'encre, tirée au sort,
 * dessinée en une dizaine de secondes sur le côté de la page.
 *
 * ── Pourquoi une seconde scène, et pourquoi aléatoire ─────────────────────
 *
 * L'analyse dure douze secondes, et la planche centrale (`SceneEncre`) est
 * achevée au bout de six. La seconde moitié de l'attente se regardait donc
 * comme une image fixe. Ces vignettes couvrent exactement ce creux : elles se
 * dessinent lentement, du premier trait à la dernière ombre, et ne sont
 * terminées qu'au moment où l'écran laisse la place au formulaire.
 *
 * Le tirage au sort n'est pas un ornement. Un agent fait passer cet écran
 * plusieurs fois par jour, sous les yeux de vendeurs différents : une scène
 * unique deviendrait, dès la troisième estimation, l'écran d'attente qu'on ne
 * regarde plus. Six scènes, tirées à l'ouverture, font qu'il reste quelque
 * chose à découvrir — et elles disent ensemble le métier : la côte, la villa,
 * le bassin, l'appartement, l'avenue, l'agence.
 *
 * Le tirage se fait une fois, à la construction de l'état, et jamais ensuite :
 * `useState` avec une fonction d'initialisation plutôt qu'un `Math.random()`
 * posé dans le corps du composant, qui redessinerait une scène différente à
 * chaque rendu de l'écran — c'est-à-dire à chaque rotation de l'encart « Le
 * saviez-vous », toutes les quatre secondes.
 *
 * ── Le tempo ──────────────────────────────────────────────────────────────
 *
 * Chaque scène étale ses tracés de 0,2 s à un peu plus de 9 s, du fond vers le
 * premier plan : l'horizon, puis les masses, puis le détail, puis les ombres.
 * C'est l'ordre dans lequel on dessine, et c'est aussi celui qui se regarde le
 * mieux — le sujet se devine tôt et se précise longtemps.
 *
 * Les scènes partagent leur cadre (240 × 460, portrait) pour tenir dans la
 * même colonne quelle que soit celle qui sort.
 */

/** Cadre commun — portrait, à la proportion d'une colonne latérale. */
const VUE = '0 0 240 460'

// --- 1. La corniche --------------------------------------------------------

/**
 * Une route de la Côte d'Azur et la mer.
 *
 * La perspective tient à une seule chose : la chaussée est large en bas de
 * l'image et se referme en montant. Les piquets de la glissière suivent la
 * même fuite, et c'est leur espacement décroissant qui donne la distance —
 * plus sûrement que n'importe quel dégradé.
 */
function Corniche() {
  return (
    <>
      {/* L'horizon, haut placé : c'est ce qui fait qu'on regarde la mer d'en
          haut, depuis la corniche, et non depuis la plage. */}
      <Trait d="M 0 118 L 240 117" duree={1.1} retard={0.2} largeur={1.4} opacite={0.5} />

      {/* Le large — des traits de plus en plus espacés vers le bas : la houle
          se creuse quand elle se rapproche. */}
      {[
        [128, 30, 96, 0.22],
        [140, 12, 74, 0.2],
        [154, 60, 130, 0.18],
        [170, 8, 60, 0.16],
        [186, 84, 150, 0.15],
      ].map(([y, x1, x2], index) => (
        <Trait
          key={y}
          d={`M ${x1} ${y} q ${(x2 - x1) / 4} -4 ${(x2 - x1) / 2} 0 t ${(x2 - x1) / 2} 0`}
          duree={0.5}
          retard={1.4 + index * 0.35}
          largeur={0.9}
          opacite={0.3}
        />
      ))}

      {/* Le cap, à droite — deux masses qui se recouvrent. La plus lointaine
          est la plus pâle : c'est le seul indice de profondeur dont dispose un
          dessin au trait. */}
      <Trait
        d="M 240 118 C 214 112, 196 120, 178 118"
        duree={0.7}
        retard={2.6}
        largeur={1.2}
        opacite={0.35}
      />
      <Trait
        d="M 240 132 C 208 122, 190 136, 168 133 C 186 128, 206 118, 240 122"
        duree={0.9}
        retard={3.1}
        largeur={1.3}
        opacite={0.55}
      />

      {/* La falaise, en un geste : elle part du bord gauche, plonge et se perd
          derrière la route. */}
      <Trait
        d="M 0 214 C 44 200, 78 208, 106 226 C 130 242, 148 268, 156 300"
        duree={1.3}
        retard={3.8}
        largeur={1.8}
      />

      {/* La chaussée. Deux courbes qui s'écartent en descendant — c'est tout ce
          qu'il faut pour qu'on lise une route qui monte au loin. */}
      <Trait
        d="M 96 232 C 78 292, 42 348, 8 460"
        duree={1.5}
        retard={4.8}
        largeur={2.1}
      />
      <Trait
        d="M 130 234 C 132 300, 148 372, 176 460"
        duree={1.5}
        retard={5.1}
        largeur={2.1}
      />

      {/* L'axe médian, en pointillés qui s'allongent vers le premier plan. */}
      {[
        [116, 258, 118, 276],
        [110, 300, 113, 328],
        [98, 360, 104, 400],
        [82, 432, 90, 460],
      ].map(([x1, y1, x2, y2], index) => (
        <Trait
          key={y1}
          d={`M ${x1} ${y1} L ${x2} ${y2}`}
          duree={0.3}
          retard={6.2 + index * 0.22}
          largeur={1.5}
          opacite={0.4}
        />
      ))}

      {/* La glissière, côté mer. Les piquets se resserrent en montant : leur
          espacement porte à lui seul toute la profondeur de l'image. */}
      <Trait d="M 92 230 C 74 288, 38 344, 4 452" duree={0.9} retard={7} largeur={0.9} opacite={0.5} />
      {[
        [94, 236],
        [86, 268],
        [72, 306],
        [52, 356],
        [28, 414],
      ].map(([x, y], index) => (
        <Trait
          key={y}
          d={`M ${x} ${y} L ${x - 1} ${y + 10 + index * 3}`}
          duree={0.2}
          retard={7.4 + index * 0.16}
          largeur={0.9}
          opacite={0.45}
        />
      ))}

      {/* Deux pins parasols au premier plan, à droite : ils cadrent la vue et
          plantent la scène — une corniche sans pin pourrait être n'importe
          quelle route de bord de mer. */}
      <Trait d="M 216 460 C 212 420, 214 392, 218 372" duree={0.5} retard={8.2} largeur={1.6} />
      <Trait
        d="M 186 370 C 198 352, 224 348, 240 358 C 226 366, 200 374, 186 370 Z"
        duree={0.8}
        retard={8.5}
        largeur={1.5}
      />
      <Trait d="M 172 460 C 170 436, 172 420, 175 408" duree={0.4} retard={9} largeur={1.1} opacite={0.55} />
      <Trait
        d="M 150 406 C 162 392, 190 390, 202 398 C 188 404, 164 410, 150 406 Z"
        duree={0.6}
        retard={9.2}
        largeur={1.1}
        opacite={0.55}
      />
    </>
  )
}

// --- 2. La bastide ---------------------------------------------------------

/** Une belle maison — un mas provençal, toiture à faible pente et volets. */
function Bastide() {
  return (
    <>
      <Trait d="M 0 404 C 70 401, 160 407, 240 403" duree={1} retard={0.2} largeur={1.3} opacite={0.45} />

      {/* Le toit d'abord, comme sur la planche centrale : c'est lui qui donne
          l'assiette du bâtiment, et tout le reste s'y accroche. Faible pente et
          large débord — la signature du mas. */}
      <Trait d="M 22 244 L 120 196 L 218 246" duree={1.1} retard={0.9} largeur={2.2} />
      {[252, 259].map((y, index) => (
        <Trait
          key={y}
          d={`M ${30 + index * 5} ${y - 4} L ${210 - index * 5} ${y - 3}`}
          duree={0.5}
          retard={1.9 + index * 0.2}
          largeur={0.9}
          opacite={0.35}
        />
      ))}

      {/* Les murs, montés du sol. */}
      <Trait d="M 36 404 L 36 250" duree={0.6} retard={2.4} largeur={2} />
      <Trait d="M 204 404 L 204 250" duree={0.6} retard={2.6} largeur={2} />
      <Trait d="M 36 404 L 204 404" duree={0.6} retard={2.8} largeur={1.8} />

      {/* Étage : trois fenêtres à volets. Le volet est ce qui distingue une
          maison de Provence d'une maison en général — deux traits verticaux de
          part et d'autre suffisent. */}
      {[62, 108, 154].map((x, index) => (
        <g key={x}>
          <Trait
            d={`M ${x} 336 L ${x} 288 L ${x + 24} 288 L ${x + 24} 336 Z`}
            duree={0.55}
            retard={3.2 + index * 0.35}
            largeur={1.2}
            opacite={0.75}
          />
          <Trait
            d={`M ${x - 7} 288 L ${x - 7} 336`}
            duree={0.25}
            retard={3.45 + index * 0.35}
            largeur={1.4}
            opacite={0.5}
          />
          <Trait
            d={`M ${x + 31} 288 L ${x + 31} 336`}
            duree={0.25}
            retard={3.55 + index * 0.35}
            largeur={1.4}
            opacite={0.5}
          />
        </g>
      ))}

      {/* La porte, en plein cintre. Tracée d'un montant à l'autre en passant
          par l'arc : c'est le geste qu'on ferait, et l'arc s'en trouve un peu
          irrégulier — tant mieux. */}
      <Trait
        d="M 100 404 L 100 372 A 20 20 0 0 1 140 372 L 140 404"
        duree={0.9}
        retard={4.6}
        largeur={1.6}
      />

      {/* Deux fenêtres basses, plus petites que celles de l'étage. */}
      {[52, 162].map((x, index) => (
        <Trait
          key={x}
          d={`M ${x} 392 L ${x} 358 L ${x + 26} 358 L ${x + 26} 392 Z`}
          duree={0.5}
          retard={5.3 + index * 0.3}
          largeur={1.1}
          opacite={0.7}
        />
      ))}

      {/* Les marches du perron, et l'allée qui y mène. */}
      {[0, 1, 2].map((rang) => (
        <Trait
          key={rang}
          d={`M ${104 - rang * 8} ${408 + rang * 6} L ${136 + rang * 8} ${408 + rang * 6}`}
          duree={0.3}
          retard={6.1 + rang * 0.2}
          largeur={1.2}
          opacite={0.5}
        />
      ))}

      {/* Un cyprès de chaque côté, l'un plus haut que l'autre : deux arbres de
          même taille encadrant une façade font une composition de catalogue. */}
      <Trait
        d="M 14 404 C 4 350, 10 296, 16 274 C 24 300, 30 356, 22 404"
        duree={1}
        retard={6.9}
        largeur={1.4}
        opacite={0.75}
      />
      <Trait
        d="M 224 404 C 216 366, 220 328, 225 312 C 232 332, 236 372, 230 404"
        duree={0.9}
        retard={7.6}
        largeur={1.2}
        opacite={0.6}
      />

      {/* L'olivier du premier plan, en boule sur un tronc court. */}
      <Trait d="M 190 460 L 190 434" duree={0.3} retard={8.3} largeur={1.6} />
      <Trait
        d="M 168 430 C 172 414, 190 408, 206 414 C 216 420, 212 434, 196 436 C 180 438, 168 438, 168 430 Z"
        duree={1}
        retard={8.6}
        largeur={1.3}
      />

      {/* Le muret du premier plan, qui ferme la composition en bas. */}
      <Trait d="M 0 442 C 40 438, 92 444, 132 441" duree={0.7} retard={9.1} largeur={1.5} opacite={0.55} />
    </>
  )
}

// --- 3. Le bassin ----------------------------------------------------------

/** Une piscine — bassin rectangulaire en perspective, transats et parasol. */
function Bassin() {
  return (
    <>
      {/* La haie du fond, en un seul geste ondulé : elle ferme l'image et donne
          au bassin son intimité. */}
      <Trait
        d="M 0 176 C 30 164, 58 180, 88 168 C 118 156, 148 178, 178 166 C 208 154, 226 174, 240 168"
        duree={1.3}
        retard={0.2}
        largeur={1.6}
        opacite={0.6}
      />

      {/* La margelle du fond, puis le bassin : le trapèze se referme sur le
          spectateur, plus large au premier plan. */}
      <Trait d="M 44 214 L 196 214" duree={0.6} retard={1.5} largeur={1.1} opacite={0.5} />
      <Trait
        d="M 30 380 L 56 226 L 184 226 L 212 380 Z"
        duree={1.6}
        retard={1.9}
        largeur={2.1}
      />

      {/* Les lignes d'eau, en fuite vers le fond — elles disent la longueur du
          bassin, qu'un contour seul ne dit pas. */}
      {[0.33, 0.66].map((part, index) => (
        <Trait
          key={part}
          d={`M ${56 + (184 - 56) * part} 230 L ${30 + (212 - 30) * part} 376`}
          duree={0.7}
          retard={3.6 + index * 0.3}
          largeur={0.8}
          opacite={0.25}
        />
      ))}

      {/* L'échelle, deux mains courantes en arc. */}
      <Trait d="M 168 232 C 178 224, 186 230, 184 240" duree={0.4} retard={4.4} largeur={1.2} opacite={0.7} />
      <Trait d="M 176 232 C 186 224, 194 230, 192 240" duree={0.4} retard={4.6} largeur={1.2} opacite={0.7} />

      {/* La terrasse au premier plan, dallée : trois joints suffisent. */}
      {[400, 418, 438].map((y, index) => (
        <Trait
          key={y}
          d={`M ${8 - index * 3} ${y} L ${232 + index * 3} ${y + 2}`}
          duree={0.5}
          retard={5.1 + index * 0.25}
          largeur={0.9}
          opacite={0.28}
        />
      ))}

      {/* Deux transats, de trois quarts : dossier incliné, assise, pieds. Le
          second est plus petit et plus pâle — il est plus loin. */}
      <Trait d="M 18 348 L 40 330 L 58 336 L 34 356 Z" duree={0.7} retard={6.2} largeur={1.3} />
      <Trait d="M 40 330 L 52 314" duree={0.3} retard={6.7} largeur={1.3} />
      <Trait d="M 24 356 L 22 368 M 54 340 L 52 352" duree={0.3} retard={6.9} largeur={1} opacite={0.6} />

      <Trait
        d="M 12 306 L 30 292 L 44 297 L 25 312 Z"
        duree={0.6}
        retard={7.2}
        largeur={1.1}
        opacite={0.6}
      />
      <Trait d="M 30 292 L 40 279" duree={0.25} retard={7.6} largeur={1.1} opacite={0.6} />

      {/* Le parasol — mât puis toile, dans cet ordre : on plante avant
          d'ouvrir. */}
      <Trait d="M 206 344 L 206 268" duree={0.5} retard={7.9} largeur={1.4} />
      <Trait
        d="M 168 272 C 182 254, 226 252, 240 270 C 224 276, 186 278, 168 272 Z"
        duree={0.9}
        retard={8.3}
        largeur={1.5}
      />
      {[186, 206, 226].map((x, index) => (
        <Trait
          key={x}
          d={`M ${x} 271 L ${206 + (x - 206) * 0.12} 258`}
          duree={0.25}
          retard={8.9 + index * 0.12}
          largeur={0.7}
          opacite={0.4}
        />
      ))}
    </>
  )
}

// --- 4. L'appartement ------------------------------------------------------

/**
 * Un appartement — vu de l'intérieur, depuis le fond du séjour.
 *
 * Le parti pris est celui d'une agence plutôt que d'un architecte : ce qui se
 * vend d'un appartement, c'est la lumière et la vue, pas le plan. La baie tient
 * donc les deux tiers de l'image, et le mobilier n'est là que pour donner
 * l'échelle.
 */
function Appartement() {
  return (
    <>
      {/* Les arêtes de la pièce — plafond, sol, mur de droite. Tracées avant
          tout le reste : c'est le volume qui accueille la scène. */}
      <Trait d="M 0 116 L 240 108" duree={0.9} retard={0.2} largeur={1.2} opacite={0.4} />
      <Trait d="M 0 386 L 240 396" duree={0.9} retard={0.6} largeur={1.4} opacite={0.5} />
      <Trait d="M 196 108 L 196 396" duree={0.7} retard={1} largeur={1} opacite={0.35} />

      {/* La baie, du sol au plafond. Elle est le sujet : c'est le tracé le plus
          appuyé de la scène. */}
      <Trait d="M 34 380 L 34 140 L 176 132 L 176 388" duree={1.6} retard={1.5} largeur={2.1} />
      {[76, 118].map((x, index) => (
        <Trait
          key={x}
          d={`M ${x} ${380 - index * 3} L ${x} ${138 - index * 2}`}
          duree={0.6}
          retard={3.2 + index * 0.3}
          largeur={1.1}
          opacite={0.45}
        />
      ))}

      {/* Ce qu'on voit dehors : un garde-corps, et deux toitures au loin. Trois
          traits, pas davantage — un paysage détaillé volerait la vedette à la
          pièce. */}
      <Trait d="M 40 300 L 172 294" duree={0.6} retard={4} largeur={1} opacite={0.4} />
      <Trait d="M 44 240 L 82 216 L 118 238" duree={0.6} retard={4.4} largeur={0.9} opacite={0.28} />
      <Trait d="M 116 244 L 148 224 L 172 240" duree={0.5} retard={4.7} largeur={0.9} opacite={0.22} />

      {/* Le rideau, côté droit — une seule courbe et deux plis. */}
      <Trait d="M 184 130 C 178 220, 190 320, 182 390" duree={1} retard={5.1} largeur={1.3} opacite={0.6} />
      <Trait d="M 190 150 C 186 240, 194 330, 188 388" duree={0.8} retard={5.6} largeur={0.9} opacite={0.35} />

      {/* Le canapé, de trois quarts : dossier, assise, accoudoirs, pieds. */}
      <Trait d="M 46 372 L 46 336 C 46 328, 54 326, 62 326 L 150 322 C 158 322, 162 326, 162 334 L 162 372" duree={1.4} retard={6.1} largeur={1.7} />
      <Trait d="M 46 348 L 162 344" duree={0.5} retard={7.2} largeur={1} opacite={0.5} />
      <Trait d="M 60 372 L 60 382 M 150 370 L 150 380" duree={0.3} retard={7.5} largeur={1} opacite={0.5} />

      {/* Deux coussins, posés à l'encre pleine : à cette échelle, ils n'ont pas
          de contour à parcourir. */}
      <Touche x={58} y={330} largeur={20} hauteur={16} retard={7.8} opacite={0.14} rx={3} />
      <Touche x={130} y={328} largeur={20} hauteur={16} retard={7.95} opacite={0.14} rx={3} />

      {/* La table basse, ovale, et le tapis qui la porte. */}
      <Trait
        d="M 62 412 C 62 402, 92 396, 118 396 C 144 396, 168 402, 168 412 C 168 422, 144 428, 118 428 C 92 428, 62 422, 62 412 Z"
        duree={1}
        retard={8.2}
        largeur={1.4}
      />
      <Trait d="M 24 442 C 80 434, 170 436, 218 444" duree={0.7} retard={8.9} largeur={1} opacite={0.3} />

      {/* Le lampadaire, à droite — pied, fût, abat-jour. */}
      <Trait d="M 210 386 L 210 300" duree={0.5} retard={9.1} largeur={1.2} opacite={0.7} />
      <Trait d="M 198 300 L 204 276 L 224 274 L 226 298 Z" duree={0.6} retard={9.35} largeur={1.2} opacite={0.7} />
    </>
  )
}

// --- 5. L'avenue -----------------------------------------------------------

/**
 * Une avenue très luxueuse — perspective à un point de fuite.
 *
 * Tout converge vers un point unique, un peu au-dessus du milieu de l'image.
 * C'est le seul dessin de la série où la géométrie est calculée plutôt que
 * posée : les corniches, les trottoirs et les arbres sont interpolés vers ce
 * point, faute de quoi la rue « gauchit » et la scène cesse d'être crédible.
 */
const FUITE = { x: 122, y: 208 }

/** Point à `part` du chemin entre un bord de l'image et le point de fuite. */
const versFuite = (x, y, part) => [
  x + (FUITE.x - x) * part,
  y + (FUITE.y - y) * part,
]

function Avenue() {
  const trottoirGauche = versFuite(0, 460, 0.86)
  const trottoirDroit = versFuite(240, 460, 0.86)

  return (
    <>
      {/* Le fond de la perspective — quelques toitures au point de fuite, très
          pâles : c'est là que l'œil s'arrête. */}
      <Trait d="M 96 208 L 122 190 L 150 208" duree={0.6} retard={0.2} largeur={0.9} opacite={0.25} />

      {/* Les deux façades, réduites à leur arête basse et à leur corniche : le
          reste se devine. */}
      <Trait d={`M 0 296 L ${FUITE.x - 8} ${FUITE.y}`} duree={1.2} retard={0.7} largeur={1.7} />
      <Trait d={`M 240 288 L ${FUITE.x + 8} ${FUITE.y}`} duree={1.2} retard={1} largeur={1.7} />
      <Trait d={`M 0 108 L ${FUITE.x - 10} ${FUITE.y - 14}`} duree={1.2} retard={1.4} largeur={1.4} opacite={0.55} />
      <Trait d={`M 240 96 L ${FUITE.x + 10} ${FUITE.y - 14}`} duree={1.2} retard={1.7} largeur={1.4} opacite={0.55} />

      {/* Les refends verticaux qui découpent les façades en immeubles. Leur
          espacement se resserre vers le fond — c'est lui qui fait la
          profondeur. */}
      {[0.08, 0.26, 0.46, 0.66, 0.8].map((part, index) => {
        const [xg, yg] = versFuite(0, 296, part)
        const [xgh, ygh] = versFuite(0, 108, part)
        const [xd, yd] = versFuite(240, 288, part)
        const [xdh, ydh] = versFuite(240, 96, part)
        return (
          <g key={part}>
            <Trait
              d={`M ${xg} ${yg} L ${xgh} ${ygh}`}
              duree={0.5}
              retard={2.3 + index * 0.28}
              largeur={1}
              opacite={0.4 - index * 0.05}
            />
            <Trait
              d={`M ${xd} ${yd} L ${xdh} ${ydh}`}
              duree={0.5}
              retard={2.45 + index * 0.28}
              largeur={1}
              opacite={0.4 - index * 0.05}
            />
          </g>
        )
      })}

      {/* Les trottoirs, puis la chaussée entre les deux. */}
      <Trait d={`M 0 380 L ${trottoirGauche[0]} ${trottoirGauche[1]}`} duree={1.1} retard={4} largeur={1.5} />
      <Trait d={`M 240 372 L ${trottoirDroit[0]} ${trottoirDroit[1]}`} duree={1.1} retard={4.3} largeur={1.5} />
      <Trait d={`M 0 460 L ${FUITE.x - 3} ${FUITE.y + 4}`} duree={1.1} retard={4.7} largeur={1} opacite={0.35} />
      <Trait d={`M 240 452 L ${FUITE.x + 3} ${FUITE.y + 4}`} duree={1.1} retard={4.9} largeur={1} opacite={0.35} />

      {/* L'axe de la chaussée, en pointillés qui s'allongent vers nous. */}
      {[0.62, 0.44, 0.24, 0.04].map((part, index) => {
        const [x1, y1] = versFuite(120, 460, part + 0.08)
        const [x2, y2] = versFuite(120, 460, part)
        return (
          <Trait
            key={part}
            d={`M ${x1} ${y1} L ${x2} ${y2}`}
            duree={0.3}
            retard={5.6 + index * 0.2}
            largeur={1.3}
            opacite={0.35}
          />
        )
      })}

      {/* Les candélabres, alignés sur le trottoir de gauche. Un fût, une
          traverse, un globe — le minimum pour qu'on lise « avenue » et non
          « rue ». */}
      {[0.72, 0.5, 0.2].map((part, index) => {
        const [x, y] = versFuite(24, 400, part)
        const hauteur = 130 * (1 - part) + 22
        return (
          <g key={part}>
            <Trait
              d={`M ${x} ${y} L ${x} ${y - hauteur}`}
              duree={0.4}
              retard={6.5 + index * 0.3}
              largeur={1.2 - part * 0.5}
              opacite={0.7}
            />
            <Trait
              d={`M ${x - 5 * (1 - part)} ${y - hauteur} L ${x + 5 * (1 - part)} ${y - hauteur}`}
              duree={0.2}
              retard={6.7 + index * 0.3}
              largeur={1}
              opacite={0.6}
            />
          </g>
        )
      })}

      {/* Les arbres taillés du trottoir de droite, en boule sur tronc court —
          l'alignement des avenues haussmanniennes. */}
      {[0.68, 0.42, 0.12].map((part, index) => {
        const [x, y] = versFuite(214, 396, part)
        const r = 26 * (1 - part) + 5
        return (
          <g key={part}>
            <Trait
              d={`M ${x} ${y} L ${x} ${y - r * 1.1}`}
              duree={0.3}
              retard={7.7 + index * 0.35}
              largeur={1.3 - part * 0.6}
              opacite={0.7}
            />
            <Trait
              d={`M ${x - r} ${y - r * 1.3} C ${x - r} ${y - r * 2.4}, ${x + r} ${y - r * 2.4}, ${x + r} ${y - r * 1.3} C ${x + r * 0.5} ${y - r * 0.8}, ${x - r * 0.5} ${y - r * 0.8}, ${x - r} ${y - r * 1.3} Z`}
              duree={0.7}
              retard={7.9 + index * 0.35}
              largeur={1.2}
              opacite={0.6}
            />
          </g>
        )
      })}

      {/* Deux stores de boutique au premier plan gauche : c'est le détail qui
          fait passer l'avenue du quartier d'affaires au quartier de commerces
          de luxe. */}
      <Trait d="M 0 268 L 40 276 L 38 296 L 0 288 Z" duree={0.7} retard={9} largeur={1.2} opacite={0.55} />
      <Trait d="M 0 330 L 26 338 L 24 356 L 0 348 Z" duree={0.6} retard={9.3} largeur={1.1} opacite={0.45} />
    </>
  )
}

// --- 6. L'agence -----------------------------------------------------------

/**
 * Une agence BARNES.
 *
 * Seule scène de la série à porter le nom de la marque, et le seul endroit du
 * parcours où il est écrit en toutes lettres dans un dessin plutôt que posé en
 * écusson. Il est tracé comme le reste, en Prata : le SVG est incorporé au
 * document — et non appelé par une balise `img` —, la fonte de la page s'y
 * applique donc.
 */
function Agence() {
  return (
    <>
      {/* Le trottoir, puis la trame du dallage : la devanture a besoin d'un sol
          pour ne pas flotter. */}
      <Trait d="M 0 400 L 240 404" duree={0.9} retard={0.2} largeur={1.5} />
      {[422, 442].map((y, index) => (
        <Trait
          key={y}
          d={`M 0 ${y} L 240 ${y + 3}`}
          duree={0.6}
          retard={0.9 + index * 0.25}
          largeur={0.8}
          opacite={0.25}
        />
      ))}

      {/* La façade : deux jambages et le bandeau d'enseigne. */}
      <Trait d="M 24 400 L 24 96" duree={0.9} retard={1.6} largeur={2.2} />
      <Trait d="M 216 400 L 216 96" duree={0.9} retard={1.9} largeur={2.2} />
      <Trait d="M 24 96 L 216 94" duree={0.8} retard={2.4} largeur={2} />
      <Trait d="M 24 146 L 216 145" duree={0.7} retard={2.9} largeur={1.4} opacite={0.6} />

      {/* L'enseigne. Elle se pose d'un geste, comme les fenêtres de la planche
          centrale : des lettres ne se parcourent pas au pinceau. */}
      <text
        x="120"
        y="130"
        textAnchor="middle"
        fontFamily="Prata, Georgia, serif"
        fontSize="26"
        letterSpacing="4"
        fill={ENCRE}
        className="pose-encre"
        style={{ '--retard': '3.4s', '--duree': '0.9s' }}
      >
        BARNES
      </text>

      {/* Le store, en arc, avec ses lambrequins : c'est lui qui fait la
          devanture soignée plutôt que la vitrine de bureau. */}
      <Trait
        d="M 14 168 C 60 152, 180 152, 226 168 L 226 190 C 180 176, 60 176, 14 190 Z"
        duree={1.2}
        retard={4.2}
        largeur={1.6}
      />
      {[42, 78, 114, 150, 186].map((x, index) => (
        <Trait
          key={x}
          d={`M ${x} 178 L ${x} 194`}
          duree={0.2}
          retard={5.2 + index * 0.12}
          largeur={0.8}
          opacite={0.35}
        />
      ))}

      {/* Les vitrines, de part et d'autre de l'entrée. */}
      <Trait d="M 36 392 L 36 208 L 100 208 L 100 392 Z" duree={1.1} retard={5.9} largeur={1.5} />
      <Trait d="M 140 392 L 140 208 L 204 208 L 204 392 Z" duree={1.1} retard={6.2} largeur={1.5} />

      {/* Les annonces en vitrine — trois panneaux par côté, posés à l'encre :
          ce sont les biens à vendre, et c'est ce qui distingue une agence
          immobilière de n'importe quelle boutique. */}
      {[
        [46, 232],
        [46, 288],
        [46, 344],
        [150, 232],
        [150, 288],
        [150, 344],
      ].map(([x, y], index) => (
        <g key={`${x}-${y}`}>
          <Touche x={x} y={y} largeur={44} hauteur={30} retard={6.9 + index * 0.18} opacite={0.12} rx={1.5} />
          <Trait
            d={`M ${x} ${y + 38} L ${x + 30} ${y + 38}`}
            duree={0.2}
            retard={7.05 + index * 0.18}
            largeur={0.8}
            opacite={0.35}
          />
        </g>
      ))}

      {/* La porte, entre les deux vitrines, avec sa poignée. */}
      <Trait d="M 106 400 L 106 216 L 134 216 L 134 400" duree={0.9} retard={8.2} largeur={1.6} />
      <Trait d="M 126 308 L 126 320" duree={0.2} retard={8.9} largeur={1.4} opacite={0.7} />

      {/* Deux oliviers en pot encadrant l'entrée — pot d'abord, feuillage
          ensuite : on plante avant que ça pousse. */}
      {[
        [16, 8.7],
        [224, 9.05],
      ].map(([x, retard]) => (
        <g key={x}>
          <Trait
            d={`M ${x - 11} 400 L ${x - 8} 372 L ${x + 8} 372 L ${x + 11} 400`}
            duree={0.5}
            retard={retard}
            largeur={1.3}
          />
          <Trait d={`M ${x} 372 L ${x} 350`} duree={0.25} retard={retard + 0.25} largeur={1.2} />
          <Trait
            d={`M ${x - 18} 344 C ${x - 14} 324, ${x + 14} 324, ${x + 18} 344 C ${x + 8} 354, ${x - 8} 354, ${x - 18} 344 Z`}
            duree={0.7}
            retard={retard + 0.4}
            largeur={1.2}
          />
        </g>
      ))}
    </>
  )
}

/**
 * Les six scènes, dans l'ordre où elles ont été demandées.
 *
 * Le libellé n'est pas décoratif : c'est le texte alternatif de la vignette. Un
 * lecteur d'écran n'a rien à faire du pinceau, mais il doit pouvoir dire ce qui
 * est dessiné si l'utilisateur le demande.
 */
const SCENES = [
  { id: 'corniche', Dessin: Corniche, titre: 'Dessin à l’encre d’une route de la Côte d’Azur au-dessus de la mer' },
  { id: 'bastide', Dessin: Bastide, titre: 'Dessin à l’encre d’un mas provençal et de ses cyprès' },
  { id: 'bassin', Dessin: Bassin, titre: 'Dessin à l’encre d’une piscine, de ses transats et de son parasol' },
  { id: 'appartement', Dessin: Appartement, titre: 'Dessin à l’encre d’un séjour d’appartement ouvert sur une grande baie' },
  { id: 'avenue', Dessin: Avenue, titre: 'Dessin à l’encre d’une avenue bordée d’immeubles et d’arbres taillés' },
  { id: 'agence', Dessin: Agence, titre: 'Dessin à l’encre de la devanture d’une agence Barnes' },
]

/**
 * Une scène tirée au sort, dessinée en une dizaine de secondes.
 *
 * Le tirage a lieu une fois, à la construction de l'état — voir l'en-tête de
 * fichier : posé dans le corps du composant, il changerait de scène à chaque
 * rendu de l'écran d'analyse, et il y en a un toutes les quatre secondes.
 */
export function SceneLaterale({ className = '' }) {
  const [scene] = useState(() => SCENES[Math.floor(Math.random() * SCENES.length)])
  const { Dessin, titre } = scene

  return (
    <svg viewBox={VUE} className={className} role="img" aria-label={titre}>
      <Dessin />
    </svg>
  )
}
