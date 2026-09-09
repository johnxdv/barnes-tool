import { useId } from 'react'

/**
 * Logo IA du parcours : histogramme ascendant surmonté d'une flèche de
 * tendance, repris du pictogramme de marque IMMOVIA (barres dégradées Brass,
 * silhouette blanche en négatif sur la flèche pour la détacher des barres
 * qu'elle traverse). Tracé au format Lucide (viewBox 24, fond transparent)
 * pour s'insérer sans réglage partout où l'étincelle/l'icône maison servait
 * jusqu'ici d'identité visuelle « IA » de l'outil.
 *
 * Le dégradé des barres est fixe (teintes Brass de la charte) ; `className`
 * ne colore donc que le tracé de la flèche via `currentColor`, comme pour les
 * autres pictogrammes du design system.
 */
export function GrowthArrowIcon({ className = '' }) {
  const gradientId = useId()

  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5E3BC" />
          <stop offset="100%" stopColor="#B08D57" />
        </linearGradient>
      </defs>

      {/* Histogramme ascendant */}
      <rect x="2" y="15" width="3" height="6.5" rx="0.9" fill={`url(#${gradientId})`} />
      <rect x="7" y="12" width="3" height="9.5" rx="0.9" fill={`url(#${gradientId})`} />
      <rect x="12" y="8.5" width="3" height="13" rx="0.9" fill={`url(#${gradientId})`} />
      <rect x="17" y="5" width="3" height="16.5" rx="0.9" fill={`url(#${gradientId})`} />

      {/* Flèche de tendance — halo blanc en dessous pour se détacher des
          barres qu'elle traverse, tracé teinté au-dessus. */}
      <g strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" stroke="#fff" strokeWidth="4.2" />
        <polyline points="16 7 22 7 22 13" stroke="#fff" strokeWidth="4.2" />
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" stroke="currentColor" strokeWidth="2.1" />
        <polyline points="16 7 22 7 22 13" stroke="currentColor" strokeWidth="2.1" />
      </g>
    </svg>
  )
}
