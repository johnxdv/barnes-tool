import { Trait, Touche } from './encre'

/**
 * La Maison Barnes — le grand dessin à l'encre de l'écran d'adresse.
 *
 * Une demeure de prestige tracée au pinceau, qui sort du sol niveau par niveau :
 * un corps central de trois étages, deux ailes plus basses, un toit à la
 * Mansart, un perron à colonnes. Elle est posée en fond de l'écran d'adresse,
 * centrée sur le titre, et n'y tient pas le rôle d'illustration mais celui de
 * décor : très peu contrastée, large, derrière le texte.
 *
 * ── Ce que le dessin a changé, et pourquoi ────────────────────────────────
 *
 * Il a d'abord été une tour à retraits, puis un immeuble de rapport
 * haussmannien. L'immeuble était juste de trait, mais il disait le mauvais
 * bien : un écran qui demande « Où se situe le bien ? » à un agent qui estime
 * des maisons de standing ne peut pas ouvrir sur une façade d'immeuble de
 * ville. Le sujet change donc, le pinceau non — c'est le même `encre.jsx` que
 * partout ailleurs dans le parcours.
 *
 * Les cotes de la maison, et ce qu'elles servent :
 *
 *  - **Trois niveaux pleins, et non deux.** Rez-de-chaussée de 92 unités,
 *    premier de 84, second de 76 : les hauteurs décroissent en montant, comme
 *    dans toute demeure ancienne — un étage noble sous des combles moins hauts.
 *    C'est ce qui fait lire « demeure » plutôt que « pavillon à étage ».
 *  - **Deux ailes.** Elles portent la largeur de 192 à 336 unités et donnent la
 *    silhouette qu'on attend d'une propriété : un corps central plus haut,
 *    encadré. Sans elles, trois niveaux sur un seul volume redonnent un
 *    immeuble étroit.
 *  - **Un rapport hauteur / largeur de 1,1.** La composition tient entre
 *    y = 246 (souches de cheminée) et y = 602 (sol), pour 336 de largeur bâtie.
 *    Une maison est plus large que haute ; elle monte ici jusqu'au ratio le
 *    plus élevé qu'on puisse tenir sans redessiner un immeuble.
 *  - **Un toit à la Mansart**, brisé, avec sa balustrade de faîtage et ses deux
 *    souches. C'est la pièce qui travaille le plus : la même façade sous un
 *    toit plat redevient un petit collectif.
 *  - **Un perron à quatre colonnes.** Il n'ajoute qu'une dizaine de traits et
 *    c'est lui qui dit « haut de gamme » — une porte percée dans un mur ne le
 *    dit pas.
 *
 * ── Ce qui a été retiré ───────────────────────────────────────────────────
 *
 * L'écusson qui se posait au-dessus du toit. L'écran en porte déjà un, franc et
 * net, au-dessus du titre (voir `EstimationAddressStep`) ; celui-ci en était un
 * troisième, deux fois plus haut sur la page et noyé à 9 % d'opacité avec le
 * reste du dessin. Un logo de marque à peine visible ne signe rien — il dilue
 * celui qui signe.
 *
 * ── Le trait ──────────────────────────────────────────────────────────────
 *
 * Le pinceau est celui de tout le parcours (voir `encre.jsx`). Rien n'est
 * parfaitement droit, et c'est l'essentiel du rendu « à la main » : les
 * verticales dérivent d'un demi-point, les planchers ne sont jamais tout à fait
 * horizontaux, les épaisseurs varient d'un niveau à l'autre. Une maison tracée
 * à la règle aurait l'air d'un plan de permis de construire.
 *
 * La scène se joue une fois, en un peu plus de trois secondes, et ne boucle
 * pas : c'est une ouverture, pas un fond d'écran animé — une maison qui se
 * redessinerait en continu derrière un champ de saisie deviendrait un
 * clignotant.
 *
 * Le mode « moins d'animations » est couvert sans condition : le filet global
 * d'`index.css` ramène toute durée à 0,001 ms en gardant `forwards`, et la
 * maison s'affiche d'emblée terminée.
 */

/** Axe de la demeure et ligne de sol, en unités de dessin. */
const AXE = 200
const SOL = 596

