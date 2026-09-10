import { Minus, Plus, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react'
import { ChampModifiable, OutilLigne, useEdition } from './Edition'
import {
  BlocIndisponible,
  CelluleModifiable,
  EnteteTableau,
  ListeChamps,
  PageRapport,
  Section,
  Statistique,
} from './RapportPage'
import { Barres, Courbe, Repartition } from './RapportCharts'

/**
 * Les onze pages de l'avis de valeur.
 *
 * Chacune reçoit sa part du modèle d'affichage (`rapportModele.js`) et ne fait
 * que la disposer : aucun calcul, aucun formatage, aucune décision sur ce qui
 * mérite d'être montré — tout cela a été tranché en amont. Ce qui se décide
 * ici, et rien d'autre, c'est la mise en page.
 *
 * Une règle traverse le fichier : **une page manquante n'existe pas**. Quand
 * une source n'a rien rendu, la page s'affiche quand même avec un bloc qui dit
 * pourquoi — et ce texte-là est modifiable comme le reste, l'agent complétant
 * à la main ce que les bases n'ont pas su fournir. Un rapport dont la
 * pagination change selon la commune n'est pas un document, c'est une sortie
 * de programme.
 */

/** Flèche d'évolution — jamais seule, toujours accolée au pourcentage. */
function Tendance({ sens, className = 'h-3.5 w-3.5' }) {
  if (sens !== 'hausse' && sens !== 'baisse') return null
  const Icone = sens === 'hausse' ? TrendingUp : TrendingDown

  return (
    <Icone
      className={`${className} ${sens === 'hausse' ? 'text-bottle' : 'text-corail'}`}
      strokeWidth={2}
      aria-hidden="true"
    />
  )
}

// --- 1. Couverture ---------------------------------------------------------

export function PageCouverture({ couverture }) {
  return (
    <PageRapport sombre>
      <div className="flex flex-1 flex-col justify-between py-4">
        <div>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.42em] text-brass">Barnes</p>
          <span aria-hidden="true" className="mt-5 block h-px w-16 bg-brass/50" />
        </div>

        <div>
          <ChampModifiable
            cle="couverture.mention"
            valeur="Avis de valeur"
            as="p"
            className="font-mono text-[0.62rem] uppercase tracking-micro text-brass"
          />
          <ChampModifiable
            cle="couverture.adresse"
            valeur={couverture.adresse}
            as="h1"
            multiligne
            className="mt-5 block font-display text-[2.5rem] font-semibold leading-[1.08] text-white"
          />
          {couverture.ville ? (
            <ChampModifiable
              cle="couverture.ville"
              valeur={couverture.ville}
              as="p"
              className="mt-3 block font-display text-[1.15rem] font-normal text-white/60"
            />
          ) : null}

          <span aria-hidden="true" className="mt-8 block h-px w-full bg-white/12" />

          <ChampModifiable
            cle="couverture.chapeau"
            valeur="Estimation établie à partir des ventes réalisées dans le secteur, des caractéristiques déclarées du bien et des données publiques du marché immobilier."
            as="p"
            multiligne
            className="mt-6 block max-w-md text-[0.85rem] leading-relaxed text-white/55"
          />
        </div>

        <div className="flex items-end justify-between gap-6">
          <div>
            <p className="font-mono text-[0.55rem] uppercase tracking-micro text-white/35">
              Établi le
            </p>
            <ChampModifiable
              cle="couverture.date"
              valeur={couverture.date}
              as="p"
              className="mt-1.5 block font-display text-[1rem] font-semibold text-white"
            />
          </div>
          <p className="max-w-[16rem] text-right text-[0.62rem] leading-relaxed text-white/35">
            Document non contractuel. Le montant indiqué est une estimation, il ne constitue
            ni une expertise judiciaire ni un engagement de prix.
          </p>
        </div>
      </div>
    </PageRapport>
  )
}

// --- 2. Localisation -------------------------------------------------------

