// Utilitaires de formatage — pensés pour un rendu « données techniques »
// cohérent (chiffres tabulaires, séparateurs français).

const eur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const num = new Intl.NumberFormat('fr-FR')

/**
 * Prix formaté. En location, on suffixe « /mois ».
 */
export function formatPrice(prix, typeTransaction) {
  if (prix == null) return 'Prix sur demande'
  const base = eur.format(prix)
  return typeTransaction === 'location' ? `${base} /mois` : base
}

export function formatSurface(surface) {
  if (surface == null) return '—'
  return `${num.format(surface)} m²`
}

export function formatNumber(n) {
  return num.format(n)
}

/**
 * Montant en euros, ou `null` si absent/invalide — jamais « 0 € » ni « NaN € ».
 * Au consommateur de masquer le champ concerné quand `null` est renvoyé.
 */
export function formatEuros(amount) {
  if (amount == null || Number.isNaN(Number(amount)) || Number(amount) <= 0) return null
  return eur.format(amount)
}

/**
 * Liste d'années à la française : « 2021 », « 2021 et 2022 », « 2021, 2022 et 2023 ».
 */
export function formatAnnees(annees) {
  if (!Array.isArray(annees) || annees.length === 0) return null
  if (annees.length === 1) return String(annees[0])
  return `${annees.slice(0, -1).join(', ')} et ${annees[annees.length - 1]}`
}

/**
 * Résout une photo en URL.
 * - Si la valeur est déjà une URL absolue (futur flux XML réel), on la renvoie telle quelle.
 * - Sinon on la traite comme un identifiant Unsplash et on compose une URL optimisée
 *   (format automatique, recadrage, largeur et qualité maîtrisées).
 */
export function photoUrl(photo, { w = 1200, q = 70 } = {}) {
  if (!photo) return ''
  if (photo.startsWith('http')) return photo
  return `https://images.unsplash.com/photo-${photo}?auto=format&fit=crop&w=${w}&q=${q}`
}

/**
 * srcSet responsive pour une photo Unsplash.
 */
export function photoSrcSet(photo, widths = [480, 768, 1200, 1800]) {
  if (!photo || photo.startsWith('http')) return undefined
  return widths.map((w) => `${photoUrl(photo, { w })} ${w}w`).join(', ')
}

export const DPE_SCALE = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

/**
 * Fourchette affichée à la révélation finale du prix : ± 5 % autour du montant
 * estimé, chaque borne arrondie proprement (au millier au-delà de 100 000 €, à
 * la centaine en deçà) pour ne jamais exhiber un chiffre faussement précis.
 * Renvoie `null` quand le montant est absent ou invalide.
 */
export function priceRange(amount, pct = 0.05) {
  const n = Number(amount)
  if (amount == null || !Number.isFinite(n) || n <= 0) return null

  const round = (value) => {
    const step = value >= 100000 ? 1000 : 100
    return Math.round(value / step) * step
  }

  return { low: round(n * (1 - pct)), high: round(n * (1 + pct)) }
}

/**
 * Pourcentage signé, à une décimale — « + 5,9 % », « − 6,1 % », « stable ».
 *
 * Le signe est explicite dans les deux sens : sur une page qui aligne des
 * évolutions, un « 5,9 % » sans signe se lit aussi bien comme une hausse que
 * comme le niveau atteint. Le zéro exact devient « stable » plutôt que
 * « + 0,0 % », qui ferait croire à un arrondi.
 */
export function formatPct(valeur) {
  if (valeur == null || !Number.isFinite(Number(valeur))) return null

  const n = Number(valeur)
  if (Math.abs(n) < 0.05) return 'stable'

  const signe = n > 0 ? '+' : '−'
  return `${signe} ${num.format(Math.abs(Math.round(n * 10) / 10))} %`
}

/** Distance lisible — « 320 m » en deçà du kilomètre, « 1,4 km » au-delà. */
export function formatDistance(metres) {
  if (metres == null || !Number.isFinite(Number(metres))) return null

  const m = Number(metres)
  if (m < 1000) return `${num.format(Math.round(m))} m`
  return `${num.format(Math.round(m / 100) / 10)} km`
}

const dateLongue = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const moisCourt = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' })

/** Date au long — « 10 septembre 2026 ». Accepte une chaîne ISO ou une `Date`. */
export function formatDateFr(valeur) {
  const date = valeur instanceof Date ? valeur : new Date(valeur)
  return Number.isNaN(date.getTime()) ? null : dateLongue.format(date)
}

/** Mois abrégé — « sept. 2025 ». Sert aux bornes de période. */
export function formatMois(valeur) {
  const date = valeur instanceof Date ? valeur : new Date(valeur)
  return Number.isNaN(date.getTime()) ? null : moisCourt.format(date)
}
