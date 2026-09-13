/**
 * Graphiques du rapport — en SVG écrit à la main, sans librairie.
 *
 * Trois raisons, dans l'ordre d'importance :
 *
 *  1. **L'impression.** Un graphique en `<canvas>` sort de l'imprimante en
 *     basse définition quand il en sort ; en SVG, il s'imprime au trait, à la
 *     résolution du périphérique. C'est la seule contrainte non négociable
 *     d'un document destiné au papier.
 *  2. **Le poids.** Trois figures à barres et une ligne brisée ne justifient
 *     pas les cent kilo-octets d'une librairie de graphiques.
 *  3. **L'identité.** Les couleurs, les graduations et la typographie sont
 *     celles du rapport, sans avoir à défaire les valeurs par défaut d'un
 *     thème étranger.
 *
 * Chaque figure porte son `role="img"` et son `aria-label` : à la lecture
 * vocale comme à l'impression en noir et blanc, les chiffres restent lisibles
 * dans le tableau qui accompagne toujours la figure.
 */

const MARINE = '#3C3C3C'
const CORAIL = '#B4002F'

/** Hauteur des deux lignes d'étiquettes, retirée de la zone de tracé. */
const ETIQUETTES_PX = 32

/** En deçà, une barre cesse d'être visible ; au-dessus de zéro, elle doit l'être. */
const BARRE_MIN_PX = 3

/**
 * Largeur maximale d'une barre.
 *
 * ── Ce que corrige ce plafond ─────────────────────────────────────────────
 *
 * Les barres se partageaient la largeur disponible, à parts égales et sans
 * limite. Sur l'historique des ventes, qui porte une dizaine de millésimes,
 * cela donne des barres fines et une figure lisible. Sur la population aux
 * recensements, qui en porte trois, cela donnait trois pavés de cinquante
 * millimètres de large sur trente de haut, presque de la même hauteur — la
 * population d'un quartier ne double pas d'un recensement à l'autre.
 *
 * Un rectangle plus large que haut, dans un ton uni et pâle, ne se lit pas
 * comme une barre : il se lit comme un bloc de couleur, et une figure faite de
 * trois blocs de couleur se lit comme un emplacement resté vide. C'était le
 * rapport qu'on en faisait, et il était juste — ce n'était pas une figure.
 *
 * Trente-quatre pixels est la largeur d'une barre lisible : assez large pour
 * porter sa valeur en dessous, assez étroite pour être plus haute que large sur
 * toute l'échelle utile. Au-delà de huit points, le partage reprend la main et
 * le plafond ne joue plus.
 */
const BARRE_MAX_PX = 34

/**
 * Barres verticales — historique des ventes, population aux recensements.
 *
 * Trois choses distinguent cette figure d'un simple empilement de rectangles,
 * et il en faut trois : c'est ce qui manquait quand elle ne portait qu'une
 * série courte.
 *
 *  1. **Une ligne de base.** Un trait continu sous les barres, d'un bord à
 *     l'autre. C'est lui qui dit « ceci est un axe », et donc que ce qui est
 *     posé dessus est une mesure.
 *  2. **Une graduation haute**, en pointillé, au niveau du maximum de la série,
 *     avec sa valeur en clair. L'échelle cesse d'être implicite : on lit la
 *     hauteur d'une barre contre quelque chose.
 *  3. **Des barres plus hautes que larges** (voir `BARRE_MAX_PX`).
 *
 * L'échelle part de zéro et non du minimum de la série : sur des volumes de
 * ventes comme sur une population, une base tronquée transforme une variation
 * de 5 % en un doublement apparent. C'est le genre de raccourci graphique qu'un
 * avis de valeur ne peut pas se permettre — et c'est aussi pourquoi trois
 * barres presque égales *doivent* se ressembler : c'est l'information.
 *
 * ── Pourquoi les hauteurs sont en pixels, et non en pourcentage ───────────
 *
 * Elles l'étaient, et les barres sortaient vides — à l'écran par intermittence,
 * à l'impression presque toujours. La cause tenait en une ligne de CSS : une
 * hauteur en pourcentage posée sur un élément qui est aussi un enfant de boîte
 * flexible. Le pourcentage se résout sur la hauteur du conteneur, puis le
 * moteur constate que la colonne déborde — la barre pleine plus ses deux
 * étiquettes dépassent le cadre — et rétracte la barre pour rentrer. La
 * proportion affichée n'est alors plus celle des données, et une barre courte
 * peut disparaître tout à fait.
 *
 * Les hauteurs sont donc calculées ici, en pixels, sur une zone de tracé dont
 * la hauteur est connue : ce qui est dessiné est exactement ce qui a été
 * calculé, à l'écran comme sur la feuille. Les étiquettes, elles, sont sorties
 * de la zone de tracé et ne peuvent plus la comprimer.
 */
