import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Printer } from 'lucide-react'
import { RapportEdition, useEdition } from './Edition'
import {
  PageAcquereur,
  PageAgence,
  PageBudgets,
  PageCommodites,
  PageComparables,
  PageCouverture,
  PageDescription,
  PageEstimation,
  PageHistorique,
  PageLocalisation,
  PageMarche,
  PagePhotos,
  PageQuartier,
} from './RapportPages'
import { SelectionPages } from './SelectionPages'
import { construireModele } from '../../lib/rapportModele'

/**
 * Le rapport d'estimation — treize pages, modifiables sur place, imprimables en
 * A4, et choisies une à une avant l'export.
 *
 * Dernière étape du parcours : l'analyse a produit un montant, le formulaire a
 * recueilli les caractéristiques et les photos, `api/rapport.js` a assemblé le
 * secteur. Il ne reste qu'à mettre tout cela en page — et à laisser l'agent le
 * corriger, puis décider de ce qu'il imprime.
 *
 * Quatre choses se jouent ici, et une seule est visible :
 *
 *  - **Le modèle d'affichage** est reconstruit à chaque rendu
 *    (`construireModele`), à partir des seules données sources. Il est pur : à
 *    entrées égales, sorties égales.
 *  - **Les corrections** vivent à côté, dans `RapportEdition`, et priment
 *    toujours. C'est ce qui permet au premier d'être recalculé sans risque —
 *    un rendu de plus n'efface jamais une relecture.
 *  - **La sélection des pages** vit ici, dans `exclues`. Une page décochée
 *    reste à l'écran, grisée et signalée — comme une ligne retirée d'un
 *    tableau (voir `rapport-masque`) — et disparaît de l'impression. C'est le
 *    même parti pris que partout ailleurs dans ce rapport : rien n'est
 *    supprimé, tout est réversible, et ce qui ne s'imprimera pas se voit.
 *  - **L'impression** ne passe par aucune conversion : `window.print()` sur le
 *    même arbre, avec une feuille de style dédiée (voir `@media print` dans
 *    `index.css`). Aucune librairie PDF, donc aucun second rendu à maintenir en
 *    phase avec le premier — ce qui s'imprime est, au pixel près, ce qui a été
 *    relu.
 */
