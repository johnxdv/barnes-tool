import { useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Minus, Plus, RotateCcw } from 'lucide-react'

/**
 * Contrôles du formulaire de caractéristiques.
 *
 * Tous partagent une même règle, qui est le cœur de l'écran : `null` n'est pas
 * zéro. Un champ auquel personne n'a touché vaut `null` et l'affiche
 * — « Non renseigné », pastille creuse, illustration en veille — là où un zéro
 * délibéré (« aucun stationnement ») s'affiche comme un vrai chiffre. Le
 * rapport final pourra donc taire ce qu'on ignore au lieu d'annoncer 0.
 *
 * Aucune couleur n'est écrite ici : chaque contrôle lit `--accent` et
 * `--accent-from`, posés par la colonne qui l'accueille. Le même bouton est
 * marine à gauche et corail à droite, sans une classe de plus.
 */

/** Libellé de l'état vide, partagé par tous les contrôles. */
const VIDE = 'Non renseigné'

/** Ressort commun aux retours au doigt — court, sans rebond mou. */
const TAP = { type: 'spring', stiffness: 500, damping: 30 }

/**
 * Carte d'un champ : libellé, valeur en vis-à-vis, illustration, contrôle.
 *
 * L'illustration s'éteint quand le champ est vide plutôt que de disparaître :
 * la carte garde sa hauteur, la colonne ne saute pas à la première saisie.
 *
 * L'arrivée de la carte est la seule animation de l'écran à ne pas passer par
 * Framer Motion : c'est `animate-fade-up`, décalé par la colonne. Une animation
 * pilotée par une boucle JavaScript se fige dans un onglet en arrière-plan, et
 * l'on reviendrait alors sur un formulaire resté invisible — le reste du
 * parcours suit déjà cette règle. Les interactions, elles, sont toutes en
 * Framer Motion : personne ne clique dans un onglet caché.
 */
function FieldCard({ label, value, filled, onReset, illustration, illustrationHeight, children }) {
  const reduce = useReducedMotion()

  return (
    <div className="rounded-xl border border-ink/10 bg-white px-4 py-3.5 shadow-[0_10px_28px_-22px_rgba(16,20,28,0.5)] transition-colors duration-300 ease-plan hover:border-ink/20">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[0.58rem] uppercase tracking-micro text-ink/50">
          {label}
        </span>

        <span className="flex shrink-0 items-center gap-1.5">
          {/* La clé ne suit que l'état — renseigné ou non — et jamais la valeur
              elle-même : sur un curseur, elle changerait à chaque cran et l'on
              empilerait des dizaines de fondus croisés le temps d'un
              glissement. Le chiffre se met donc à jour sur place ; seul le
              passage du vide à une valeur s'anime. */}
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={filled ? 'valeur' : 'vide'}
              initial={{ opacity: 0, y: reduce ? 0 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : 6 }}
              transition={{ duration: 0.18 }}
              className={
                filled
                  ? 'font-display text-[1.05rem] font-semibold leading-none tabular-nums text-[color:var(--accent)]'
                  : 'font-mono text-[0.58rem] uppercase tracking-micro text-ink/30'
              }
            >
              {filled ? value : VIDE}
            </motion.span>
          </AnimatePresence>

          <ResetButton label={label} onReset={filled ? onReset : null} />
        </span>
      </div>

      {illustration ? (
        <div
          style={{ color: 'var(--accent)' }}
          className={[
            illustrationHeight,
            // Mise en veille du dessin tant que rien n'est déclaré. Simple
            // transition CSS : seize cartes à l'écran, autant de composants
            // animés en moins, et une opacité qui aboutit quoi qu'il arrive.
            'transition-opacity duration-300 ease-plan',
            filled ? 'opacity-100' : 'opacity-25',
          ].join(' ')}
        >
          {illustration}
        </div>
      ) : null}

      {children}
    </div>
  )
}

/**
 * Bouton d'effacement — le seul geste qui ramène un champ au silence.
 *
 * Il n'existe que tant qu'il y a quelque chose à effacer, et arrive en fondu
 * plutôt qu'en surgissant : posé d'un coup à côté du chiffre qu'on vient de
 * déclarer, il attirerait l'œil sur lui au lieu de la valeur. La petite taille
 * sert aux compteurs doubles, où il se glisse contre un sous-libellé.
 */