export function Barres({ points, hauteur = 132, accentDernier = true, legende }) {
  if (!points || points.length === 0) return null

  const max = Math.max(...points.map((p) => p.valeur), 1)
  const zone = Math.max(hauteur - ETIQUETTES_PX, 24)
  // L'étiquette du maximum reprend le format de la série : c'est `label` qui
  // porte le nombre déjà mis en forme (séparateurs de milliers, unité), et il
  // n'y a pas de raison d'en écrire un second ici.
  const etiquetteMax = points.find((p) => p.valeur === max)?.label ?? null

  return (
    <figure className="mt-1">
      <div
        role="img"
        aria-label={legende ?? points.map((p) => `${p.annee} : ${p.label}`).join(', ')}
      >
        {/* La graduation haute, hors de la zone de tracé : elle en marque le
            plafond sans en consommer la hauteur. */}
        {etiquetteMax ? (
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-px flex-1"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, ${MARINE}33 0 3px, transparent 3px 6px)`,
              }}
            />
            {/* L'étiquette est posée à droite, contre le bord du cadre, et non
                au départ du trait : la valeur maximale est déjà écrite au-dessus
                de la barre qui la porte, et les deux se superposeraient dès que
                cette barre est la première de la série — ce qui est le cas d'un
                quartier dont la population décline. */}
            <span className="font-mono text-[0.5rem] uppercase tracking-micro text-marine/35">
              {etiquetteMax}
            </span>
          </div>
        ) : null}

        <div className="flex items-end gap-2 border-b border-marine/25">
          {points.map((point, index) => {
            const dernier = index === points.length - 1
            const hauteurBarre =
              point.valeur > 0
                ? Math.max(Math.round((point.valeur / max) * zone), BARRE_MIN_PX)
                : 0

            return (
              <div key={point.annee} className="flex flex-1 flex-col justify-end">
                <span className="mb-1 block text-center font-mono text-[0.56rem] leading-none text-marine/55">
                  {point.label}
                </span>
                {/* La zone de tracé, de hauteur fixe : c'est elle qui garantit
                    que deux barres de la même figure se comparent, et que la
                    figure occupe la même place quelle que soit la série. */}
                <span
                  aria-hidden="true"
                  className="flex w-full items-end justify-center"
                  style={{ height: `${zone}px` }}
                >
                  <span
                    className="block w-full rounded-t-[3px]"
                    style={{
                      height: `${hauteurBarre}px`,
                      maxWidth: `${BARRE_MAX_PX}px`,
                      backgroundColor: accentDernier && dernier ? CORAIL : MARINE,
                      // Le dégradé d'opacité fait lire la série de gauche à
                      // droite. Son plancher est relevé à 0,4 : à 0,22, la
                      // première barre d'une série courte passait pour un
                      // aplat de fond plutôt que pour une donnée.
                      opacity: accentDernier && dernier ? 1 : 0.4 + (index / points.length) * 0.4,
                    }}
                  />
                </span>
              </div>
            )
          })}
        </div>

        {/* Les millésimes, sous l'axe — c'est leur place sur une figure à
            barres, et c'est ce qui fait de la ligne de base un axe plutôt
            qu'un simple filet. */}
        <div className="flex gap-2 pt-1.5">
          {points.map((point) => (
            <span
              key={point.annee}
              className="flex-1 text-center font-mono text-[0.56rem] uppercase leading-none tracking-micro text-marine/40"
            >
              {point.annee}
            </span>
          ))}
        </div>
      </div>
    </figure>
  )
}

/**
 * Ligne brisée — l'évolution des taux d'emprunt.
 *
 * Ici l'échelle ne part **pas** de zéro, à l'inverse des barres : un taux de
 * crédit se lit dans ses écarts, et une échelle partant de zéro écraserait le
 * passage de 1,15 % à 3,39 % — le fait marquant de la période — en une droite
 * presque horizontale. La graduation porte donc ses deux bornes en clair, sans
 * quoi la pente serait illisible.
 */
