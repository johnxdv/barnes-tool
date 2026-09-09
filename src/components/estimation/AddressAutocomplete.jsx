import { useEffect, useId, useState } from 'react'
import { Loader2, MapPin, SearchX } from 'lucide-react'
import { MIN_QUERY_LENGTH, SEARCH_DEBOUNCE_MS, searchAddresses } from '../../lib/adresse'
import { useDebouncedValue } from '../../lib/useDebouncedValue'

/**
 * Champ d'adresse avec suggestions issues de la Base Adresse Nationale.
 * Motif ARIA « combobox » : navigation clavier (flèches, Entrée, Échap),
 * liste annoncée aux lecteurs d'écran.
 *
 * `onSelect` reçoit la suggestion choisie (`{ id, label }`), ou `null` dès que
 * l'utilisateur reprend la saisie — le choix précédent n'est alors plus valide.
 * Le composant ne décide rien de la suite du parcours.
 */
export function AddressAutocomplete({
  onSelect,
  placeholder = 'Entrez l’adresse de votre bien',
  autoFocus = false,
}) {
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  // 'idle' | 'loading' | 'done' | 'error'
  const [status, setStatus] = useState('idle')
  const [selectedLabel, setSelectedLabel] = useState(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [open, setOpen] = useState(false)

  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const listId = useId()
  const optionId = (index) => `${listId}-option-${index}`

  const trimmed = query.trim()
  const isSelected = trimmed === selectedLabel
  // Le temps que l'anti-rebond se déclenche, la frappe est déjà « en cours » :
  // l'indicateur apparaît immédiatement plutôt qu'après 300 ms de vide.
  const pending = trimmed.length >= MIN_QUERY_LENGTH && trimmed !== debouncedQuery.trim() && !isSelected
  const loading = status === 'loading' || pending

  useEffect(() => {
    const q = debouncedQuery.trim()

    // L'anti-rebond n'a pas encore rattrapé la saisie courante : on attend, sans
    // rien vider (les propositions précédentes restent affichées pendant la frappe).
    // Sans ce garde-fou, choisir une proposition relancerait une recherche sur
    // l'ancienne valeur — et rouvrirait la liste juste après la confirmation.
    if (q !== query.trim()) return undefined

    // Rien à chercher : sous le seuil, ou valeur déjà validée dans la liste.
    if (q.length < MIN_QUERY_LENGTH || q === selectedLabel) {
      setSuggestions([])
      setStatus('idle')
      return undefined
    }

    const controller = new AbortController()
    setStatus('loading')

    searchAddresses(q, { signal: controller.signal })
      .then((results) => {
        setSuggestions(results)
        setActiveIndex(-1)
        setStatus('done')
        setOpen(true)
      })
      .catch((error) => {
        if (error.name === 'AbortError') return
        setSuggestions([])
        setStatus('error')
      })

    return () => controller.abort()
  }, [debouncedQuery, query, selectedLabel])

  const select = (suggestion) => {
    setQuery(suggestion.label)
    setSelectedLabel(suggestion.label)
    setSuggestions([])
    setActiveIndex(-1)
    setStatus('idle')
    setOpen(false)
    onSelect?.(suggestion)
  }

  const handleChange = (event) => {
    const value = event.target.value
    setQuery(value)
    setOpen(true)

    // Reprendre la saisie invalide le choix précédent : on prévient le parent
    // pour qu'il ne reste pas sur une adresse qui n'est plus celle du champ.
    if (selectedLabel !== null) {
      setSelectedLabel(null)
      onSelect?.(null)
    }

    // Repassé sous le seuil : on vide tout de suite plutôt que d'attendre
    // l'anti-rebond, sinon la liste survit 300 ms à l'effacement.
    if (value.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setActiveIndex(-1)
      setStatus('idle')
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false)
      return
    }
    if (suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (event.key === 'Enter' && open && activeIndex >= 0) {
      event.preventDefault()
      select(suggestions[activeIndex])
    }
  }

  const showList = open && suggestions.length > 0
  const showEmpty =
    open && status === 'done' && suggestions.length === 0 && trimmed.length >= MIN_QUERY_LENGTH

  return (
    <div className="relative">
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/35 sm:left-5"
          strokeWidth={1.75}
          aria-hidden="true"
        />

        <input
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck="false"
          aria-label="Adresse du bien"
          role="combobox"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          // 16 px minimum : en deçà, iOS zoome automatiquement sur le champ.
          className="w-full rounded-xl border border-ink/15 bg-white py-4 pl-12 pr-12 text-base text-ink shadow-sm shadow-ink/5 outline-none transition-colors duration-300 ease-plan placeholder:text-ink/40 focus:border-ink/40 sm:py-5 sm:pl-14 sm:pr-14 sm:text-lg"
        />

        {loading ? (
          <Loader2
            className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-ink/35 sm:right-5"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : null}
      </div>

      {/* `onMouseDown` neutralisé : sans cela le blur du champ fermerait la
          liste avant que le clic sur une proposition ne soit enregistré. */}
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Suggestions d’adresses"
          onMouseDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-20 overflow-hidden rounded-xl border border-ink/10 bg-white shadow-xl shadow-ink/10"
        >
          {suggestions.map((suggestion, index) => (
            <li key={suggestion.id || suggestion.label} role="none">
              <button
                type="button"
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onClick={() => select(suggestion)}
                onMouseEnter={() => setActiveIndex(index)}
                className={[
                  'flex w-full touch-manipulation items-center gap-3 px-4 py-3.5 text-left text-base text-ink/80 transition-colors sm:px-5',
                  index === activeIndex ? 'bg-stone/70 text-ink' : 'bg-white',
                ].join(' ')}
              >
                <MapPin className="h-4 w-4 shrink-0 text-ink/30" strokeWidth={1.75} aria-hidden="true" />
                <span>{suggestion.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showEmpty ? (
        <p className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-20 flex items-center gap-3 rounded-xl border border-ink/10 bg-white px-4 py-3.5 text-base text-ink/55 shadow-xl shadow-ink/10 sm:px-5">
          <SearchX className="h-4 w-4 shrink-0 text-ink/30" strokeWidth={1.75} aria-hidden="true" />
          Aucune adresse ne correspond à cette recherche.
        </p>
      ) : null}

      {/* Panne réseau : message discret, la saisie reste possible. */}
      {status === 'error' ? (
        <p role="status" className="mt-3 text-center text-base text-ink/45">
          Recherche d’adresse momentanément indisponible. Réessayez dans un instant.
        </p>
      ) : null}
    </div>
  )
}