/**
 * Le cadre du dessin, resserré autour de lui : les souches de cheminée en haut
 * (y = 246), la ligne de sol en bas (y = 602), et de quoi loger les deux cyprès
 * de part et d'autre du bâti.
 * C'est ce cadrage qui permet de centrer la maison sur un titre sans la
 * décaler : le centre de la boîte *est* le centre du dessin.
 */
const VUE = '-40 236 480 386'

/** Corps central — demi-largeur, et les trois niveaux du sol vers le ciel. */
const DEMI = 96
const NIVEAUX = [
  { bas: SOL, haut: 504 },
  { bas: 504, haut: 420 },
  { bas: 420, haut: 344 },
]

/** Ailes — demi-largeur comprise entre le corps central et le bord du bâti. */
const AILE_INTERIEUR = DEMI
const AILE_EXTERIEUR = 168
const AILE_NIVEAUX = [
  { bas: SOL, haut: 508 },
  { bas: 508, haut: 428 },
]

/** Décalage de main : quelques dixièmes d'unité, jamais les mêmes. */
const tremble = (index, amplitude = 0.7) =>
  ((Math.sin(index * 12.9898) * 43758.5453) % 1) * amplitude

/**
 * Une baie — le percement et ce qui l'encadre.
 *
 * Le contour est un tracé, le vitrage un aplat : à vingt-cinq unités de large,
 * un rectangle plein tracé au pinceau n'a pas de trajet et clignoterait. Le
 * contour donne le geste, l'aplat donne l'ombre du vitrage.
 *
 * `cintree` ferme la baie par un demi-cercle — c'est la fenêtre du
 * rez-de-chaussée d'une demeure, et rien ne distingue mieux celui-ci des étages
 * qu'un plein cintre. `balcon` ajoute l'appui et ses trois balustres : l'étage
 * noble est le seul à en porter, comme dans la réalité.
 */
function Baie({ x, y, largeur, hauteur, retard, cintree = false, balcon = false }) {
  const r = largeur / 2
  const bas = y + hauteur

  const contour = cintree
    ? `M ${x} ${bas} L ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + largeur} ${y + r} L ${x + largeur} ${bas}`
    : `M ${x} ${bas} L ${x} ${y} L ${x + largeur} ${y} L ${x + largeur} ${bas}`

  return (
    <g>
      <Trait d={contour} duree={0.42} retard={retard} largeur={1.1} opacite={0.8} />

      <Touche
        x={x + 1.6}
        y={y + (cintree ? r * 0.5 : 2)}
        largeur={largeur - 3.2}
        hauteur={hauteur - (cintree ? r * 0.5 : 2) - 2}
        retard={retard + 0.14}
        duree={0.42}
        opacite={0.17}
      />

      {/* Le meneau — un seul, vertical. Une baie vide se lit comme un trou ;
          partagée en deux, elle se lit comme une fenêtre. */}
      <Trait
        d={`M ${x + r} ${y + (cintree ? r * 0.5 : 2)} L ${x + r} ${bas - 2}`}
        duree={0.22}
        retard={retard + 0.24}
        largeur={0.7}
        opacite={0.45}
      />

      {/* L'appui, débordant de part et d'autre : c'est lui qui empêche la façade
          de ressembler à une grille de tableur. */}
      <Trait
        d={`M ${x - 2.4} ${bas + 1.6} L ${x + largeur + 2.4} ${bas + 1.4}`}
        duree={0.22}
        retard={retard + 0.2}
        largeur={1}
        opacite={0.55}
      />

      {balcon ? (
        <g>
          <Trait
            d={`M ${x - 4} ${bas + 8} L ${x + largeur + 4} ${bas + 7.8}`}
            duree={0.24}
            retard={retard + 0.3}
            largeur={1.2}
            opacite={0.7}
          />
          {[0.25, 0.5, 0.75].map((part) => (
            <Trait
              key={part}
              d={`M ${x + largeur * part} ${bas + 1.8} L ${x + largeur * part} ${bas + 8}`}
              duree={0.16}
              retard={retard + 0.34}
              largeur={0.7}
              opacite={0.4}
            />
          ))}
        </g>
      ) : null}
    </g>
  )
}

/**
 * Une travée de baies, réparties sur la largeur d'un volume.
 *
 * `saut` retire la baie centrale — c'est ainsi que le rez-de-chaussée fait
 * place au perron sans qu'on ait à décrire sa rangée à la main.
 */