function ResetButton({ label, onReset, small = false }) {
  return (
    <AnimatePresence initial={false}>
      {onReset ? (
        <motion.button
          type="button"
          onClick={onReset}
          aria-label={`Effacer — ${label}`}
          title="Effacer"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.5 }}
          whileTap={{ scale: 0.82 }}
          transition={TAP}
          className={[
            'flex touch-manipulation items-center justify-center rounded-full text-ink/25 transition-colors hover:bg-ink/5 hover:text-ink/60',
            small ? 'h-4 w-4' : 'h-5 w-5',
          ].join(' ')}
        >
          <RotateCcw
            className={small ? 'h-2.5 w-2.5' : 'h-3 w-3'}
            strokeWidth={2}
            aria-hidden="true"
          />
        </motion.button>
      ) : null}
    </AnimatePresence>
  )
}

/**
 * Curseur d'une grandeur continue.
 *
 * `start` est la position d'attente de la pastille tant que rien n'a été
 * choisi : ouvrir tous les curseurs sur leur borne basse obligerait à traverser
 * l'échelle à chaque champ, et placerait l'année de construction en 1800. La
 * pastille s'y pose creuse et grise, la piste reste vide — la position n'est
 * qu'une invitation, jamais une valeur (`value` vaut toujours `null` tant qu'on
 * n'a pas glissé).
 */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  fineStep = 1,
  start,
  format,
  minLabel,
  maxLabel,
  illustration,
  illustrationHeight = 'mt-2 h-[4.75rem]',
}) {
  const id = useId()
  const filled = value !== null && value !== undefined
  const display = filled ? value : start
  const fill = filled ? ((value - min) / (max - min)) * 100 : 0

  // Le pas du curseur est volontairement grossier — cinq mètres, vingt-cinq —
  // pour qu'un glissement traverse l'échelle sans effort ; les deux boutons,
  // eux, avancent au mètre. Reste que le navigateur recale toujours la valeur
  // d'un `range` sur son pas : dès qu'un réglage fin la pose entre deux crans,
  // le pas de l'élément passe donc au pas fin, sans quoi la pastille sauterait
  // toute seule au cran voisin et le chiffre affiché mentirait.
  const inputStep = filled && (value - min) % step !== 0 ? fineStep : step

  const nudge = (delta) => {
    // Depuis le vide, le pas part de la position d'attente de la pastille : le
    // premier appui déclare ce qui était déjà sous les yeux, décalé d'un mètre
    // — jamais la borne basse, qu'on n'a pas demandée.
    const base = filled ? value : start
    onChange(Math.min(max, Math.max(min, base + delta)))
  }

  return (
    <FieldCard
      label={label}
      value={filled ? format(value) : null}
      filled={filled}
      onReset={() => onChange(null)}
      illustration={illustration(display)}
      illustrationHeight={illustrationHeight}
    >
      <div className="mt-1 flex items-center gap-2">
        <StepButton
          icon={Minus}
          size="sm"
          label={`Diminuer — ${label}`}
          disabled={filled && value <= min}
          onClick={() => nudge(-fineStep)}
        />

        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={inputStep}
          value={display}
          data-empty={filled ? 'false' : 'true'}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
          aria-valuetext={filled ? format(value) : VIDE}
          style={{ '--fill': `${fill}%` }}
          className="spec-slider min-w-0 flex-1"
        />

        <StepButton
          icon={Plus}
          size="sm"
          label={`Augmenter — ${label}`}
          disabled={filled && value >= max}
          onClick={() => nudge(fineStep)}
        />
      </div>

      {/* Retrait égal à un bouton et son écart (2 rem + 0,5 rem) : les bornes
          restent à l'aplomb des extrémités de la piste, pas de la carte. */}
      <div className="flex justify-between px-[2.5rem] font-mono text-[0.56rem] uppercase tracking-micro text-ink/30">
        <span>{minLabel}</span>
        <span>{maxLabel}</span>
      </div>
    </FieldCard>
  )
}

