import { Trait } from './encre'
import { LOGO_BARNES_SRC } from '../ui/LogoBarnes'

/**
 * La Tour Barnes — le grand dessin à l'encre du parcours.
 *
 * Un immeuble à retraits successifs, tracé au pinceau, qui sort du sol et se
 * coiffe de l'écusson rouge une fois debout. Il tient la moitié droite de
 * l'écran d'adresse et accompagne le formulaire de caractéristiques, où il
 * monte à mesure que l'agent répond.
 *
 * ── Deux régimes, un seul dessin ──────────────────────────────────────────
 *
 * `progression` décide duquel :
 *
 *  - **`null` — la tour se construit seule.** Les tranches se tracent l'une
 *    après l'autre, du sol vers le ciel, et l'écusson se pose au sommet. Trois
 *    secondes et demie en tout, écusson compris : c'est le temps que met un
 *    utilisateur à lire un titre et à commencer à taper une adresse, et la
 *    scène doit être finie quand son regard revient.
 *
 *  - **`0` à `1` — la tour suit le formulaire.** Le nombre de tranches
 *    dessinées est proportionnel à l'avancement, et l'écusson n'apparaît qu'à
 *    la dernière. Chaque tranche s'ajoute avec son propre tracé, si bien que
 *    remplir un champ *dessine* un étage de plus plutôt que d'en révéler un
 *    déjà là.
 *
 * ── Pourquoi des tranches, et pas un seul tracé ───────────────────────────
 *
 * Le dessin est découpé en une quinzaine de bandes horizontales, du socle à la
 * flèche. C'est ce découpage qui permet aux deux régimes de partager le même
 * dessin : l'un joue toutes les tranches sur une minuterie CSS, l'autre n'en
 * monte qu'un préfixe. Sans lui, il faudrait deux illustrations à tenir en
 * phase — et elles divergeraient à la première retouche.
 *
 * Il donne aussi le geste juste. Un bâtiment se construit par le bas : chaque
 * tranche part de son propre plancher et monte, et les délais suivent le même
 * ordre. Inverser les délais ferait descendre la tour dans le sol.
 *
 * ── Le trait ──────────────────────────────────────────────────────────────
 *
 * Le pinceau est celui de tout le parcours (voir `encre.jsx`). Rien n'est
 * parfaitement droit ici, et c'est l'essentiel du rendu « à la main » :
 * les verticales dérivent d'un demi-point, les planchers ne sont jamais tout à
 * fait horizontaux, les épaisseurs varient d'une tranche à l'autre. Une tour
 * tracée à la règle aurait l'air d'un schéma technique.
 *
 * Le mode « moins d'animations » est couvert sans condition : le filet global
 * d'`index.css` ramène toute durée à 0,001 ms en gardant `forwards`, et la tour
 * s'affiche d'emblée terminée.
 */

/**
 * Le corps de la tour, tranche par tranche, du sol vers le ciel.
 *
 * Chaque entrée porte la demi-largeur du bâtiment à son pied et à son sommet,
 * la hauteur de la bande, et de quoi la détailler. Les retraits (`etage` qui
 * rétrécit) donnent la silhouette à degrés des tours des années trente —
 * choisie parce qu'elle se lit comme un immeuble de prestige à toutes les
 * échelles, là où un parallélépipède vitré aurait l'air d'un bloc de bureaux.
 *
 * Les cotes sont en unités de la `viewBox` (360 × 620), l'axe du bâtiment est
 * à x = 180, et le sol à y = 596.
 *
 * La `viewBox` est large au regard du bâtiment, et volontairement : c'est elle
 * qui fixe la taille à laquelle la tour se dessine dans sa colonne. Cadrée au
 * plus juste, une tour haute et fine se retrouve réduite par sa hauteur et
 * n'occupe plus qu'un sixième de la largeur disponible ; ces trois cent
 * soixante unités lui rendent l'ampleur qu'on lui demande.
 */
const AXE = 180
const SOL = 596

/**
 * Bandes du bâtiment. `bas` et `haut` sont des ordonnées, `demi` la demi-
 * largeur au sommet de la bande — le pied reprend la largeur de la bande
 * précédente, ce qui dessine les retraits sans avoir à les décrire deux fois.
 */
