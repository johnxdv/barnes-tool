import { useEffect, useState } from 'react'

/**
 * Suit une media query CSS depuis React. Utilisé pour distinguer un pointeur
 * fin (souris) d'un écran tactile — distinction impossible à faire de façon
 * fiable sur le seul agent utilisateur, et qui peut changer en cours de
 * session (souris branchée sur une tablette), d'où l'abonnement.
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)

    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}
