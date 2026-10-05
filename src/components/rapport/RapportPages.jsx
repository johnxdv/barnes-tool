import { Suspense, lazy } from 'react'
import { Minus, Plus, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react'
import { ChampModifiable, OutilLigne, useEdition } from './Edition'
import { LogoBarnes } from '../ui/LogoBarnes'
import {
  BlocIndisponible,
  CelluleModifiable,
  EnteteTableau,
  ListeChamps,
  PageRapport,
  Section,
  Statistique,
} from './RapportPage'
import { Barres, Courbe, Repartition } from './RapportCharts'
import { AngleBarnes, MotifCouverture } from './Motifs'

/**
 * Les pages de l'avis de valeur.
 *
 * Chacune reçoit sa part du modèle d'affichage (`rapportModele.js`) et ne fait
 * que la disposer : aucun calcul, aucun formatage, aucune décision sur ce qui
 * mérite d'être montré — tout cela a été tranché en amont. Ce qui se décide
 * ici, et rien d'autre, c'est la mise en page.
 *
 * Une règle traverse le fichier : **une page manquante n'existe pas**. Quand
 * une source n'a rien rendu, la page s'affiche quand même avec un bloc qui dit
 * pourquoi — et ce texte-là est modifiable comme le reste, l'agent complétant
 * à la main ce que les bases n'ont pas su fournir. Un rapport dont la
 * pagination change selon la commune n'est pas un document, c'est une sortie
 * de programme.
 *
 * Une seule page y échappe, `PagePhotos`, et l'exception dit la règle : les
 * autres pages attendent d'une source qu'elle réponde, celle-là attend de
 * l'agent qu'il ait photographié le bien. Une page « marché » vide indique un
 * travail à faire ; une page de photographies vide ne serait qu'une feuille
 * blanche dans un document remis au vendeur. Elle est donc omise, et c'est
 * `RapportView` qui en décide — voir la sélection des pages à l'export.
 */

/**
 * La carte des commodités est chargée à part.
 *
 * Elle est le seul morceau du rapport à dépendre de Leaflet, et l'importer
 * directement ferait entrer la librairie dans le paquet principal — soit une
 * centaine de kilooctets à télécharger avant même l'écran d'adresse, pour une
 * page que le parcours n'atteint qu'à la fin. Le repérage du bâtiment suit déjà
 * cette règle (`EstimationBuildingStep`), et les deux se partagent alors le
 * même morceau : la librairie est en cache bien avant que le rapport s'ouvre —
 * le parcours passe par la carte de repérage, et `App` l'amorce dès la saisie
 * de l'adresse.
 */
const CarteCommodites = lazy(() =>
  import('./CarteCommodites').then((module) => ({ default: module.CarteCommodites })),
)

/** Flèche d'évolution — jamais seule, toujours accolée au pourcentage. */
function Tendance({ sens, className = 'h-3.5 w-3.5' }) {
  if (sens !== 'hausse' && sens !== 'baisse') return null
  const Icone = sens === 'hausse' ? TrendingUp : TrendingDown

  return (
    <Icone
      className={`${className} ${sens === 'hausse' ? 'text-bottle' : 'text-corail'}`}
      strokeWidth={2}
      aria-hidden="true"
    />
  )
}

// --- 1. Couverture ---------------------------------------------------------

/**
 * La couverture — la seule page du document qu'on regarde avant de la lire.
 *
 * Elle ne portait qu'un mot, une adresse, une date et beaucoup de blanc. Le
 * texte était juste ; la page ne ressemblait à rien qu'une agence remette à un
 * vendeur. Ce qui a changé tient en trois choses, et aucune n'ajoute une seule
 * information :
 *
 *  - **Une composition graphique** (voir `MotifCouverture`) : arcs concentriques
 *    coupés par le bord de la feuille, trame oblique dans l'angle, bandeau plein
 *    en pied. Elle donne à la page une diagonale et un cadre.
 *  - **Un bloc de titre posé sur un aplat**, plutôt que flottant : l'adresse est
 *    le sujet du document, elle doit avoir un support.
 *  - **L'écusson en grand**, une fois, et à sa place — sous la marque, au-dessus
 *    du titre. Les dix autres pages le portent en vignette dans l'angle ; ici
 *    il ouvre le document.
 *
 * Tous les champs restent modifiables comme avant : le décor est autour, jamais
 * dessous.
 */
export function PageCouverture({ couverture }) {
  return (
    <PageRapport couverture>
      <MotifCouverture />

      {/* `relative` : le contenu repasse au-dessus de la composition, qui est
          posée en absolu sur toute la feuille. Sans cela, la trame de l'angle
          supérieur droit recouvrirait la signature. */}
      <div className="relative flex flex-1 flex-col justify-between py-4">
        <div>
          {/* La signature. `tracking-embleme` (3 px) est la plus forte des trois
              valeurs d'interlettrage relevées sur le site, et elle n'est
              employée qu'ici : le mot « Barnes » posé seul, en tête de
              document. */}
          <p className="font-mono text-[0.62rem] uppercase tracking-embleme text-barnes">Barnes</p>
          <span aria-hidden="true" className="mt-5 block h-[2px] w-16 rounded-full bg-barnes" />

          {/* L'écusson en grand, sous la signature — le seul endroit du rapport
              où il dépasse la vignette d'angle. Il est masqué à cet endroit sur
              les autres pages par le rembourrage de la couverture (`pr-16`),
              qui écarte le titre de la vignette posée par `PageRapport`. */}
          <LogoBarnes className="mt-7 h-20 w-20" alt="" />
        </div>

        <div>
          {/* Le bloc de titre, posé sur un aplat très clair bordé à gauche d'un
              trait rouge plein : c'est ce trait qui ancre l'adresse dans la
              page, là où elle flottait au milieu du blanc. */}
          <div className="relative border-l-[3px] border-barnes bg-barnes/[0.045] py-5 pl-6 pr-4">
            <AngleBarnes className="right-2 top-2 rotate-90" />

            <ChampModifiable
              cle="couverture.mention"
              valeur="Avis de valeur"
              as="p"
              className="font-mono text-[0.62rem] uppercase tracking-micro text-barnes"
            />
            <ChampModifiable
              cle="couverture.adresse"
              valeur={couverture.adresse}
              as="h1"
              multiligne
              className="mt-4 block font-display text-[2.4rem] font-semibold leading-[1.08] text-marine"
            />
            {couverture.ville ? (
              <ChampModifiable
                cle="couverture.ville"
                valeur={couverture.ville}
                as="p"
                className="mt-2.5 block font-display text-[1.15rem] font-normal text-marine/55"
              />
            ) : null}
          </div>

          <ChampModifiable
            cle="couverture.chapeau"
            valeur="Estimation établie à partir des ventes réalisées dans le secteur, des caractéristiques déclarées du bien et des données publiques du marché immobilier."
            as="p"
            multiligne
            className="mt-7 block max-w-md pl-6 text-[0.85rem] leading-relaxed text-marine/60"
          />
        </div>

        <div className="flex items-end justify-between gap-6">
          <div className="border-l-[3px] border-barnes/40 pl-4">
            <p className="font-mono text-[0.55rem] uppercase tracking-micro text-marine/40">
              Établi le
            </p>
            <ChampModifiable
              cle="couverture.date"
              valeur={couverture.date}
              as="p"
              className="mt-1.5 block font-display text-[1rem] font-semibold text-marine"
            />
          </div>
          <p className="max-w-[16rem] text-right text-[0.62rem] leading-relaxed text-marine/40">
            Document non contractuel. Le montant indiqué est une estimation, il ne constitue
            ni une expertise judiciaire ni un engagement de prix.
          </p>
        </div>
      </div>
    </PageRapport>
  )
}

// --- 2. Localisation -------------------------------------------------------

export function PageLocalisation({ localisation, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Situation" titre="Localisation du bien">
      {/* Les proportions des deux vues sont choisies pour que la page tienne en
          une feuille A4 une fois les références cadastrales ajoutées : à
          210 mm de large et 14 mm de marge, chaque dixième de rapport de forme
          coûte une quarantaine de points de hauteur. */}
      {localisation.image ? (
        <img
          src={localisation.image}
          alt="Vue aérienne du bien"
          width={1120}
          height={560}
          loading="eager"
          className="w-full rounded-lg border border-marine/10 object-cover"
          style={{ aspectRatio: '1120 / 560' }}
        />
      ) : (
        <BlocIndisponible
          cle="loc.absente"
          message="Aucune vue aérienne disponible pour ce point — l’orthophotographie de l’IGN s’arrête aux frontières françaises."
        />
      )}

      <Section titre="Vue élargie" className="mt-5">
        {localisation.large ? (
          <img
            src={localisation.large}
            alt="Vue aérienne élargie du quartier"
            width={1120}
            height={360}
            loading="lazy"
            className="w-full rounded-lg border border-marine/10 object-cover"
            style={{ aspectRatio: '1120 / 360' }}
          />
        ) : null}
      </Section>

      <Section titre="Références cadastrales" className="mt-5">
        <ListeChamps champs={localisation.lignes} colonnes={2} />
      </Section>

      <p className="mt-4 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
        Vues aériennes © IGN — Géoplateforme
      </p>
    </PageRapport>
  )
}

// --- 3. Description du bien ------------------------------------------------

/**
 * Densités du bloc « points forts / points de réserve ».
 *
 * ── Le problème ───────────────────────────────────────────────────────────
 *
 * Ces deux listes sont les seules du rapport dont la longueur ne soit bornée
 * par rien. Le moteur en suggère jusqu'à dix d'un côté et cinq de l'autre (voir
 * `api/_lib/points.js`), l'agent en ajoute autant qu'il veut, et chaque ligne
 * dans sa forme ample coûte douze millimètres de feuille. Douze points forts
 * faisaient donc cent quarante millimètres là où la page en a une centaine à
 * donner : le bloc débordait sous le bord de la feuille, et ce qui dépassait ne
 * s'imprimait nulle part.
 *
 * ── Ce qui le résout ──────────────────────────────────────────────────────
 *
 * Trois formes, et ce n'est pas le goût qui choisit mais la place disponible
 * (voir `BUDGET_MM`) :
 *
 *  - **Ample** — la forme d'origine, une carte par point, commentaire complet
 *    sur deux ou trois lignes. Elle tient jusqu'à deux points.
 *  - **Moyenne** — la carte perd son fond, les corps descendent d'un point, et
 *    surtout le commentaire est **coupé à une ligne** : c'est son repli, et lui
 *    seul, qui coûtait les deux tiers de la hauteur. Jusqu'à cinq points.
 *  - **Compacte** — intitulé et commentaire sur la **même** ligne, le
 *    commentaire tronqué proprement par la mise en page. Dix points tiennent
 *    alors dans la hauteur que deux occupaient.
 *
 * Le commentaire tronqué reste entier dans le champ : c'est son affichage qui
 * est borné, jamais son contenu, et l'agent qui l'ouvre pour le corriger voit
 * ce qu'il a écrit.
 */
const DENSITES = [
  {
    nom: 'ample',
    // Hauteur d'une ligne, en millimètres de feuille, commentaire compris.
    // Ces trois valeurs ne sont pas des estimations : elles ont été relevées
    // sur la page composée au format A4, dans une colonne de 85 mm — la
    // largeur réelle du bloc. C'est important, parce que l'essentiel de la
    // hauteur d'une ligne ample tient au *repli* du commentaire : « Un espace
    // extérieur privatif, premier critère de recherche depuis 2020 » occupe
    // trois lignes à cette largeur, pas une.
    ligneMm: 22.5,
    liste: 'space-y-2',
    ligne: 'items-start gap-2.5 rounded-lg border px-3 py-2.5',
    fond: true,
    puce: 'mt-[0.45rem]',
    titre: 'text-[0.9rem]',
    detail: 'mt-0.5 text-[0.74rem] leading-snug',
    enLigne: false,
  },
  {
    nom: 'moyenne',
    ligneMm: 9,
    liste: 'space-y-[0.1rem]',
    ligne: 'items-start gap-2 border-l-2 py-[0.15rem] pl-2.5',
    fond: false,
    puce: 'mt-[0.4rem]',
    titre: 'text-[0.78rem] leading-[1.3]',
    // Le commentaire tient sur une ligne, coupé net s'il est plus long. C'est
    // ce qui sépare cette forme de l'ample : le repli du commentaire est ce qui
    // coûte, pas le commentaire.
    detail: 'truncate text-[0.64rem] leading-[1.3]',
    enLigne: false,
  },
  {
    nom: 'compacte',
    ligneMm: 4.4,
    liste: 'space-y-0',
    ligne: 'items-baseline gap-2 border-l-2 py-0 pl-2.5',
    fond: false,
    puce: 'mt-[0.28rem]',
    titre: 'text-[0.72rem] leading-[1.25]',
    detail: 'text-[0.62rem] leading-[1.25]',
    enLigne: true,
  },
]

/**
 * Ce que la feuille donne à la liste, en millimètres.
 *
 * Ce n'est pas un réglage d'esthétique : c'est un reste, et un reste étroit. La
 * page de description porte 229 mm utiles entre son en-tête et son pied ; le
 * tableau « Le logement / Le bâti » en prend 106, le bloc « Environnement » 51,
 * la mention de source et les intervalles une vingtaine, le titre de section du
 * bloc lui-même neuf. Restent quarante-cinq millimètres pour les lignes
 * elles-mêmes, et c'est tout.
 *
 * Rapporté aux hauteurs ci-dessus, cela dit exactement ce que la page peut
 * porter : **deux** points forts dans leur forme ample, **cinq** dans la
 * moyenne, **dix** dans la compacte. C'est peu, et ce n'est pas un choix de
 * mise en page — c'est ce qu'une feuille A4 contient une fois le reste servi.
 * La forme d'origine, seule, tenait jusqu'à deux lignes ; à partir de la
 * troisième elle débordait, ce qui est précisément le défaut corrigé ici.
 *
 * Le chiffre est à revoir dès qu'un bloc de cette page change de taille — et la
 * façon de le vérifier est celle du projet : composer la page au format A4 dans
 * le navigateur et lire sa hauteur, qui doit valoir 297 mm.
 */
const BUDGET_MM = 45

/**
 * La forme qui convient à la plus longue des deux colonnes : la plus ample de
 * celles qui tiennent dans le budget, et la plus serrée à défaut.
 *
 * La décision est prise **une fois pour les deux colonnes**, sur la plus
 * longue : deux listes côte à côte dans deux corps différents se liraient comme
 * un défaut d'impression.
 */
const densitePour = (lignes) =>
  DENSITES.find((densite) => lignes * densite.ligneMm <= BUDGET_MM) ?? DENSITES[DENSITES.length - 1]

/**
 * Au-delà, la colonne ne tient plus, même à la densité la plus serrée.
 *
 * Les lignes suivantes ne sont pas rognées en silence — c'est le défaut qu'on
 * corrige, pas une façon de le corriger : elles restent à l'écran, barrées
 * comme une ligne retirée à la main, et un avertissement dit exactement combien
 * ne s'imprimeront pas. À l'agent de choisir lesquelles garder ; le rapport ne
 * tranche pas à sa place, il l'avertit.
 */
const MAX_LIGNES_IMPRIMEES = Math.floor(BUDGET_MM / DENSITES[DENSITES.length - 1].ligneMm)

/**
 * Liste de points forts ou de réserves : titre et commentaire modifiables,
 * ligne masquable, et de quoi en ajouter.
 *
 * C'est la partie du rapport la plus susceptible d'être récrite — le moteur
 * déduit ces lignes d'un formulaire, l'agent a vu le bien. Elles arrivent donc
 * en suggestion et non en conclusion : chacune se corrige, se retire, et rien
 * n'interdit d'en écrire d'autres.
 */
function ListePoints({ lignes, cleListe, accent, densite }) {
  const { masques, basculerMasque, ajouter } = useEdition()
  // Rang de chaque ligne parmi celles qui partiront réellement à l'impression.
  // Une ligne retirée à la main ne consomme pas de place sur la feuille, et ne
  // doit donc pas pousser une autre au-delà du plafond.
  let rangImprime = -1
  const imprimees = lignes.filter((point) => masques[point.cle] !== true).length
  const surplus = Math.max(imprimees - MAX_LIGNES_IMPRIMEES, 0)
  // Les classes de couleur sont écrites en toutes lettres : Tailwind compose sa
  // feuille en lisant les sources, et une classe fabriquée à l'exécution
  // (`text-${'{'}teinte{'}'}`) n'y figurerait jamais.
  const titreCouleur = accent === 'corail' ? 'text-corail' : 'text-marine'

  return (
    <div>
      <ul className={densite.liste}>
        {lignes.map((point) => {
          const masque = masques[point.cle] === true
          if (!masque) rangImprime += 1
          // Une ligne au-delà de la capacité de la feuille : elle reste ici,
          // signalée, et ne part pas à l'impression.
          const horsFeuille = !masque && rangImprime >= MAX_LIGNES_IMPRIMEES

          return (
            <li
              key={point.cle}
              className={[
                'flex',
                densite.ligne,
                accent === 'corail'
                  ? `border-corail/20 ${densite.fond ? 'bg-corail/[0.04]' : ''}`
                  : `border-marine/12 ${densite.fond ? 'bg-marine/[0.025]' : ''}`,
                // Une ligne hors feuille porte la même marque qu'une ligne
                // retirée à la main : barrée et pâlie à l'écran, absente du
                // papier. C'est la seule façon de la signaler qui dise aussi ce
                // qu'il va lui arriver.
                masque || horsFeuille ? 'rapport-masque' : '',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className={`${densite.puce} h-1.5 w-1.5 shrink-0 rounded-full ${
                  accent === 'corail' ? 'bg-corail' : 'bg-marine/60'
                }`}
              />
              {/* En forme compacte, intitulé et commentaire partagent la même
                  ligne : c'est ce qui divise la hauteur du bloc par trois.
                  `min-w-0` + `truncate` sur le commentaire évitent qu'un
                  commentaire long ne repousse la ligne — il est coupé à
                  l'affichage, jamais dans le champ. */}
              <div
                className={densite.enLigne ? 'flex min-w-0 flex-1 items-baseline gap-2' : 'min-w-0 flex-1'}
              >
                <ChampModifiable
                  cle={`${point.cle}.titre`}
                  valeur={point.titre}
                  as="p"
                  placeholder="Intitulé"
                  className={`${densite.enLigne ? 'shrink-0' : 'block'} font-display ${densite.titre} font-semibold ${titreCouleur}`}
                />
                <ChampModifiable
                  cle={`${point.cle}.detail`}
                  valeur={point.detail}
                  as="p"
                  multiligne
                  placeholder="Commentaire"
                  className={`${densite.enLigne ? 'min-w-0 flex-1 truncate' : 'block'} ${densite.detail} text-marine/55`}
                />
              </div>
              <OutilLigne
                onClick={() => basculerMasque(point.cle)}
                titre={masque ? 'Rétablir cette ligne' : 'Retirer cette ligne du rapport'}
              >
                {masque ? <RotateCcw className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
              </OutilLigne>
            </li>
          )
        })}
      </ul>

      {lignes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-marine/20 px-3 py-4 text-[0.74rem] text-marine/40">
          Aucune suggestion — les caractéristiques renseignées n’en produisent pas.
        </p>
      ) : null}

      {/* L'avertissement de débordement. Marqué `data-outil` : il s'adresse à
          l'agent pendant la relecture, et n'a rien à faire sur le document
          remis au vendeur. */}
      {surplus > 0 ? (
        <p
          data-outil="true"
          className="mt-1.5 rounded-md border border-corail/30 bg-corail/[0.06] px-2.5 py-1.5 text-[0.66rem] leading-snug text-corail"
        >
          {surplus > 1
            ? `${surplus} lignes au-delà de ce que la feuille peut porter : elles ne seront pas imprimées.`
            : 'Une ligne au-delà de ce que la feuille peut porter : elle ne sera pas imprimée.'}{' '}
          Retirez-en {surplus > 1 ? 'd’autres' : 'une'} pour choisir {surplus > 1 ? 'lesquelles' : 'laquelle'}{' '}
          garder.
        </p>
      ) : null}

      <button
        type="button"
        data-outil="true"
        onClick={() => ajouter(cleListe)}
        className="mt-2 inline-flex items-center gap-1.5 font-mono text-[0.58rem] uppercase tracking-micro text-marine/40 transition-colors hover:text-corail"
      >
        <Plus className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        Ajouter
      </button>
    </div>
  )
}

/**
 * Les deux colonnes de points, et la densité qu'elles partagent.
 *
 * Le montage des lignes — suggestions du moteur, puis ajouts de l'agent — est
 * fait ici plutôt que dans chaque colonne : c'est ce qui permet de compter les
 * deux avant d'en choisir la forme (voir `DENSITES`).
 */
function Points({ forts, reserves }) {
  const { ajouts, masques } = useEdition()

  const monter = (liste, cleListe) => [
    ...liste.map((point) => ({ ...point })),
    ...Array.from({ length: ajouts[cleListe] ?? 0 }, (_, index) => ({
      cle: `${cleListe}.ajout.${index}`,
      titre: '',
      detail: '',
    })),
  ]

  const lignesForts = monter(forts, 'points.forts')
  const lignesReserves = monter(reserves, 'points.reserves')

  // Le compte qui décide de la forme est celui des lignes **imprimées** : une
  // ligne que l'agent retire ne pèse plus sur la feuille, et rend sa place aux
  // autres. Retirer trois points forts d'une liste de dix la fait donc repasser
  // d'elle-même à une forme plus lisible, ce qui est le geste attendu.
  const aImprimer = (liste) => liste.filter((point) => masques[point.cle] !== true).length
  const densite = densitePour(Math.max(aImprimer(lignesForts), aImprimer(lignesReserves)))

  return (
    <div className="mt-5 grid gap-x-8 gap-y-6 sm:grid-cols-2">
      <Section titre="Points forts">
        <ListePoints lignes={lignesForts} cleListe="points.forts" densite={densite} />
      </Section>
      <Section titre="Points de réserve">
        <ListePoints
          lignes={lignesReserves}
          cleListe="points.reserves"
          accent="corail"
          densite={densite}
        />
      </Section>
    </div>
  )
}

export function PageDescription({ description, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Le bien" titre="Description et caractéristiques">
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <Section titre="Le logement">
          <ListeChamps champs={description.bien} />
        </Section>
        <Section titre="Le bâti">
          <ListeChamps champs={description.bati} />
        </Section>
      </div>

      {/* Le cadre, entre ce que le bien est et ce qu'on en pense.

          Trois colonnes plutôt que deux : neuf lignes courtes rangées deux par
          deux pousseraient les points forts hors de la feuille, et aucune de
          ces valeurs n'est assez longue pour réclamer une demi-largeur.

          Le fond légèrement teinté distingue ce bloc de ses voisins, et il le
          faut : c'est le seul de la page dont les valeurs ne viennent pas
          toutes de la même main — trois sont déclarées par l'agent, six sont
          relevées (voir `environnement` dans `rapportModele.js`). */}
      <Section titre="Environnement du bien" className="mt-5">
        {/* Neuf vignettes plutôt que neuf lignes.

            Le couple libellé / valeur en vis-à-vis, employé partout ailleurs
            dans le rapport, ne tient pas ici : à trois colonnes sur une feuille
            A4, chaque cellule fait cinquante-cinq millimètres, et un libellé
            qui doit partager cette largeur avec sa valeur passe à la ligne deux
            fois. Le bloc gagnait alors quatre-vingts millimètres, et la page
            débordait sur une seconde feuille pour trois lignes.

            Empilés — libellé au-dessus, valeur au-dessous —, les mêmes neuf
            champs tiennent en trois rangs. Le filet rouge à gauche de chaque
            vignette remplace le trait de séparation horizontal des listes : il
            faut bien quelque chose pour découper la grille, et une bordure
            complète en ferait un tableau. */}
        <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
          {description.environnement.lignes.map((ligne) => (
            <div key={ligne.id} className="border-l-2 border-barnes/25 pl-2.5">
              <p className="font-mono text-[0.5rem] uppercase leading-tight tracking-micro text-marine/40">
                {ligne.label}
              </p>
              <ChampModifiable
                cle={ligne.id}
                valeur={ligne.valeur}
                as="p"
                className="mt-0.5 block font-display text-[0.85rem] font-semibold leading-snug text-marine"
              />
            </div>
          ))}
        </div>

        {/* Les apartés — d'où sortent les valeurs relevées.

            Ils étaient un, celui du niveau sonore ; ils sont quatre depuis que
            la vue, l'exposition et la luminosité sont déduites plutôt que
            déclarées. C'est la contrepartie exacte de cette déduction : une
            qualification présumée qui n'énonce pas sur quoi elle se fonde est
            une affirmation, et ce document est signé par l'agence.

            Chacun tient en une phrase courte, rédigée pour cet emplacement
            (voir `cadre.js`) : quatre motifs de trois lignes prendraient vingt
            millimètres de feuille, que les points forts n'ont pas à payer. Deux
            colonnes les ramènent à deux rangs. */}
        {description.environnement.motifs.length > 0 ? (
          <ul className="mt-2 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {description.environnement.motifs.map((motif) => (
              <li
                key={motif.cle}
                className="flex items-baseline gap-2 text-[0.58rem] leading-[1.2] text-marine/45"
              >
                <span
                  aria-hidden="true"
                  className="mt-[0.28rem] h-1 w-1 shrink-0 rounded-full bg-barnes"
                />
                <ChampModifiable cle={motif.cle} valeur={motif.texte} multiligne />
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Points forts={description.forts} reserves={description.reserves} />

      {description.environnement.source ? (
        <p className="mt-auto pt-4 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
          Environnement relevé d’après {description.environnement.source}
        </p>
      ) : null}
    </PageRapport>
  )
}

// --- Photos du bien --------------------------------------------------------

/**
 * Les clichés déposés au formulaire, en planche.
 *
 * La seule page du rapport à disparaître quand elle n'a rien à montrer : c'est
 * `RapportView` qui l'écarte, sur la foi du modèle qui rend `null` faute de
 * photo (voir `photos` dans `rapportModele.js`). Elle ne porte donc jamais de
 * bloc « indisponible ».
 *
 * Deux colonnes, et la première photo sur toute la largeur : la planche
 * uniforme donnait à chaque cliché le même poids, alors que le premier déposé
 * est presque toujours la façade — celui qu'on regarde avant les autres. Les
 * clichés en hauteur sont contenus plutôt que recadrés (`object-contain`) :
 * couper un intérieur pour le faire tenir dans un cadre paysage revient à en
 * retirer le plafond et le sol.
 */
export function PagePhotos({ photos, numero }) {
  const [ouverture, ...suite] = photos

  return (
    <PageRapport numero={numero} surtitre="Le bien" titre="Photos du bien">
      <figure className="m-0">
        <img
          src={ouverture.src}
          alt={ouverture.nom || 'Photo du bien'}
          className={`w-full rounded-lg border border-marine/10 bg-marine/[0.03] ${
            ouverture.portrait ? 'object-contain' : 'object-cover'
          }`}
          style={{ aspectRatio: '16 / 9' }}
        />
      </figure>

      {suite.length > 0 ? (
        <ul className="mt-3 grid grid-cols-2 gap-3">
          {suite.map((photo) => (
            <li key={photo.cle} className="m-0">
              <img
                src={photo.src}
                alt={photo.nom || 'Photo du bien'}
                className={`w-full rounded-lg border border-marine/10 bg-marine/[0.03] ${
                  photo.portrait ? 'object-contain' : 'object-cover'
                }`}
                style={{ aspectRatio: '4 / 3' }}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
        {photos.length > 1 ? `${photos.length} clichés du bien` : 'Cliché du bien'} — pris sur place
      </p>
    </PageRapport>
  )
}

// --- 4. Points d'intérêt ---------------------------------------------------

/**
 * La carte est obligatoire, et c'est le seul point qui compte sur cette page.
 *
 * Elle ne l'était pas : le relevé en échec faisait disparaître la carte au
 * profit d'un bloc « à compléter à la main », c'est-à-dire d'une feuille
 * d'excuse au milieu d'un document remis à un vendeur. Ce repli n'existe plus,
 * ni ici ni dans le relevé, qui interroge désormais trois sources indépendantes
 * avant d'abandonner et élargit son rayon plutôt que de rendre une carte nue
 * (voir `src/lib/poi.js`).
 *
 * Reste ce que la carte ne peut pas inventer : un quartier réellement dépourvu
 * de commerces à cinq cents mètres. La page le dit alors en une phrase, sous
 * une carte qui, elle, montre toujours le bien, son disque de recherche et les
 * rues autour — une information juste, plutôt qu'une case vide.
 */
export function PageCommodites({ commodites, numero }) {
  if (!commodites) return null

  const releve = commodites.releve > 0

  return (
    <PageRapport numero={numero} surtitre="Environnement" titre="Commodités à proximité">
      <p className="text-[0.82rem] leading-relaxed text-marine/60">
        {releve ? (
          <>
            Équipements et services relevés dans un rayon de{' '}
            <strong className="font-semibold text-marine">{commodites.rayon}</strong> autour du bien
            — l’ordre de grandeur de ce qui se fait à pied.
          </>
        ) : (
          <>
            Aucun équipement n’a été relevé jusqu’à{' '}
            <strong className="font-semibold text-marine">{commodites.rayon}</strong> du bien : le
            secteur est à l’écart des commerces et des services du quotidien.
          </>
        )}
      </p>

      {/* La carte d'abord : elle donne la forme du quartier, que les décomptes
          détaillent ensuite. Le repli du `Suspense` tient sa hauteur exacte —
          sans lui, les sections du dessous remonteraient le temps du
          chargement puis redescendraient, et l'agent verrait sa page se
          réorganiser sous les yeux. */}
      <div className="mt-3">
        <Suspense
          fallback={
            <div
              className="rapport-carte mx-auto w-full rounded-lg border border-marine/12 bg-marine/[0.03]"
              style={{ height: '265px', maxWidth: '23rem' }}
            />
          }
        >
          <CarteCommodites carte={commodites.carte} source={commodites.attribution} />
        </Suspense>
      </div>

      {/* Trois catégories serrées sous une carte de soixante-dix millimètres :
          la feuille A4 n'a pas de marge de manœuvre ici, et chaque écart de
          plus la ferait déborder sur une seconde page pour deux lignes.

          L'élargissement du relevé (voir `CATEGORIES` dans `src/lib/poi.js`) a
          coûté le dernier millimètre : les décomptes passent de « 4 commerces »
          à « 41 commerces », et la légende de la carte, qui les reprend,
          approche de son second rang. D'où ces intervalles rabotés d'un
          quart. */}
      <div className="mt-2.5 space-y-1.5">
        {commodites.categories.map((categorie) => (
          <Section
            key={categorie.id}
            titre={categorie.label}
            aparte={categorie.plusProche ? `au plus près : ${categorie.plusProche}` : null}
          >
            <ChampModifiable
              cle={`poi.${categorie.id}.total`}
              valeur={categorie.totalTexte}
              as="p"
              className={`block font-display text-[0.95rem] font-semibold ${
                categorie.total > 0 ? 'text-marine' : 'text-marine/45'
              }`}
            />

            {categorie.lieux.length > 0 ? (
              <ul className="mt-2 space-y-0.5">
                {categorie.lieux.map((lieu) => (
                  <li
                    key={lieu.cle}
                    className="flex items-baseline justify-between gap-3 border-b border-marine/8 py-[0.22rem]"
                  >
                    <span className="min-w-0">
                      <ChampModifiable
                        cle={`${lieu.cle}.nom`}
                        valeur={lieu.nom}
                        className="text-[0.8rem] text-marine/80"
                      />
                      <span className="ml-2 font-mono text-[0.58rem] uppercase tracking-micro text-marine/35">
                        {lieu.type}
                      </span>
                    </span>
                    <ChampModifiable
                      cle={`${lieu.cle}.distance`}
                      valeur={lieu.distance}
                      className="shrink-0 font-mono text-[0.7rem] text-marine/55"
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </Section>
        ))}
      </div>

    </PageRapport>
  )
}

// --- 5. Profil du quartier -------------------------------------------------

export function PageQuartier({ quartier, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Environnement" titre="Profil du quartier">
      {!quartier ? (
        <BlocIndisponible
          cle="quartier.absent"
          message="Le profil démographique du secteur n’a pas pu être établi."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <ChampModifiable
              cle="quartier.nom"
              valeur={quartier.nom}
              as="p"
              className="block font-display text-[1.2rem] font-semibold text-marine"
            />
            {quartier.codeIris ? (
              <p className="font-mono text-[0.58rem] uppercase tracking-micro text-marine/35">
                IRIS {quartier.codeIris}
              </p>
            ) : null}
          </div>

          <Section className="mt-5">
            <ListeChamps champs={quartier.lignes} />
          </Section>

          {quartier.serie.length > 1 ? (
            <Section titre="Population aux recensements" className="mt-7">
              <Barres points={quartier.serie} legende="Population aux recensements successifs" />
            </Section>
          ) : null}

          {/* L'échelle des chiffres, dite en clair et non en note de bas de
              page : un chiffre communal présenté comme celui d'un quartier
              serait un faux, et cette mention est ce qui l'en distingue. */}
          <div className="mt-auto pt-6">
            <div className="rounded-lg border border-marine/12 bg-marine/[0.03] px-4 py-3">
              <p className="font-mono text-[0.55rem] uppercase tracking-micro text-marine/45">
                Échelle des données : {quartier.niveau === 'commune' ? 'commune' : 'non déterminée'}
              </p>
              <ChampModifiable
                cle="quartier.motif"
                valeur={quartier.niveauMotif}
                as="p"
                multiligne
                className="mt-1.5 block text-[0.72rem] leading-snug text-marine/55"
              />
            </div>
            <p className="mt-3 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
              Source : {quartier.source}
              {quartier.millesime ? ` — millésime ${quartier.millesime}` : ''}
            </p>
          </div>
        </>
      )}
    </PageRapport>
  )
}

// --- Repères Alsace-Moselle ------------------------------------------------

/**
 * Le substitut du territoire du livre foncier.
 *
 * Quatre pages du rapport reposent entièrement sur les Demandes de valeurs
 * foncières — statistiques, budgets, historique, ventes comparables. En
 * Moselle, dans le Bas-Rhin et le Haut-Rhin, ces quatre pages sortaient vides,
 * et pour de bon : le droit local y confie la publicité foncière au livre
 * foncier, dont les mutations n'entrent dans aucune base ouverte.
 *
 * Ce bloc ne comble pas ce vide — rien ne le peut — mais il le remplace par ce
 * qui est connaissable : un niveau de prix communal, construit sur deux
 * indicateurs Insee qui, eux, couvrent le territoire (voir
 * `api/_lib/alsaceMoselle.js`). Il prend la place du bloc « indisponible » sur
 * la page des statistiques, et se signale sur les trois autres.
 *
 * Tout ce qui suit l'encadré est de la mise en garde, et elle est délibérément
 * longue : c'est l'agent qui présentera ce chiffre, et il doit pouvoir dire
 * exactement ce qu'il vaut.
 */
function BlocReperes({ reperes }) {
  return (
    <>
      <p className="text-[0.82rem] leading-relaxed text-marine/60">
        Aucune vente n’est publiée pour la{' '}
        <strong className="font-semibold text-marine">{reperes.departement}</strong>. À défaut de
        statistiques de transactions, voici les niveaux de prix de référence retenus pour{' '}
        <strong className="font-semibold text-marine">{reperes.commune ?? 'la commune'}</strong>.
      </p>

      <Section titre="Prix de référence au m²" className="mt-6">
        <div className="relative rounded-xl border border-corail/25 bg-corail/[0.04] px-5 pb-2 pt-3">
          <AngleBarnes className="right-2 top-2 rotate-90" />
          <ListeChamps champs={reperes.prix} colonnes={3} />
        </div>
      </Section>

      {reperes.indice.length > 0 ? (
        <Section titre="Ce qui situe la commune" className="mt-7">
          <ListeChamps champs={reperes.indice} colonnes={2} />
        </Section>
      ) : null}

      <Section titre="Pourquoi ces chiffres, et non des ventes" className="mt-7">
        <div className="space-y-2.5 text-[0.78rem] leading-relaxed text-marine/60">
          <ChampModifiable cle="reperes.motif" valeur={reperes.motif} as="p" multiligne className="block" />
          <ChampModifiable
            cle="reperes.methode"
            valeur={reperes.methode}
            as="p"
            multiligne
            className="block"
          />
          <p className="flex items-baseline gap-2 rounded-lg border border-marine/12 bg-marine/[0.03] px-3.5 py-2.5 text-marine/70">
            <span aria-hidden="true" className="mt-[0.35rem] h-1.5 w-1.5 shrink-0 rounded-full bg-barnes" />
            <ChampModifiable cle="reperes.precision" valeur={reperes.precision} multiligne />
          </p>
        </div>
      </Section>

      <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
        Source : {reperes.source}
      </p>
    </>
  )
}

/**
 * Le renvoi porté par les trois pages qui n'ont pas de substitut à offrir.
 *
 * Budgets par typologie, historique annuel et ventes comparables supposent des
 * transactions datées : sans elles, il n'y a rien à calculer, et un repère de
 * prix ne les remplace pas. La page dit donc pourquoi elle est vide et où
 * trouver ce qui a pu être établi — plutôt que d'afficher le message générique
 * d'un secteur simplement peu actif, qui ferait croire à un problème passager.
 */
const messageLivreFoncier = (quoi) =>
  `${quoi} suppose des ventes datées, et le livre foncier du droit local ` +
  'alsacien-mosellan n’en publie aucune. La page « Statistiques du secteur » porte, à la ' +
  'place, les niveaux de prix de référence retenus pour la commune.'

// --- 6. Statistiques de marché ---------------------------------------------

export function PageMarche({ marche, reperes, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Marché" titre="Statistiques du secteur">
      {!marche && reperes ? (
        <BlocReperes reperes={reperes} />
      ) : !marche ? (
        <BlocIndisponible
          cle="marche.absent"
          message="Aucune vente publiée ne permet d’établir les statistiques de ce secteur. À Mayotte, dont le cadastre est encore en cours de constitution, la DGFiP ne diffuse aucune mutation."
        />
      ) : (
        <>
          <p className="text-[0.82rem] leading-relaxed text-marine/60">
            Chiffres établis sur <strong className="font-semibold text-marine">{marche.zone}</strong>,
            d’après les ventes publiées par la DGFiP.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Statistique
              cle="marche.stat.median"
              label="Prix médian au m²"
              valeur={marche.lignes[0].valeur}
              note="Toutes ventes de logements confondues"
              accent
            />
            <Statistique
              cle="marche.stat.evolution"
              label="Évolution sur douze mois"
              valeur={marche.evolution.valeur}
              note={
                marche.evolution.recente.periode
                  ? `${marche.evolution.recente.periode} contre ${marche.evolution.precedente.periode}`
                  : null
              }
            />
          </div>

          <Section titre="Détail par type de bien" className="mt-7">
            <ListeChamps champs={marche.lignes.slice(1)} />
          </Section>

          <Section titre="Comparaison des deux périodes" className="mt-7">
            <table className="w-full">
              <EnteteTableau
                colonnes={[
                  { label: 'Période' },
                  { label: 'Ventes', droite: true },
                  { label: 'Prix médian au m²', droite: true },
                ]}
              />
              <tbody>
                {[
                  { cle: 'recente', ...marche.evolution.recente },
                  { cle: 'precedente', ...marche.evolution.precedente },
                ].map((periode) => (
                  <tr key={periode.cle} className="border-b border-marine/8">
                    <CelluleModifiable
                      cle={`marche.${periode.cle}.periode`}
                      valeur={periode.periode}
                    />
                    <CelluleModifiable
                      cle={`marche.${periode.cle}.ventes`}
                      valeur={periode.ventes}
                      droite
                    />
                    <CelluleModifiable
                      cle={`marche.${periode.cle}.prix`}
                      valeur={periode.prix}
                      droite
                      fort
                    />
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-3 flex items-center gap-1.5 text-[0.72rem] text-marine/50">
              <Tendance sens={marche.evolution.sens} />
              Les douze derniers mois publiés sont comparés aux douze précédents ; la base DVF
              paraît avec plusieurs mois de décalage.
            </p>
          </Section>

          <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
            Source : DGFiP — Demandes de valeurs foncières, géocodées par Etalab
          </p>
        </>
      )}
    </PageRapport>
  )
}

// --- 7. Budgets par typologie ----------------------------------------------

export function PageBudgets({ budgets, reperes, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Marché" titre="Budgets moyens par typologie">
      {!budgets ? (
        <BlocIndisponible
          cle="budgets.absent"
          message={
            reperes
              ? messageLivreFoncier('Le budget moyen par typologie')
              : 'Le nombre de pièces n’est pas renseigné sur assez de ventes du secteur pour établir des budgets par typologie.'
          }
        />
      ) : (
        <>
          <p className="text-[0.82rem] leading-relaxed text-marine/60">
            Ce qui se vend sur <strong className="font-semibold text-marine">{budgets.zone}</strong>,
            et le revenu qu’il faut justifier pour l’acheter — emprunt sur {budgets.duree} au taux
            de {budgets.taux}, mensualité plafonnée à {budgets.effort} du revenu net.
          </p>

          <Section titre="Répartition des ventes" className="mt-6">
            <Repartition
              segments={budgets.lignes
                .filter((ligne) => ligne.partPct != null)
                .map((ligne) => ({ label: ligne.label, part: ligne.partPct }))}
            />
          </Section>

          <Section titre="Détail par typologie" className="mt-7">
            <table className="w-full">
              <EnteteTableau
                colonnes={[
                  { label: 'Type' },
                  { label: 'Surface', droite: true },
                  { label: 'Budget moyen', droite: true },
                  { label: 'Part', droite: true },
                  { label: 'Revenu net requis', droite: true },
                ]}
              />
              <tbody>
                {budgets.lignes.map((ligne) => (
                  <tr key={ligne.cle} className="border-b border-marine/8">
                    <td className="py-[0.42rem]">
                      <span className="font-display text-[0.88rem] font-semibold text-marine">
                        {ligne.label}
                      </span>
                    </td>
                    {ligne.champs.map((champ, index) => (
                      <CelluleModifiable
                        key={champ.id}
                        cle={champ.id}
                        valeur={champ.valeur}
                        droite
                        fort={index === 1 || index === 3}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <p className="mt-5 text-[0.7rem] leading-relaxed text-marine/45">
            Calcul établi sur {budgets.references} ventes dont le nombre de pièces est renseigné.
            Le capital emprunté est pris égal au prix du bien : un apport le réduirait, les frais
            d’acquisition l’augmenteraient.
          </p>

          <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
            Sources : DGFiP (ventes) — BCE (taux d’emprunt)
          </p>
        </>
      )}
    </PageRapport>
  )
}

// --- 8. Historique des ventes ----------------------------------------------

export function PageHistorique({ historique, reperes, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Marché" titre="Historique des ventes">
      {!historique ? (
        <BlocIndisponible
          cle="historique.absent"
          message={
            reperes
              ? messageLivreFoncier('L’historique annuel des ventes')
              : 'Aucun historique de ventes n’est publié pour ce secteur.'
          }
        />
      ) : (
        <>
          <p className="text-[0.82rem] leading-relaxed text-marine/60">
            Volume et prix au m² année par année sur{' '}
            <strong className="font-semibold text-marine">{historique.zone}</strong>.
          </p>

          {/* Les deux figures côte à côte plutôt que l'une sous l'autre : elles
              répondent à deux questions différentes — combien de biens
              changent de main, et à quel prix — et la feuille n'a pas la
              hauteur de deux graphiques empilés sous un tableau de cinq
              lignes. Sur écran étroit, la grille retombe en une colonne. */}
          <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            <Section titre="Ventes par année">
              <Barres
                points={historique.lignes.map((ligne) => ({
                  annee: ligne.annee,
                  valeur: ligne.ventesBrut,
                  label: ligne.ventes,
                }))}
                legende="Nombre de ventes par année"
              />
            </Section>

            <Section titre="Prix moyen au m²">
              <Courbe
                points={historique.lignes.map((ligne) => ({
                  annee: ligne.annee,
                  valeur: ligne.prixM2Brut,
                  label: ligne.prixM2,
                }))}
                hauteur={100}
                legende="Prix moyen au m² par année"
              />
            </Section>
          </div>

          <Section titre="Détail annuel" className="mt-7">
            <table className="w-full">
              <EnteteTableau
                colonnes={[
                  { label: 'Année' },
                  { label: 'Ventes', droite: true },
                  { label: 'Prix moyen au m²', droite: true },
                  { label: 'Évolution', droite: true },
                ]}
              />
              <tbody>
                {historique.lignes.map((ligne) => (
                  <tr key={ligne.cle} className="border-b border-marine/8">
                    <CelluleModifiable cle={`${ligne.cle}.annee`} valeur={ligne.annee} fort />
                    <CelluleModifiable cle={`${ligne.cle}.ventes`} valeur={ligne.ventes} droite />
                    <CelluleModifiable cle={`${ligne.cle}.prix`} valeur={ligne.prixM2} droite fort />
                    <td className="py-[0.42rem] text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <Tendance sens={ligne.sens} className="h-3 w-3" />
                        <ChampModifiable
                          cle={`${ligne.cle}.evolution`}
                          valeur={ligne.evolution}
                          placeholder="—"
                          className="text-[0.8rem] text-marine/75"
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section titre="Synthèse de la période" className="mt-7">
            <ListeChamps champs={historique.synthese} colonnes={2} />
          </Section>

          <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
            Source : DGFiP — Demandes de valeurs foncières
          </p>
        </>
      )}
    </PageRapport>
  )
}

// --- 9. Ventes comparables -------------------------------------------------

export function PageComparables({ comparables, reperes, numero }) {
  const { masques, basculerMasque } = useEdition()

  return (
    <PageRapport numero={numero} surtitre="Marché" titre="Ventes comparables">
      {!comparables ? (
        <BlocIndisponible
          cle="comparables.absent"
          message={
            reperes
              ? messageLivreFoncier('La liste des ventes comparables')
              : 'Aucune vente comparable n’a été trouvée à proximité du bien.'
          }
        />
      ) : (
        <>
          <p className="text-[0.82rem] leading-relaxed text-marine/60">
            Les biens de même nature vendus le plus près du vôtre. Ce sont ces ventes, et non un
            barème, qui portent l’estimation.
          </p>

          <Section className="mt-6">
            <table className="w-full">
              <EnteteTableau
                colonnes={[
                  { label: 'Bien' },
                  { label: 'Distance', droite: true },
                  { label: 'Surface', droite: true },
                  { label: 'Pièces', droite: true },
                  { label: 'Prix', droite: true },
                  { label: '€/m²', droite: true },
                  { label: 'Date', droite: true },
                  { label: '' },
                ]}
              />
              <tbody>
                {comparables.map((vente) => {
                  const masque = masques[vente.cle] === true

                  return (
                    <tr
                      key={vente.cle}
                      className={`border-b border-marine/8 ${masque ? 'rapport-masque' : ''}`}
                    >
                      <CelluleModifiable cle={`${vente.cle}.type`} valeur={vente.type} />
                      <CelluleModifiable cle={`${vente.cle}.distance`} valeur={vente.distance} droite />
                      <CelluleModifiable cle={`${vente.cle}.surface`} valeur={vente.surface} droite />
                      <CelluleModifiable cle={`${vente.cle}.pieces`} valeur={vente.pieces} droite />
                      <CelluleModifiable cle={`${vente.cle}.prix`} valeur={vente.prix} droite fort />
                      <CelluleModifiable cle={`${vente.cle}.prixM2`} valeur={vente.prixM2} droite />
                      <CelluleModifiable cle={`${vente.cle}.date`} valeur={vente.date} droite />
                      <td className="py-[0.42rem] pl-2 text-right">
                        <OutilLigne
                          onClick={() => basculerMasque(vente.cle)}
                          titre={masque ? 'Rétablir cette vente' : 'Retirer cette vente du rapport'}
                        >
                          {masque ? (
                            <RotateCcw className="h-3.5 w-3.5" />
                          ) : (
                            <Minus className="h-3.5 w-3.5" />
                          )}
                        </OutilLigne>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Section>

          <p className="mt-5 text-[0.7rem] leading-relaxed text-marine/45">
            Les distances sont calculées depuis le bien estimé. Les prix sont ceux effectivement
            enregistrés à l’acte, frais de notaire exclus.
          </p>

          <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
            Source : DGFiP — Demandes de valeurs foncières
          </p>
        </>
      )}
    </PageRapport>
  )
}

// --- 10. Estimation --------------------------------------------------------

export function PageEstimation({ estimation, marche, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Conclusion" titre="Estimation de valeur">
      {!estimation ? (
        <BlocIndisponible
          cle="estimation.absente"
          message="Le montant n’a pas pu être calculé. À établir à la main d’après les ventes comparables de la page précédente."
        />
      ) : (
        <>
          {/* Le montant, seul bloc du document à porter un aplat rouge franc
              derrière son libellé et un filet plein de part et d'autre : c'est
              la ligne que le vendeur cherche en ouvrant le rapport, et rien
              d'autre sur ces onze pages ne doit se présenter comme elle. */}
          <div className="relative overflow-hidden rounded-xl border border-barnes/20 bg-barnes/[0.045] px-6 py-8 text-center">
            <AngleBarnes className="left-3 top-3" taille={16} />
            <AngleBarnes className="bottom-3 right-3 rotate-180" taille={16} />
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-[3px] bg-barnes"
            />
            <p className="font-mono text-[0.58rem] uppercase tracking-micro text-barnes">
              Valeur de présentation recommandée
            </p>
            <ChampModifiable
              cle="estimation.prix"
              valeur={estimation.prix}
              as="p"
              className="mt-3 block font-display text-[2.9rem] font-semibold leading-none text-marine"
            />
            {estimation.prixM2 ? (
              <ChampModifiable
                cle="estimation.prixM2"
                valeur={`soit ${estimation.prixM2}`}
                as="p"
                className="mt-3 block font-mono text-[0.7rem] text-marine/45"
              />
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Statistique cle="estimation.bas" label="Fourchette basse" valeur={estimation.bas} />
            <Statistique cle="estimation.haut" label="Fourchette haute" valeur={estimation.haut} accent />
          </div>

          {/* Ce qui a écarté le montant de la médiane du secteur, ligne à
              ligne. La section n'apparaît que s'il y a quelque chose à
              montrer : un formulaire qui n'a rien déclaré de déterminant ne
              produit aucun ajustement, et un tableau vide se lirait comme un
              relevé manquant.

              Ces lignes sont dans le rapport pour une raison précise : un
              vendeur à qui l'on annonce une décote a le droit de savoir
              laquelle, et l'agent qui la lui présente doit pouvoir la défendre
              sans deviner d'où elle sort. */}
          {estimation.ajustements.length > 0 ? (
            <Section
              titre="Ajustements appliqués"
              aparte={estimation.ajustementTotal ? `total : ${estimation.ajustementTotal}` : null}
              className="mt-6"
            >
              <ListeChamps
                champs={estimation.ajustements.map((ajustement) => ({
                  id: ajustement.cle,
                  label: ajustement.label,
                  valeur: ajustement.valeur,
                }))}
                colonnes={2}
              />
              <p className="mt-2.5 text-[0.7rem] leading-relaxed text-marine/45">
                Appliqués à la valeur tirée des ventes comparables, qui décrit un bien moyen du
                secteur. Chaque ajustement est plafonné, et leur cumul aussi
                {estimation.ajustementPlafonne
                  ? ' — c’est ce plafond qui explique que le total ne fasse pas la somme des lignes.'
                  : '.'}
              </p>
            </Section>
          ) : null}

          <Section titre="Synthèse" className="mt-7">
            <ChampModifiable
              cle="estimation.synthese"
              valeur={
                marche
                  ? `Le bien est estimé à partir des ventes réalisées sur ${marche.zone}, dont le prix médian s’établit à ${marche.lignes[0].valeur}. La fourchette tient compte de l’état du marché et des caractéristiques déclarées ; elle n’intègre ni le mobilier ni d’éventuels travaux en cours.`
                  : 'Le bien est estimé à partir des ventes comparables relevées à proximité et des caractéristiques déclarées. La fourchette n’intègre ni le mobilier ni d’éventuels travaux en cours.'
              }
              as="p"
              multiligne
              className="block text-[0.85rem] leading-relaxed text-marine/70"
            />
          </Section>

          <Section titre="Recommandation" className="mt-6">
            <ChampModifiable
              cle="estimation.recommandation"
              valeur="Un bien positionné dès la mise en vente dans cette fourchette se négocie sensiblement plus vite qu’un bien surévalué puis rebaissé — les premières semaines concentrent l’essentiel des contacts."
              as="p"
              multiligne
              className="block text-[0.85rem] leading-relaxed text-marine/70"
            />
          </Section>

          <div className="mt-auto pt-6">
            <p className="rounded-lg border border-corail/25 bg-corail/[0.05] px-4 py-3 text-[0.72rem] leading-relaxed text-marine/60">
              Cette estimation est un avis de valeur. Elle ne constitue ni une expertise au sens
              judiciaire, ni un mandat, ni un engagement sur le prix de vente définitif.
            </p>
          </div>
        </>
      )}
    </PageRapport>
  )
}

// --- 11. Profil acquéreur --------------------------------------------------

export function PageAcquereur({ acquereur, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Financement" titre="Profil de l’acquéreur">
      {!acquereur ? (
        <BlocIndisponible
          cle="acquereur.absent"
          message="Le profil de financement n’a pas pu être établi — ni montant estimé, ni taux d’emprunt disponible."
        />
      ) : (
        <>
          <p className="text-[0.82rem] leading-relaxed text-marine/60">
            Ce qu’il faut gagner pour acheter ce bien à crédit. Une façon de mesurer la profondeur
            du marché : plus le revenu requis est élevé, plus le nombre d’acquéreurs se resserre.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Statistique
              cle="acquereur.stat.revenu"
              label="Revenu net mensuel requis"
              valeur={acquereur.lignes[0].valeur}
              accent
            />
            <Statistique
              cle="acquereur.stat.mensualite"
              label="Mensualité"
              valeur={acquereur.lignes[1].valeur}
            />
          </div>

          <Section titre="Hypothèses de calcul" className="mt-7">
            <ListeChamps champs={acquereur.lignes.slice(2)} />
          </Section>

          {acquereur.taux.serie.length > 1 ? (
            <Section titre="Évolution du coût du crédit" className="mt-7">
              <Courbe
                points={acquereur.taux.serie}
                legende="Taux moyen des crédits à l’habitat, moyenne annuelle"
              />
              <p className="mt-3 text-[0.7rem] leading-relaxed text-marine/45">
                Moyennes annuelles du coût des crédits à l’habitat accordés aux ménages en France.
                La série couvre toutes les durées confondues ; un emprunt sur 25 ans se négocie en
                général quelques dixièmes de point au-dessus.
              </p>
            </Section>
          ) : null}

          <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
            Source : {acquereur.taux.source}
          </p>
        </>
      )}
    </PageRapport>
  )
}

// --- Notre agence ----------------------------------------------------------

/**
 * La page de fin — qui a établi cet avis de valeur, et comment le joindre.
 *
 * Ces informations ne viennent d'aucune source et ne se calculent pas : elles
 * sont celles de l'agence, posées une fois pour toutes hors du code (voir
 * `src/config/agence.js`) et modifiables à l'écran comme le reste du rapport.
 * Un champ non configuré s'affiche « Non renseigné » plutôt que d'être omis :
 * c'est ce qui rappelle à l'agent, avant impression, qu'il manque un numéro de
 * téléphone sur un document qui porte son nom.
 */
export function PageAgence({ agence, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Votre interlocuteur" titre="Notre agence">
      {/* Les espacements de cette page sont volontairement plus serrés que
          ceux de ses voisines : les mentions légales du pied sont libres, et
          trois lignes de carte professionnelle ne doivent pas faire déborder la
          feuille. */}
      <div className="rounded-xl border border-marine/12 bg-marine/[0.03] px-6 py-6">
        <ChampModifiable
          cle="agence.enseigne"
          valeur={agence.enseigne}
          as="p"
          className="block font-mono text-[0.7rem] uppercase tracking-[0.42em] text-corail"
        />
        <span aria-hidden="true" className="mt-4 block h-px w-16 bg-corail/40" />
        <ChampModifiable
          cle="agence.nom"
          valeur={agence.nom}
          as="p"
          className="mt-4 block font-display text-[1.6rem] font-semibold leading-tight text-marine"
        />
        <ChampModifiable
          cle="agence.baseline"
          valeur={agence.baseline}
          as="p"
          className="mt-1.5 block text-[0.85rem] leading-relaxed text-marine/55"
        />
      </div>

      <Section titre="Coordonnées" className="mt-6">
        <ListeChamps champs={agence.coordonnees} />
      </Section>

      <Section titre="Votre conseiller" className="mt-6">
        <ListeChamps champs={agence.conseiller} />
      </Section>

      <Section titre="Les prochaines étapes" className="mt-6">
        <ChampModifiable
          cle="agence.suite"
          valeur="Cet avis de valeur constitue le point de départ de la commercialisation. Nous vous proposons d’en reprendre ensemble les hypothèses, d’arrêter un prix de présentation et de convenir des modalités de diffusion et de visite."
          as="p"
          multiligne
          className="block text-[0.85rem] leading-relaxed text-marine/70"
        />
      </Section>

      <div className="mt-auto pt-6">
        <ChampModifiable
          cle="agence.mentions"
          valeur={agence.mentionsLegales}
          as="p"
          multiligne
          placeholder="Mentions légales de l’agence — carte professionnelle, RCS, garant financier."
          className="block text-[0.66rem] leading-relaxed text-marine/40"
        />
        <p className="mt-3 rounded-lg border border-corail/25 bg-corail/[0.05] px-4 py-3 text-[0.72rem] leading-relaxed text-marine/60">
          Document établi à titre d’information. Il ne vaut ni mandat, ni expertise judiciaire, ni
          engagement sur le prix de vente définitif.
        </p>
      </div>
    </PageRapport>
  )
}
