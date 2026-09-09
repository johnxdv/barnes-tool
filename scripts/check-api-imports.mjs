// Vérifie que chaque fonction serverless de `api/` se charge sous Node.
//
// Raison d'être : Vite résout les imports du front (alias, extensions
// omises, JSX) ; Vercel, lui, exécute les fichiers d'`api/` en ESM Node pur,
// qui n'en résout aucun. Un module partagé entre les deux mondes — et il y en
// a, `api/estimation.js` important `src/lib/typeBien.js` — peut donc marcher
// parfaitement en local et ne pas démarrer du tout en production.
//
// C'est exactement ce qui s'est produit : `import … from './geo'`, sans
// extension, a mis le moteur d'estimation hors service pendant plusieurs
// déploiements. Le front n'y voyait qu'un `null` de plus, et l'écran résultat
// affichait « — € » sans qu'aucune trace ne remonte.
//
// Le contrôle ne fait qu'importer les modules : il ne les appelle pas. Cela
// suffit — l'erreur recherchée se produit au chargement, avant tout handler,
// et hors de portée du moindre `try/catch` applicatif. Aucun réseau n'est
// touché, le contrôle tient en quelques dizaines de millisecondes.
//
// Branché sur `npm run build`, donc sur la construction Vercel : une
// régression de ce type fait échouer le déploiement au lieu de le réussir
// avec un moteur mort.

import { readdir } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const API_DIR = path.resolve(import.meta.dirname, '..', 'api')

const entries = (await readdir(API_DIR, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => entry.name)
  .sort()

if (entries.length === 0) {
  console.error('api/ — aucune fonction trouvée, le contrôle ne vérifie rien.')
  process.exit(1)
}

const failures = []

for (const name of entries) {
  try {
    const module = await import(pathToFileURL(path.join(API_DIR, name)).href)

    // Vercel appelle `default` : un module qui se charge mais n'exporte rien
    // échouerait à la première requête, ce qui revient au même.
    if (typeof module.default !== 'function') {
      throw new Error('pas d’export `default` appelable')
    }

    console.log(`  ✓ api/${name}`)
  } catch (error) {
    failures.push({ name, error })
    console.log(`  ✗ api/${name}`)
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} fonction(s) ne démarreraient pas en production :\n`)
  for (const { name, error } of failures) {
    console.error(`api/${name} — ${error?.code ?? 'Erreur'} : ${error?.message ?? error}`)
  }
  process.exit(1)
}

console.log(`\n${entries.length} fonction(s) serverless chargées sans erreur.`)
