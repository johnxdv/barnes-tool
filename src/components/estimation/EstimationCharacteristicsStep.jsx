import { useId, useMemo, useState } from 'react'
import { ArrowLeft, Building2, Home } from 'lucide-react'
import { GoldFrame, Shine } from '../ui/GoldFrame'

/**
 * Étape « caractéristiques » — saisie détaillée du bien, entre l'analyse et
 * (plus tard) l'affichage du prix.
 *
 * Purement déclaratif pour l'instant : le formulaire remonte ses valeurs au
 * parent via `onValidate`, rien n'est branché sur le calcul ni sur un export.
 *
 * `selection` (la sélection carte enrichie par `EstimationBuildingStep`) sert
 * uniquement à préremplir ce qui est déjà connu — type détecté, surface saisie
 * au curseur — sans jamais bloquer la saisie.
 */

const TYPE_OPTIONS = [
  { value: 'maison', label: 'Maison' },
  { value: 'appartement', label: 'Appartement' },
]

const STANDING_OPTIONS = [
  { value: 'bon-standing', label: 'Bon standing' },
  { value: 'standard', label: 'Standard' },
  { value: 'haut-standing', label: 'Haut standing' },
]

const DPE_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => ({ value: c, label: c }))

const ETAT_OPTIONS = [
  { value: 'a-renover', label: 'À rénover' },
  { value: 'bon-etat', label: 'Bon état' },
  { value: 'renove', label: 'Rénové' },
  { value: 'neuf', label: 'Neuf' },
]

/** Valeurs par défaut du formulaire, préremplies depuis la sélection carte. */
function initialValues(selection) {
  const detectedType =
    selection?.type === 'maison' || selection?.type === 'appartement' ? selection.type : 'maison'

  const surfaceFromMap = Number.isFinite(selection?.surfaceM2) ? String(selection.surfaceM2) : ''

  return {
    // Section « Votre bien »
    typeBien: detectedType,
    surfaceHabitable: surfaceFromMap,
    surfaceTerrain: '',
    surfaceTerrasse: '',
    nombrePieces: '',
    nombreChambres: '',
    nombreSallesBain: '',
    nombreSallesEau: '',
    standing: 'standard',
    classeEnergie: 'D',
    // Section « Informations sur le bâti »
    anneeConstruction: '',
    nombreNiveaux: '',
    etatGeneral: 'bon-etat',
    piscine: false,
    stationnementsExterieurs: '',
    stationnementsInterieurs: '',
  }
}