export function PageLocalisation({ localisation, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Situation" titre="Localisation du bien">
      {/* Les proportions des deux vues sont choisies pour que la page tienne en
          une feuille A4 une fois les références cadastrales ajoutées : à
          210 mm de large et 14 mm de marge, chaque dixième de rapport de forme
          coûte une quarantaine de points de hauteur. */}
      {localisation.image ? (
        <img
          src={localisation.image}
          alt="Vue aérienne du bien"
          width={1120}
          height={560}
          loading="eager"
          className="w-full rounded-lg border border-marine/10 object-cover"
          style={{ aspectRatio: '1120 / 560' }}
        />
      ) : (
        <BlocIndisponible
          cle="loc.absente"
          message="Aucune vue aérienne disponible pour ce point — l’orthophotographie de l’IGN s’arrête aux frontières françaises."
        />
      )}

      <Section titre="Vue élargie" className="mt-5">
        {localisation.large ? (
          <img
            src={localisation.large}
            alt="Vue aérienne élargie du quartier"
            width={1120}
            height={360}
            loading="lazy"
            className="w-full rounded-lg border border-marine/10 object-cover"
            style={{ aspectRatio: '1120 / 360' }}
          />
        ) : null}
      </Section>

      <Section titre="Références cadastrales" className="mt-5">
        <ListeChamps champs={localisation.lignes} colonnes={2} />
      </Section>

      <p className="mt-4 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
        Vues aériennes © IGN — Géoplateforme
      </p>
    </PageRapport>
  )
}

// --- 3. Description du bien ------------------------------------------------

/**
 * Liste de points forts ou de réserves : titre et commentaire modifiables,
 * ligne masquable, et de quoi en ajouter.
 *
 * C'est la partie du rapport la plus susceptible d'être récrite — le moteur
 * déduit ces lignes d'un formulaire, l'agent a vu le bien. Elles arrivent donc
 * en suggestion et non en conclusion : chacune se corrige, se retire, et rien
 * n'interdit d'en écrire d'autres.
 */
function ListePoints({ liste, cleListe, accent }) {
  const { masques, basculerMasque, ajouts, ajouter } = useEdition()
  const supplementaires = ajouts[cleListe] ?? 0

  const lignes = [
    ...liste.map((point) => ({ ...point, ajoutee: false })),
    ...Array.from({ length: supplementaires }, (_, index) => ({
      cle: `${cleListe}.ajout.${index}`,
      titre: '',
      detail: '',
      ajoutee: true,
    })),
  ]

  return (
    <div>
      <ul className="space-y-2">
        {lignes.map((point) => {
          const masque = masques[point.cle] === true

          return (
            <li
              key={point.cle}
              className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 ${
                accent === 'corail' ? 'border-corail/20 bg-corail/[0.04]' : 'border-marine/12 bg-marine/[0.025]'
              } ${masque ? 'rapport-masque' : ''}`}
            >
              <span
                aria-hidden="true"
                className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${
                  accent === 'corail' ? 'bg-corail' : 'bg-marine/60'
                }`}
              />
              <div className="min-w-0 flex-1">
                <ChampModifiable
                  cle={`${point.cle}.titre`}
                  valeur={point.titre}
                  as="p"
                  placeholder="Intitulé"
                  className="block font-display text-[0.9rem] font-semibold text-marine"
                />
                <ChampModifiable
                  cle={`${point.cle}.detail`}
                  valeur={point.detail}
                  as="p"
                  multiligne
                  placeholder="Commentaire"
                  className="mt-0.5 block text-[0.74rem] leading-snug text-marine/55"
                />
              </div>
              <OutilLigne
                onClick={() => basculerMasque(point.cle)}
                titre={masque ? 'Rétablir cette ligne' : 'Retirer cette ligne du rapport'}
              >
                {masque ? <RotateCcw className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
              </OutilLigne>
            </li>
          )
        })}
      </ul>

      {lignes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-marine/20 px-3 py-4 text-[0.74rem] text-marine/40">
          Aucune suggestion — les caractéristiques renseignées n’en produisent pas.
        </p>
      ) : null}

      <button
        type="button"
        data-outil="true"
        onClick={() => ajouter(cleListe)}
        className="mt-2 inline-flex items-center gap-1.5 font-mono text-[0.58rem] uppercase tracking-micro text-marine/40 transition-colors hover:text-corail"
      >
        <Plus className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
        Ajouter
      </button>
    </div>
  )
}

