import { useMemo } from 'react'
import { ArrowLeft, Pencil, Printer } from 'lucide-react'
import { RapportEdition, useEdition } from './Edition'
import {
  PageAcquereur,
  PageBudgets,
  PageCommodites,
  PageComparables,
  PageCouverture,
  PageDescription,
  PageEstimation,
  PageHistorique,
  PageLocalisation,
  PageMarche,
  PageQuartier,
} from './RapportPages'
import { construireModele } from '../../lib/rapportModele'

/**
 * Le rapport d'estimation — onze pages, modifiables sur place, imprimables en
 * A4.
 *
 * Dernière étape du parcours : l'analyse a produit un montant, le formulaire a
 * recueilli les caractéristiques, `api/rapport.js` a assemblé le secteur. Il ne
 * reste qu'à mettre tout cela en page — et à laisser l'agent le corriger.
 *
 * Trois choses se jouent ici, et une seule est visible :
 *
 *  - **Le modèle d'affichage** est reconstruit à chaque rendu
 *    (`construireModele`), à partir des seules données sources. Il est pur : à
 *    entrées égales, sorties égales.
 *  - **Les corrections** vivent à côté, dans `RapportEdition`, et priment
 *    toujours. C'est ce qui permet au premier d'être recalculé sans risque —
 *    un rendu de plus n'efface jamais une relecture.
 *  - **L'impression** ne passe par aucune conversion : `window.print()` sur le
 *    même arbre, avec une feuille de style dédiée (voir `@media print` dans
 *    `index.css`). Aucune librairie PDF, donc aucun second rendu à maintenir en
 *    phase avec le premier — ce qui s'imprime est, au pixel près, ce qui a été
 *    relu.
 */
export function RapportView({ address, selection, price, characteristics, rapport, onRestart }) {
  const modele = useMemo(
    () => construireModele({ address, selection, price, characteristics, rapport }),
    [address, selection, price, characteristics, rapport],
  )

  return (
    <RapportEdition>
      <div className="w-full">
        <BarreOutils onRestart={onRestart} />

        {/* Le fond sombre et l'espacement entre feuilles n'existent qu'à
            l'écran : à l'impression, la page devient la feuille. */}
        <div className="rapport-pages mt-6 flex flex-col items-center gap-6">
          <PageCouverture couverture={modele.couverture} />
          <PageLocalisation localisation={modele.localisation} numero={2} />
          <PageDescription description={modele.description} numero={3} />
          <PageCommodites commodites={modele.commodites} numero={4} />
          <PageQuartier quartier={modele.quartier} numero={5} />
          <PageMarche marche={modele.marche} numero={6} />
          <PageBudgets budgets={modele.budgets} numero={7} />
          <PageHistorique historique={modele.historique} numero={8} />
          <PageComparables comparables={modele.comparables} numero={9} />
          <PageEstimation estimation={modele.estimation} marche={modele.marche} numero={10} />
          <PageAcquereur acquereur={modele.acquereur} numero={11} />
        </div>
      </div>
    </RapportEdition>
  )
}

/**
 * Barre d'outils du rapport — hors document.
 *
 * Elle est `data-outil`, comme tous les éléments d'interface disséminés dans
 * les pages : la feuille d'impression les fait disparaître d'un seul sélecteur.
 * Rien de ce qui sert à fabriquer le rapport ne doit se retrouver dedans.
 */
function BarreOutils({ onRestart }) {
  const { nombreCorrections } = useEdition()

  return (
    <div
      data-outil="true"
      className="sticky top-4 z-30 mx-auto flex w-full max-w-[52rem] flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-ink/85 px-4 py-3 backdrop-blur"
    >
      <button
        type="button"
        onClick={onRestart}
        className="group inline-flex touch-manipulation items-center gap-2 font-mono text-[0.66rem] uppercase tracking-micro text-stone/50 transition-colors hover:text-stone"
      >
        <ArrowLeft
          className="h-4 w-4 transition-transform duration-300 ease-plan group-hover:-translate-x-1"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        Nouvelle estimation
      </button>

      <div className="flex items-center gap-4">
        {/* Le compteur est le seul retour donné sur l'édition : sans lui, une
            correction saisie puis perdue de vue ne se distingue pas d'une
            valeur d'origine. */}
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-micro text-stone/35"
          aria-live="polite"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          {nombreCorrections === 0
            ? 'Cliquez sur une valeur pour la corriger'
            : `${nombreCorrections} correction${nombreCorrections > 1 ? 's' : ''}`}
        </span>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex touch-manipulation items-center gap-2 rounded-lg bg-brass px-4 py-2.5 font-mono text-[0.66rem] uppercase tracking-micro text-ink transition-colors hover:bg-brass/90"
        >
          <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Générer le PDF
        </button>
      </div>
    </div>
  )
}
