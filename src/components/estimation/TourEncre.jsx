import { Touche, Trait } from './encre'
import { LOGO_BARNES_SRC } from '../ui/LogoBarnes'

/**
 * L'Immeuble Barnes — le grand dessin à l'encre de l'écran d'adresse.
 *
 * Un immeuble de rapport tracé au pinceau, qui sort du sol étage par étage et
 * se coiffe de l'écusson une fois le toit posé. Il est posé en fond de l'écran
 * d'adresse, centré sur le titre, et n'y tient plus le rôle d'illustration mais
 * celui de décor : très peu contrasté, large, derrière le texte.
 *
 * ── Ce que le dessin a changé, et pourquoi ────────────────────────────────
 *
 * La version précédente était une tour à retraits successifs — cinq ressauts en
 * quatorze bandes, du socle à la flèche. Le motif existe (les gratte-ciel
 * américains des années trente), mais à cette échelle et sans perspective il ne
 * se lisait pas comme un immeuble : chaque retrait ramenait la largeur d'un
 * sixième, et l'empilement de galettes de plus en plus petites évoquait une
 * pièce montée. Le défaut était de proportions, pas de trait.
 *
 * Le dessin actuel est celui d'un immeuble de ville ordinaire, et ses cotes
 * viennent de là :
 *
 *  - **Un seul volume, et un seul retrait.** Sept niveaux de même largeur, puis
 *    un étage attique en retrait sous le toit — la silhouette d'un immeuble
 *    haussmannien surélevé, qui est ce qu'un vendeur français reconnaît.
 *  - **Un rapport hauteur / largeur de 2,4.** Un immeuble de huit niveaux sur
 *    une parcelle de dix-sept mètres. Au-delà de 3, on dessine une tour ; en
 *    deçà de 2, un bloc.
 *  - **Une hauteur d'étage constante de 48 unités pour 168 de largeur** —
 *    le rapport réel d'un plafond de trois mètres sur une façade de dix.
 *  - **Un vrai toit à deux pans**, avec ses lucarnes et ses souches de
 *    cheminée. C'est lui qui fait le plus de travail : un volume coupé net en
 *    haut est un immeuble de bureaux, la même masse sous un toit est un
 *    immeuble d'habitation.
 *  - **Des fenêtres, et non des meneaux.** Les montants verticaux qui tenaient
 *    lieu de fenêtres rayaient la façade du sol au toit et accentuaient l'effet
 *    d'empilement. Des percements posés en rangs — cinq par étage, alignés
 *    verticalement — donnent l'échelle d'un seul coup.
 *
 * ── Le trait ──────────────────────────────────────────────────────────────
 *
 * Le pinceau est celui de tout le parcours (voir `encre.jsx`). Rien n'est
 * parfaitement droit, et c'est l'essentiel du rendu « à la main » : les
 * verticales dérivent d'un demi-point, les planchers ne sont jamais tout à fait
 * horizontaux, les épaisseurs varient d'un niveau à l'autre. Un immeuble tracé
 * à la règle aurait l'air d'un schéma technique.
 *
 * La scène se joue une fois, en trois secondes, et ne boucle pas : c'est une
 * ouverture, pas un fond d'écran animé — un immeuble qui se redessinerait en
 * continu derrière un champ de saisie deviendrait un clignotant.
 *
 * Le mode « moins d'animations » est couvert sans condition : le filet global
 * d'`index.css` ramène toute durée à 0,001 ms en gardant `forwards`, et
 * l'immeuble s'affiche d'emblée terminé.
 */

/** Axe du bâtiment et ligne de sol, en unités de dessin. */
const AXE = 180
const SOL = 596

/**
 * Le cadre du dessin, resserré autour de lui : l'écusson en haut (y = 76), la
 * ligne de sol en bas (y = 602), et deux poignées d'unités de marge. Voir le
 * commentaire du rendu — c'est ce cadrage qui permet de centrer l'immeuble sur
 * un titre sans le décaler.
 */