export function PageDescription({ description, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Le bien" titre="Description et caractéristiques">
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <Section titre="Le logement">
          <ListeChamps champs={description.bien} />
        </Section>
        <Section titre="Le bâti">
          <ListeChamps champs={description.bati} />
        </Section>
      </div>

      <div className="mt-7 grid gap-x-8 gap-y-6 sm:grid-cols-2">
        <Section titre="Points forts">
          <ListePoints liste={description.forts} cleListe="points.forts" />
        </Section>
        <Section titre="Points de réserve">
          <ListePoints liste={description.reserves} cleListe="points.reserves" accent="corail" />
        </Section>
      </div>
    </PageRapport>
  )
}

// --- 4. Points d'intérêt ---------------------------------------------------

export function PageCommodites({ commodites, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Environnement" titre="Commodités à proximité">
      {!commodites || !commodites.disponible ? (
        <BlocIndisponible
          cle="poi.absent"
          message="Le relevé des commodités n’a pas pu être établi. À compléter à la main : écoles, commerces et transports du quartier."
        />
      ) : (
        <>
          <p className="text-[0.82rem] leading-relaxed text-marine/60">
            Équipements et services relevés dans un rayon de {commodites.rayon} autour du bien —
            l’ordre de grandeur de ce qui se fait à pied.
          </p>

          <div className="mt-6 space-y-6">
            {commodites.categories.map((categorie) => (
              <Section
                key={categorie.id}
                titre={categorie.label}
                aparte={categorie.plusProche ? `au plus près : ${categorie.plusProche}` : null}
              >
                <ChampModifiable
                  cle={`poi.${categorie.id}.total`}
                  valeur={categorie.totalTexte}
                  as="p"
                  className="block font-display text-[0.95rem] font-semibold text-marine"
                />

                {categorie.lieux.length > 0 ? (
                  <ul className="mt-2.5 space-y-1">
                    {categorie.lieux.map((lieu) => (
                      <li
                        key={lieu.cle}
                        className="flex items-baseline justify-between gap-3 border-b border-marine/8 py-[0.35rem]"
                      >
                        <span className="min-w-0">
                          <ChampModifiable
                            cle={`${lieu.cle}.nom`}
                            valeur={lieu.nom}
                            className="text-[0.8rem] text-marine/80"
                          />
                          <span className="ml-2 font-mono text-[0.58rem] uppercase tracking-micro text-marine/35">
                            {lieu.type}
                          </span>
                        </span>
                        <ChampModifiable
                          cle={`${lieu.cle}.distance`}
                          valeur={lieu.distance}
                          className="shrink-0 font-mono text-[0.7rem] text-marine/55"
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Section>
            ))}
          </div>

          <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
            Source : {commodites.attribution}
          </p>
        </>
      )}
    </PageRapport>
  )
}

// --- 5. Profil du quartier -------------------------------------------------

export function PageQuartier({ quartier, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Environnement" titre="Profil du quartier">
      {!quartier ? (
        <BlocIndisponible
          cle="quartier.absent"
          message="Le profil démographique du secteur n’a pas pu être établi."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <ChampModifiable
              cle="quartier.nom"
              valeur={quartier.nom}
              as="p"
              className="block font-display text-[1.2rem] font-semibold text-marine"
            />
            {quartier.codeIris ? (
              <p className="font-mono text-[0.58rem] uppercase tracking-micro text-marine/35">
                IRIS {quartier.codeIris}
              </p>
            ) : null}
          </div>

          <Section className="mt-5">
            <ListeChamps champs={quartier.lignes} />
          </Section>

          {quartier.serie.length > 1 ? (
            <Section titre="Population aux recensements" className="mt-7">
              <Barres points={quartier.serie} legende="Population aux recensements successifs" />
            </Section>
          ) : null}

          {/* L'échelle des chiffres, dite en clair et non en note de bas de
              page : un chiffre communal présenté comme celui d'un quartier
              serait un faux, et cette mention est ce qui l'en distingue. */}
          <div className="mt-auto pt-6">
            <div className="rounded-lg border border-marine/12 bg-marine/[0.03] px-4 py-3">
              <p className="font-mono text-[0.55rem] uppercase tracking-micro text-marine/45">
                Échelle des données : {quartier.niveau === 'commune' ? 'commune' : 'non déterminée'}
              </p>
              <ChampModifiable
                cle="quartier.motif"
                valeur={quartier.niveauMotif}
                as="p"
                multiligne
                className="mt-1.5 block text-[0.72rem] leading-snug text-marine/55"
              />
            </div>
            <p className="mt-3 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
              Source : {quartier.source}
              {quartier.millesime ? ` — millésime ${quartier.millesime}` : ''}
            </p>
          </div>
        </>
      )}
    </PageRapport>
  )
}

// --- 6. Statistiques de marché ---------------------------------------------

export function PageMarche({ marche, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Marché" titre="Statistiques du secteur">
      {!marche ? (
        <BlocIndisponible
          cle="marche.absent"
          message="Aucune vente publiée ne permet d’établir les statistiques de ce secteur. En Alsace-Moselle et à Mayotte, les mutations relèvent du livre foncier et ne sont diffusées nulle part."
        />
      ) : (
        <>
          <p className="text-[0.82rem] leading-relaxed text-marine/60">
            Chiffres établis sur <strong className="font-semibold text-marine">{marche.zone}</strong>,
            d’après les ventes publiées par la DGFiP.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Statistique
              cle="marche.stat.median"
              label="Prix médian au m²"
              valeur={marche.lignes[0].valeur}
              note="Toutes ventes de logements confondues"
              accent
            />
            <Statistique
              cle="marche.stat.evolution"
              label="Évolution sur douze mois"
              valeur={marche.evolution.valeur}
              note={
                marche.evolution.recente.periode
                  ? `${marche.evolution.recente.periode} contre ${marche.evolution.precedente.periode}`
                  : null
              }
            />
          </div>

          <Section titre="Détail par type de bien" className="mt-7">
            <ListeChamps champs={marche.lignes.slice(1)} />
          </Section>

          <Section titre="Comparaison des deux périodes" className="mt-7">
            <table className="w-full">
              <EnteteTableau
                colonnes={[
                  { label: 'Période' },
                  { label: 'Ventes', droite: true },
                  { label: 'Prix médian au m²', droite: true },
                ]}
              />
              <tbody>
                {[
                  { cle: 'recente', ...marche.evolution.recente },
                  { cle: 'precedente', ...marche.evolution.precedente },
                ].map((periode) => (
                  <tr key={periode.cle} className="border-b border-marine/8">
                    <CelluleModifiable
                      cle={`marche.${periode.cle}.periode`}
                      valeur={periode.periode}
                    />
                    <CelluleModifiable
                      cle={`marche.${periode.cle}.ventes`}
                      valeur={periode.ventes}
                      droite
                    />
                    <CelluleModifiable
                      cle={`marche.${periode.cle}.prix`}
                      valeur={periode.prix}
                      droite
                      fort
                    />
                  </tr>
                ))}
              </tbody>
            </table>

            <p className="mt-3 flex items-center gap-1.5 text-[0.72rem] text-marine/50">
              <Tendance sens={marche.evolution.sens} />
              Les douze derniers mois publiés sont comparés aux douze précédents ; la base DVF
              paraît avec plusieurs mois de décalage.
            </p>
          </Section>

          <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
            Source : DGFiP — Demandes de valeurs foncières, géocodées par Etalab
          </p>
        </>
      )}
    </PageRapport>
  )
}

// --- 7. Budgets par typologie ----------------------------------------------

export function PageBudgets({ budgets, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Marché" titre="Budgets moyens par typologie">
      {!budgets ? (
        <BlocIndisponible
          cle="budgets.absent"
          message="Le nombre de pièces n’est pas renseigné sur assez de ventes du secteur pour établir des budgets par typologie."
        />
      ) : (
        <>
          <p className="text-[0.82rem] leading-relaxed text-marine/60">
            Ce qui se vend sur <strong className="font-semibold text-marine">{budgets.zone}</strong>,
            et le revenu qu’il faut justifier pour l’acheter — emprunt sur {budgets.duree} au taux
            de {budgets.taux}, mensualité plafonnée à {budgets.effort} du revenu net.
          </p>

          <Section titre="Répartition des ventes" className="mt-6">
            <Repartition
              segments={budgets.lignes
                .filter((ligne) => ligne.partPct != null)
                .map((ligne) => ({ label: ligne.label, part: ligne.partPct }))}
            />
          </Section>

          <Section titre="Détail par typologie" className="mt-7">
            <table className="w-full">
              <EnteteTableau
                colonnes={[
                  { label: 'Type' },
                  { label: 'Surface', droite: true },
                  { label: 'Budget moyen', droite: true },
                  { label: 'Part', droite: true },
                  { label: 'Revenu net requis', droite: true },
                ]}
              />
              <tbody>
                {budgets.lignes.map((ligne) => (
                  <tr key={ligne.cle} className="border-b border-marine/8">
                    <td className="py-[0.42rem]">
                      <span className="font-display text-[0.88rem] font-semibold text-marine">
                        {ligne.label}
                      </span>
                    </td>
                    {ligne.champs.map((champ, index) => (
                      <CelluleModifiable
                        key={champ.id}
                        cle={champ.id}
                        valeur={champ.valeur}
                        droite
                        fort={index === 1 || index === 3}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <p className="mt-5 text-[0.7rem] leading-relaxed text-marine/45">
            Calcul établi sur {budgets.references} ventes dont le nombre de pièces est renseigné.
            Le capital emprunté est pris égal au prix du bien : un apport le réduirait, les frais
            d’acquisition l’augmenteraient.
          </p>

          <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
            Sources : DGFiP (ventes) — BCE (taux d’emprunt)
          </p>
        </>
      )}
    </PageRapport>
  )
}

// --- 8. Historique des ventes ----------------------------------------------

export function PageHistorique({ historique, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Marché" titre="Historique des ventes">
      {!historique ? (
        <BlocIndisponible
          cle="historique.absent"
          message="Aucun historique de ventes n’est publié pour ce secteur."
        />
      ) : (
        <>
          <p className="text-[0.82rem] leading-relaxed text-marine/60">
            Volume et prix au m² année par année sur{' '}
            <strong className="font-semibold text-marine">{historique.zone}</strong>.
          </p>

          <Section titre="Ventes par année" className="mt-6">
            <Barres
              points={historique.lignes.map((ligne) => ({
                annee: ligne.annee,
                valeur: ligne.ventesBrut,
                label: ligne.ventes,
              }))}
              legende="Nombre de ventes par année"
            />
          </Section>

          <Section titre="Détail annuel" className="mt-7">
            <table className="w-full">
              <EnteteTableau
                colonnes={[
                  { label: 'Année' },
                  { label: 'Ventes', droite: true },
                  { label: 'Prix moyen au m²', droite: true },
                  { label: 'Évolution', droite: true },
                ]}
              />
              <tbody>
                {historique.lignes.map((ligne) => (
                  <tr key={ligne.cle} className="border-b border-marine/8">
                    <CelluleModifiable cle={`${ligne.cle}.annee`} valeur={ligne.annee} fort />
                    <CelluleModifiable cle={`${ligne.cle}.ventes`} valeur={ligne.ventes} droite />
                    <CelluleModifiable cle={`${ligne.cle}.prix`} valeur={ligne.prixM2} droite fort />
                    <td className="py-[0.42rem] text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <Tendance sens={ligne.sens} className="h-3 w-3" />
                        <ChampModifiable
                          cle={`${ligne.cle}.evolution`}
                          valeur={ligne.evolution}
                          placeholder="—"
                          className="text-[0.8rem] text-marine/75"
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section titre="Synthèse de la période" className="mt-7">
            <ListeChamps champs={historique.synthese} colonnes={2} />
          </Section>

          <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
            Source : DGFiP — Demandes de valeurs foncières
          </p>
        </>
      )}
    </PageRapport>
  )
}

// --- 9. Ventes comparables -------------------------------------------------

export function PageComparables({ comparables, numero }) {
  const { masques, basculerMasque } = useEdition()

  return (
    <PageRapport numero={numero} surtitre="Marché" titre="Ventes comparables">
      {!comparables ? (
        <BlocIndisponible
          cle="comparables.absent"
          message="Aucune vente comparable n’a été trouvée à proximité du bien."
        />
      ) : (
        <>
          <p className="text-[0.82rem] leading-relaxed text-marine/60">
            Les biens de même nature vendus le plus près du vôtre. Ce sont ces ventes, et non un
            barème, qui portent l’estimation.
          </p>

          <Section className="mt-6">
            <table className="w-full">
              <EnteteTableau
                colonnes={[
                  { label: 'Bien' },
                  { label: 'Distance', droite: true },
                  { label: 'Surface', droite: true },
                  { label: 'Pièces', droite: true },
                  { label: 'Prix', droite: true },
                  { label: '€/m²', droite: true },
                  { label: 'Date', droite: true },
                  { label: '' },
                ]}
              />
              <tbody>
                {comparables.map((vente) => {
                  const masque = masques[vente.cle] === true

                  return (
                    <tr
                      key={vente.cle}
                      className={`border-b border-marine/8 ${masque ? 'rapport-masque' : ''}`}
                    >
                      <CelluleModifiable cle={`${vente.cle}.type`} valeur={vente.type} />
                      <CelluleModifiable cle={`${vente.cle}.distance`} valeur={vente.distance} droite />
                      <CelluleModifiable cle={`${vente.cle}.surface`} valeur={vente.surface} droite />
                      <CelluleModifiable cle={`${vente.cle}.pieces`} valeur={vente.pieces} droite />
                      <CelluleModifiable cle={`${vente.cle}.prix`} valeur={vente.prix} droite fort />
                      <CelluleModifiable cle={`${vente.cle}.prixM2`} valeur={vente.prixM2} droite />
                      <CelluleModifiable cle={`${vente.cle}.date`} valeur={vente.date} droite />
                      <td className="py-[0.42rem] pl-2 text-right">
                        <OutilLigne
                          onClick={() => basculerMasque(vente.cle)}
                          titre={masque ? 'Rétablir cette vente' : 'Retirer cette vente du rapport'}
                        >
                          {masque ? (
                            <RotateCcw className="h-3.5 w-3.5" />
                          ) : (
                            <Minus className="h-3.5 w-3.5" />
                          )}
                        </OutilLigne>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Section>

          <p className="mt-5 text-[0.7rem] leading-relaxed text-marine/45">
            Les distances sont calculées depuis le bien estimé. Les prix sont ceux effectivement
            enregistrés à l’acte, frais de notaire exclus.
          </p>

          <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
            Source : DGFiP — Demandes de valeurs foncières
          </p>
        </>
      )}
    </PageRapport>
  )
}

// --- 10. Estimation --------------------------------------------------------

export function PageEstimation({ estimation, marche, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Conclusion" titre="Estimation de valeur">
      {!estimation ? (
        <BlocIndisponible
          cle="estimation.absente"
          message="Le montant n’a pas pu être calculé. À établir à la main d’après les ventes comparables de la page précédente."
        />
      ) : (
        <>
          <div className="rounded-xl border border-marine/12 bg-marine/[0.03] px-6 py-8 text-center">
            <p className="font-mono text-[0.58rem] uppercase tracking-micro text-marine/45">
              Valeur de présentation recommandée
            </p>
            <ChampModifiable
              cle="estimation.prix"
              valeur={estimation.prix}
              as="p"
              className="mt-3 block font-display text-[2.9rem] font-semibold leading-none text-marine"
            />
            {estimation.prixM2 ? (
              <ChampModifiable
                cle="estimation.prixM2"
                valeur={`soit ${estimation.prixM2}`}
                as="p"
                className="mt-3 block font-mono text-[0.7rem] text-marine/45"
              />
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Statistique cle="estimation.bas" label="Fourchette basse" valeur={estimation.bas} />
            <Statistique cle="estimation.haut" label="Fourchette haute" valeur={estimation.haut} accent />
          </div>

          <Section titre="Synthèse" className="mt-7">
            <ChampModifiable
              cle="estimation.synthese"
              valeur={
                marche
                  ? `Le bien est estimé à partir des ventes réalisées sur ${marche.zone}, dont le prix médian s’établit à ${marche.lignes[0].valeur}. La fourchette tient compte de l’état du marché et des caractéristiques déclarées ; elle n’intègre ni le mobilier ni d’éventuels travaux en cours.`
                  : 'Le bien est estimé à partir des ventes comparables relevées à proximité et des caractéristiques déclarées. La fourchette n’intègre ni le mobilier ni d’éventuels travaux en cours.'
              }
              as="p"
              multiligne
              className="block text-[0.85rem] leading-relaxed text-marine/70"
            />
          </Section>

          <Section titre="Recommandation" className="mt-6">
            <ChampModifiable
              cle="estimation.recommandation"
              valeur="Un bien positionné dès la mise en vente dans cette fourchette se négocie sensiblement plus vite qu’un bien surévalué puis rebaissé — les premières semaines concentrent l’essentiel des contacts."
              as="p"
              multiligne
              className="block text-[0.85rem] leading-relaxed text-marine/70"
            />
          </Section>

          <div className="mt-auto pt-6">
            <p className="rounded-lg border border-corail/25 bg-corail/[0.05] px-4 py-3 text-[0.72rem] leading-relaxed text-marine/60">
              Cette estimation est un avis de valeur. Elle ne constitue ni une expertise au sens
              judiciaire, ni un mandat, ni un engagement sur le prix de vente définitif.
            </p>
          </div>
        </>
      )}
    </PageRapport>
  )
}

// --- 11. Profil acquéreur --------------------------------------------------

export function PageAcquereur({ acquereur, numero }) {
  return (
    <PageRapport numero={numero} surtitre="Financement" titre="Profil de l’acquéreur">
      {!acquereur ? (
        <BlocIndisponible
          cle="acquereur.absent"
          message="Le profil de financement n’a pas pu être établi — ni montant estimé, ni taux d’emprunt disponible."
        />
      ) : (
        <>
          <p className="text-[0.82rem] leading-relaxed text-marine/60">
            Ce qu’il faut gagner pour acheter ce bien à crédit. Une façon de mesurer la profondeur
            du marché : plus le revenu requis est élevé, plus le nombre d’acquéreurs se resserre.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Statistique
              cle="acquereur.stat.revenu"
              label="Revenu net mensuel requis"
              valeur={acquereur.lignes[0].valeur}
              accent
            />
            <Statistique
              cle="acquereur.stat.mensualite"
              label="Mensualité"
              valeur={acquereur.lignes[1].valeur}
            />
          </div>

          <Section titre="Hypothèses de calcul" className="mt-7">
            <ListeChamps champs={acquereur.lignes.slice(2)} />
          </Section>

          {acquereur.taux.serie.length > 1 ? (
            <Section titre="Évolution du coût du crédit" className="mt-7">
              <Courbe
                points={acquereur.taux.serie}
                legende="Taux moyen des crédits à l’habitat, moyenne annuelle"
              />
              <p className="mt-3 text-[0.7rem] leading-relaxed text-marine/45">
                Moyennes annuelles du coût des crédits à l’habitat accordés aux ménages en France.
                La série couvre toutes les durées confondues ; un emprunt sur 25 ans se négocie en
                général quelques dixièmes de point au-dessus.
              </p>
            </Section>
          ) : null}

          <p className="mt-auto pt-5 font-mono text-[0.52rem] uppercase tracking-micro text-marine/30">
            Source : {acquereur.taux.source}
          </p>
        </>
      )}
    </PageRapport>
  )
}
