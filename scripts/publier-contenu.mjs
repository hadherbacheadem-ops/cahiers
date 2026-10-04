// Turns a Cahiers backup into the content published with the site (public/contenu.json):
// cahiers, fiches, exercises, points, supplements and mind maps — nothing else.
//
//   npm run publier-contenu -- C:/Users/PC/Downloads/cahiers-2026-10-04.json
//
// Left out on purpose: the review journal and each exercise's scheduling (a reader starts with new cards or
// keeps their own), the settings, the deletion records, exercises still waiting for validation, and the
// OneNote page ids. The file is public (GitHub Pages): read what is in it before pushing.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const [input, output = 'public/contenu.json'] = process.argv.slice(2)
if (!input) {
  console.error('Usage : npm run publier-contenu -- <sauvegarde.json> [sortie]')
  process.exit(1)
}

const backup = JSON.parse(readFileSync(input, 'utf8'))
if (backup.app !== 'cahiers') {
  console.error('Ce fichier n’est pas une sauvegarde Cahiers.')
  process.exit(1)
}
const schemaVersion = Number(backup.schemaVersion ?? backup.version ?? 0)
if (schemaVersion < 6) {
  console.error(`Sauvegarde trop ancienne (schéma ${schemaVersion}) : ouvre-la d’abord dans l’application, puis exporte-la de nouveau.`)
  process.exit(1)
}

const list = (v) => (Array.isArray(v) ? v : [])
const omit = (row, keys) => Object.fromEntries(Object.entries(row).filter(([k]) => !keys.includes(k)))

const exercises = list(backup.exercises).filter((e) => e.status !== 'pending')
const kept = new Set(exercises.map((e) => e.id))
const content = {
  app: 'cahiers',
  kind: 'contenu',
  schemaVersion,
  exportedAt: backup.exportedAt,
  cahiers: list(backup.cahiers),
  chapitres: list(backup.chapitres).map((c) => omit(c, ['onenotePageId'])),
  // Suspended / leech cards come back as ordinary ones; the scheduling state is the reader's.
  exercises: exercises.map((e) => ({ ...omit(e, ['fsrs', 'fading', 'forcedDue', 'repaired']), status: e.status === 'leech' || e.status === 'suspended' ? 'active' : e.status })),
  points: list(backup.points),
  supplements: list(backup.supplements),
  mindmaps: list(backup.mindmaps),
}

mkdirSync(dirname(output), { recursive: true })
const json = JSON.stringify(content)
writeFileSync(output, json)
const skipped = list(backup.exercises).length - kept.size
console.log(
  `${output} : ${content.cahiers.length} cahiers, ${content.chapitres.length} fiches, ${content.exercises.length} exercices` +
    `${skipped ? ` (${skipped} en attente de validation écartés)` : ''}, ${content.points.length} points, ${content.supplements.length} compléments, ${content.mindmaps.length} cartes — ${(json.length / 1024).toFixed(0)} Ko`,
)
console.log('Laissés de côté : historique de révision, planification des exercices, réglages, suppressions.')
console.log('Ce fichier sera PUBLIC une fois poussé sur GitHub : relis son contenu avant de pousser.')
