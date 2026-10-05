import { useCallback, useEffect, useRef, useState } from 'react'
import { EstimationAddressStep } from './components/estimation/EstimationAddressStep'
import { EstimationBuildingStep } from './components/estimation/EstimationBuildingStep'
import { EstimationLoadingStep } from './components/estimation/EstimationLoadingStep'
import { EstimationCharacteristicsStep } from './components/estimation/EstimationCharacteristicsStep'
import { EstimationRapportStep } from './components/estimation/EstimationRapportStep'
import { RapportView } from './components/rapport/RapportView'
// EstimationResultStep n'est plus dans l'enchaînement : la révélation du prix
// et la conversation de capture qu'elle porte ont cédé la place au rapport, qui
// restitue le montant sur sa page « Estimation de valeur ». Le fichier est
// conservé — c'est le seul écran du parcours à recueillir des coordonnées, et
// rien ne l'a remplacé sur ce point.
import { EstimationIndisponibleStep } from './components/estimation/EstimationIndisponibleStep'
import { AUCUN_AJUSTEMENT, AUCUNE_DETECTION, requestEstimation } from './lib/estimation'
import { RAPPORT_VIDE, requestRapport } from './lib/rapport'

/**
 * Étapes majeures du parcours, dans l'ordre — base de la barre de progression
 * globale : adresse → bâtiment → analyse → caractéristiques → assemblage.
 *
 * Le rapport lui-même (`rapport`) n'y figure pas : il est l'aboutissement, pas
 * une étape de plus. La barre y est pleine, et disparaît à l'impression.
 *
 * L'écran de révélation du prix (`EstimationResultStep`) reste hors du
 * parcours : le montant est désormais restitué par le rapport, sur sa page
 * « Estimation de valeur ».
 */
const STAGES = ['adresse', 'batiment', 'analyse', 'caracteristiques', 'assemblage']

/** Fourchette absente — même forme que celle du serveur, bornes nulles. */
const AUCUNE_FOURCHETTE = { low: null, high: null, confiance: null }

/**
 * Outil d'estimation — parcours en écrans successifs dans une même page (aucune
 * navigation d'URL entre les étapes) : saisie de l'adresse, repérage du
 * bâtiment sur photo aérienne, analyse, saisie des caractéristiques détaillées,
 * puis restitution — un rapport de onze pages, modifiable et imprimable.
 *
 * Trois appels au serveur, à trois moments distincts :
 *
 *  - `requestEstimation` part au lancement de l'analyse et rend un premier
 *    montant (`price`), ainsi que ce que les bases savaient déjà du bien
 *    (`detection`) — la chaîne cadastre → BDNB qu'il déroule pour reconstituer
 *    la surface croise de toute façon la vocation du bâtiment et son
 *    diagnostic énergétique.
 *  - `requestEstimation` **une seconde fois**, à la validation du formulaire,
 *    avec la surface habitable que l'agent vient de déclarer et le reste des
 *    caractéristiques saisies. Le premier montant reposait sur une surface
 *    reconstituée depuis l'emprise au sol et un nombre de niveaux présumé, sur
 *    un bien dont on ne savait ni l'état ni le diagnostic ; celui-ci repose sur
 *    ce qui a été vu et déclaré, et c'est lui que le rapport retient — avec le
 *    détail des ajustements appliqués. Voir `saveCharacteristics`.
 *  - `requestRapport` part dans la foulée, une fois le montant définitif connu
 *    et les caractéristiques saisies : les deux lui sont nécessaires, pour le
 *    profil acquéreur et pour les points forts. Il ne peut donc pas être
 *    anticipé, et l'écran d'assemblage couvre les deux allers-retours.
 *
 * Aucun des trois ne rejette : un parcours ne s'interrompt pas sur une source
 * indisponible.
 */