function Travee({ nombre, gauche, droite, y, hauteur, largeur, retard, cintree, balcon, saut = -1 }) {
  const portee = droite - gauche

  return Array.from({ length: nombre }, (_, rang) => {
    if (rang === saut) return null

    const part = (rang + 1) / (nombre + 1)
    const x = gauche + portee * part - largeur / 2

    return (
      <Baie
        key={rang}
        x={x}
        y={y}
        largeur={largeur}
        hauteur={hauteur}
        retard={retard + rang * 0.06}
        cintree={cintree}
        balcon={balcon}
      />
    )
  })
}

/**
 * Le toit à la Mansart — deux pentes par versant, une croupe de chaque côté,
 * une balustrade de faîtage et deux souches.
 *
 * Le brisis (la pente raide du bas) monte de la corniche à y = 300 ; le terrasson
 * (la pente douce) le prolonge jusqu'au faîtage. Aplatir l'un ou redresser
 * l'autre suffit à retomber sur un toit à deux pans ordinaire — c'est la
 * cassure, et elle seule, qui fait le toit français de demeure.
 */
function ToitMansart({ retard }) {
  const corniche = 344
  const brisis = 300
  const faite = 272
  const debord = DEMI + 10
  const epaule = DEMI - 18
  const creteDemi = 30

  return (
    <g>
      {/* La corniche, sur toute la largeur de l'avant-toit : l'assise du toit,
          et le trait le plus épais du dessin après le socle. */}
      <Trait
        d={`M ${AXE - debord} ${corniche} L ${AXE + debord} ${corniche + 0.4}`}
        duree={0.4}
        retard={retard}
        largeur={2.6}
      />

      {/* Les deux brisis, tracés du bas vers la cassure — le geste de quelqu'un
          qui monte une charpente. */}
      {[-1, 1].map((cote) => (
        <Trait
          key={`brisis${cote}`}
          d={`M ${AXE + cote * debord} ${corniche} L ${AXE + cote * epaule} ${brisis}`}
          duree={0.34}
          retard={retard + 0.1 + (cote > 0 ? 0.05 : 0)}
          largeur={2}
        />
      ))}

      {/* La ligne de bris, horizontale : sans elle les deux pentes se
          confondent et la cassure ne se voit pas. */}
      <Trait
        d={`M ${AXE - epaule} ${brisis} L ${AXE + epaule} ${brisis + 0.4}`}
        duree={0.3}
        retard={retard + 0.22}
        largeur={1.3}
        opacite={0.65}
      />

      {/* Les terrassons, jusqu'au faîtage. */}
      {[-1, 1].map((cote) => (
        <Trait
          key={`terrasson${cote}`}
          d={`M ${AXE + cote * epaule} ${brisis} L ${AXE + cote * creteDemi} ${faite}`}
          duree={0.3}
          retard={retard + 0.28 + (cote > 0 ? 0.04 : 0)}
          largeur={1.7}
        />
      ))}

      <Trait
        d={`M ${AXE - creteDemi} ${faite} L ${AXE + creteDemi} ${faite + 0.3}`}
        duree={0.26}
        retard={retard + 0.38}
        largeur={1.6}
      />

      {/* Deux œils-de-bœuf sur le brisis, écartés de l'axe : centrés, ils
          tomberaient sous la balustrade. */}
      {[-1, 1].map((cote) => {
        const x = AXE + cote * 46
        return (
          <g key={`oeil${cote}`}>
            <Trait
              d={`M ${x} ${brisis + 12} A 9 8 0 1 1 ${x - 0.1} ${brisis + 12}`}
              duree={0.34}
              retard={retard + 0.44 + (cote > 0 ? 0.05 : 0)}
              largeur={1.1}
              opacite={0.75}
            />
            <Touche
              x={x - 6}
              y={brisis + 15}
              largeur={12}
              hauteur={10}
              retard={retard + 0.56}
              duree={0.3}
              opacite={0.15}
              rx={5}
            />
          </g>
        )
      })}

      {/* La balustrade de faîtage — le détail de demeure par excellence : un
          toit couronné n'est plus une couverture, c'est une terrasse. */}
      <g>
        <Trait
          d={`M ${AXE - creteDemi + 2} ${faite - 9} L ${AXE + creteDemi - 2} ${faite - 8.8}`}
          duree={0.24}
          retard={retard + 0.5}
          largeur={1.1}
          opacite={0.7}
        />
        {[-2, -1, 0, 1, 2].map((rang) => {
          const x = AXE + rang * 11
          return (
            <Trait
              key={`balustre${rang}`}
              d={`M ${x} ${faite - 0.5} L ${x} ${faite - 9}`}
              duree={0.16}
              retard={retard + 0.54 + Math.abs(rang) * 0.03}
              largeur={0.8}
              opacite={0.45}
            />
          )
        })}
      </g>

      {/* Les souches, posées en dernier : elles dépassent le faîtage, et rien ne
          doit être tracé par-dessus. Leur assise suit la pente du terrasson —
          une souche posée à hauteur constante flotterait d'un côté et
          s'enfoncerait de l'autre. */}
      {[-1, 1].map((cote) => {
        const ecart = 62
        const x = AXE + cote * ecart
        const t = (ecart - creteDemi) / (epaule - creteDemi)
        const yAssise = faite + t * (brisis - faite)

        return (
          <g key={`souche${cote}`}>
            <Trait
              d={`M ${x - 6} ${yAssise} L ${x - 6} ${yAssise - 24} L ${x + 6} ${yAssise - 24} L ${x + 6} ${yAssise + 3}`}
              duree={0.3}
              retard={retard + 0.62 + (cote > 0 ? 0.04 : 0)}
              largeur={1.5}
              opacite={0.85}
            />
            <Trait
              d={`M ${x - 8.5} ${yAssise - 24} L ${x + 8.5} ${yAssise - 24.4}`}
              duree={0.18}
              retard={retard + 0.72}
              largeur={1.3}
              opacite={0.8}
            />
          </g>
        )
      })}
    </g>
  )
}

