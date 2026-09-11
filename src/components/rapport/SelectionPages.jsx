import { useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Check, Printer, X } from 'lucide-react'

/**
 * Choix des pages, juste avant l'export.
 *
 * Un avis de valeur ne se remet pas toujours entier. Le vendeur d'un studio en
 * centre-ville n'a que faire de la page des budgets par typologie ; un mandat
 * pressé se présente parfois sur trois feuilles. Jusqu'ici, l'agent imprimait
 * les treize pages et retirait les feuilles à la main — ce qui laisse une
 * pagination trouée sur ce qu'il reste.
 *
 * La fenêtre s'ouvre sur le bouton d'export plutôt que de vivre en permanence
 * dans la barre d'outils : le moment où l'on décide de ce qu'on imprime est
 * celui où l'on imprime, pas celui où l'on relit. Tout y est coché par défaut —
 * la sélection est une soustraction délibérée, jamais une case oubliée.
 *
 * Rien n'est appliqué en différé : décocher retire immédiatement la page du
 * document derrière la fenêtre, grisée et signalée. On voit ce qu'on enlève
 * avant de valider, et l'on peut le remettre.
 */
export function SelectionPages({ pages, exclues, onChange, onFermer, onImprimer }) {
  const dialogRef = useRef(null)
  const retenues = pages.filter((page) => exclues[page.id] !== true)

  // Échap referme, comme partout ailleurs dans le parcours. La mise au point
  // part sur la fenêtre : sans cela, elle resterait sur le bouton d'export, et
  // la tabulation continuerait de parcourir le rapport derrière le voile.
  useEffect(() => {
    dialogRef.current?.focus()

    const auClavier = (event) => {
      if (event.key === 'Escape') onFermer()
    }
    window.addEventListener('keydown', auClavier)
    return () => window.removeEventListener('keydown', auClavier)
  }, [onFermer])

  const basculer = (id) => onChange({ ...exclues, [id]: exclues[id] !== true })

  const toutCocher = (valeur) =>
    onChange(valeur ? {} : Object.fromEntries(pages.map((page) => [page.id, true])))

  return (
    <div
      data-outil="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/70 p-5 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) onFermer()
      }}
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Choix des pages à inclure dans le PDF"
        tabIndex={-1}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-[0_30px_80px_-20px_rgba(16,20,28,0.6)] focus:outline-none"
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-marine/10 px-5 py-4">
          <div>
            <p className="font-mono text-[0.58rem] uppercase tracking-micro text-corail">
              Avant l’export
            </p>
            <h2 className="mt-1.5 font-display text-[1.15rem] font-semibold leading-tight text-marine">
              Pages à inclure
            </h2>
          </div>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-lg text-marine/35 transition-colors hover:bg-marine/5 hover:text-marine"
          >
            <X className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
        </header>

        {/* La liste défile, l'en-tête et le pied restent : sur un écran bas,
            le bouton d'impression ne doit jamais sortir du champ. */}
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {pages.map((page, index) => {
            const retenue = exclues[page.id] !== true

            return (
              <li key={page.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={retenue}
                  onClick={() => basculer(page.id)}
                  className="flex w-full touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-marine/[0.04]"
                >
                  <span
                    aria-hidden="true"
                    className={[
                      'flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded border transition-colors duration-200',
                      retenue
                        ? 'border-marine bg-marine text-white'
                        : 'border-marine/25 bg-white text-transparent',
                    ].join(' ')}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>

                  <span
                    className={[
                      'min-w-0 flex-1 text-[0.85rem] leading-snug transition-colors',
                      retenue ? 'text-marine' : 'text-marine/35 line-through',
                    ].join(' ')}
                  >
                    {page.label}
                  </span>

                  {/* Le rang dans la liste complète, pas dans le document
                      produit : c'est un repère pour retrouver la page à
                      l'écran, et il ne doit pas se renuméroter sous les doigts
                      de l'agent à chaque case décochée. */}
                  <span className="shrink-0 font-mono text-[0.58rem] uppercase tracking-micro text-marine/25">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <footer className="shrink-0 border-t border-marine/10 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[0.58rem] uppercase tracking-micro text-marine/40">
              {retenues.length} page{retenues.length > 1 ? 's' : ''} sur {pages.length}
            </span>
            <button
              type="button"
              onClick={() => toutCocher(retenues.length !== pages.length)}
              className="font-mono text-[0.58rem] uppercase tracking-micro text-marine/45 underline-offset-4 transition-colors hover:text-corail hover:underline"
            >
              {retenues.length === pages.length ? 'Tout décocher' : 'Tout cocher'}
            </button>
          </div>

          <motion.button
            type="button"
            onClick={onImprimer}
            disabled={retenues.length === 0}
            whileTap={{ scale: retenues.length === 0 ? 1 : 0.98 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={[
              'mt-3 flex w-full touch-manipulation items-center justify-center gap-2 rounded-xl px-5 py-3.5 font-mono text-[0.66rem] uppercase tracking-micro transition-colors',
              retenues.length === 0
                ? 'cursor-not-allowed bg-marine/10 text-marine/30'
                : 'bg-brass text-ink hover:bg-brass/90',
            ].join(' ')}
          >
            <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
            {retenues.length === 0
              ? 'Aucune page sélectionnée'
              : `Générer le PDF — ${retenues.length} page${retenues.length > 1 ? 's' : ''}`}
          </motion.button>

          <p className="mt-2.5 text-center text-[0.68rem] leading-snug text-marine/40">
            Les pages décochées restent affichées, grisées, et ne sont pas imprimées.
          </p>
        </footer>
      </motion.div>
    </div>
  )
}
