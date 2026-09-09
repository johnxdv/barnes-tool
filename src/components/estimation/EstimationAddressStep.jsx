import { useEffect, useState } from 'react'
import { ArrowLeft, Building2, Check, Home, TreeDeciduous } from 'lucide-react'
import { AddressAutocomplete } from './AddressAutocomplete'
import { GrowingIcons } from '../ui/GrowingIcons'

/**
 * Immeuble, maison puis arbre : trois échelles du bâti qui poussent du sol
 * l'une après l'autre, en boucle — décor d'ouverture de l'étape adresse.
 * Délais négatifs décalés d'un bon tiers du cycle (`animate-grow-from-ground`,
 * 4,8 s) pour que la pousse de chacun s'enchaîne sans jamais se synchroniser.
 */
const GROWING_ICONS = [
  { Icon: Building2, delay: 0 },
  { Icon: Home, delay: -1.6 },
  { Icon: TreeDeciduous, delay: -3.2 },
]

/**
 * Délai entre le choix dans la liste et le passage à la carte. Assez court pour
 * rester ressenti comme immédiat, assez long pour que la pastille « Adresse
 * confirmée » soit vue : sans elle, l'écran changerait sans que l'utilisateur
 * sache ce qui a été retenu.
 */
const HANDOFF_DELAY_MS = 550

/**
 * Étape 2 — saisie de l'adresse du bien.
 *
 * Choisir une proposition suffit : aucune validation supplémentaire n'est
 * demandée, `onConfirm` enchaîne sur l'étape carte. Une adresse sans
 * coordonnées ne peut pas être cartographiée — cas théorique avec la BAN, mais
 * l'écran reste alors sur la confirmation plutôt que d'ouvrir une carte vide.
 */
export function EstimationAddressStep({ onBack, onConfirm }) {
  const [address, setAddress] = useState(null)

  const mappable =
    address !== null && Number.isFinite(address.lat) && Number.isFinite(address.lon)

  useEffect(() => {
    if (!mappable) return undefined

    const timer = setTimeout(() => onConfirm?.(address), HANDOFF_DELAY_MS)
    return () => clearTimeout(timer)
  }, [address, mappable, onConfirm])

  return (
    <div className="w-full max-w-xl">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="group mb-8 inline-flex touch-manipulation items-center gap-2 font-mono text-[0.7rem] uppercase tracking-micro text-ink/45 transition-colors hover:text-ink"
        >
          <ArrowLeft
            className="h-4 w-4 transition-transform duration-300 ease-plan group-hover:-translate-x-1"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Retour
        </button>
      ) : null}

      <GrowingIcons icons={GROWING_ICONS} className="mb-6 h-16 text-brass" iconClassName="h-14 w-14" />

      <h1 className="text-center font-display text-[1.75rem] font-semibold leading-tight text-ink sm:text-[2.1rem]">
        Où se situe votre bien&nbsp;?
      </h1>
      <p className="mx-auto mt-4 max-w-md text-center text-base leading-relaxed text-ink/55">
        Commencez à saisir l’adresse, puis choisissez-la dans la liste.
      </p>

      <div className="mt-8">
        <AddressAutocomplete onSelect={setAddress} autoFocus />
      </div>

      {address ? (
        <div
          role="status"
          className="mt-6 flex items-start gap-3 rounded-xl border border-bottle/20 bg-bottle/5 px-4 py-4 text-left sm:px-5"
        >
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bottle">
            <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden="true" />
          </span>
          <span>
            <span className="block font-mono text-[0.62rem] uppercase tracking-micro text-bottle">
              Adresse confirmée
            </span>
            <span className="mt-1.5 block text-[0.95rem] leading-relaxed text-ink/75">{address.label}</span>
          </span>
        </div>
      ) : null}

      {address && !mappable ? (
        <p role="status" className="mt-4 text-center text-base text-ink/45">
          Cette adresse n’est pas localisable sur la carte. Essayez une adresse voisine.
        </p>
      ) : null}
    </div>
  )
}