/**
 * Un niveau du corps central : son plancher, ses deux montants, sa travée.
 *
 * Le plancher est tracé en premier, les montants ensuite : c'est l'ordre dans
 * lequel on le dessinerait — on pose l'assise, puis on monte les murs.
 */
function Niveau({ niveau, index, retard }) {
  const { bas, haut } = niveau
  const d = tremble(index)
  const socle = index === 0

  return (
    <g>
      <Trait
        d={`M ${AXE - DEMI + d} ${bas} L ${AXE + DEMI - d} ${bas + d * 0.4 - 0.2}`}
        duree={0.3}
        retard={retard}
        largeur={socle ? 2.4 : 1.2}
        opacite={socle ? 1 : 0.55}
      />

      {/* Les montants, verticaux. Une façade monte droit ; tracés obliques d'un
          niveau à l'autre, les étages accumuleraient leurs pentes et la maison
          prendrait l'allure d'un tronc de pyramide. */}
      {[-1, 1].map((cote) => (
        <Trait
          key={cote}
          d={`M ${AXE + cote * (DEMI + d * 0.4)} ${bas} L ${AXE + cote * (DEMI - d * 0.3)} ${haut}`}
          duree={0.42}
          retard={retard + 0.06 + (cote > 0 ? 0.04 : 0)}
          largeur={socle ? 2.6 : 2.1}
        />
      ))}

      {/* Les chaînes d'angle — deux courtes horizontales à chaque montant, en
          quinconce. Trois traits par côté suffisent à faire lire de la pierre
          de taille là où il n'y aurait qu'un mur. */}
      {[-1, 1].map((cote) =>
        [0.2, 0.45, 0.7].map((part) => {
          const y = bas - (bas - haut) * part
          return (
            <Trait
              key={`chaine${cote}-${part}`}
              d={`M ${AXE + cote * DEMI} ${y} L ${AXE + cote * (DEMI - 9)} ${y - 0.2}`}
              duree={0.16}
              retard={retard + 0.3 + part * 0.2}
              largeur={0.7}
              opacite={0.3}
            />
          )
        }),
      )}
    </g>
  )
}

/**
 * Une aile — deux niveaux et son toit en croupe, du côté indiqué.
 *
 * Elle se dessine après le corps central et son mur intérieur n'est pas tracé :
 * une aile est adossée, pas posée à côté. Le toit déborde de six unités vers
 * l'extérieur et rejoint le corps central de l'autre.
 */