const VUE = '0 62 360 556'

/**
 * Les niveaux, du sol vers le ciel.
 *
 * `bas` et `haut` sont des ordonnées, `demi` la demi-largeur du niveau. Le pied
 * de chaque niveau reprend la largeur de celui du dessous, ce qui dessine le
 * ressaut de l'attique sans avoir à le décrire deux fois.
 *
 * La composition tient entre y = 168 (faîtage) et y = 602 (sol), soit 434
 * unités pour 176 de largeur au rez-de-chaussée. Au-dessus du faîtage, un
 * intervalle puis l'écusson, qui se pose de y = 76 à y = 138.
 */
const BANDES = [
  { bas: SOL, haut: 552, demi: 88, socle: true },
  { bas: 552, haut: 504, demi: 84, fenetres: 5 },
  { bas: 504, haut: 456, demi: 84, fenetres: 5 },
  { bas: 456, haut: 408, demi: 84, fenetres: 5 },
  { bas: 408, haut: 360, demi: 84, fenetres: 5 },
  { bas: 360, haut: 312, demi: 84, fenetres: 5 },
  { bas: 312, haut: 264, demi: 84, fenetres: 5 },
  { bas: 264, haut: 222, demi: 70, fenetres: 4, attique: true },
  { bas: 222, haut: 168, demi: 70, toit: true },
]

/** Décalage de main : quelques dixièmes d'unité, jamais les mêmes. */
const tremble = (index, amplitude = 0.7) =>
  ((Math.sin(index * 12.9898) * 43758.5453) % 1) * amplitude

/**
 * Une rangée de fenêtres, posées à l'encre.
 *
 * Les percements sont des aplats (`Touche`) et non des contours : à douze
 * unités de large, un rectangle tracé au pinceau n'a pas de trajet — il
 * clignoterait. Posés, ils se lisent comme des ouvertures sombres dans une
 * façade claire, ce qu'ils sont.
 *
 * L'appui de fenêtre, lui, est un trait : c'est le détail qui empêche la rangée
 * de ressembler à une grille de tableur.
 */
function Fenetres({ nombre, demi, bas, haut, retard }) {
  if (!nombre) return null

  const hauteurNiveau = bas - haut
  // Le percement occupe la moitié de la hauteur d'étage, posé au tiers
  // supérieur : c'est la position réelle d'une fenêtre entre son allège et son
  // linteau, et c'est elle qui donne l'échelle du dessin.
  const hauteurFenetre = hauteurNiveau * 0.46
  const y = haut + hauteurNiveau * 0.26
  const largeur = Math.min((2 * demi) / (nombre * 2.1), 15)

  return Array.from({ length: nombre }, (_, rang) => {
    const part = (rang + 1) / (nombre + 1)
    const x = AXE - demi + 2 * demi * part - largeur / 2

    return (
      <g key={rang}>
        <Touche
          x={x}
          y={y}
          largeur={largeur}
          hauteur={hauteurFenetre}
          retard={retard + 0.14 + rang * 0.04}
          duree={0.4}
          opacite={0.2}
        />
        <Trait
          d={`M ${x - 1.6} ${y + hauteurFenetre + 1.4} L ${x + largeur + 1.6} ${y + hauteurFenetre + 1.2}`}
          duree={0.22}
          retard={retard + 0.18 + rang * 0.04}
          largeur={0.9}
          opacite={0.5}
        />
      </g>
    )
  })
}

/**
 * Le toit — deux pans, un faîtage, deux souches et deux lucarnes.
 *
 * C'est la pièce qui fait lire « immeuble d'habitation » plutôt que « bloc », et
 * elle mérite ses quelques traits : un volume coupé net en haut reste un
 * parallélépipède quelle que soit la qualité de sa façade.
 *
 * L'avant-toit déborde de six unités de part et d'autre. Un toit à l'aplomb
 * exact des murs ne se distingue pas d'un couronnement plein ; c'est le
 * débord — et l'ombre qu'il porte — qui le détache.
 */
