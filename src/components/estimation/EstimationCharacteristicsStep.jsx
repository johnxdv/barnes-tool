import { Children, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Building2 } from 'lucide-react'
import { GoldFrame, Shine } from '../ui/GoldFrame'
import { HouseIllustration } from './HouseIllustration'
import {
  ChambresIllustration,
  EpoqueIllustration,
  NiveauxIllustration,
  ParkingExtIllustration,
  ParkingIntIllustration,
  PiecesIllustration,
  PiscineIllustration,
  SalleEauIllustration,
  SdbIllustration,
  TerrainIllustration,
  TerrasseIllustration,
} from './SpecIllustrations'
import {
  DpeField,
  SegmentedField,
  SliderField,
  StepperField,
  ToggleField,
} from './SpecControls'

/**
 * Étape « caractéristiques » — la seule saisie détaillée du parcours, entre
 * l'analyse et la restitution.
 *
 * Une page, deux colonnes, seize champs : le bien à gauche, le bâti à droite.
 * Rien n'est obligatoire et rien n'est prérempli — pas même depuis la sélection
 * carte, dont le type détecté n'est qu'une présomption. Un champ auquel
 * personne n'a touché reste à `null`, ce que `SpecControls` sait distinguer
 * d'un zéro déclaré ; la restitution pourra donc écrire « Non renseigné » plutôt
 * qu'un « 0 » qui affirmerait quelque chose de faux.
 *
 * Chaque champ chiffré a son curseur ou son compteur, et son illustration
 * propre (`SpecIllustrations`) : le terrain s'étend, l'immeuble monte, la
 * rangée de voitures s'allonge. C'est ce qui distingue cet écran d'une pile de
 * champs texte — on voit ce qu'on déclare pendant qu'on le déclare.
 *
 * La sélection carte n'est volontairement pas passée à cette étape : rien ici
 * n'en dépend, et s'en servir pour préremplir un champ reviendrait à faire
 * passer une présomption du moteur pour une déclaration de l'utilisateur.
 */

/**
 * Couples de couleurs des deux colonnes, repris de l'identité Barnes (rapports
 * d'estimation PDF) — mêmes valeurs que `marine` et `corail` dans
 * `tailwind.config.js`, à garder en phase.
 *
 * `accent` porte le trait, `from` l'amorce du dégradé de piste des curseurs,
 * `tint` le survol des boutons. Ils sont posés en variables CSS sur la colonne :
 * les contrôles n'écrivent aucune couleur, ils héritent de celle de leur
 * colonne.
 */
const COLONNES = {
  bien: {
    titre: 'Votre bien',
    accent: '#12294A',
    from: '#4A6B99',
    tint: 'rgba(18, 41, 74, 0.06)',
  },
  bati: {
    titre: 'Informations sur le bâti',
    accent: '#D24B3E',
    from: '#F0A192',
    tint: 'rgba(210, 75, 62, 0.07)',
  },
}

const TYPE_OPTIONS = [
  { value: 'maison', label: 'Maison' },
  { value: 'appartement', label: 'Appartement' },
]

const STANDING_OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'bon-standing', label: 'Bon standing' },
  { value: 'haut-standing', label: 'Haut standing' },
]

const ETAT_OPTIONS = [
  { value: 'a-renover', label: 'À rénover' },
  { value: 'bon-etat', label: 'Bon état' },
  { value: 'renove', label: 'Rénové' },
  { value: 'neuf', label: 'Neuf' },
]

/**
 * Bornes des curseurs.
 *
 * `start` n'est pas une valeur par défaut : c'est l'endroit où la pastille
 * attend, tant que rien n'a été déclaré. Elle est choisie médiane pour que
 * l'échelle se traverse dans les deux sens — ouvrir l'année de construction sur
 * 1800 obligerait tout le monde à parcourir deux siècles.
 */
const BORNES = {
  surfaceHabitable: { min: 10, max: 800, step: 5, start: 100 },
  surfaceTerrain: { min: 0, max: 5000, step: 25, start: 600 },
  surfaceTerrasse: { min: 0, max: 200, step: 1, start: 20 },
  anneeConstruction: { min: 1800, max: 2026, step: 1, start: 1975 },
}

/** Plafonds des compteurs — au-delà, le chiffre cesserait de vouloir dire quelque chose. */
const PLAFONDS = {
  nombrePieces: 12,
  nombreChambres: 8,
  nombreSallesBain: 6,
  nombreSallesEau: 6,
  nombreNiveaux: 10,
  stationnementsExterieurs: 8,
  stationnementsInterieurs: 8,
}

/**
 * État initial : tout à `null`. Pas un seul zéro, pas une seule présélection —
 * c'est la règle de l'écran, et elle tient dans cet objet.
 */