/**
 * Saisie directe d'une grandeur qu'on connaît au chiffre près.
 *
 * Une année de construction ne s'approche pas : on la sait ou on l'ignore. Sur
 * deux siècles, un curseur demanderait de viser le pixel qui vaut 1963, quand
 * quatre chiffres tapés suffisent. L'illustration reste, elle — c'est elle qui
 * fait qu'on voit ce qu'on déclare, curseur ou pas.
 *
 * La valeur n'est publiée que lorsqu'elle est plausible : « 19 », en cours de
 * frappe, ne fait pas basculer le dessin dans le premier XIXe siècle. Le reste
 * attend la sortie du champ, qui ramène alors la saisie dans ses bornes.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  start,
  placeholder,
  hint,
  illustration,
  illustrationHeight = 'mt-2 h-[4.75rem]',
}) {
  const id = useId()
  const filled = value !== null && value !== undefined
  // `null` : personne ne tape, l'affichage suit alors la valeur — ce qui suffit
  // à ce que le bouton d'effacement vide aussi le champ.
  const [draft, setDraft] = useState(null)
  const shown = draft ?? (filled ? String(value) : '')

  const handleChange = (event) => {
    const texte = event.target.value
    setDraft(texte)

    if (texte === '') {
      onChange(null)
      return
    }

    const nombre = Number(texte)
    if (Number.isInteger(nombre) && nombre >= min && nombre <= max) onChange(nombre)
  }

  const handleBlur = () => {
    const texte = draft
    setDraft(null)
    if (texte === null) return

    const nombre = Number(texte)
    if (texte.trim() === '' || !Number.isFinite(nombre)) {
      onChange(null)
      return
    }

    onChange(Math.min(max, Math.max(min, Math.round(nombre))))
  }

  return (
    <FieldCard
      label={label}
      value={filled ? String(value) : null}
      filled={filled}
      onReset={() => onChange(null)}
      illustration={illustration(filled ? value : start)}
      illustrationHeight={illustrationHeight}
    >
      <div className="mt-1 flex items-center justify-center">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={shown}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            }
          }}
          aria-label={label}
          placeholder={placeholder}
          className="spec-number w-32 rounded-xl border border-ink/12 bg-stone/40 px-3 py-2 text-center font-display text-[1.35rem] font-semibold tabular-nums text-ink outline-none transition-colors duration-200 ease-plan placeholder:font-mono placeholder:text-[0.62rem] placeholder:uppercase placeholder:tracking-micro placeholder:text-ink/25 hover:border-ink/25 focus:border-[color:var(--accent)] focus:bg-white"
        />
      </div>

      {hint ? (
        <p className="mt-1 text-center font-mono text-[0.56rem] uppercase tracking-micro text-ink/30">
          {hint}
        </p>
      ) : null}
    </FieldCard>
  )
}

/**
 * Compteur « − / + ».
 *
 * Les deux boutons ne font pas la même chose depuis l'état vide, et c'est
 * voulu : « + » donne 1 (on déclare une pièce), « − » donne 0 (on déclare
 * l'absence). Un seul geste suffit donc à dire « aucun stationnement », qui est
 * une information, sans qu'on puisse l'obtenir par inadvertance.
 */
export function StepperField({
  label,
  value,
  onChange,
  min = 0,
  max = 12,
  format,
  allowCustom = false,
  illustration,
  illustrationHeight = 'mt-2 h-14',
}) {
  const filled = value !== null && value !== undefined

  return (
    <FieldCard
      label={label}
      value={filled ? (format ? format(value) : value) : null}
      filled={filled}
      onReset={() => onChange(null)}
      // Le dessin plafonne là où le compteur s'arrête : une valeur libre plus
      // grande reste écrite en toutes lettres, mais on ne dessinera pas
      // vingt-deux lits.
      illustration={illustration(filled ? Math.min(value, max) : 0)}
      illustrationHeight={illustrationHeight}
    >
      <StepperControl label={label} value={value} onChange={onChange} min={min} max={max} />

      {allowCustom ? <CustomValue label={label} min={min} onChange={onChange} /> : null}
    </FieldCard>
  )
}

/**
 * Les deux boutons et le chiffre entre eux.
 *
 * Sorti de `StepperField` parce que les stationnements en logent deux dans une
 * même carte (`DualStepperField`) : c'est le même compteur, en plus petit.
 */