export function EstimationCharacteristicsStep({ selection, onBack, onValidate }) {
  const [values, setValues] = useState(() => initialValues(selection))

  const set = (name) => (event) => {
    const next = event?.target?.type === 'checkbox' ? event.target.checked : event.target.value
    setValues((current) => ({ ...current, [name]: next }))
  }

  const setValue = (name, value) => setValues((current) => ({ ...current, [name]: value }))

  const handleSubmit = (event) => {
    event.preventDefault()
    onValidate?.(values)
  }

  // Entrée décalée section par section — animation CSS (`animate-fade-up`,
  // neutralisée sous `prefers-reduced-motion` par le filet global) plutôt que
  // Framer Motion : le contenu ne doit jamais rester bloqué invisible si
  // l'animation n'aboutit pas.
  const sectionAnim = (index) => ({ style: { animationDelay: `${index * 0.1}s` } })

  const typeIcon = useMemo(
    () => (values.typeBien === 'appartement' ? Building2 : Home),
    [values.typeBien],
  )
  const TypeIcon = typeIcon

  return (
    <div className="w-full max-w-2xl">
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

      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-brass">
        <TypeIcon className="h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
      </div>

      <h1 className="mt-6 text-center font-display text-[1.75rem] font-semibold leading-tight text-ink sm:text-[2.1rem]">
        Les caractéristiques de votre bien
      </h1>
      <p className="mx-auto mt-4 max-w-md text-center text-base leading-relaxed text-ink/55">
        Précisez ces informations pour affiner l’estimation.
      </p>

      <form onSubmit={handleSubmit} className="mt-10 space-y-6">
        <section
          style={sectionAnim(0).style}
          className="animate-fade-up rounded-2xl border border-ink/10 bg-white px-5 py-6 shadow-[0_18px_44px_-24px_rgba(16,20,28,0.35)] sm:px-7"
        >
          <SectionTitle>Votre bien</SectionTitle>

          <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <SelectField
              label="Type de bien"
              value={values.typeBien}
              onChange={set('typeBien')}
              options={TYPE_OPTIONS}
            />
            <NumberField
              label="Surface habitable"
              unit="m²"
              value={values.surfaceHabitable}
              onChange={set('surfaceHabitable')}
            />
            <NumberField
              label="Surface du terrain"
              unit="m²"
              value={values.surfaceTerrain}
              onChange={set('surfaceTerrain')}
            />
            <NumberField
              label="Surface de la terrasse"
              unit="m²"
              value={values.surfaceTerrasse}
              onChange={set('surfaceTerrasse')}
            />
            <NumberField
              label="Nombre de pièces"
              value={values.nombrePieces}
              onChange={set('nombrePieces')}
            />
            <NumberField
              label="Nombre de chambres"
              value={values.nombreChambres}
              onChange={set('nombreChambres')}
            />
            <NumberField
              label="Salles de bain"
              value={values.nombreSallesBain}
              onChange={set('nombreSallesBain')}
            />
            <NumberField
              label="Salles d’eau"
              value={values.nombreSallesEau}
              onChange={set('nombreSallesEau')}
            />
            <SelectField
              label="Standing"
              value={values.standing}
              onChange={set('standing')}
              options={STANDING_OPTIONS}
            />
            <SelectField
              label="Classe énergie (DPE)"
              value={values.classeEnergie}
              onChange={set('classeEnergie')}
              options={DPE_OPTIONS}
            />
          </div>
        </section>

        <section
          style={sectionAnim(1).style}
          className="animate-fade-up rounded-2xl border border-ink/10 bg-white px-5 py-6 shadow-[0_18px_44px_-24px_rgba(16,20,28,0.35)] sm:px-7"
        >
          <SectionTitle>Informations sur le bâti</SectionTitle>

          <div className="mt-5 grid gap-x-5 gap-y-4 sm:grid-cols-2">
            <NumberField
              label="Année de construction"
              value={values.anneeConstruction}
              onChange={set('anneeConstruction')}
              min={1700}
              max={new Date().getFullYear()}
              placeholder="AAAA"
            />
            <NumberField
              label="Nombre de niveaux"
              value={values.nombreNiveaux}
              onChange={set('nombreNiveaux')}
            />
            <SelectField
              label="État général du bien"
              value={values.etatGeneral}
              onChange={set('etatGeneral')}
              options={ETAT_OPTIONS}
            />
            <ToggleField
              label="Piscine"
              value={values.piscine}
              onChange={(next) => setValue('piscine', next)}
            />
            <NumberField
              label="Stationnements extérieurs"
              value={values.stationnementsExterieurs}
              onChange={set('stationnementsExterieurs')}
            />
            <NumberField
              label="Stationnements intérieurs"
              value={values.stationnementsInterieurs}
              onChange={set('stationnementsInterieurs')}
            />
          </div>
        </section>

        <div
          style={sectionAnim(2).style}
          className="animate-fade-up relative mx-auto mt-2 max-w-[19rem]"
        >
          <GoldFrame className="-inset-[2px] rounded-[0.87rem]" />
          <button
            type="submit"
            className="group relative flex w-full touch-manipulation items-center justify-center overflow-hidden rounded-xl bg-ink px-5 py-4 shadow-[0_8px_20px_-10px_rgba(16,20,28,0.55),0_0_10px_-5px_rgba(176,141,87,0.7)] transition-shadow duration-300 ease-plan hover:shadow-[0_10px_24px_-10px_rgba(16,20,28,0.6),0_0_14px_-4px_rgba(176,141,87,0.85)]"
          >
            <Shine width="w-1/5" tint="via-brass/40" />
            <span className="relative font-mono text-[0.7rem] uppercase tracking-micro text-white">
              Valider
            </span>
          </button>
        </div>
      </form>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 className="font-mono text-[0.66rem] uppercase tracking-micro text-brass">{children}</h2>
  )
}

/** Habillage commun d'un champ : libellé mono au-dessus, contrôle en dessous. */
function FieldShell({ label, htmlFor, children }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="block font-mono text-[0.6rem] uppercase tracking-micro text-ink/45">
        {label}
      </span>
      {children}
    </label>
  )
}

const CONTROL_CLASS =
  'mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-3.5 py-2.5 text-[0.95rem] text-ink transition-colors duration-200 ease-plan hover:border-ink/30 focus:border-brass focus:outline-none'

function NumberField({ label, value, onChange, unit, min = 0, max, placeholder }) {
  const id = useFieldId()
  return (
    <FieldShell label={unit ? `${label} (${unit})` : label} htmlFor={id}>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`${CONTROL_CLASS} tabular-nums`}
      />
    </FieldShell>
  )
}

function SelectField({ label, value, onChange, options }) {
  const id = useFieldId()
  return (
    <FieldShell label={label} htmlFor={id}>
      <select id={id} value={value} onChange={onChange} className={CONTROL_CLASS}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

/** Interrupteur oui / non — repris du sélecteur segmenté de la fenêtre surface. */
function ToggleField({ label, value, onChange }) {
  return (
    <div className="block">
      <span className="block font-mono text-[0.6rem] uppercase tracking-micro text-ink/45">
        {label}
      </span>
      <div className="mt-1.5 flex gap-1.5 rounded-xl border border-ink/10 bg-stone/60 p-1.5">
        {[
          { key: 'oui', label: 'Oui', on: true },
          { key: 'non', label: 'Non', on: false },
        ].map((choice) => {
          const active = value === choice.on
          return (
            <button
              key={choice.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(choice.on)}
              className={[
                'flex-1 touch-manipulation rounded-lg px-3 py-2 font-mono text-[0.64rem] uppercase tracking-micro transition-colors duration-300 ease-plan',
                active ? 'bg-ink text-white shadow-sm shadow-ink/20' : 'text-ink/50 hover:text-ink',
              ].join(' ')}
            >
              {choice.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Identifiant unique pour lier `label` et son contrôle. */
function useFieldId() {
  return useId()
}
