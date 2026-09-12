import type { ReactNode } from 'react'
import type { TrainMode } from '../types'
import { Kbd, Modal } from './ui'

interface Shortcut {
  keys: ReactNode
  label: string
  /** Modes where the row applies; undefined = every mode. */
  modes?: TrainMode[]
}

interface Section {
  title: string
  rows: Shortcut[]
  modes?: TrainMode[]
}

function K({ children }: { children: ReactNode }) {
  return <Kbd>{children}</Kbd>
}

function Or({ a, b }: { a: ReactNode; b: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      <K>{a}</K>
      <span className="text-xs text-muted">ou</span>
      <K>{b}</K>
    </span>
  )
}

const SECTIONS: Section[] = [
  {
    title: 'Général',
    rows: [
      { keys: <K>Échap</K>, label: 'Quitter la session' },
      { keys: <K>?</K>, label: 'Cette aide' },
      { keys: <K>Ctrl+Z</K>, label: 'Annuler la dernière réponse', modes: ['review'] },
      { keys: <K>E</K>, label: 'Modifier l’exercice' },
      { keys: <K>-</K>, label: 'Enterrer (revoir demain)', modes: ['review'] },
      { keys: <K>@</K>, label: 'Suspendre l’exercice' },
    ],
  },
  {
    title: 'Flashcard / démonstration',
    rows: [
      { keys: <Or a="Espace" b="Entrée" />, label: 'Révéler la réponse' },
      { keys: <K>1</K>, label: 'Encore', modes: ['review', 'practice'] },
      { keys: <K>2</K>, label: 'Difficile', modes: ['review', 'practice'] },
      { keys: <K>3</K>, label: 'Bien', modes: ['review', 'practice'] },
      { keys: <K>4</K>, label: 'Facile', modes: ['review', 'practice'] },
      { keys: <K>1</K>, label: 'Raté', modes: ['chrono'] },
      { keys: <K>2</K>, label: 'Su', modes: ['chrono'] },
    ],
  },
  {
    title: 'Confiance (avant la réponse, si activée)',
    modes: ['review', 'practice'],
    rows: [
      { keys: <K>S</K>, label: 'Sûr' },
      { keys: <K>H</K>, label: 'Hésitant' },
      { keys: <K>A</K>, label: 'Aucune idée' },
    ],
  },
  {
    title: 'Texte à trous',
    rows: [
      { keys: <K>Tab</K>, label: 'Trou suivant' },
      { keys: <K>Entrée</K>, label: 'Valider' },
    ],
  },
  {
    title: 'QCM',
    rows: [
      { keys: <Or a="1 à 9" b="A à Z" />, label: 'Choisir une réponse' },
      { keys: <K>Entrée</K>, label: 'Valider (choix multiples)' },
    ],
  },
  {
    title: 'Vrai / Faux',
    rows: [
      { keys: <Or a="V" b="←" />, label: 'Vrai' },
      { keys: <Or a="F" b="→" />, label: 'Faux' },
    ],
  },
  {
    title: 'Association / classement',
    rows: [
      { keys: <Or a="Entrée" b="Espace" />, label: 'Sélectionner un élément' },
      { keys: <K>← ↑ ↓ →</K>, label: 'Se déplacer' },
    ],
  },
  {
    title: 'Après une réponse',
    rows: [{ keys: <K>Entrée</K>, label: 'Continuer' }],
  },
]

function applies(modes: TrainMode[] | undefined, mode: TrainMode) {
  return !modes || modes.includes(mode)
}

/** The shortcut tables, filtered for `mode`; shared by the modal (desktop) and the /aide page (mobile). */
export function HelpSections({ mode }: { mode: 'review' | 'practice' | 'chrono' }) {
  const sections = SECTIONS.filter((s) => applies(s.modes, mode))
    .map((s) => ({ ...s, rows: s.rows.filter((r) => applies(r.modes, mode)) }))
    .filter((s) => s.rows.length > 0)
  return (
    <div className="flex flex-col gap-5">
      {sections.map((s) => (
        <section key={s.title}>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted">{s.title}</h3>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1.5 text-sm">
            {s.rows.map((r, i) => (
              <div key={i} className="contents">
                <dt className="flex justify-end whitespace-nowrap">{r.keys}</dt>
                <dd className="min-w-0">{r.label}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

/** Lists the session shortcuts; rows that do not apply to `mode` are hidden. */
export function KeyboardHelp({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: 'review' | 'practice' | 'chrono' }) {
  return (
    <Modal open={open} onClose={onClose} title="Raccourcis clavier">
      <HelpSections mode={mode} />
    </Modal>
  )
}