function Aile({ cote, retard }) {
  const interieur = AXE + cote * AILE_INTERIEUR
  const exterieur = AXE + cote * AILE_EXTERIEUR
  const gauche = Math.min(interieur, exterieur)
  const droite = Math.max(interieur, exterieur)
  const debord = cote * 6

  return (
    <g>
      {AILE_NIVEAUX.map((niveau, index) => (
        <g key={niveau.bas}>
          <Trait
            d={`M ${interieur} ${niveau.bas} L ${exterieur} ${niveau.bas + 0.4}`}
            duree={0.3}
            retard={retard + index * 0.24}
            largeur={index === 0 ? 2.2 : 1.1}
            opacite={index === 0 ? 1 : 0.5}
          />
          <Trait
            d={`M ${exterieur} ${niveau.bas} L ${exterieur - cote * 0.5} ${niveau.haut}`}
            duree={0.4}
            retard={retard + 0.06 + index * 0.24}
            largeur={2.2}
          />
          <Travee
            nombre={2}
            gauche={gauche}
            droite={droite}
            y={niveau.haut + (niveau.bas - niveau.haut) * 0.22}
            hauteur={(niveau.bas - niveau.haut) * 0.5}
            largeur={22}
            retard={retard + 0.2 + index * 0.24}
            cintree={index === 0}
          />
        </g>
      ))}

      {/* Le toit en croupe de l'aile : plus bas que celui du corps central, et
          c'est tout l'intérêt — deux toits à la même hauteur donneraient un
          bâtiment unique très long, pas une demeure à ailes. */}
      <Trait
        d={`M ${interieur} 428 L ${exterieur + debord} 428.4`}
        duree={0.3}
        retard={retard + 0.5}
        largeur={2.2}
      />
      <Trait
        d={`M ${exterieur + debord} 428 L ${exterieur - cote * 16} 394`}
        duree={0.3}
        retard={retard + 0.58}
        largeur={1.8}
      />
      <Trait
        d={`M ${exterieur - cote * 16} 394 L ${interieur} 392`}
        duree={0.3}
        retard={retard + 0.66}
        largeur={1.6}
      />

      {/* Une lucarne sur le rampant, décalée vers l'extérieur. */}
      <Trait
        d={`M ${exterieur - cote * 40} 424 L ${exterieur - cote * 40} 410 L ${exterieur - cote * 32} 404 L ${exterieur - cote * 24} 410 L ${exterieur - cote * 24} 424`}
        duree={0.32}
        retard={retard + 0.76}
        largeur={1}
        opacite={0.7}
      />
      <Touche
        x={Math.min(exterieur - cote * 38, exterieur - cote * 26)}
        y={412}
        largeur={12}
        hauteur={11}
        retard={retard + 0.86}
        duree={0.3}
        opacite={0.16}
      />
    </g>
  )
}

/**
 * Le perron — quatre colonnes, un entablement, un fronton, et la porte
 * derrière.
 *
 * C'est la pièce qui coûte le moins de traits et rapporte le plus : une porte
 * percée dans une façade donne une maison, la même porte sous un portique donne
 * une demeure. Les colonnes sont tracées du sol vers le haut, dans l'ordre où on
 * les planterait.
 */
function Perron({ retard }) {
  const hautColonne = 512
  const entablement = 504
  const fronton = 480

  return (
    <g>
      {/* La porte, en premier : elle est au fond, le portique passe devant. */}
      <Trait
        d={`M ${AXE - 15} ${SOL} L ${AXE - 15} ${SOL - 46} Q ${AXE} ${SOL - 70} ${AXE + 15} ${SOL - 46} L ${AXE + 15} ${SOL}`}
        duree={0.5}
        retard={retard}
        largeur={1.7}
      />
      <Touche
        x={AXE - 12}
        y={SOL - 60}
        largeur={24}
        hauteur={60}
        retard={retard + 0.14}
        duree={0.5}
        opacite={0.15}
      />
      <Trait
        d={`M ${AXE} ${SOL - 44} L ${AXE} ${SOL - 2}`}
        duree={0.2}
        retard={retard + 0.3}
        largeur={0.8}
        opacite={0.45}
      />

      {/* Les quatre colonnes. Les deux extérieures sont un peu plus épaisses :
          à cette échelle c'est ce qui tient lieu de perspective. */}
      {[-40, -22, 22, 40].map((ecart, rang) => (
        <Trait
          key={ecart}
          d={`M ${AXE + ecart} ${SOL} L ${AXE + ecart + 0.5} ${hautColonne}`}
          duree={0.34}
          retard={retard + 0.36 + rang * 0.05}
          largeur={Math.abs(ecart) > 20 ? 2 : 1.5}
        />
      ))}

      <Trait
        d={`M ${AXE - 48} ${entablement} L ${AXE + 48} ${entablement + 0.4}`}
        duree={0.3}
        retard={retard + 0.6}
        largeur={2.2}
      />
      <Trait
        d={`M ${AXE - 48} ${entablement} L ${AXE} ${fronton} L ${AXE + 48} ${entablement}`}
        duree={0.45}
        retard={retard + 0.68}
        largeur={1.8}
      />

      {/* Les marches, hachurées : elles ancrent la maison au sol au lieu de la
          laisser posée dessus. */}
      {[0, 1, 2].map((rang) => (
        <Trait
          key={rang}
          d={`M ${AXE - 52 - rang * 7} ${SOL + 2 + rang * 4} L ${AXE + 52 + rang * 7} ${SOL + 1.6 + rang * 4}`}
          duree={0.3}
          retard={retard + 0.8 + rang * 0.08}
          largeur={1.2}
          opacite={0.5}
        />
      ))}
    </g>
  )
}

