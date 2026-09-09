/**
 * Rangée d'icônes qui poussent du sol l'une après l'autre, en boucle continue.
 *
 * `icons` : liste de `{ Icon, delay }` — `delay` en secondes, négatif pour
 * démarrer le cycle déjà entamé (même convention que `figure-forming` dans
 * `BuildingConfirmModal`), ce qui donne l'effet de croissance décalée d'une
 * icône à l'autre sans minuterie JS. Tout repose sur `opacity`/`transform` :
 * composite GPU, aucun reflow.
 */
export function GrowingIcons({ icons, className = '', iconClassName = 'h-8 w-8' }) {
  return (
    <div className={`relative flex items-end justify-center gap-5 overflow-hidden ${className}`}>
      {icons.map(({ Icon, delay = 0 }, index) => (
        <Icon
          key={index}
          className={`animate-grow-from-ground will-change-transform ${iconClassName}`}
          style={{ animationDelay: `${delay}s`, transformOrigin: 'bottom center' }}
          strokeWidth={1.5}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