export function Courbe({ points, hauteur = 120, legende }) {
  if (!points || points.length < 2) return null

  const valeurs = points.map((p) => p.valeur)
  const min = Math.min(...valeurs)
  const max = Math.max(...valeurs)
  // Respiration verticale : sans elle, les points extrêmes touchent les bords
  // du cadre et le tracé paraît coupé.
  const marge = (max - min) * 0.18 || 0.2
  const bas = min - marge
  const haut = max + marge

  const L = 300
  const H = 100
  // Retrait horizontal : les pastilles des extrémités sont dessinées *sur* le
  // point, donc à cheval sur le bord du cadre. Sans ce retrait, la première et
  // la dernière sont coupées en deux — et c'est la dernière, le taux du moment,
  // que l'œil cherche en premier.
  const PAD = 4
  const x = (index) => PAD + (index / (points.length - 1)) * (L - 2 * PAD)
  const y = (valeur) => H - ((valeur - bas) / (haut - bas)) * H

  const trace = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.valeur).toFixed(1)}`)
    .join(' ')
  const aire = `${trace} L ${x(points.length - 1).toFixed(1)} ${H} L ${x(0).toFixed(1)} ${H} Z`

  return (
    <figure className="mt-1">
      <svg
        viewBox={`0 0 ${L} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={legende ?? points.map((p) => `${p.annee} : ${p.label}`).join(', ')}
        style={{ height: `${hauteur}px` }}
        className="w-full"
      >
        <defs>
          <linearGradient id="rapport-courbe" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CORAIL} stopOpacity="0.22" />
            <stop offset="100%" stopColor={CORAIL} stopOpacity="0" />
          </linearGradient>
        </defs>

        <path d={aire} fill="url(#rapport-courbe)" />
        <path
          d={trace}
          fill="none"
          stroke={CORAIL}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          // Le tracé est étiré horizontalement par `preserveAspectRatio="none"` :
          // sans cette contre-mise à l'échelle, l'épaisseur du trait le serait
          // aussi et la ligne paraîtrait plus fine en largeur qu'en hauteur.
          vectorEffect="non-scaling-stroke"
        />
        {points.map((point, index) => (
          <circle
            key={point.annee}
            cx={x(index)}
            cy={y(point.valeur)}
            r="2.4"
            fill="#ffffff"
            stroke={CORAIL}
            strokeWidth="1.4"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div className="mt-2 flex justify-between">
        {points.map((point) => (
          <span
            key={point.annee}
            className="flex-1 text-center font-mono text-[0.55rem] uppercase tracking-micro text-marine/40"
          >
            <span className="block text-[0.62rem] normal-case tracking-normal text-marine/70">
              {point.label}
            </span>
            {point.annee}
          </span>
        ))}
      </div>
    </figure>
  )
}

/**
 * Répartition en une seule barre horizontale segmentée — la part de chaque
 * typologie dans le volume de ventes du secteur.
 *
 * Préférée à un camembert : cinq parts dont trois se ressemblent ne se
 * comparent pas à l'œil sur un disque, et une barre s'imprime à l'identique
 * quelle que soit la largeur de la page.
 */
export function Repartition({ segments }) {
  const utiles = (segments ?? []).filter((s) => s.part > 0)
  if (utiles.length === 0) return null

  return (
    <figure className="mt-1">
      <div
        role="img"
        aria-label={utiles.map((s) => `${s.label} : ${s.part} %`).join(', ')}
        className="flex h-3 w-full overflow-hidden rounded-full"
      >
        {utiles.map((segment, index) => (
          <span
            key={segment.label}
            style={{
              width: `${segment.part}%`,
              backgroundColor: index === 0 ? CORAIL : MARINE,
              opacity: index === 0 ? 1 : 0.85 - index * 0.15,
            }}
          />
        ))}
      </div>

      <figcaption className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {utiles.map((segment, index) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5 text-[0.68rem] text-marine/60">
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full"
              style={{
                backgroundColor: index === 0 ? CORAIL : MARINE,
                opacity: index === 0 ? 1 : 0.85 - index * 0.15,
              }}
            />
            {segment.label}
            <span className="font-mono text-[0.62rem] text-marine/40">{segment.part} %</span>
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