function Toit({ bas, haut, demi, retard, d }) {
  const debord = demi + 6
  const faite = 26

  return (
    <g>
      {/* La corniche, sur toute la largeur de l'avant-toit : c'est l'assise du
          toit, et le trait le plus épais du dessin après le socle. */}
      <Trait
        d={`M ${AXE - debord} ${bas} L ${AXE + debord} ${bas + d * 0.3 - 0.15}`}
        duree={0.35}
        retard={retard}
        largeur={2.6}
      />

      {/* Les deux pans, tracés du bas vers le faîtage — le geste de quelqu'un
          qui monte une charpente. */}
      <Trait
        d={`M ${AXE - debord} ${bas} L ${AXE - faite - d * 0.4} ${haut}`}
        duree={0.4}
        retard={retard + 0.08}
        largeur={2.1}
      />
      <Trait
        d={`M ${AXE + debord} ${bas} L ${AXE + faite + d * 0.4} ${haut}`}
        duree={0.4}
        retard={retard + 0.12}
        largeur={2.1}
      />
      <Trait
        d={`M ${AXE - faite} ${haut} L ${AXE + faite} ${haut + d * 0.3 - 0.15}`}
        duree={0.28}
        retard={retard + 0.2}
        largeur={1.9}
      />

      {/* Deux lucarnes sur le pan visible, décalées de l'axe : centrées, elles
          se confondraient avec le faîtage. */}
      {[-1, 1].map((cote) => {
        const x = AXE + cote * 32
        const yBas = bas - 14
        const yHaut = yBas - 15
        return (
          <g key={cote}>
            <Trait
              d={`M ${x - 7} ${yBas} L ${x - 7} ${yHaut + 4} L ${x} ${yHaut} L ${x + 7} ${yHaut + 4} L ${x + 7} ${yBas}`}
              duree={0.3}
              retard={retard + 0.26 + (cote > 0 ? 0.05 : 0)}
              largeur={1.1}
              opacite={0.75}
            />
            <Touche
              x={x - 4}
              y={yHaut + 6}
              largeur={8}
              hauteur={9}
              retard={retard + 0.34 + (cote > 0 ? 0.05 : 0)}
              duree={0.35}
              opacite={0.18}
            />
          </g>
        )
      })}

      {/* Les souches de cheminée, posées en dernier : elles dépassent le
          faîtage, et rien ne doit être tracé par-dessus.

          Leur assise suit la pente — une souche posée à hauteur constante
          flotterait au-dessus du pan d'un côté et s'y enfoncerait de l'autre.
          L'ordonnée est donc interpolée entre l'avant-toit et le faîtage, à
          l'abscisse de la souche. */}
      {[-1, 1].map((cote) => {
        const ecart = 52
        const x = AXE + cote * ecart
        const t = (ecart - faite) / (debord - faite)
        const yAssise = haut + t * (bas - haut)

        return (
          <Trait
            key={`souche-${cote}`}
            d={`M ${x - 5} ${yAssise} L ${x - 5} ${yAssise - 20} L ${x + 5} ${yAssise - 20} L ${x + 5} ${yAssise + 3}`}
            duree={0.3}
            retard={retard + 0.4 + (cote > 0 ? 0.04 : 0)}
            largeur={1.5}
            opacite={0.85}
          />
        )
      })}
    </g>
  )
}

/**
 * Un niveau du bâtiment : son plancher, ses deux montants, ses percements.
 *
 * Le plancher est tracé en premier, les montants ensuite : c'est l'ordre dans
 * lequel on le dessinerait — on pose l'assise, puis on monte les murs.
 */
