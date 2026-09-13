import { LogoBarnes } from '../ui/LogoBarnes'
import { ChampModifiable, NON_RENSEIGNE } from './Edition'

/**
 * Habillage commun aux pages du rapport — et le seul endroit où se décide ce
 * qui fait qu'une page « est » une page.
 *
 * À l'écran, chaque page est une feuille posée dans le parcours, à la
 * proportion d'un A4. À l'impression, elle en devient une : la feuille de style
 * dédiée lui donne ses 210 × 297 mm et force la coupe après chacune (voir
 * `@media print` dans `index.css`). Rien n'est mis en page deux fois — c'est le
 * même arbre qui s'affiche et qui s'imprime, ce qui est la seule façon de
 * garantir que l'agent imprime ce qu'il a relu.
 *
 * ── Le fond ───────────────────────────────────────────────────────────────
 *
 * `bg-papier`, soit #F5F5F5 : le `--grey-50` de barnes-provence-littoral.com,
 * relevé sur le site même. C'est le fond de toutes les pages, couverture
 * comprise — le document doit se lire comme une page du site, et non comme un
 * imprimé blanc portant le même logo.
 *
 * La couverture n'a donc plus son aplat bleu marine. C'était, dans le document
 * précédent, le seul endroit où un fond différent subsistait : elle garde sa
 * composition (mention, adresse, chapeau, date) mais sur le même papier que le
 * reste, en encre sur gris clair.
 *
 * Ce fond tient à l'impression grâce au `print-color-adjust: exact` posé dans
 * `index.css` ; sans lui, les navigateurs le supprimeraient pour économiser
 * l'encre et rendraient au rapport le blanc dont on cherche à le sortir.
 *
 * Le reste de l'identité vient de la même relève : Prata pour les titres,
 * Roboto pour tout le reste, encre #3C3C3C pour la structure, rouge #B4002F
 * pour l'accent.
 */
export function PageRapport({ numero, surtitre, titre, couverture = false, children }) {
  return (
    <article
      className="rapport-page relative flex w-full max-w-[52rem] flex-col overflow-hidden bg-papier text-marine shadow-[0_18px_50px_-24px_rgba(60,60,60,0.55)]"
    >
      {/* Filet de tête, rouge Barnes — le seul élément qui traverse tout le
          document, couverture comprise. */}
      <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-barnes" />

      {/* L'écusson, en haut à droite de chaque feuille. Posé en absolu plutôt
          que dans le flux : toutes les pages n'ont pas d'en-tête — la
          couverture n'en a pas — et il doit tomber au même endroit sur les
          onze. Les décalages reprennent exactement le rembourrage de
          `.rapport-page` (voir `index.css`), ce qui l'aligne sur la marge du
          texte.

          Le `pr-16` de l'en-tête ci-dessous est sa contrepartie : sans lui, un
          titre long passerait dessous. */}
      <LogoBarnes className="absolute right-8 top-8 h-11 w-11 sm:right-11 sm:top-11 sm:h-12 sm:w-12" />

      {titre ? (
        <header className="mb-7 shrink-0 pr-16">
          {surtitre ? (
            <p className="font-mono text-[0.58rem] uppercase tracking-micro text-barnes">
              {surtitre}
            </p>
          ) : null}
          <h2 className="mt-2 font-display text-[1.6rem] leading-tight text-marine">{titre}</h2>
          <FiletTitre />
        </header>
      ) : null}

      <div className={`flex min-h-0 flex-1 flex-col ${couverture ? 'pr-16 sm:pr-20' : ''}`}>
        {children}
      </div>

      {numero ? (
        <footer className="mt-6 flex shrink-0 items-center justify-between border-t border-marine/10 pt-3 font-mono text-[0.55rem] uppercase tracking-micro text-marine/35">
          <span>Barnes — Avis de valeur</span>
          <span>{String(numero).padStart(2, '0')}</span>
        </footer>
      ) : null}
    </article>
  )
}

/**
 * Soulignement des titres de section — un court trait rouge, puis le filet
 * clair qui court jusqu'au bord.
 *
 * Les deux ensemble, plutôt que l'un ou l'autre : le trait rouge signe, le
 * filet clair sépare. Un trait rouge sur toute la largeur serait une barre et
 * pèserait sur chaque page ; un filet clair seul ne dit rien de la marque. Le
 * segment coloré fait vingt-six pixels — la longueur d'un mot court, ce qui
 * suffit à le lire comme un accent et non comme une règle.
 *
 * Posé en `flex` avec le filet en `flex-1` : les deux se rejoignent sans
 * calcul, quelle que soit la largeur de la colonne où le titre est pris.
 */
function FiletTitre({ className = 'mt-4' }) {
  return (
    <span aria-hidden="true" className={`flex items-center ${className}`}>
      <span className="block h-[2px] w-[26px] shrink-0 rounded-full bg-barnes" />
      <span className="block h-px flex-1 bg-marine/12" />
    </span>
  )
}