/**
 * Un cyprès — le seul élément végétal du dessin, et il tient la composition.
 *
 * Deux d'entre eux, aux extrémités, encadrent la demeure et lui donnent son
 * échelle : sans repère végétal, une façade symétrique peut aussi bien mesurer
 * dix mètres que quarante.
 */
function Cypres({ x, hauteur, retard }) {
  const cime = SOL - hauteur
  // Un dixième de la hauteur en demi-largeur, et le renflement placé au tiers
  // bas : un cyprès est un fuseau lesté vers le sol. Les deux flancs ne sont pas
  // symétriques — mêmes cotes de part et d'autre, et l'arbre devient une amande.
  const demi = hauteur * 0.1
  const pointe = x - demi * 0.14

  return (
    <g>
      {/* Le tronc, court : il n'en dépasse presque rien, mais sans lui l'arbre
          est posé sur le sol au lieu d'y être planté. */}
      <Trait
        d={`M ${x} ${SOL} L ${x + 0.5} ${SOL - hauteur * 0.07}`}
        duree={0.2}
        retard={retard}
        largeur={1.6}
      />

      {/* Le flanc gauche, du pied à la cime, en un seul geste. */}
      <Trait
        d={`M ${x - demi * 0.25} ${SOL - hauteur * 0.02} C ${x - demi * 1.08} ${SOL - hauteur * 0.28}, ${x - demi * 0.72} ${SOL - hauteur * 0.66}, ${pointe} ${cime}`}
        duree={0.75}
        retard={retard + 0.1}
        largeur={1.3}
      />
      {/* Et le droit, aux cotes volontairement différentes. */}
      <Trait
        d={`M ${x + demi * 0.3} ${SOL - hauteur * 0.02} C ${x + demi * 0.92} ${SOL - hauteur * 0.33}, ${x + demi * 0.82} ${SOL - hauteur * 0.7}, ${pointe} ${cime}`}
        duree={0.75}
        retard={retard + 0.18}
        largeur={1.3}
      />

      {/* Le feuillage — de courtes obliques en chevron, serrées vers la cime.
          C'est ce qui distingue un cyprès d'un fuseau vide : la matière se voit
          au bord, pas au milieu. */}
      {[0.18, 0.3, 0.42, 0.54, 0.66, 0.78].map((part, rang) => {
        const y = SOL - hauteur * part
        // La touffe se rétracte avec la hauteur, comme le fuseau qui la porte.
        const etalement = demi * (1 - part * 0.75)
        return (
          <g key={part}>
            <Trait
              d={`M ${x - etalement * 0.9} ${y} q ${etalement * 0.5} ${-5} ${etalement * 0.95} ${-1.5}`}
              duree={0.22}
              retard={retard + 0.55 + rang * 0.07}
              largeur={0.7}
              opacite={0.4}
            />
            <Trait
              d={`M ${x + etalement * 0.9} ${y - 6} q ${-etalement * 0.5} ${4} ${-etalement * 0.95} ${2}`}
              duree={0.22}
              retard={retard + 0.6 + rang * 0.07}
              largeur={0.7}
              opacite={0.32}
            />
          </g>
        )
      })}
    </g>
  )
}

