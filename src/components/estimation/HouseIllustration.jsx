/**
 * Illustrations de la fenêtre de saisie de la surface — cinq silhouettes, une
 * par palier du curseur.
 *
 * Cinq dessins distincts plutôt qu'une forme unique qu'on déformerait : à
 * 800 m², ce n'est plus la même maison en plus grand, c'est un autre bâtiment.
 * Une interpolation continue aurait donné un pavillon étiré, là où le saut de
 * palier raconte quelque chose.
 *
 * Tous partagent la même `viewBox` et la même ligne de sol : au fondu enchaîné,
 * le terrain ne bouge pas, seul le bâti change. La charte ne laisse que quatre
 * teintes — murs en Ink, toitures en Brass, ouvertures en Warm Stone, végétal
 * en Bottle Green.
 */

const VIEW_BOX = '0 0 260 130'

/** Ligne de sol, identique aux cinq dessins — invisible au fondu, donc. */
function Sol() {
  return (
    <path
      d="M14 112 H246"
      className="stroke-ink"
      strokeOpacity="0.14"
      strokeWidth="2"
      strokeLinecap="round"
    />
  )
}

/** 10 à 50 m² — un volume, une porte, deux fenêtres. */
function MaisonPetite() {
  return (
    <>
      <Sol />
      <rect x="108" y="78" width="44" height="34" className="fill-ink" />
      <path d="M101 80 L130 57 L159 80 Z" className="fill-brass" />
      <rect x="124" y="94" width="13" height="18" rx="1" className="fill-stone" />
      <rect x="112" y="85" width="9" height="9" rx="1" className="fill-stone" />
      <rect x="140" y="85" width="9" height="9" rx="1" className="fill-stone" />
    </>
  )
}

/** 50 à 150 m² — le pavillon ordinaire : plus large, une souche, deux fenêtres. */
function MaisonMoyenne() {
  return (
    <>
      <Sol />
      {/* La souche est peinte avant la toiture : celle-ci la recouvre à sa base. */}
      <rect x="149" y="48" width="9" height="20" className="fill-ink" />
      <rect x="96" y="70" width="68" height="42" className="fill-ink" />
      <path d="M89 72 L130 43 L171 72 Z" className="fill-brass" />
      <rect x="122" y="88" width="16" height="24" rx="1" className="fill-stone" />
      <rect x="104" y="78" width="13" height="13" rx="1" className="fill-stone" />
      <rect x="143" y="78" width="13" height="13" rx="1" className="fill-stone" />
    </>
  )
}

/** 150 à 250 m² — un étage apparaît, et avec lui une seconde rangée d'ouvertures. */
function MaisonEtage() {
  return (
    <>
      <Sol />
      <rect x="159" y="34" width="9" height="24" className="fill-ink" />
      <rect x="86" y="56" width="88" height="56" className="fill-ink" />
      <path d="M79 58 L130 29 L181 58 Z" className="fill-brass" />
      {/* Bandeau d'étage : la seule ligne claire qui traverse la façade. */}
      <rect x="86" y="83" width="88" height="2" className="fill-brass" fillOpacity="0.55" />
      <rect x="93" y="64" width="13" height="13" rx="1" className="fill-stone" />
      <rect x="113" y="64" width="13" height="13" rx="1" className="fill-stone" />
      <rect x="137" y="64" width="13" height="13" rx="1" className="fill-stone" />
      <rect x="157" y="64" width="13" height="13" rx="1" className="fill-stone" />
      <rect x="122" y="90" width="16" height="22" rx="1" className="fill-stone" />
      <rect x="95" y="91" width="15" height="14" rx="1" className="fill-stone" />
      <rect x="150" y="91" width="15" height="14" rx="1" className="fill-stone" />
    </>
  )
}

/** 250 à 500 m² — la maison prend une aile, et le terrain autour se meuble. */
function MaisonPiscine() {
  return (
    <>
      <Sol />

      {/* Arbres placés en premier : le bâti passe devant, la profondeur se lit. */}
      <rect x="170" y="88" width="3" height="14" className="fill-ink" fillOpacity="0.7" />
      <circle cx="171.5" cy="82" r="10" className="fill-bottle" />
      <rect x="237" y="90" width="3" height="12" className="fill-ink" fillOpacity="0.7" />
      <circle cx="238.5" cy="84" r="8" className="fill-bottle" fillOpacity="0.8" />

      {/* Aile basse, puis corps principal — deux volumes, pas un bloc étiré. */}
      <rect x="134" y="78" width="28" height="34" className="fill-ink" />
      <path d="M129 80 L148 65 L167 80 Z" className="fill-brass" />
      <rect x="104" y="24" width="9" height="26" className="fill-ink" />
      <rect x="46" y="54" width="88" height="58" className="fill-ink" />
      <path d="M39 56 L90 27 L141 56 Z" className="fill-brass" />
      <rect x="46" y="81" width="88" height="2" className="fill-brass" fillOpacity="0.55" />

      <rect x="53" y="62" width="13" height="13" rx="1" className="fill-stone" />
      <rect x="73" y="62" width="13" height="13" rx="1" className="fill-stone" />
      <rect x="97" y="62" width="13" height="13" rx="1" className="fill-stone" />
      <rect x="117" y="62" width="13" height="13" rx="1" className="fill-stone" />
      <rect x="82" y="90" width="16" height="22" rx="1" className="fill-stone" />
      <rect x="55" y="90" width="15" height="14" rx="1" className="fill-stone" />
      <rect x="110" y="90" width="15" height="14" rx="1" className="fill-stone" />
      <rect x="141" y="88" width="14" height="13" rx="1" className="fill-stone" />

      {/* Bassin : margelle claire, eau en Bottle Green. */}
      <rect x="176" y="92" width="58" height="18" rx="4" className="fill-stone" />
      <rect x="179" y="95" width="52" height="12" rx="3" className="fill-bottle" fillOpacity="0.75" />
      <path
        d="M186 101 q5 -3 10 0 t10 0 t10 0"
        fill="none"
        className="stroke-stone"
        strokeOpacity="0.55"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </>
  )
}

