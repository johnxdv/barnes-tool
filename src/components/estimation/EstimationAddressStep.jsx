import { useEffect, useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { AddressAutocomplete } from './AddressAutocomplete'
import { LogoBarnes } from '../ui/LogoBarnes'
import { TourEncre } from './TourEncre'

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
    /* Deux colonnes au-delà du portable : la saisie à gauche, la tour à droite.
       Sur écran étroit, la grille retombe en une colonne et la tour disparaît —
       elle a besoin de sa hauteur pour exister, et un immeuble de six
       centimètres coincé sous un champ de formulaire n'est plus un immeuble. */
    <div className="w-full max-w-xl lg:max-w-6xl">
      <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="mx-auto w-full max-w-xl">
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

          {/* L'écusson, au-dessus du titre — à la place de la rangée d'icônes
              (immeuble, maison, arbre) qui poussaient du sol en boucle. Elles
              disaient « immobilier » ; l'écusson dit qui estime, ce qui est la
              seule chose que cet écran ait à annoncer. La tour de droite dit le
              reste, et elle le dit mieux qu'un pictogramme de quatorze pixels.

              `arrivee` lui fait tomber les quelques pixels de son entrée, et le
              sautillement prend la suite sans rupture — les deux animations
              finissent à `translateY(0)`. */}
          <LogoBarnes mouvement="saut" arrivee className="mx-auto mb-6 h-16 w-16" />

          <h1 className="text-center font-display text-[1.75rem] font-semibold leading-tight text-ink sm:text-[2.1rem]">
            Où se situe le bien&nbsp;?
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

        {/* La Tour Barnes. Elle se construit seule en trois secondes et demie,
            du socle à l'écusson, et ne rejoue pas : c'est une ouverture, pas
            une boucle de fond d'écran — un immeuble qui se redessinerait en
            continu derrière un champ de saisie deviendrait un clignotant.

            `aria-hidden` : ce que cet écran demande est écrit à gauche, et un
            lecteur d'écran n'a rien à faire d'un dessin d'immeuble. */}
        <div aria-hidden="true" className="hidden justify-center lg:flex">
          <TourEncre className="h-[76vh] max-h-[44rem] w-full" />
        </div>
      </div>
    </div>
  )
}