const BANDES = [
  { bas: SOL, haut: 558, demi: 124, socle: true },
  { bas: 558, haut: 512, demi: 112, fenetres: 6 },
  { bas: 512, haut: 466, demi: 112, fenetres: 6 },
  { bas: 466, haut: 420, demi: 112, fenetres: 6 },
  { bas: 420, haut: 376, demi: 94, fenetres: 5 },
  { bas: 376, haut: 332, demi: 94, fenetres: 5 },
  { bas: 332, haut: 288, demi: 94, fenetres: 5 },
  { bas: 288, haut: 246, demi: 74, fenetres: 4 },
  { bas: 246, haut: 204, demi: 74, fenetres: 4 },
  { bas: 204, haut: 166, demi: 54, fenetres: 3 },
  { bas: 166, haut: 128, demi: 54, fenetres: 3 },
  { bas: 128, haut: 96, demi: 34, fenetres: 2 },
  { bas: 96, haut: 70, demi: 34 },
  { bas: 70, haut: 46, demi: 14, couronne: true },
]

/** Décalage de main : quelques dixièmes d'unité, jamais les mêmes. */
const tremble = (index, amplitude = 0.7) =>
  ((Math.sin(index * 12.9898) * 43758.5453) % 1) * amplitude

/**
 * Une bande du bâtiment : ses deux montants, son plancher, et son détail.
 *
 * Le plancher est tracé en premier, les montants ensuite : c'est l'ordre dans
 * lequel on le dessinerait — on pose l'assise, puis on monte les murs.
 */
function Bande({ bande, index, demiPrecedent, retard, actif }) {
  const { bas, haut, demi, fenetres = 0, socle = false, couronne = false } = bande
  const pied = demiPrecedent ?? demi
  const d = tremble(index)
  const duree = 0.42

  // Le pied de la bande reprend la largeur de celle du dessous : c'est cette
  // différence qui dessine le ressaut. Le sommet, lui, est à la largeur propre
  // de la bande — sauf sur la couronne, seule à s'effiler.
  const gauchePied = AXE - pied + d
  const droitePied = AXE + pied - d
  const gaucheHaut = AXE - (couronne ? demi : demi) - d * 0.5
  const droiteHaut = AXE + (couronne ? demi : demi) + d * 0.5
  // Les montants sont verticaux, et c'est ce qui fait la silhouette : un
  // gratte-ciel à degrés monte droit et se retire d'un coup, il ne s'effile
  // pas. Tracés obliques d'une largeur à l'autre, les quatorze bandes
  // accumulaient leurs pentes et la tour prenait l'allure d'un cône.
  const gaucheMontant = couronne ? gaucheHaut : AXE - demi - d * 0.4
  const droiteMontant = couronne ? droiteHaut : AXE + demi + d * 0.4

  return (
    <g>
      {/* Le plancher, tracé sur toute la largeur du niveau inférieur : c'est
          lui qui forme la corniche du ressaut quand la bande se rétrécit.
          Jamais tout à fait horizontal — deux dixièmes d'unité de dérive
          suffisent à lui ôter l'air d'un trait de règle. */}
      <Trait
        d={`M ${gauchePied} ${bas} L ${droitePied} ${bas + d * 0.4 - 0.2}`}
        duree={duree * 0.7}
        retard={retard}
        largeur={socle || pied !== demi ? 2.4 : 1.35}
        opacite={socle || pied !== demi ? 1 : 0.78}
      />

      <Trait
        d={`M ${AXE - demi - d * 0.4} ${bas} L ${gaucheMontant} ${haut}`}
        duree={duree}
        retard={retard + 0.06}
        largeur={socle ? 2.6 : 2.2}
      />
      <Trait
        d={`M ${AXE + demi + d * 0.4} ${bas} L ${droiteMontant} ${haut}`}
        duree={duree}
        retard={retard + 0.1}
        largeur={socle ? 2.6 : 2.2}
      />

      {/* Les meneaux verticaux — le détail qui fait lire « immeuble » plutôt
          que « prisme ». Ils s'arrêtent avant le plancher supérieur, comme un
          trait de pinceau qu'on relève. */}
      {Array.from({ length: fenetres }, (_, rang) => {
        const part = (rang + 1) / (fenetres + 1)
        const xBas = AXE - demi + 2 * demi * part
        const xHaut = gaucheMontant + (droiteMontant - gaucheMontant) * part
        return (
          <Trait
            key={rang}
            d={`M ${xBas} ${bas - 3} L ${xHaut} ${haut + 5}`}
            duree={0.3}
            retard={retard + 0.16 + rang * 0.05}
            largeur={0.85}
            opacite={0.45}
          />
        )
      })}

      {/* La flèche, une fois la couronne posée : c'est elle qui portera
          l'écusson. */}
      {couronne ? (
        <Trait
          d={`M ${AXE} ${haut} L ${AXE + d * 0.3} ${haut - 22}`}
          duree={0.35}
          retard={retard + 0.24}
          largeur={1.6}
        />
      ) : null}

      {/* Les marches du socle, hachurées : elles ancrent le bâtiment au sol au
          lieu de le laisser posé dessus. */}
      {socle
        ? [0.35, 0.5, 0.65].map((part, rang) => (
            <Trait
              key={part}
              d={`M ${AXE - pied * part} ${SOL + 6} L ${AXE + pied * part} ${SOL + 6 - rang * 3}`}
              duree={0.26}
              retard={retard + 0.3 + rang * 0.06}
              largeur={1}
              opacite={0.4}
            />
          ))
        : null}

      {/* Ombre portée sur la face gauche — quelques hachures obliques, le
          minimum pour que le volume se lise. Elles n'apparaissent que sur les
          bandes larges, où il y a de la place pour elles. */}
      {actif && demi >= 72
        ? [0.2, 0.34, 0.48].map((part, rang) => {
            const x = AXE - demi + 2 * demi * part
            return (
              <Trait
                key={`h${part}`}
                d={`M ${x} ${bas - 6} L ${x - 6} ${haut + 10}`}
                duree={0.3}
                retard={retard + 0.2 + rang * 0.04}
                largeur={0.6}
                opacite={0.14}
              />
            )
          })
        : null}
    </g>
  )
}