/** 500 m² et au-delà — changement d'échelle assumé : tours, courtines, étendard. */
function Chateau() {
  return (
    <>
      <Sol />

      {/* Courtines : elles ancrent la silhouette au sol de part et d'autre. */}
      <rect x="46" y="80" width="28" height="32" className="fill-ink" />
      <rect x="186" y="80" width="28" height="32" className="fill-ink" />
      {[46, 56, 66, 186, 196, 206].map((x) => (
        <rect key={x} x={x} y="74" width="8" height="6" className="fill-ink" />
      ))}

      {/* Corps central, couronné de merlons. */}
      <rect x="96" y="58" width="68" height="54" className="fill-ink" />
      {[96, 111, 126, 141, 156].map((x) => (
        <rect key={x} x={x} y="50" width="8" height="8" className="fill-ink" />
      ))}

      {/* Tours et leurs toits en poivrière. */}
      <rect x="70" y="46" width="28" height="66" className="fill-ink" />
      <rect x="162" y="46" width="28" height="66" className="fill-ink" />
      <path d="M65 48 L84 14 L103 48 Z" className="fill-brass" />
      <path d="M157 48 L176 14 L195 48 Z" className="fill-brass" />

      {/* Étendard — le seul détail qui dépasse, et qui date le bâtiment. */}
      <path d="M176 14 V5" className="stroke-ink" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M176.5 5 L191 8.5 L176.5 12 Z" className="fill-brass" />

      {/* Porte charretière en plein cintre, et meurtrières. */}
      <path d="M119 112 V92 a11 11 0 0 1 22 0 V112 Z" className="fill-stone" />
      <path d="M130 92 V112" className="stroke-ink" strokeOpacity="0.35" strokeWidth="1.5" />
      {[
        [79, 60],
        [79, 82],
        [171, 60],
        [171, 82],
      ].map(([x, y]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x} ${y + 12} V${y + 4} a5 5 0 0 1 10 0 V${y + 12} Z`}
          className="fill-stone"
        />
      ))}
      <rect x="104" y="68" width="12" height="16" rx="1" className="fill-stone" />
      <rect x="144" y="68" width="12" height="16" rx="1" className="fill-stone" />
      <rect x="55" y="88" width="10" height="14" rx="1" className="fill-stone" />
      <rect x="195" y="88" width="10" height="14" rx="1" className="fill-stone" />
    </>
  )
}

/**
 * Paliers du curseur, du plus petit au plus grand. `max` est la borne haute
 * exclue ; le dernier palier n'en a pas — il absorbe tout ce qui dépasse, ce
 * que le curseur affiche par ailleurs « 800+ ».
 */
const TIERS = [
  { id: 'petite', max: 50, Dessin: MaisonPetite },
  { id: 'moyenne', max: 150, Dessin: MaisonMoyenne },
  { id: 'etage', max: 250, Dessin: MaisonEtage },
  { id: 'piscine', max: 500, Dessin: MaisonPiscine },
  { id: 'chateau', max: Infinity, Dessin: Chateau },
]

/**
 * Palier correspondant à une surface. Gardés privés, l'un comme l'autre : ce
 * fichier n'exporte que son composant, condition du rafraîchissement à chaud
 * de Vite — un export de données à côté le fait retomber sur un rechargement
 * complet de la page à chaque retouche d'un dessin.
 */
const tierIndexFor = (surfaceM2) => TIERS.findIndex((tier) => surfaceM2 < tier.max)

/**
 * Illustration du palier courant, en fondu enchaîné avec les autres.
 *
 * Les cinq dessins sont montés en permanence et superposés : seule leur
 * opacité change. Rien n'est monté ni démonté au franchissement d'un seuil —
 * c'est ce qui permet de traverser toute l'échelle d'un geste sans à-coup, les
 * paliers sautés se contentant de rester à zéro. `opacity` et `transform` se
 * composent sur le GPU : aucun recalcul de mise en page pendant le glissement.
 *
 * Sous `prefers-reduced-motion`, le filet CSS global ramène les transitions à
 * une durée nulle : le changement devient un remplacement net, sans fondu.
 *
 * `className` ne porte que des dimensions : la racine se pose elle-même en
 * `relative`, socle des cinq calques superposés. Lui passer un `absolute`
 * entrerait en conflit avec — et Tailwind tranchant par son propre ordre, pas
 * par celui des classes écrites, c'est `relative` qui l'emporterait. À
 * positionner par un parent, donc, jamais par cette prop.
 */
export function HouseIllustration({ surfaceM2, className = '' }) {
  const active = tierIndexFor(surfaceM2)

  return (
    <div aria-hidden="true" className={`relative ${className}`}>
      {TIERS.map(({ id, Dessin }, index) => (
        <svg
          key={id}
          viewBox={VIEW_BOX}
          role="presentation"
          className={`absolute inset-0 h-full w-full transition-[opacity,transform] duration-500 ease-plan will-change-transform ${
            index === active ? 'scale-100 opacity-100' : 'scale-[0.94] opacity-0'
          }`}
        >
          <Dessin />
        </svg>
      ))}
    </div>
  )
}
