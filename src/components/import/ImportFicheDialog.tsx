import { useRef, useState, type KeyboardEvent } from 'react'
import { Clipboard, Files, Notebook } from 'lucide-react'
import { Button, Modal, cx } from '../ui'
import { usePasteTab } from './PasteTab'
import { useFilesTab } from './FilesTab'
import { useOneNoteTab } from './OneNoteTab'

type Tab = 'paste' | 'files' | 'onenote'

const TABS: { id: Tab; label: string; icon: typeof Clipboard }[] = [
  { id: 'paste', label: 'Coller', icon: Clipboard },
  { id: 'files', label: 'Fichiers', icon: Files },
  { id: 'onenote', label: 'OneNote', icon: Notebook },
]

export interface ImportFicheDialogProps {
  cahierId: string
  open: boolean
  onClose: () => void
  onImported?: (chapitreIds: string[]) => void
}

/** Adds one or more fiches to a cahier: pasted text, dropped files, or OneNote pages. */
export function ImportFicheDialog(props: ImportFicheDialogProps) {
  // Remount the inner dialog every time it opens so every tab starts from a blank state.
  const [session, setSession] = useState(0)
  const [prevOpen, setPrevOpen] = useState(props.open)
  if (props.open !== prevOpen) {
    setPrevOpen(props.open)
    if (props.open) setSession((s) => s + 1)
  }
  return <DialogInner key={session} {...props} />
}

function DialogInner({ cahierId, open, onClose, onImported }: ImportFicheDialogProps) {
  const [tab, setTab] = useState<Tab>('paste')
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const done = (ids: string[]) => {
    onImported?.(ids)
    onClose()
  }

  const views = {
    paste: usePasteTab({ cahierId, onDone: done }),
    files: useFilesTab({ cahierId, onDone: done }),
    onenote: useOneNoteTab({ cahierId, active: tab === 'onenote', onDone: done }),
  }
  const current = views[tab]

  function onTabKey(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.id === tab)
    let next = i
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    else return
    e.preventDefault()
    setTab(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ajouter des fiches"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          {current.footer}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div role="tablist" aria-label="Source des fiches" onKeyDown={onTabKey} className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
          {TABS.map((t, i) => {
            const active = t.id === tab
            const Icon = t.icon
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el
                }}
                type="button"
                role="tab"
                id={`import-tab-${t.id}`}
                aria-selected={active}
                aria-controls={`import-panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={cx(
                  'flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium press ring-focus',
                  active ? 'bg-surface text-ink shadow-elev-2' : 'text-muted hover:text-ink',
                )}
              >
                <Icon size={16} />
                {t.label}
              </button>
            )
          })}
        </div>
        <div role="tabpanel" id={`import-panel-${tab}`} aria-labelledby={`import-tab-${tab}`}>
          {current.body}
        </div>
      </div>
    </Modal>
  )
}