function Bande({ bande, index, demiPrecedent, retard }) {
  const { bas, haut, demi, fenetres = 0, socle = false, attique = false, toit = false } = bande
  const pied = demiPrecedent ?? demi
  const d = tremble(index)
  const duree = 0.42

  if (toit) return <Toit bas={bas} haut={haut} demi={demi} retard={retard} d={d} />

  const ressaut = pied !== demi

  return (
    <g>
      {/* Le plancher, tracé sur toute la largeur du niveau inférieur : c'est
          lui qui forme la corniche du ressaut quand le bâtiment se retire.
          Jamais tout à fait horizontal — deux dixièmes d'unité de dérive
          suffisent à lui ôter l'air d'un trait de règle. */}
      <Trait
        d={`M ${AXE - pied + d} ${bas} L ${AXE + pied - d} ${bas + d * 0.4 - 0.2}`}
        duree={duree * 0.7}
        retard={retard}
        largeur={socle || ressaut ? 2.4 : 1.2}
        opacite={socle || ressaut ? 1 : 0.6}
      />

      {/* Les montants, verticaux. Une façade d'immeuble monte droit ; tracés
          obliques d'une largeur à l'autre, les niveaux accumuleraient leurs
          pentes et le bâtiment prendrait l'allure d'un tronc de pyramide. */}
      <Trait
        d={`M ${AXE - demi - d * 0.4} ${bas} L ${AXE - demi + d * 0.3} ${haut}`}
        duree={duree}
        retard={retard + 0.06}
        largeur={socle ? 2.6 : 2.1}
      />
      <Trait
        d={`M ${AXE + demi + d * 0.4} ${bas} L ${AXE + demi - d * 0.3} ${haut}`}
        duree={duree}
        retard={retard + 0.1}
        largeur={socle ? 2.6 : 2.1}
      />

      <Fenetres nombre={fenetres} demi={demi} bas={bas} haut={haut} retard={retard} />

      {/* La balustrade de l'attique : quelques balustres sur la corniche du
          retrait. C'est ce qui transforme le ressaut en terrasse plutôt qu'en
          simple rétrécissement. */}
      {attique
        ? [-2, -1, 0, 1, 2].map((rang) => {
            const x = AXE + rang * 28
            return (
              <Trait
                key={`bal${rang}`}
                d={`M ${x} ${bas} L ${x} ${bas - 7}`}
                duree={0.2}
                retard={retard + 0.1 + Math.abs(rang) * 0.03}
                largeur={0.9}
                opacite={0.4}
              />
            )
          })
        : null}

      {/* Le rez-de-chaussée : une porte cochère au centre, deux percements
          hauts de part et d'autre. Un socle vide donnerait un immeuble posé sur
          un mur plein, ce qui n'existe pas en ville. */}
      {socle ? (
        <g>
          <Trait
            d={`M ${AXE - 17} ${bas} L ${AXE - 17} ${haut + 8} Q ${AXE} ${haut - 1} ${AXE + 17} ${haut + 8} L ${AXE + 17} ${bas}`}
            duree={0.5}
            retard={retard + 0.18}
            largeur={1.7}
          />
          <Touche
            x={AXE - 14}
            y={haut + 11}
            largeur={28}
            hauteur={bas - haut - 11}
            retard={retard + 0.3}
            duree={0.5}
            opacite={0.14}
          />
          {[-1, 1].map((cote) => (
            <Touche
              key={cote}
              x={AXE + cote * 48 - 9}
              y={haut + 12}
              largeur={18}
              hauteur={20}
              retard={retard + 0.34 + (cote > 0 ? 0.04 : 0)}
              duree={0.4}
              opacite={0.18}
            />
          ))}
          {/* Les marches, hachurées : elles ancrent le bâtiment au sol au lieu
              de le laisser posé dessus. */}
          {[0.3, 0.42].map((part, rang) => (
            <Trait
              key={part}
              d={`M ${AXE - pied * part} ${SOL + 5 + rang * 3} L ${AXE + pied * part} ${SOL + 5 + rang * 3 - 0.4}`}
              duree={0.26}
              retard={retard + 0.42 + rang * 0.06}
              largeur={1.1}
              opacite={0.45}
            />
          ))}
        </g>
      ) : null}

      {/* Ombre portée sur la face gauche — quelques hachures obliques, le
          minimum pour que le volume se lise. */}
      {!socle
        ? [0.06, 0.13].map((part, rang) => {
            const x = AXE - demi + 2 * demi * part
            return (
              <Trait
                key={`h${part}`}
                d={`M ${x} ${bas - 5} L ${x - 4} ${haut + 8}`}
                duree={0.3}
                retard={retard + 0.22 + rang * 0.04}
                largeur={0.6}
                opacite={0.13}
              />
            )
          })
        : null}
    </g>
  )
}