export default function App() {
  const [step, setStep] = useState('adresse')
  const [address, setAddress] = useState(null)
  // Sélection confirmée sur la carte : bâtiment, coordonnées, emprise, type
  // détecté, parcelle et fiche BDNB. Charge utile du calcul, conservée ici pour
  // n'avoir pas à être redemandée.
  const [selection, setSelection] = useState(null)
  // Montant renvoyé par le moteur. Une première fois pendant l'analyse, sur la
  // surface que les bases ont su reconstituer ; une seconde fois à la
  // validation du formulaire, sur la surface déclarée par l'agent — c'est
  // celui-là qui part au rapport (voir `saveCharacteristics`). Aucun écran ne
  // l'affiche avant.
  const [price, setPrice] = useState(null)
  // Fourchette et niveau de confiance, tels que le moteur les a établis. Ils
  // descendent du serveur depuis le portage : la fourchette n'est plus un
  // pourcentage fixe posé au moment de l'affichage, elle vaut ±15 % en confiance
  // normale, ±20 % en moyenne, ±25 % en faible. Le front ne la recalcule plus.
  const [fourchette, setFourchette] = useState(AUCUNE_FOURCHETTE)
  // Les ventes que le moteur a retenues et pondérées pour établir le prix —
  // celles-là mêmes, et non un relevé de voisinage fait à part. Elles portent
  // leur distance, leur €/m² actualisé, leur poids et leur score de similarité,
  // et c'est la page « ventes comparables » du rapport qui les met en page.
  const [comparables, setComparables] = useState([])
  // Motif d'indisponibilité, quand le calcul n'a pas pu aboutir pour une raison
  // technique — source DVF injoignable, budget dépassé. `null` le reste du
  // temps. C'est lui qui fait basculer le parcours sur `EstimationIndisponibleStep`.
  const [indisponible, setIndisponible] = useState(null)
  // Caractéristiques que les bases connaissaient déjà du bien — type et classe
  // énergie — rapportées par le même appel que le montant. Elles arrivent donc
  // avant que le formulaire de caractéristiques s'affiche, ce qui est la seule
  // condition qui compte : c'est lui qui s'en sert, pour ne pas redemander ce
  // qui est déjà su.
  const [detection, setDetection] = useState(AUCUNE_DETECTION)
  // Détail des ajustements que les caractéristiques déclarées ont fait jouer
  // sur le prix — état général, classe énergie, standing, piscine,
  // stationnements. L'étage n'y figure plus : le moteur l'applique lui-même,
  // en amont de cette couche. Vide jusqu'à la validation du formulaire, qui est
  // le premier appel à les connaître. Le rapport les imprime sous le montant :
  // sans eux, deux biens voisins estimés à des prix différents n'auraient
  // aucune explication à présenter au vendeur.
  const [ajustements, setAjustements] = useState(AUCUN_AJUSTEMENT)
  // Caractéristiques détaillées saisies à l'étape `caracteristiques`. Les
  // champs laissés de côté y valent `null` — à distinguer d'un zéro déclaré au
  // moment de les restituer.
  const [characteristics, setCharacteristics] = useState(null)
  // Blocs de secteur assemblés par `api/rapport.js` — commodités, quartier,
  // marché, budgets, historique, comparables, taux. `null` tant que l'appel
  // court ; les corrections que l'agent apportera ensuite vivent ailleurs, dans
  // le rapport lui-même (voir `RapportEdition`), et ne sont pas concernées.
  const [rapport, setRapport] = useState(null)
  // Calcul en cours, conservé comme promesse : démarre avec l'animation
  // d'analyse et n'est lu qu'à la fin de celle-ci.
  const pendingEstimate = useRef(null)

  // Avancement à l'intérieur de l'étape courante (0 à 1) — les sous-écrans qui
  // en ont un le remontent via `onProgress`.
  const [stageProgress, setStageProgress] = useState(0)

  const goToStep = useCallback((nextStep, localProgress = 0) => {
    setStageProgress(localProgress)
    setStep(nextStep)
  }, [])

  const goToBuilding = useCallback(
    (confirmed) => {
      setAddress(confirmed)
      goToStep('batiment')
    },
    [goToStep],
  )

  // Le calcul est lancé une seule fois, au démarrage de l'écran d'analyse, et
  // court en arrière-plan de l'animation — laquelle garde son déroulé complet.
  const startAnalysis = useCallback(
    (confirmedSelection) => {
      setSelection(confirmedSelection)
      setPrice(null)
      setFourchette(AUCUNE_FOURCHETTE)
      setComparables([])
      setIndisponible(null)
      setDetection(AUCUNE_DETECTION)
      setAjustements(AUCUN_AJUSTEMENT)
      pendingEstimate.current = requestEstimation(confirmedSelection)
      goToStep('analyse')
    },
    [goToStep],
  )

  // Fin de l'animation d'analyse : on récupère le montant (il ne sera pas
  // affiché pour l'instant, seulement mémorisé) et ce que les bases ont su dire
  // du bien, puis on passe au formulaire de caractéristiques.
  // `requestEstimation` ne rejette jamais.
  //
  // Les deux `set` précèdent le changement d'étape dans le même traitement,
  // donc dans le même rendu : le formulaire naît avec la détection déjà en
  // main, et non pas vide puis rempli après coup — ce qui lui ferait afficher
  // un champ pour le retirer sous les yeux de l'agent.
  const proceedToCharacteristics = useCallback(async () => {
    const estimate = await pendingEstimate.current
    setPrice(estimate?.price ?? null)
    setDetection(estimate?.detection ?? AUCUNE_DETECTION)
    goToStep('caracteristiques')
  }, [goToStep])

  // Formulaire validé : on retient les caractéristiques, on refait le calcul
  // sur la surface que l'agent vient de déclarer, puis l'assemblage du rapport
  // part — le tout derrière l'écran d'attente.
  //
  // Le montant obtenu pendant l'analyse reposait sur une surface reconstituée :
  // emprise au sol du bâtiment × nombre de niveaux présumé. Le formulaire vient
  // d'en donner une vraie, et le rapport affiche les deux côte à côte — la
  // surface en page « caractéristiques », le prix et son prix au m² en page
  // « estimation de valeur ». Les laisser diverger revenait à imprimer, sur le
  // même document, un montant qui n'a jamais eu affaire à la surface annoncée.
  // On relance donc le moteur avec elle, et c'est ce second montant qui fait
  // foi partout ensuite.
  //
  // Le calcul est relancé dans tous les cas, surface déclarée ou non : le
  // formulaire porte désormais des caractéristiques qui pèsent sur le prix —
  // état général, classe énergie, standing, piscine, stationnements
  // (voir `api/_lib/ajustements.js`) —, et la charge utile n'est donc plus jamais
  // identique à celle de l'analyse. Un curseur de surface laissé au repos
  // n'empêche plus un état « à rénover » de se voir.
  //
  // L'assemblage du rapport ne pouvait pas être anticipé — il lui faut le
  // montant *et* le formulaire — et il attend maintenant le montant définitif :
  // les deux allers-retours s'enchaînent, l'écran d'assemblage les couvre sans
  // limite de durée (voir `EstimationRapportStep`). `values` et le prix relu
  // lui sont passés directement plutôt que relus dans l'état, qui n'aura pas
  // encore été rafraîchi à cet instant du traitement.
  const saveCharacteristics = useCallback(
    async (values) => {
      setCharacteristics(values)
      setRapport(null)
      goToStep('assemblage')

      const surfaceM2 = values?.surfaceHabitable ?? null

      // `requestEstimation` ne rejette jamais ; un échec rend un montant `null`,
      // qu'on ne laisse pas écraser celui de l'analyse — un rapport avec un
      // prix approché vaut mieux qu'un rapport sans prix. Les ajustements, eux,
      // ne survivent pas à l'échec : ils décrivent un montant qui n'a pas été
      // obtenu, et les afficher sous celui de l'analyse en ferait la
      // justification d'un calcul qui ne les a jamais appliqués.
      const estimation = await requestEstimation({ ...selection, surfaceM2, characteristics: values })
      const recalcule = estimation?.price ?? price

      // Panne technique **et** aucun montant à présenter, pas même celui de
      // l'analyse : le parcours s'arrête sur la page d'indisponibilité plutôt
      // que d'aboutir à un rapport dont la page « Estimation de valeur » serait
      // muette. C'est le renversement qu'apporte le portage du moteur — voir
      // `EstimationIndisponibleStep`.
      //
      // Le montant de l'analyse, s'il existe, l'emporte : il a été calculé, lui,
      // et un rapport avec un prix approché vaut mieux qu'un parcours perdu.
      if (estimation?.indisponible?.rejouable && recalcule == null) {
        setIndisponible(estimation.indisponible)
        return goToStep('indisponible')
      }

      setPrice(recalcule)
      setIndisponible(null)
      setAjustements(estimation?.price == null ? AUCUN_AJUSTEMENT : estimation.ajustements)

      // La fourchette et les comparables ne survivent pas non plus à un montant
      // manquant : ils décrivent un calcul qui n'a pas abouti. Conservés du
      // premier appel, ils prétendraient border un prix qu'ils n'ont pas produit.
      if (estimation?.price != null) {
        setFourchette({
          low: estimation.low,
          high: estimation.high,
          confiance: estimation.confiance,
        })
        setComparables(estimation.comparables ?? [])
      }

      // `requestRapport` ne rejette jamais : un échec complet rend un rapport
      // vide, dont les pages de secteur s'affichent en attente de saisie.
      setRapport(
        await requestRapport({ selection, address, price: recalcule, characteristics: values }),
      )
    },
    [goToStep, selection, address, price],
  )

  // Nouvelle tentative depuis la page d'indisponibilité. La sélection et le
  // formulaire sont conservés : rien n'est à refaire, ni sur la carte ni à la
  // saisie — on repart de l'écran d'assemblage, qui relance les deux appels.
  const retryEstimation = useCallback(() => {
    if (!characteristics) return goToStep('caracteristiques')
    setIndisponible(null)
    saveCharacteristics(characteristics)
  }, [characteristics, saveCharacteristics, goToStep])

  // Repart de l'étape adresse pour une nouvelle estimation.
  const restart = useCallback(() => {
    setAddress(null)
    setSelection(null)
    setPrice(null)
    setFourchette(AUCUNE_FOURCHETTE)
    setComparables([])
    setIndisponible(null)
    setDetection(AUCUNE_DETECTION)
    setAjustements(AUCUN_AJUSTEMENT)
    setCharacteristics(null)
    setRapport(null)
    pendingEstimate.current = null
    goToStep('adresse')
  }, [goToStep])

  // Le module carte est chargé à la demande (Leaflet ne sert qu'aux étapes
  // suivantes). On l'amorce dès la saisie de l'adresse.
  useEffect(() => {
    if (step !== 'adresse') return
    import('./components/estimation/BuildingMap')
  }, [step])

  // La page d'indisponibilité ne figure pas dans les étapes — c'est une sortie,
  // pas une marche de plus. La barre y garde l'avancement de l'assemblage, d'où
  // le parcours vient et où il repartira : la ramener à zéro dirait que tout est
  // à refaire, et `indexOf` seul la rendrait négative.
  const etapeCourante = step === 'indisponible' ? 'assemblage' : step
  const stageIndex = STAGES.indexOf(etapeCourante)
  const globalPct =
    step === 'rapport'
      ? 100
      : Math.round(((Math.max(stageIndex, 0) + stageProgress) / STAGES.length) * 100)


  return (
    <>
      {/* Barre de progression globale — persistante du premier écran au dernier,
          logée en haut de la fenêtre. Reste au-dessus des fenêtres modales du
          parcours (z-[60]) : z-[70]. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={globalPct}
        aria-label="Progression du parcours d’estimation"
        className="fixed inset-x-0 top-0 z-[70] h-2 bg-ink/10"
      >
        <div
          className="h-full bg-gradient-to-r from-ink via-ink/80 to-brass transition-[width] duration-500 ease-plan"
          style={{ width: `${globalPct}%` }}
        />
      </div>

      {/* Colonne flex + `my-auto` sur l'enfant : les marges automatiques sur
          l'axe principal (vertical) centrent le contenu quand il tient dans la
          fenêtre et retombent à zéro quand il déborde — le haut reste alors
          défilable (le formulaire de caractéristiques dépasse la hauteur
          d'écran). `items-center` seul, ou des marges auto sur l'axe
          transversal, rendraient le haut inatteignable. */}
      {/* Les variantes `print:` neutralisent le cadre du parcours au moment de
          l'impression — fond, marges, centrage vertical : sur papier, seules
          les feuilles du rapport subsistent (voir `@media print` dans
          `index.css`). */}
      {/* Le fond du rapport est plus sombre que celui du parcours, et c'est une
          conséquence directe de la mise en charte : les feuilles ont pris le
          fond du site (#F5F5F5), qui était jusqu'ici celui du parcours — posées
          dessus, elles cessaient de se lire comme des feuilles. Le gris retenu
          est le `--grey-200` du site (#DEDEDE), assez creusé pour détacher la
          feuille, assez proche pour ne pas la trancher.

          C'est un réglage d'écran seulement : à l'impression, la feuille *est*
          la page, il n'y a plus rien autour, et `print:bg-transparent` laisse
          passer le fond papier posé sur le `body` (voir `@media print` dans
          `index.css`). Un fond blanc posé ici le recouvrirait. */}
      <section
        className={`flex min-h-screen flex-col items-center px-5 py-20 sm:px-8 sm:py-24 print:block print:min-h-0 print:bg-transparent print:p-0 ${
          step === 'rapport' ? 'bg-[#DEDEDE]' : 'bg-stone'
        }`}
      >
        {/* Transition entre étapes sans animation au niveau de la page : chaque
            écran garde ses propres animations Framer Motion internes, mais un
            wrapper animé ici se figeait par intermittence (écran d'analyse à
            animations en boucle + minuteurs, rendu du formulaire lourd). `key`
            force le remontage propre à chaque changement d'étape. */}
        <div key={step} className="my-auto flex w-full justify-center print:my-0 print:block">
          <>
            {step === 'adresse' ? (
              <EstimationAddressStep onConfirm={goToBuilding} />
            ) : null}

            {step === 'batiment' && address ? (
              <EstimationBuildingStep
                address={address}
                onBack={() => goToStep('adresse')}
                onEstimate={startAnalysis}
                onProgress={setStageProgress}
              />
            ) : null}

            {step === 'analyse' ? (
              <EstimationLoadingStep onDone={proceedToCharacteristics} onProgress={setStageProgress} />
            ) : null}

            {step === 'caracteristiques' ? (
              <EstimationCharacteristicsStep
                detection={detection}
                onBack={() => goToStep('batiment')}
                onValidate={saveCharacteristics}
              />
            ) : null}

            {/* L'écran d'assemblage tient l'attente pendant que le rapport se
                monte, et ne rend la main que lorsqu'il est là : `pret` porte
                l'arrivée de la réponse, l'écran y ajoute sa durée plancher. */}
            {step === 'assemblage' ? (
              <EstimationRapportStep pret={rapport !== null} onDone={() => goToStep('rapport')} />
            ) : null}

            {/* Panne technique du moteur, sans montant à présenter. Le bouton
                relance les deux appels sur la sélection et le formulaire déjà
                en main : rien n'est à refaire. */}
            {step === 'indisponible' ? (
              <EstimationIndisponibleStep
                address={address}
                onRetry={retryEstimation}
                onBack={() => goToStep('batiment')}
              />
            ) : null}

            {step === 'rapport' ? (
              <RapportView
                address={address}
                selection={selection}
                price={price}
                fourchette={fourchette}
                comparables={comparables}
                ajustements={ajustements}
                characteristics={characteristics}
                // Un assemblage qui n'aurait pas abouti laisse `rapport` à
                // `null` ; le rapport vide a la même forme et s'affiche avec ses
                // pages de secteur en attente de saisie.
                rapport={rapport ?? RAPPORT_VIDE}
                onRestart={restart}
              />
            ) : null}
          </>
        </div>
      </section>
    </>
  )
}