/** Intertitre de section à l'intérieur d'une page. */
export function Section({ titre, aparte, children, className = '' }) {
  return (
    <section className={className}>
      {titre ? (
        <div className="mb-3">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="font-mono text-[0.58rem] uppercase tracking-micro text-marine/45">
              {titre}
            </h3>
            {aparte ? (
              <span className="font-mono text-[0.55rem] uppercase tracking-micro text-marine/30">
                {aparte}
              </span>
            ) : null}
          </div>
          {/* Même signature qu'en tête de page, à l'échelle de l'intertitre :
              le trait rouge se retrouve sous chaque titre du document, et pas
              seulement sur les onze en-têtes. */}
          <FiletTitre className="mt-1.5" />
        </div>
      ) : null}
      {children}
    </section>
  )
}

/**
 * Liste de couples libellé / valeur — la forme de restitution majoritaire du
 * rapport.
 *
 * La valeur est modifiable, le libellé ne l'est pas : ce qu'on corrige sur un
 * avis de valeur, c'est un chiffre ou une mention, jamais le nom de la ligne —
 * et rendre les deux modifiables ferait deux fois plus de zones cliquables pour
 * une utilité nulle.
 */
export function ListeChamps({ champs, colonnes = 1 }) {
  return (
    <dl
      className={`grid gap-x-6 ${colonnes === 2 ? 'sm:grid-cols-2' : ''}`}
      style={{ gridAutoRows: 'min-content' }}
    >
      {champs.map((champ) => (
        <div
          key={champ.id}
          className="flex items-baseline justify-between gap-3 border-b border-marine/8 py-[0.42rem]"
        >
          <dt className="shrink-0 text-[0.76rem] leading-snug text-marine/55">{champ.label}</dt>
          <dd className="min-w-0 text-right">
            <ChampModifiable
              cle={champ.id}
              valeur={champ.valeur}
              className="font-display text-[0.92rem] font-semibold text-marine"
            />
          </dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * Chiffre mis en avant — un par bloc, jamais plus : c'est ce qui distingue une
 * page de rapport d'un tableau de bord.
 */
export function Statistique({ cle, label, valeur, note, accent = false }) {
  return (
    <div
      className={`rounded-lg border px-4 py-3.5 ${
        accent ? 'border-corail/30 bg-corail/[0.06]' : 'border-marine/12 bg-marine/[0.03]'
      }`}
    >
      <p className="font-mono text-[0.55rem] uppercase tracking-micro text-marine/45">{label}</p>
      <ChampModifiable
        cle={cle}
        valeur={valeur}
        as="p"
        className={`mt-1.5 font-display text-[1.45rem] font-semibold leading-none ${
          accent ? 'text-corail' : 'text-marine'
        }`}
      />
      {note ? <p className="mt-1.5 text-[0.68rem] leading-snug text-marine/45">{note}</p> : null}
    </div>
  )
}

/** En-tête de tableau — mono, capitales, filet bas. */
export function EnteteTableau({ colonnes }) {
  return (
    <thead>
      <tr className="border-b border-marine/20">
        {colonnes.map((colonne) => (
          <th
            key={colonne.label}
            scope="col"
            className={`pb-2 font-mono text-[0.55rem] font-normal uppercase tracking-micro text-marine/45 ${
              colonne.droite ? 'text-right' : 'text-left'
            }`}
          >
            {colonne.label}
          </th>
        ))}
      </tr>
    </thead>
  )
}

/** Cellule de tableau modifiable. */
export function CelluleModifiable({ cle, valeur, droite = false, fort = false }) {
  return (
    <td className={`py-[0.42rem] ${droite ? 'text-right' : ''}`}>
      <ChampModifiable
        cle={cle}
        valeur={valeur}
        className={
          fort
            ? 'font-display text-[0.88rem] font-semibold text-marine'
            : 'text-[0.8rem] text-marine/75'
        }
        placeholder="—"
      />
    </td>
  )
}

/**
 * Page dont le bloc de données n'a rien à montrer.
 *
 * Elle s'imprime tout de même, et c'est voulu : la structure du rapport ne doit
 * pas dépendre de ce qu'une source publie. Une page qui manque laisse penser
 * qu'on l'a retirée ; une page qui dit pourquoi elle est vide se complète à la
 * main — et le texte lui-même est modifiable.
 */
export function BlocIndisponible({ cle, message }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-marine/20 px-8 py-14 text-center">
      <ChampModifiable
        cle={cle}
        valeur={message}
        as="p"
        multiligne
        placeholder={NON_RENSEIGNE}
        className="max-w-md text-[0.82rem] leading-relaxed text-marine/45"
      />
    </div>
  )
}