/**
 * Cadence de construction.
 *
 * Le sol, les trois niveaux du corps central, le toit, les ailes, le perron,
 * les cyprès : la scène est achevée un peu après la troisième seconde. C'est la
 * contrainte de l'écran d'adresse — elle doit être finie quand le regard revient
 * sur le champ de saisie, et une ouverture qui dure plus de quatre secondes
 * retarde l'utilisateur au lieu de l'accueillir.
 */
const RETARD_NIVEAU_S = 0.3
const PAS_NIVEAU_S = 0.26
const RETARD_TOIT_S = RETARD_NIVEAU_S + NIVEAUX.length * PAS_NIVEAU_S + 0.1
const RETARD_AILE_S = RETARD_TOIT_S + 0.35
const RETARD_PERRON_S = RETARD_AILE_S + 0.8
const RETARD_CYPRES_S = RETARD_PERRON_S + 0.5

export function MaisonEncre({ className = '', titre }) {
  return (
    <svg
      viewBox={VUE}
      className={className}
      role="img"
      aria-label={titre ?? 'Dessin à l’encre d’une demeure de prestige en cours de construction'}
      // Centré dans son cadre, et non calé en bas : le dessin est posé en fond
      // d'écran, centré sur le titre, et c'est sa masse qui doit l'être — un
      // ancrage bas le ferait glisser vers le pied de la page dès que le cadre
      // change de proportions.
      preserveAspectRatio="xMidYMid meet"
    >
      {/* La ligne d'horizon, posée avant tout le reste : c'est le sol d'où la
          maison sort. Volontairement pas droite, et prolongée bien au-delà du
          bâti — un sol qui s'arrête aux murs n'est pas un sol. */}
      <Trait
        d={`M -34 ${SOL + 6} C 90 ${SOL + 3}, 280 ${SOL + 9}, 434 ${SOL + 4}`}
        duree={0.9}
        retard={0.1}
        largeur={1.3}
        opacite={0.4}
      />

      {NIVEAUX.map((niveau, index) => (
        <Niveau
          key={niveau.bas}
          niveau={niveau}
          index={index}
          retard={RETARD_NIVEAU_S + index * PAS_NIVEAU_S}
        />
      ))}

      {/* Les travées du corps central. Le rez-de-chaussée saute sa baie
          centrale : le perron y prend la place. L'étage noble est le seul à
          porter des balcons. */}
      <Travee
        nombre={5}
        gauche={AXE - DEMI}
        droite={AXE + DEMI}
        y={520}
        hauteur={54}
        largeur={26}
        retard={RETARD_NIVEAU_S + 0.36}
        cintree
        saut={2}
      />
      <Travee
        nombre={5}
        gauche={AXE - DEMI}
        droite={AXE + DEMI}
        y={436}
        hauteur={50}
        largeur={26}
        retard={RETARD_NIVEAU_S + PAS_NIVEAU_S + 0.36}
        balcon
      />
      <Travee
        nombre={5}
        gauche={AXE - DEMI}
        droite={AXE + DEMI}
        y={360}
        hauteur={40}
        largeur={22}
        retard={RETARD_NIVEAU_S + 2 * PAS_NIVEAU_S + 0.36}
      />

      <ToitMansart retard={RETARD_TOIT_S} />

      <Aile cote={-1} retard={RETARD_AILE_S} />
      <Aile cote={1} retard={RETARD_AILE_S + 0.12} />

      <Perron retard={RETARD_PERRON_S} />

      <Cypres x={-12} hauteur={224} retard={RETARD_CYPRES_S} />
      <Cypres x={412} hauteur={206} retard={RETARD_CYPRES_S + 0.15} />

      {/* Ombre portée sur la face gauche du corps central — quelques hachures
          obliques, le minimum pour que le volume se lise. Posées en dernier :
          une ombre se met une fois le dessin en place. */}
      {[0.04, 0.09, 0.14].map((part, rang) => {
        const x = AXE - DEMI + 2 * DEMI * part
        return (
          <Trait
            key={part}
            d={`M ${x} ${SOL - 8} L ${x - 6} 356`}
            duree={0.5}
            retard={RETARD_CYPRES_S + 0.3 + rang * 0.06}
            largeur={0.6}
            opacite={0.12}
          />
        )
      })}
    </svg>
  )
}