export function RapportView({
  address,
  selection,
  price,
  ajustements,
  characteristics,
  rapport,
  onRestart,
}) {
  const modele = useMemo(
    () => construireModele({ address, selection, price, ajustements, characteristics, rapport }),
    [address, selection, price, ajustements, characteristics, rapport],
  )

  /**
   * Les pages du document, dans l'ordre, et ce qu'elles s'appellent dans la
   * liste de sélection.
   *
   * Une seule liste, d'où sortent à la fois le rendu et les cases à cocher :
   * deux énumérations parallèles finiraient par diverger, et l'agent cocherait
   * une page pour en imprimer une autre.
   *
   * `disponible` écarte la page des photos quand il n'y en a aucune. Elle ne
   * s'affiche pas, et ne figure pas non plus dans la liste — proposer de
   * décocher une page qui n'existe pas ne veut rien dire.
   */
  const pages = useMemo(
    () => [
      {
        id: 'couverture',
        label: 'Couverture',
        rendu: () => <PageCouverture couverture={modele.couverture} />,
      },
      {
        id: 'localisation',
        label: 'Localisation du bien',
        rendu: (numero) => <PageLocalisation localisation={modele.localisation} numero={numero} />,
      },
      {
        id: 'description',
        label: 'Description et caractéristiques',
        rendu: (numero) => <PageDescription description={modele.description} numero={numero} />,
      },
      {
        id: 'photos',
        label: 'Photos du bien',
        disponible: modele.photos !== null,
        rendu: (numero) => <PagePhotos photos={modele.photos} numero={numero} />,
      },
      {
        id: 'commodites',
        label: 'Commodités à proximité',
        rendu: (numero) => <PageCommodites commodites={modele.commodites} numero={numero} />,
      },
      {
        id: 'quartier',
        label: 'Profil du quartier',
        rendu: (numero) => <PageQuartier quartier={modele.quartier} numero={numero} />,
      },
      {
        id: 'marche',
        label: 'Statistiques du secteur',
        rendu: (numero) => <PageMarche marche={modele.marche} numero={numero} />,
      },
      {
        id: 'budgets',
        label: 'Budgets moyens par typologie',
        rendu: (numero) => <PageBudgets budgets={modele.budgets} numero={numero} />,
      },
      {
        id: 'historique',
        label: 'Historique des ventes',
        rendu: (numero) => <PageHistorique historique={modele.historique} numero={numero} />,
      },
      {
        id: 'comparables',
        label: 'Ventes comparables',
        rendu: (numero) => <PageComparables comparables={modele.comparables} numero={numero} />,
      },
      {
        id: 'estimation',
        label: 'Estimation de valeur',
        rendu: (numero) => (
          <PageEstimation estimation={modele.estimation} marche={modele.marche} numero={numero} />
        ),
      },
      {
        id: 'acquereur',
        label: 'Profil de l’acquéreur',
        rendu: (numero) => <PageAcquereur acquereur={modele.acquereur} numero={numero} />,
      },
      {
        id: 'agence',
        label: 'Notre agence',
        rendu: (numero) => <PageAgence agence={modele.agence} numero={numero} />,
      },
    ].filter((page) => page.disponible !== false),
    [modele],
  )

  // Pages écartées de l'export, par identifiant. Tout est coché au départ : la
  // sélection est une soustraction, et ce sens-là compte — un agent qui ouvre
  // la fenêtre et la referme sans rien toucher doit obtenir le rapport complet.
  const [exclues, setExclues] = useState({})
  const [choixOuvert, setChoixOuvert] = useState(false)

  // L'impression est déclenchée au rendu suivant, pas dans le gestionnaire du
  // bouton : la fermeture de la fenêtre de sélection et le retrait des pages
  // décochées sont des changements d'état, que React n'a pas encore appliqués
  // au moment du clic. Imprimer là imprimerait la page telle qu'elle était.
  const [impressionDemandee, setImpressionDemandee] = useState(false)

  useEffect(() => {
    if (!impressionDemandee) return
    setImpressionDemandee(false)
    window.print()
  }, [impressionDemandee])

  const retenues = pages.filter((page) => exclues[page.id] !== true)

  // Le numéro imprimé sur chaque feuille est son rang dans le document
  // effectivement produit, pas dans la liste complète : décocher la page des
  // budgets ne doit pas laisser un trou entre le 6 et le 8. La couverture
  // compte dans la numérotation sans l'afficher — elle est la page 1.
  let rang = 0

  return (
    <RapportEdition>
      <div className="w-full">
        <BarreOutils
          onRestart={onRestart}
          pages={pages}
          retenues={retenues.length}
          onExporter={() => setChoixOuvert(true)}
        />

        {/* Le fond sombre et l'espacement entre feuilles n'existent qu'à
            l'écran : à l'impression, la page devient la feuille. */}
        <div className="rapport-pages mt-6 flex flex-col items-center gap-6">
          {pages.map((page) => {
            const exclue = exclues[page.id] === true
            if (!exclue) rang += 1

            return (
              <div
                key={page.id}
                className={`rapport-feuille relative flex w-full justify-center ${
                  exclue ? 'rapport-exclue' : ''
                }`}
              >
                {exclue ? (
                  <span
                    data-outil="true"
                    className="absolute -top-3 z-10 rounded-full bg-corail px-3 py-1 font-mono text-[0.55rem] uppercase tracking-micro text-white shadow-lg"
                  >
                    Exclue du PDF
                  </span>
                ) : null}
                {/* Une page exclue ne reçoit pas de numéro : elle n'en aura
                    aucun dans le document, et en afficher un ferait mentir la
                    pagination des pages voisines. */}
                {page.rendu(exclue ? null : rang)}
              </div>
            )
          })}
        </div>
      </div>

      {choixOuvert ? (
        <SelectionPages
          pages={pages}
          exclues={exclues}
          onChange={setExclues}
          onFermer={() => setChoixOuvert(false)}
          onImprimer={() => {
            setChoixOuvert(false)
            setImpressionDemandee(true)
          }}
        />
      ) : null}
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
function BarreOutils({ onRestart, pages, retenues, onExporter }) {
  const { nombreCorrections } = useEdition()
  const toutes = retenues === pages.length

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
            valeur d'origine. Il dit aussi, le cas échéant, qu'une page a été
            écartée — c'est la seule trace qui subsiste une fois la fenêtre de
            sélection refermée et la page sortie du champ de vision. */}
        <span
          className="inline-flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-micro text-stone/35"
          aria-live="polite"
        >
          <Pencil className="h-3 w-3" strokeWidth={1.75} aria-hidden="true" />
          {nombreCorrections === 0
            ? 'Cliquez sur une valeur pour la corriger'
            : `${nombreCorrections} correction${nombreCorrections > 1 ? 's' : ''}`}
          {toutes ? '' : ` — ${retenues} page${retenues > 1 ? 's' : ''} sur ${pages.length}`}
        </span>

        <button
          type="button"
          onClick={onExporter}
          className="inline-flex touch-manipulation items-center gap-2 rounded-lg bg-brass px-4 py-2.5 font-mono text-[0.66rem] uppercase tracking-micro text-ink transition-colors hover:bg-brass/90"
        >
          <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Générer le PDF
        </button>
      </div>
    </div>
  )
}
