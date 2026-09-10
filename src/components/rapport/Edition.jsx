import { createContext, memo, useCallback, useContext, useMemo, useRef, useState } from 'react'

/**
 * Édition en ligne du rapport — le mécanisme qui rend chaque chiffre et chaque
 * phrase corrigeables sur place.
 *
 * Deux états cohabitent dans le rapport, et tout tient à ne jamais les
 * confondre :
 *
 *  - **Les données**, calculées par le moteur et mises en forme par
 *    `rapportModele.js`. Elles se recalculent librement, à chaque rendu.
 *  - **Les corrections**, saisies par l'agent. Elles vivent ici, dans un
 *    dictionnaire à part indexé par la clé du champ, et rien ne les écrase :
 *    un champ corrigé affiche la correction quelle que soit la donnée sous-
 *    jacente.
 *
 * L'ordre de lecture est donc toujours le même — correction d'abord, donnée
 * ensuite. C'est ce qui permet de relancer un assemblage sans perdre une heure
 * de relecture, et c'est la seule raison d'être de cette séparation.
 */

const EditionContext = createContext(null)

/**
 * Fournit le dictionnaire de corrections à tout le rapport.
 *
 * Un seul état pour tout l'arbre plutôt qu'un état par champ : c'est lui qu'on
 * voudra un jour enregistrer, exporter ou rouvrir, et un rapport corrigé doit
 * pouvoir se restituer d'un bloc.
 */
export function RapportEdition({ children }) {
  const [corrections, setCorrections] = useState({})
  // Lignes retirées par l'agent — un point fort qu'il juge hors sujet, une
  // vente comparable qui ne ressemble pas au bien. Elles ne sont pas supprimées
  // des données : elles sont masquées, et peuvent donc revenir.
  const [masques, setMasques] = useState({})
  // Lignes ajoutées à la main, comptées par liste. Le rapport n'est pas un
  // formulaire à trous : l'agent doit pouvoir écrire un argument que le moteur
  // ne pouvait pas deviner — une vue, un voisinage, une contrainte de
  // copropriété. Seul le nombre est conservé ici ; le texte de chaque ligne
  // ajoutée vit dans `corrections`, comme celui de toutes les autres.
  const [ajouts, setAjouts] = useState({})

  const definir = useCallback((cle, texte) => {
    setCorrections((actuelles) => ({ ...actuelles, [cle]: texte }))
  }, [])

  const basculerMasque = useCallback((cle) => {
    setMasques((actuels) => ({ ...actuels, [cle]: !actuels[cle] }))
  }, [])

  const ajouter = useCallback((liste) => {
    setAjouts((actuels) => ({ ...actuels, [liste]: (actuels[liste] ?? 0) + 1 }))
  }, [])

  const valeur = useCallback(
    (cle, defaut) => (cle in corrections ? corrections[cle] : defaut),
    [corrections],
  )

  const contexte = useMemo(
    () => ({
      valeur,
      definir,
      masques,
      basculerMasque,
      ajouts,
      ajouter,
      nombreCorrections: Object.keys(corrections).length,
    }),
    [valeur, definir, masques, basculerMasque, ajouts, ajouter, corrections],
  )

  return <EditionContext.Provider value={contexte}>{children}</EditionContext.Provider>
}

export function useEdition() {
  const contexte = useContext(EditionContext)
  if (!contexte) throw new Error('useEdition hors de RapportEdition')
  return contexte
}

/** Texte affiché quand ni la donnée ni l'agent n'ont rien à dire. */
export const NON_RENSEIGNE = 'Non renseigné'

/**
 * Champ modifiable sur place.
 *
 * `contentEditable` plutôt qu'un `<input>` pour une raison de mise en page : le
 * rapport est un document, pas un formulaire. Un champ de saisie y imposerait
 * sa largeur, sa hauteur de ligne et son cadre, sur onze pages qui doivent
 * s'imprimer comme du texte composé. Ici, le texte reste du texte — il se
 * justifie, se coupe, hérite de sa typographie — et ne se signale comme
 * modifiable qu'au survol.
 *
 * Le contenu est délibérément **non contrôlé** : React écrit la valeur au
 * montage, puis n'y touche plus tant qu'elle ne change pas. Un champ contrôlé
 * réécrirait le nœud de texte à chaque frappe, ce qui renvoie le curseur en
 * tête du champ — le défaut classique de `contentEditable` en React. La saisie
 * n'est donc relevée qu'à la sortie du champ (`blur`), moment où le curseur
 * n'existe plus.
 *
 * Le `memo` en dessous n'est pas une optimisation : il est ce qui empêche un
 * rendu du rapport — provoqué par la correction d'un tout autre champ — de
 * venir réécrire celui qu'on est en train de saisir.
 */
function ChampModifiableBrut({
  cle,
  valeur: defaut,
  className = '',
  as: Balise = 'span',
  multiligne = false,
  placeholder = NON_RENSEIGNE,
}) {
  const { valeur, definir } = useEdition()
  const ref = useRef(null)
  const texte = valeur(cle, defaut)
  const vide = texte == null || texte === ''
  const affiche = vide ? placeholder : texte

  const enregistrer = () => {
    const saisi = (ref.current?.textContent ?? '').replace(/\s+/g, ' ').trim()
    // Le texte de remplacement n'est pas une valeur : le laisser tel quel
    // enregistrerait « Non renseigné » comme s'il avait été écrit.
    if (saisi === affiche || (vide && saisi === placeholder)) return
    definir(cle, saisi)
  }

  const auClavier = (event) => {
    // Entrée valide et sort, comme dans un formulaire — sauf pour les champs de
    // texte long, où le retour à la ligne est légitime.
    if (event.key === 'Enter' && !multiligne) {
      event.preventDefault()
      ref.current?.blur()
    }
    // Échap abandonne la saisie en cours et rétablit l'affichage précédent.
    if (event.key === 'Escape') {
      event.preventDefault()
      if (ref.current) ref.current.textContent = affiche
      ref.current?.blur()
    }
  }

  return (
    <Balise
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      spellCheck={false}
      onBlur={enregistrer}
      onKeyDown={auClavier}
      data-modifiable="true"
      data-vide={vide ? 'true' : undefined}
      className={`rapport-modifiable ${vide ? 'rapport-modifiable-vide' : ''} ${className}`}
    >
      {affiche}
    </Balise>
  )
}

export const ChampModifiable = memo(
  ChampModifiableBrut,
  (avant, apres) =>
    avant.cle === apres.cle &&
    avant.valeur === apres.valeur &&
    avant.className === apres.className &&
    avant.placeholder === apres.placeholder,
)

/**
 * Bouton d'action propre à l'écran — masquer une ligne, en rétablir une.
 *
 * Marqué `data-outil` : c'est ce marqueur, et lui seul, que la feuille
 * d'impression cherche pour faire disparaître tout ce qui relève de l'interface
 * (voir `@media print` dans `index.css`). Un bouton oublié ici s'imprimerait au
 * milieu du rapport.
 */
export function OutilLigne({ onClick, titre, children }) {
  return (
    <button
      type="button"
      data-outil="true"
      onClick={onClick}
      title={titre}
      aria-label={titre}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-marine/30 transition-colors hover:bg-marine/10 hover:text-corail"
    >
      {children}
    </button>
  )
}
