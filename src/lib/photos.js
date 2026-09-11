// Photos du bien — lecture, réduction, et mise à l'écart des charges utiles.
//
// L'agent photographie le bien avec son téléphone et dépose les clichés dans le
// formulaire de caractéristiques ; le rapport leur consacre une page. Rien
// n'est téléversé nulle part : les images vivent dans l'onglet, le temps du
// parcours, et s'impriment depuis la page comme n'importe quelle image. C'est
// ce que demande la démonstration, et c'est aussi ce qui la rend possible sans
// stockage, sans compte et sans consentement à recueillir.
//
// Deux précautions, et elles tiennent toutes deux au poids :
//
//  1. **Chaque cliché est réduit avant d'entrer dans l'état.** Un appareil
//     moderne rend 4 à 8 Mo par photo ; douze d'entre elles en `data:` URL
//     feraient plus de cent mégaoctets à garder en mémoire, à re-rendre à
//     chaque frappe du rapport et à composer à l'impression. Réduites au format
//     ci-dessous, elles pèsent quelques centaines de kilooctets et restent
//     nettes sur une demi-page A4.
//
//  2. **Elles ne partent jamais au serveur.** Ni le moteur d'estimation ni
//     l'assemblage du rapport n'en ont l'usage — aucun calcul ne les regarde —
//     et les laisser dans la charge utile ferait des requêtes de plusieurs
//     mégaoctets, que la fonction serverless refuserait. D'où `sansPhotos`,
//     posé sur les deux appels.

/** Nombre de clichés retenus. Au-delà, la page du rapport cesse d'être lisible. */
export const MAX_PHOTOS = 12

/**
 * Côté le plus long après réduction, en pixels.
 *
 * Une photo occupe au plus une demi-largeur de page A4, soit ~85 mm : à 300
 * points par pouce, l'impression n'en tire pas plus de 1 000 pixels. 1 600
 * laisse la marge d'un recadrage sans peser inutilement.
 */
const COTE_MAX = 1600

/** Qualité JPEG. Au-delà de 0,85, le poids double sans gain visible à l'écran. */
const QUALITE = 0.82

/** Le fichier déposé est-il une image que le navigateur saura décoder ? */
const estImage = (fichier) => typeof fichier?.type === 'string' && fichier.type.startsWith('image/')

/**
 * Lit un fichier et rend une image décodée.
 *
 * `createImageBitmap` serait plus direct, mais il ignore l'orientation EXIF sur
 * une partie des navigateurs : une photo prise à la verticale ressortirait
 * couchée. L'élément `<img>`, lui, applique l'orientation déclarée.
 */
function chargerImage(fichier) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Image illisible'))
    }
    image.src = url
  })
}

/**
 * Réduit une image et la rend en `data:` URL JPEG.
 *
 * Le JPEG est imposé quelle que soit l'entrée : un PNG d'appareil photo pèse
 * plusieurs fois son équivalent JPEG pour un contenu photographique, et la page
 * du rapport n'a pas de transparence à préserver.
 */
async function reduire(fichier) {
  const image = await chargerImage(fichier)
  const facteur = Math.min(1, COTE_MAX / Math.max(image.naturalWidth, image.naturalHeight))

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(image.naturalWidth * facteur)
  canvas.height = Math.round(image.naturalHeight * facteur)

  const contexte = canvas.getContext('2d')
  contexte.drawImage(image, 0, 0, canvas.width, canvas.height)

  return {
    src: canvas.toDataURL('image/jpeg', QUALITE),
    largeur: canvas.width,
    hauteur: canvas.height,
  }
}

/**
 * Transforme une sélection de fichiers en photos exploitables par le rapport.
 *
 * Ne lève jamais : un fichier illisible — image corrompue, format exotique que
 * le navigateur refuse de décoder — est simplement écarté. Déposer dix photos
 * dont une est abîmée doit en ajouter neuf, pas échouer sur les dix.
 *
 * L'identifiant est tiré au hasard plutôt que du rang : il sert de clé de rendu
 * et de clé de suppression, et un rang se décale dès qu'un cliché est retiré.
 */
export async function lirePhotos(fichiers, { restant = MAX_PHOTOS } = {}) {
  const retenus = Array.from(fichiers ?? [])
    .filter(estImage)
    .slice(0, Math.max(restant, 0))

  const lues = await Promise.all(
    retenus.map(async (fichier) => {
      try {
        const { src, largeur, hauteur } = await reduire(fichier)
        return {
          id: `photo-${Math.random().toString(36).slice(2, 10)}`,
          nom: fichier.name ?? '',
          src,
          largeur,
          hauteur,
        }
      } catch (error) {
        console.error('[photos] Cliché écarté —', fichier?.name, error?.message ?? error)
        return null
      }
    }),
  )

  return lues.filter(Boolean)
}

/**
 * Les caractéristiques sans leurs photos — la forme sous laquelle elles partent
 * au serveur.
 *
 * Rend `null` tel quel : les deux appels transmettent volontiers un formulaire
 * absent, et le serveur sait le lire.
 */
export function sansPhotos(characteristics) {
  if (!characteristics || typeof characteristics !== 'object') return characteristics ?? null

  const { photos, ...reste } = characteristics
  return reste
}