function StepperControl({ label, value, onChange, min = 0, max = 12, size = 'md' }) {
  const reduce = useReducedMotion()
  const filled = value !== null && value !== undefined
  // Sens du dernier pas : le chiffre entre par où il vient.
  const direction = useRef(1)
  const petit = size === 'sm'

  const step = (delta) => {
    direction.current = delta
    if (!filled) {
      onChange(delta > 0 ? Math.max(min, 1) : min)
      return
    }
    onChange(Math.min(max, Math.max(min, value + delta)))
  }

  const atMin = filled && value <= min
  const atMax = filled && value >= max

  return (
    <div
      className={[
        'flex items-center justify-center',
        petit ? 'mt-0.5 gap-1.5' : 'mt-1 gap-3',
      ].join(' ')}
    >
      <StepButton
        icon={Minus}
        size={size}
        label={`Diminuer — ${label}`}
        disabled={atMin}
        onClick={() => step(-1)}
      />

      <span
        className={[
          'relative flex items-center justify-center overflow-hidden',
          petit ? 'h-7 w-8' : 'h-9 w-14',
        ].join(' ')}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={filled ? value : 'vide'}
            initial={{ opacity: 0, y: reduce ? 0 : direction.current * 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduce ? 0 : direction.current * -18 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={[
              'font-display font-semibold leading-none tabular-nums',
              petit ? 'text-[1.2rem]' : 'text-[1.6rem]',
              filled ? 'text-ink' : 'text-ink/20',
            ].join(' ')}
          >
            {filled ? value : '—'}
          </motion.span>
        </AnimatePresence>
      </span>

      <StepButton
        icon={Plus}
        size={size}
        label={`Augmenter — ${label}`}
        disabled={atMax}
        onClick={() => step(1)}
      />
    </div>
  )
}

/**
 * Saisie libre, en retrait sous un compteur.
 *
 * Un appartement de quinze pièces existe, mais il ne justifie pas d'allonger le
 * compteur de tout le monde. D'où ce mot gris, fermé sur une ligne de 0,55 rem
 * : il n'ouvre son champ qu'au clic, et le compteur reste la voie normale. La
 * valeur saisie n'est pas plafonnée — c'est tout l'objet du champ.
 */
function CustomValue({ label, min, onChange }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')

  const commit = () => {
    const nombre = Number(draft)
    if (draft.trim() !== '' && Number.isFinite(nombre)) {
      onChange(Math.max(min, Math.round(nombre)))
    }
    setDraft('')
    setOpen(false)
  }

  // Le passage du mot au champ se joue à l'aller seulement : chacun des deux
  // arrive en fondu, aucun ne sort en animation. Une sortie animée devrait
  // s'achever avant que l'autre n'entre (`mode="wait"`), et le champ n'ouvrirait
  // qu'après elle — or c'est un champ qu'on vient de réclamer d'un clic, et le
  // curseur doit y être tout de suite.
  return (
    <div className="mt-1 flex h-5 items-center justify-center">
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="champ"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <input
              type="number"
              inputMode="numeric"
              min={min}
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                // Entrée valide directement — le champ vit dans un formulaire,
                // et sans cette interception la touche l'enverrait.
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commit()
                }
                if (event.key === 'Escape') {
                  setDraft('')
                  setOpen(false)
                }
              }}
              aria-label={`Valeur personnalisée — ${label}`}
              placeholder="Autre"
              className="spec-number h-5 w-[4.5rem] rounded-md border border-ink/15 bg-white px-1 text-center font-mono text-[0.62rem] tabular-nums text-ink outline-none transition-colors focus:border-[color:var(--accent)]"
            />
          </motion.div>
        ) : (
          <motion.button
            key="lien"
            type="button"
            onClick={() => setOpen(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="font-mono text-[0.55rem] uppercase tracking-micro text-ink/25 underline decoration-dotted underline-offset-2 transition-colors duration-200 hover:text-ink/60"
          >
            Autre
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Deux compteurs dans une même carte.
 *
 * Extérieurs et intérieurs sont une seule question posée deux fois : séparés en
 * deux cartes, ils se lisaient comme deux sujets et l'on comptait ses places de
 * parking à deux endroits. Ici le libellé est commun, les deux moitiés se font
 * face, et le vis-à-vis du titre porte le compte des deux.
 *
 * Chaque moitié garde son propre effacement : « zéro place couverte » et « je
 * ne sais pas » ne sont pas la même déclaration, et le « − » ne sait dire que
 * le premier.
 */
export function DualStepperField({ label, fields }) {
  const rempli = (champ) => champ.value !== null && champ.value !== undefined
  const filled = fields.some(rempli)

  return (
    <FieldCard
      label={label}
      value={fields.map((champ) => `${champ.value ?? '—'} ${champ.suffix}`).join(' · ')}
      filled={filled}
      onReset={() => fields.forEach((champ) => champ.onChange(null))}
    >
      <div className="mt-1 grid grid-cols-2 gap-2">
        {fields.map((champ) => (
          <div key={champ.label} className="rounded-lg border border-ink/10 bg-stone/30 px-1.5 py-2">
            {/* L'entretoise de gauche a la largeur du bouton d'effacement :
                le sous-libellé reste centré, qu'il soit là ou non. */}
            <div className="flex items-center justify-center gap-1">
              <span className="w-4 shrink-0" aria-hidden="true" />
              <span className="font-mono text-[0.55rem] uppercase tracking-micro text-ink/45">
                {champ.label}
              </span>
              <span className="flex w-4 shrink-0 items-center justify-center">
                <ResetButton
                  small
                  label={`${label} ${champ.label}`}
                  onReset={rempli(champ) ? () => champ.onChange(null) : null}
                />
              </span>
            </div>

            <div
              style={{ color: 'var(--accent)' }}
              className={[
                'mt-1 h-12 transition-opacity duration-300 ease-plan',
                rempli(champ) ? 'opacity-100' : 'opacity-25',
              ].join(' ')}
            >
              {champ.illustration(rempli(champ) ? Math.min(champ.value, champ.max) : 0)}
            </div>

            <StepperControl
              size="sm"
              label={`${label} ${champ.label}`}
              value={champ.value}
              onChange={champ.onChange}
              max={champ.max}
            />
          </div>
        ))}
      </div>
    </FieldCard>
  )
}

/**
 * Bouton d'un pas. 2,5 rem de côté : sous cette taille, la cible se rate au
 * pouce. En butée, il est désactivé plutôt que masqué — une commande qui
 * disparaît déplace l'autre, et le chiffre avec.
 *
 * La variante de 2 rem est réservée aux endroits où le bouton n'est pas la
 * commande principale — il flanque un curseur, ou partage une carte avec un
 * second compteur — et où la pleine taille écraserait le reste.
 */
function StepButton({ icon: Icon, label, disabled, onClick, size = 'md' }) {
  const petit = size === 'sm'

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      whileTap={disabled ? undefined : { scale: 0.86 }}
      whileHover={disabled ? undefined : { scale: 1.06 }}
      transition={TAP}
      className={[
        'flex shrink-0 touch-manipulation items-center justify-center rounded-full border border-ink/15 bg-white text-[color:var(--accent)] transition-colors duration-200 ease-plan hover:border-[color:var(--accent)] hover:bg-[color:var(--accent-tint)] disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-ink/20 disabled:hover:bg-white',
        petit ? 'h-8 w-8' : 'h-10 w-10',
      ].join(' ')}
    >
      <Icon
        className={petit ? 'h-3.5 w-3.5' : 'h-[1.05rem] w-[1.05rem]'}
        strokeWidth={2.25}
        aria-hidden="true"
      />
    </motion.button>
  )
}

/**
 * Choix segmenté — deux à quatre possibilités, toutes visibles.
 *
 * La pastille active se déplace d'une option à l'autre (`layoutId`) au lieu de
 * s'allumer et s'éteindre : le regard suit le choix, et l'on voit qu'il s'agit
 * d'un même réglage qui change de position.
 */
export function SegmentedField({ label, options, value, onChange }) {
  const groupId = useId()
  const active = options.find((option) => option.value === value)

  return (
    <FieldCard
      label={label}
      value={active?.label ?? null}
      filled={Boolean(active)}
      onReset={() => onChange(null)}
    >
      <div
        role="group"
        aria-label={label}
        className="mt-2 flex gap-1 rounded-xl border border-ink/10 bg-stone/50 p-1"
      >
        {options.map((option) => {
          const selected = option.value === value
          return (
            <motion.button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(selected ? null : option.value)}
              whileTap={{ scale: 0.95 }}
              transition={TAP}
              className={[
                'relative flex-1 touch-manipulation rounded-lg px-2 py-2 font-mono text-[0.58rem] uppercase leading-tight tracking-micro transition-colors duration-300 ease-plan',
                selected ? 'text-white' : 'text-ink/45 hover:text-ink',
              ].join(' ')}
            >
              {selected ? (
                <motion.span
                  layoutId={`${groupId}-pastille`}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-lg bg-[color:var(--accent)] shadow-sm"
                />
              ) : null}
              <span className="relative">{option.label}</span>
            </motion.button>
          )
        })}
      </div>
    </FieldCard>
  )
}

/**
 * Barre du diagnostic de performance énergétique.
 *
 * Les sept lettres sont toujours visibles, dans leurs couleurs réglementaires
 * (le dégradé vert-rouge que tout le monde reconnaît) : c'est la seule échelle
 * du formulaire que l'utilisateur a déjà en tête. Les lettres non retenues sont
 * simplement estompées — les masquer priverait le choix de son repère.
 */
export function DpeField({ label, value, onChange }) {
  const active = DPE_LETTRES.find((lettre) => lettre.id === value)

  return (
    <FieldCard
      label={label}
      value={active ? `Classe ${active.id}` : null}
      filled={Boolean(active)}
      onReset={() => onChange(null)}
    >
      <div role="group" aria-label={label} className="mt-2 flex gap-1">
        {DPE_LETTRES.map((lettre) => {
          const selected = lettre.id === value
          return (
            <motion.button
              key={lettre.id}
              type="button"
              aria-pressed={selected}
              aria-label={`Classe ${lettre.id}`}
              onClick={() => onChange(selected ? null : lettre.id)}
              whileTap={{ scale: 0.9 }}
              animate={{
                opacity: !value || selected ? 1 : 0.32,
                scale: selected ? 1.14 : 1,
                y: selected ? -2 : 0,
              }}
              transition={TAP}
              style={{ backgroundColor: lettre.fond, color: lettre.texte }}
              className="flex h-9 flex-1 touch-manipulation items-center justify-center rounded-md font-mono text-[0.72rem] font-medium shadow-sm"
            >
              {lettre.id}
            </motion.button>
          )
        })}
      </div>
    </FieldCard>
  )
}

/**
 * Les sept classes et leurs couleurs — le vert-jaune-rouge de l'étiquette
 * officielle, repris tel quel. Le texte passe à l'encre sur les fonds clairs,
 * seul endroit du formulaire où la couleur du libellé n'est pas décidée par la
 * colonne : ici, c'est la lisibilité qui commande.
 */
const DPE_LETTRES = [
  { id: 'A', fond: '#2E8B44', texte: '#FFFFFF' },
  { id: 'B', fond: '#52A83C', texte: '#FFFFFF' },
  { id: 'C', fond: '#94BF3B', texte: '#10141C' },
  { id: 'D', fond: '#F0D22A', texte: '#10141C' },
  { id: 'E', fond: '#EFA82F', texte: '#10141C' },
  { id: 'F', fond: '#E4762C', texte: '#FFFFFF' },
  { id: 'G', fond: '#D33127', texte: '#FFFFFF' },
]

/**
 * Interrupteur oui / non, avec un troisième état : rien.
 *
 * Une case à cocher ne sait pas dire « je ne sais pas » — décochée, elle
 * affirme l'absence. D'où ce commutateur : au repos il est gris et muet, le
 * premier appui déclare « Oui », les suivants font l'aller-retour, et le bouton
 * d'effacement ramène au silence.
 */
export function ToggleField({ label, value, onChange, illustration }) {
  const filled = value !== null && value !== undefined
  const on = value === true

  return (
    <FieldCard
      label={label}
      value={filled ? (on ? 'Oui' : 'Non') : null}
      filled={filled}
      onReset={() => onChange(null)}
      illustration={illustration}
      illustrationHeight="mt-2 h-14"
    >
      <div className="mt-2 flex items-center justify-center gap-3">
        <span
          className={[
            'font-mono text-[0.58rem] uppercase tracking-micro transition-colors duration-300',
            filled && !on ? 'text-ink' : 'text-ink/30',
          ].join(' ')}
        >
          Non
        </span>

        <motion.button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          onClick={() => onChange(filled ? !on : true)}
          whileTap={{ scale: 0.94 }}
          transition={TAP}
          className={[
            // La couleur de piste passe par une transition CSS, pas par Framer
            // Motion : celui-ci ne sait pas interpoler une variable CSS, et
            // `--accent` change d'une colonne à l'autre.
            'relative flex h-8 w-[3.75rem] shrink-0 touch-manipulation items-center rounded-full px-1 transition-colors duration-300 ease-plan',
            on ? 'bg-[color:var(--accent)]' : 'bg-ink/10',
          ].join(' ')}
        >
          <motion.span
            aria-hidden="true"
            animate={{ x: on ? 28 : 0, scale: filled ? 1 : 0.82 }}
            transition={{ type: 'spring', stiffness: 460, damping: 30 }}
            className={[
              'block h-6 w-6 rounded-full bg-white shadow-md',
              filled ? '' : 'border border-ink/20',
            ].join(' ')}
          />
        </motion.button>

        <span
          className={[
            'font-mono text-[0.58rem] uppercase tracking-micro transition-colors duration-300',
            on ? 'text-[color:var(--accent)]' : 'text-ink/30',
          ].join(' ')}
        >
          Oui
        </span>
      </div>
    </FieldCard>
  )
}