const VALEURS_VIDES = {
  // Colonne « Votre bien »
  typeBien: null,
  surfaceHabitable: null,
  surfaceTerrain: null,
  surfaceTerrasse: null,
  nombrePieces: null,
  nombreChambres: null,
  nombreSallesBain: null,
  nombreSallesEau: null,
  standing: null,
  classeEnergie: null,
  // Colonne « Informations sur le bâti »
  anneeConstruction: null,
  nombreNiveaux: null,
  etatGeneral: null,
  piscine: null,
  stationnementsExterieurs: null,
  stationnementsInterieurs: null,
}

const nombreFr = new Intl.NumberFormat('fr-FR')

/** Surface formatée, « + » compris quand le curseur est en butée haute. */
const surfaceLabel = (max) => (value) =>
  `${nombreFr.format(value)}${value >= max ? '+' : ''} m²`

export function EstimationCharacteristicsStep({ onBack, onValidate }) {
  const [values, setValues] = useState(VALEURS_VIDES)

  // Un seul point d'écriture : chaque contrôle reçoit `set('champ')` et rend
  // soit une valeur, soit `null` s'il a été effacé.
  const set = (name) => (next) => setValues((current) => ({ ...current, [name]: next }))

  const handleSubmit = (event) => {
    event.preventDefault()
    onValidate?.(values)
  }

  return (
    <div className="w-full max-w-5xl">
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

      <div className="animate-fade-up text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-ink text-brass">
          <Building2 className="h-7 w-7" strokeWidth={1.5} aria-hidden="true" />
        </span>

        <h1 className="mt-6 font-display text-[1.75rem] font-semibold leading-tight text-ink sm:text-[2.1rem]">
          Les caractéristiques de votre bien
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-ink/55">
          Réglez ce que vous savez, laissez le reste de côté — aucun champ n’est
          obligatoire.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-10">
        {/* `items-start` : sans lui, la colonne la plus courte s'étirerait à la
            hauteur de l'autre et son cadre enfermerait un grand vide. */}
        <div className="grid items-start gap-5 lg:grid-cols-2 lg:gap-6">
          <Colonne colonne={COLONNES.bien} delai={0.05}>
            <SegmentedField
              label="Type de bien"
              options={TYPE_OPTIONS}
              value={values.typeBien}
              onChange={set('typeBien')}
            />

            <SliderField
              label="Surface habitable"
              value={values.surfaceHabitable}
              onChange={set('surfaceHabitable')}
              {...BORNES.surfaceHabitable}
              format={surfaceLabel(BORNES.surfaceHabitable.max)}
              minLabel="10 m²"
              maxLabel="800+ m²"
              illustrationHeight="mt-1 h-[5.25rem]"
              illustration={(surface) => (
                <HouseIllustration surfaceM2={surface} className="h-full w-full" />
              )}
            />

            <SliderField
              label="Surface du terrain"
              value={values.surfaceTerrain}
              onChange={set('surfaceTerrain')}
              {...BORNES.surfaceTerrain}
              format={surfaceLabel(BORNES.surfaceTerrain.max)}
              minLabel="0 m²"
              maxLabel="5 000+ m²"
              illustration={(surface) => (
                <TerrainIllustration value={surface} max={BORNES.surfaceTerrain.max} />
              )}
            />

            <SliderField
              label="Surface de la terrasse"
              value={values.surfaceTerrasse}
              onChange={set('surfaceTerrasse')}
              {...BORNES.surfaceTerrasse}
              format={surfaceLabel(BORNES.surfaceTerrasse.max)}
              minLabel="0 m²"
              maxLabel="200+ m²"
              illustration={(surface) => (
                <TerrasseIllustration value={surface} max={BORNES.surfaceTerrasse.max} />
              )}
            />

            <StepperField
              label="Nombre de pièces"
              value={values.nombrePieces}
              onChange={set('nombrePieces')}
              max={PLAFONDS.nombrePieces}
              illustrationHeight="mt-2 h-16"
              illustration={(count) => (
                <PiecesIllustration count={count} max={PLAFONDS.nombrePieces} />
              )}
            />

            <StepperField
              label="Nombre de chambres"
              value={values.nombreChambres}
              onChange={set('nombreChambres')}
              max={PLAFONDS.nombreChambres}
              illustration={(count) => <ChambresIllustration count={count} />}
            />

            <StepperField
              label="Salles de bain"
              value={values.nombreSallesBain}
              onChange={set('nombreSallesBain')}
              max={PLAFONDS.nombreSallesBain}
              illustration={(count) => <SdbIllustration count={count} />}
            />

            <StepperField
              label="Salles d’eau"
              value={values.nombreSallesEau}
              onChange={set('nombreSallesEau')}
              max={PLAFONDS.nombreSallesEau}
              illustrationHeight="mt-2 h-16"
              illustration={(count) => <SalleEauIllustration count={count} />}
            />

            <SegmentedField
              label="Standing"
              options={STANDING_OPTIONS}
              value={values.standing}
              onChange={set('standing')}
            />

            <DpeField
              label="Classe énergie (DPE)"
              value={values.classeEnergie}
              onChange={set('classeEnergie')}
            />
          </Colonne>

          <Colonne colonne={COLONNES.bati} delai={0.15}>
            <SliderField
              label="Année de construction"
              value={values.anneeConstruction}
              onChange={set('anneeConstruction')}
              {...BORNES.anneeConstruction}
              format={(value) => String(value)}
              minLabel="1800"
              maxLabel="2026"
              illustrationHeight="mt-1 h-[5.25rem]"
              illustration={(annee) => <EpoqueIllustration value={annee} />}
            />

            <StepperField
              label="Nombre de niveaux"
              value={values.nombreNiveaux}
              onChange={set('nombreNiveaux')}
              max={PLAFONDS.nombreNiveaux}
              illustrationHeight="mt-2 h-[4.5rem]"
              illustration={(count) => <NiveauxIllustration count={count} />}
            />

            <SegmentedField
              label="État général du bien"
              options={ETAT_OPTIONS}
              value={values.etatGeneral}
              onChange={set('etatGeneral')}
            />

            <ToggleField
              label="Piscine"
              value={values.piscine}
              onChange={set('piscine')}
              illustration={<PiscineIllustration active={values.piscine === true} />}
            />

            <StepperField
              label="Stationnements extérieurs"
              value={values.stationnementsExterieurs}
              onChange={set('stationnementsExterieurs')}
              max={PLAFONDS.stationnementsExterieurs}
              illustration={(count) => <ParkingExtIllustration count={count} />}
            />

            <StepperField
              label="Stationnements intérieurs"
              value={values.stationnementsInterieurs}
              onChange={set('stationnementsInterieurs')}
              max={PLAFONDS.stationnementsInterieurs}
              illustration={(count) => <ParkingIntIllustration count={count} />}
            />
          </Colonne>
        </div>

        <div
          style={{ animationDelay: '0.35s' }}
          className="animate-fade-up relative mx-auto mt-8 max-w-[19rem]"
        >
          <GoldFrame className="-inset-[2px] rounded-[0.87rem]" />
          <motion.button
            type="submit"
            whileTap={{ scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="group relative flex w-full touch-manipulation items-center justify-center overflow-hidden rounded-xl bg-ink px-5 py-4 shadow-[0_8px_20px_-10px_rgba(16,20,28,0.55),0_0_10px_-5px_rgba(176,141,87,0.7)] transition-shadow duration-300 ease-plan hover:shadow-[0_10px_24px_-10px_rgba(16,20,28,0.6),0_0_14px_-4px_rgba(176,141,87,0.85)]"
          >
            <Shine width="w-1/5" tint="via-brass/40" />
            <span className="relative font-mono text-[0.7rem] uppercase tracking-micro text-white">
              Valider
            </span>
          </motion.button>
        </div>
      </form>
    </div>
  )
}

/**
 * Colonne de saisie : en-tête coloré, puis ses champs, révélés en cascade.
 *
 * C'est ici — et nulle part ailleurs — que la couleur est décidée. Les trois
 * variables CSS posées sur la racine descendent à tous les contrôles, ce qui
 * permet au même `StepperField` d'être marine à gauche et corail à droite sans
 * qu'aucun d'eux ne connaisse sa colonne.
 */
function Colonne({ colonne, delai, children }) {
  return (
    <section
      style={{
        '--accent': colonne.accent,
        '--accent-from': colonne.from,
        '--accent-tint': colonne.tint,
      }}
      className="animate-fade-up rounded-2xl border border-ink/10 bg-stone/40 p-3 sm:p-4"
    >
      <header className="mb-3 flex items-center gap-2.5 px-1">
        <span
          aria-hidden="true"
          className="h-6 w-1 shrink-0 rounded-full bg-[color:var(--accent)]"
        />
        <h2 className="font-mono text-[0.66rem] uppercase tracking-micro text-[color:var(--accent)]">
          {colonne.titre}
        </h2>
      </header>

      {/* Cascade d'arrivée en CSS, une carte après l'autre. Le décalage est posé
          ici plutôt que dans `FieldCard` : c'est la colonne qui connaît l'ordre
          de ses champs, la carte n'a pas à savoir son rang. */}
      <div className="space-y-3">
        {Children.map(children, (child, index) => (
          <div className="animate-fade-up" style={{ animationDelay: `${delai + index * 0.05}s` }}>
            {child}
          </div>
        ))}
      </div>
    </section>
  )
}