/**
 * Cadence de construction.
 *
 * Neuf niveaux à 0,2 s d'intervalle, plus le temps de tracé du toit et la pose
 * de l'écusson : la scène est achevée un peu avant la troisième seconde. C'est
 * la contrainte de l'écran d'adresse — elle doit être finie quand le regard
 * revient sur le champ de saisie, et une ouverture qui dure plus de quatre
 * secondes retarde l'utilisateur au lieu de l'accueillir.
 */
const PAS_S = 0.2
const RETARD_INITIAL_S = 0.25
const RETARD_ECUSSON_S = RETARD_INITIAL_S + BANDES.length * PAS_S + 0.25

export function TourEncre({ className = '', titre }) {
  return (
    /* La `viewBox` est cadrée au plus juste sur le dessin — de l'écusson
       (y = 76) à la ligne de sol (y = 602) —, à quelques unités près de part et
       d'autre. C'est ce qui permet de poser le dessin centré sur un titre sans
       avoir à le décaler : le centre de la boîte *est* le centre de l'immeuble.
       Cadrée sur l'origine, elle laissait soixante unités de vide au-dessus de
       l'écusson, et le dessin tombait d'autant sous sa cible. */
    <svg
      viewBox={VUE}
      className={className}
      role="img"
      aria-label={titre ?? 'Dessin à l’encre d’un immeuble en cours de construction'}
      // Centré dans son cadre, et non plus calé en bas : le dessin est
      // désormais posé en fond d'écran, centré sur le titre, et c'est sa masse
      // qui doit l'être — un ancrage bas le ferait glisser vers le pied de la
      // page dès que le cadre change de proportions.
      preserveAspectRatio="xMidYMid meet"
    >
      {/* La ligne d'horizon, posée avant tout le reste : c'est le sol d'où le
          bâtiment sort. Volontairement pas droite, et prolongée bien au-delà de
          sa largeur — un sol qui s'arrête aux murs n'est pas un sol. */}
      <Trait
        d={`M 10 ${SOL + 6} C 104 ${SOL + 4}, 224 ${SOL + 9}, 350 ${SOL + 5}`}
        duree={0.9}
        retard={0.1}
        largeur={1.3}
        opacite={0.4}
      />

      {BANDES.map((bande, index) => (
        <Bande
          key={bande.bas}
          bande={bande}
          index={index}
          demiPrecedent={index === 0 ? bande.demi : BANDES[index - 1].demi}
          retard={RETARD_INITIAL_S + index * PAS_S}
        />
      ))}

      {/* L'écusson au-dessus du toit — le bâtiment devient l'Immeuble Barnes.
          L'échelle est portée par l'image, l'animation par le groupe :
          `pose-encre` écrit elle-même un `transform`, et les deux s'écraseraient
          sur un même nœud. */}
      <g className="pose-encre" style={{ '--retard': `${RETARD_ECUSSON_S}s`, '--duree': '0.8s' }}>
        <image href={LOGO_BARNES_SRC} x={AXE - 31} y="76" width="62" height="62" />
      </g>
    </svg>
  )
}