/**
 * Cadence de construction en régime autonome.
 *
 * Quatorze bandes à 0,18 s d'intervalle, plus le temps de tracé de la dernière
 * et la pose de l'écusson : la scène est achevée un peu avant la quatrième
 * seconde. C'est la contrainte de l'écran d'adresse — elle doit être finie
 * quand le regard revient sur le champ de saisie, et une ouverture qui dure
 * plus de quatre secondes se met à retarder l'utilisateur au lieu de
 * l'accueillir.
 */
const PAS_S = 0.18
const RETARD_INITIAL_S = 0.25

export function TourEncre({ progression = null, className = '', titre }) {
  const autonome = progression === null

  // Nombre de bandes réellement dessinées. En régime autonome, toutes — les
  // délais suffisent à les échelonner. En régime piloté, le préfixe qui
  // correspond à l'avancement, et jamais moins d'une : une tour à zéro bande
  // n'est pas une tour qui n'a pas commencé, c'est un écran vide.
  const bandes = autonome
    ? BANDES.length
    : Math.max(1, Math.round(Math.min(Math.max(progression, 0), 1) * BANDES.length))

  const achevee = bandes === BANDES.length
  // L'écusson se pose après la dernière bande. En régime piloté il arrive au
  // moment où elle est dessinée, sans attendre : l'agent vient de finir son
  // formulaire, la récompense ne doit pas se faire désirer.
  const retardEcusson = autonome ? RETARD_INITIAL_S + BANDES.length * PAS_S + 0.15 : 0.25

  return (
    <svg
      viewBox="0 0 360 620"
      className={className}
      role="img"
      aria-label={titre ?? 'Dessin à l’encre d’une tour Barnes en cours de construction'}
      preserveAspectRatio="xMidYMax meet"
    >
      {/* La ligne d'horizon, posée avant tout le reste : c'est le sol d'où la
          tour sort. Volontairement pas droite, et prolongée bien au-delà de la
          largeur du bâtiment — un sol qui s'arrête aux murs n'est pas un sol. */}
      <Trait
        d={`M 6 ${SOL + 6} C 100 ${SOL + 4}, 220 ${SOL + 9}, 354 ${SOL + 5}`}
        duree={0.9}
        retard={0.1}
        largeur={1.3}
        opacite={0.4}
      />

      {BANDES.slice(0, bandes).map((bande, index) => (
        <Bande
          key={bande.bas}
          bande={bande}
          index={index}
          demiPrecedent={index === 0 ? bande.demi : BANDES[index - 1].demi}
          // En régime piloté, chaque bande naît à son tour : elle est montée au
          // moment où l'avancement l'atteint, et son tracé part aussitôt. Le
          // retard n'a donc à échelonner que le régime autonome.
          retard={autonome ? RETARD_INITIAL_S + index * PAS_S : 0}
          actif={autonome}
        />
      ))}

      {/* L'écusson au sommet — la tour devient la Tour Barnes.
          L'échelle est portée par l'image, l'animation par le groupe :
          `pose-encre` écrit elle-même un `transform`, et les deux
          s'écraseraient sur un même nœud. */}
      {achevee ? (
        <g className="pose-encre" style={{ '--retard': `${retardEcusson}s`, '--duree': '0.8s' }}>
          <image href={LOGO_BARNES_SRC} x={AXE - 30} y="0" width="60" height="60" />
        </g>
      ) : null}
    </svg>
  )
}
