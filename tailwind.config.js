/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // --- Palette Barnes ---------------------------------------------
        //
        // Relevée sur barnes-provence-littoral.com (variables CSS du site) —
        // c'est la source, et elle prime sur toute teinte héritée de la
        // maquette d'origine.
        //
        //   --primary-500   #B4002F   l'accent, le rouge Barnes
        //   --secondary-500 #3C3C3C   le corps de texte
        //   --grey-500      #808080   la navigation, le texte secondaire
        //   --grey-50       #F5F5F5   le fond des sections
        //
        barnes: '#B4002F', // Rouge Barnes — accent unique (CTA, filets, actifs)
        'barnes-sombre': '#900026', // primary-600 — survol/appui du rouge
        'barnes-clair': '#D25878', // primary-300 — filets et fonds très légers
        encre: '#3C3C3C', // Corps de texte, et les surfaces sombres du parcours
        ardoise: '#808080', // Navigation, mentions secondaires
        papier: '#F5F5F5', // Fond du site — et, depuis cette passe, du rapport

        // --- Noms hérités -------------------------------------------------
        //
        // La maquette d'origine nommait ses teintes `ink` / `stone` / `brass`
        // et le rapport `marine` / `corail`. Ces noms sont conservés parce
        // qu'ils sont posés dans plus de sept mille lignes de JSX, mais leurs
        // *valeurs* sont désormais celles de la charte ci-dessus : un
        // `text-ink` rend le gris du corps de texte Barnes, un `text-brass` le
        // rouge Barnes. Rien de doré, rien de bleu marine ne subsiste.
        //
        // À n'utiliser que là où ils sont déjà ; le code neuf prend les noms de
        // charte.
        ink: '#3C3C3C', // ← encre
        stone: '#F5F5F5', // ← papier
        brass: '#B4002F', // ← barnes
        marine: '#3C3C3C', // ← encre — colonne « Votre bien », structure du rapport
        corail: '#B4002F', // ← barnes — colonne « bâti », accents du rapport
        // Seule teinte hors charte conservée : l'état « confirmé ». C'est une
        // couleur de statut, pas une couleur de marque — et le rouge, qui est
        // l'accent Barnes, ne peut pas dire « validé » sans dire aussi
        // « erreur ».
        bottle: '#1F3B2E',
      },
      fontFamily: {
        // Les deux familles du site de référence. `mono` n'en est pas une
        // troisième : le site n'embarque aucune monospace, et le rôle que la
        // maquette lui donnait — étiquette capitale très espacée — y est tenu
        // par du Roboto. Elle est donc repointée plutôt que supprimée, ce qui
        // convertit d'un coup toutes les étiquettes `font-mono` du parcours et
        // du rapport sans toucher à leur balisage. Roboto porte des chiffres
        // tabulaires, ce dont ces étiquettes ont besoin (voir `index.css`).
        display: ['Prata', 'Georgia', 'serif'],
        sans: ['Roboto', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['Roboto', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
      fontSize: {
        // Échelle éditoriale généreuse. L'interlettrage y est *positif* et
        // aligné sur le geste du site (0.025em) : un titre Prata resserré,
        // comme le voulait la maquette d'origine, perdait précisément l'effet
        // de desserrage qui fait la signature de la marque.
        'display-xl': ['clamp(2.75rem, 7vw, 6rem)', { lineHeight: '1.04', letterSpacing: '0.025em' }],
        'display-lg': ['clamp(2.25rem, 5vw, 4rem)', { lineHeight: '1.08', letterSpacing: '0.025em' }],
        'display-md': ['clamp(1.75rem, 3.5vw, 2.75rem)', { lineHeight: '1.12', letterSpacing: '0.025em' }],
      },
      letterSpacing: {
        // Les trois valeurs fortes du site, chacune à son emploi — relevées
        // dans sa feuille de style (`tracking-[1.2px]`, `tracking-[3px]`,
        // `tracking-widest`).
        //
        // `nav` est la seule dont l'usage soit observable en page :
        // barnes-provence-littoral.com la pose sur ses liens d'en-tête et sur
        // ses liens d'appel — Roboto 12 px, capitales, graisse 400.
        //
        // `micro` (0.1em) est la valeur du `tracking-widest` du site ; elle
        // reprend ici le rôle d'étiquette capitale que la maquette d'origine
        // tenait à 0.18em — un desserrage que rien, sur le site, ne justifie.
        //
        // `embleme` (3px) est réservée au mot « BARNES » posé seul, en
        // signature : couverture du rapport et rien d'autre.
        nav: '1.2px',
        micro: '0.1em',
        embleme: '3px',
      },
      maxWidth: {
        content: '1320px',
      },
      transitionTimingFunction: {
        plan: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        // --- Logo Barnes ---------------------------------------------------
        //
        // Deux sautillements, et l'écart entre eux est volontaire : sur l'écran
        // d'adresse le logo est seul en haut de page et peut se permettre du
        // ressort ; sur le formulaire il surmonte le titre d'une page dense, où
        // le même geste deviendrait un tic. `translateY` seul — composite GPU,
        // aucun recalcul de mise en page.
        'logo-bounce': {
          '0%, 62%, 100%': { transform: 'translateY(0)' },
          '70%': { transform: 'translateY(-22%)' },
          '78%': { transform: 'translateY(0)' },
          '85%': { transform: 'translateY(-9%)' },
          '92%': { transform: 'translateY(0)' },
        },
        'logo-bounce-soft': {
          '0%, 70%, 100%': { transform: 'translateY(0)' },
          '80%': { transform: 'translateY(-7%)' },
          '90%': { transform: 'translateY(0)' },
        },
        // Arrivée du logo sur l'écran d'adresse : il tombe de quelques pixels
        // et rebondit — le sautillement en boucle prend la suite sans rupture,
        // puisque tous deux finissent à `translateY(0)`.
        'logo-drop': {
          '0%': { opacity: '0', transform: 'translateY(-60%) scale(0.85)' },
          '55%': { opacity: '1', transform: 'translateY(8%) scale(1.03)' },
          '75%': { transform: 'translateY(-4%) scale(0.99)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Respiration du halo derrière le CTA d'estimation — opacité seule.
        'cta-breath': {
          '0%, 100%': { opacity: '0.25' },
          '50%': { opacity: '0.65' },
        },
        // Scintillement de l'étincelle, désynchronisé du halo.
        'sparkle-shimmer': {
          '0%, 100%': { opacity: '0.72' },
          '50%': { opacity: '1' },
        },
        // Liseré Brass qui tourne autour du CTA (arc conique en rotation).
        'border-spin': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        // Reflet diagonal : un seul passage, puis pause sur le reste du cycle.
        shine: {
          '0%, 62%': { transform: 'translateX(-160%) skewX(-14deg)' },
          '100%': { transform: 'translateX(360%) skewX(-14deg)' },
        },
        // Chiffre en cours de formation : les blocs floutés respirent en opacité
        // et s'étirent à peine. `scaleX` plutôt qu'une largeur animée — composite
        // GPU, aucun recalcul de mise en page à chaque image.
        'figure-forming': {
          '0%, 100%': { opacity: '0.5', transform: 'scaleX(0.97)' },
          '50%': { opacity: '0.92', transform: 'scaleX(1.03)' },
        },
        // Étincelles qui s'allument autour du chiffre, une à une.
        'spark-twinkle': {
          '0%, 100%': { opacity: '0', transform: 'scale(0.55)' },
          '50%': { opacity: '1', transform: 'scale(1)' },
        },
        // Arrivée du CTA final : léger rebond, joué une seule fois.
        'cta-pop': {
          '0%': { opacity: '0', transform: 'scale(0.94)' },
          '60%': { opacity: '1', transform: 'scale(1.02)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        // Icône qui pousse du sol puis y retourne, en boucle. `scaleY` déforme
        // depuis `transform-origin: bottom` (posé côté composant) : l'icône
        // grandit depuis sa base plutôt que de se redimensionner sur son centre.
        'grow-from-ground': {
          '0%, 100%': { opacity: '0', transform: 'translateY(55%) scaleY(0.45)' },
          '18%': { opacity: '1', transform: 'translateY(0%) scaleY(1.08)' },
          '26%': { transform: 'translateY(0%) scaleY(0.96)' },
          '34%': { transform: 'translateY(0%) scaleY(1)' },
          '78%': { opacity: '1', transform: 'translateY(0%) scaleY(1)' },
          '94%': { opacity: '0', transform: 'translateY(30%) scaleY(0.7)' },
        },
        // Rotation d'icônes superposées : chaque copie n'est visible que sur un
        // quart du cycle, décalée par un délai négatif — les quatre fenêtres se
        // succèdent sans blanc ni superposition perceptible.
        'icon-rotate': {
          '0%, 100%': { opacity: '0', transform: 'scale(0.85)' },
          '3%': { opacity: '1', transform: 'scale(1)' },
          '20%': { opacity: '1', transform: 'scale(1)' },
          '25%': { opacity: '0', transform: 'scale(0.85)' },
        },
        // Clignotement du bâtiment armé sur la carte, en attente du second
        // geste de confirmation — opacité seule, appliquée au `<path>` SVG.
        'building-blink': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        // Le sautillement du logo : 2,6 s de cycle dont l'essentiel est immobile
        // — le rebond n'occupe que le dernier tiers, ce qui le rend remarquable
        // plutôt que continu.
        'logo-bounce': 'logo-bounce 2.6s cubic-bezier(0.34, 1.56, 0.64, 1) infinite',
        'logo-bounce-soft': 'logo-bounce-soft 4.2s cubic-bezier(0.34, 1.3, 0.64, 1) infinite',
        'logo-drop': 'logo-drop 0.85s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
        'cta-breath': 'cta-breath 2.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'sparkle-shimmer': 'sparkle-shimmer 2.8s cubic-bezier(0.4, 0, 0.6, 1) 0.7s infinite',
        'border-spin': 'border-spin 4s linear infinite',
        shine: 'shine 3.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        // Tour plus lent pour les grands cadres (carte) : à surface égale, une
        // même vitesse angulaire y paraîtrait bien plus agitée que sur un bouton.
        'border-spin-slow': 'border-spin 6s linear infinite',
        'cta-pop': 'cta-pop 0.7s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both',
        // Décor d'anticipation de la fenêtre de confirmation. Les durées sont
        // premières entre elles : les blocs et les étincelles ne retombent
        // jamais en phase, le motif ne se laisse pas mémoriser.
        'figure-forming': 'figure-forming 2.3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spark-twinkle': 'spark-twinkle 3.1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'grow-from-ground': 'grow-from-ground 4.8s cubic-bezier(0.4, 0, 0.2, 1) infinite',
        'icon-rotate': 'icon-rotate 8s linear infinite',
        'building-blink': 'building-blink 0.9s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
