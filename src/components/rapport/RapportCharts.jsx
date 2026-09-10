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

const MARINE = '#12294A'
const CORAIL = '#D24B3E'

/**
 * Barres verticales — historique des ventes, population aux recensements.
 *
 * L'échelle part de zéro et non du minimum de la série : sur des volumes de
 * ventes, une base tronquée transforme une variation de 5 % en un doublement
 * apparent. C'est le genre de raccourci graphique qu'un avis de valeur ne peut
 * pas se permettre.
 */
export function Barres({ points, hauteur = 132, accentDernier = true, legende }) {
  if (!points || points.length === 0) return null

  const max = Math.max(...points.map((p) => p.valeur), 1)
  const largeur = 100 / points.length

  return (
    <figure className="mt-1">
      <div
        role="img"
        aria-label={legende ?? points.map((p) => `${p.annee} : ${p.label}`).join(', ')}
        className="flex items-end gap-2"
        style={{ height: `${hauteur}px` }}
      >
        {points.map((point, index) => {
          const dernier = index === points.length - 1
          const part = Math.max((point.valeur / max) * 100, 2)

          return (
            <div key={point.annee} className="flex h-full flex-1 flex-col justify-end" style={{ maxWidth: `${largeur * 1.6}%` }}>
              <span className="mb-1.5 text-center font-mono text-[0.56rem] text-marine/55">
                {point.label}
              </span>
              <span
                aria-hidden="true"
                className="block w-full rounded-t-[3px]"
                style={{
                  height: `${part}%`,
                  backgroundColor: accentDernier && dernier ? CORAIL : MARINE,
                  opacity: accentDernier && dernier ? 1 : 0.18 + (index / points.length) * 0.5,
                }}
              />
              <span className="mt-1.5 text-center font-mono text-[0.56rem] uppercase tracking-micro text-marine/40">
                {point.annee}
              </span>
            </div>
          )
        })}
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
