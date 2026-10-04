import { useRef, useState, type FormEvent } from 'react'
import { Lock, LockOpen } from 'lucide-react'
import { checkCode, setAdmin, useIsAdmin } from '../lib/admin'
import { Button, Field, Input, Modal, toast } from './ui'

/**
 * A small, discreet padlock at the bottom of Réglages. Locked: asks for the administrator code.
 * Unlocked (on this device): shows the buttons to load a backup; the padlock locks again on a tap.
 */
export function AdminLock() {
  const admin = useIsAdmin()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const failures = useRef(0)

  function close() {
    setOpen(false)
    setCode('')
    setError(undefined)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(undefined)
    try {
      if (await checkCode(code)) {
        failures.current = 0
        setAdmin(true)
        close()
        toast('Mode administrateur activé sur cet appareil.', 'ok')
        return
      }
      failures.current++
      // Each wrong code costs a little more time.
      await new Promise((r) => window.setTimeout(r, Math.min(failures.current, 5) * 700))
      setError('Code incorrect.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <button
          type="button"
          data-action="admin"
          aria-label={admin ? 'Verrouiller l’accès administrateur' : 'Accès administrateur'}
          title={admin ? 'Mode administrateur : toucher pour verrouiller' : undefined}
          onClick={() => {
            if (admin) {
              setAdmin(false)
              toast('Accès administrateur verrouillé.')
            } else setOpen(true)
          }}
          className={`inline-flex size-9 items-center justify-center rounded-md text-muted ring-focus transition-opacity ${admin ? 'opacity-70 hover:opacity-100' : 'opacity-20 hover:opacity-80 focus-visible:opacity-100'}`}
        >
          {admin ? <LockOpen size={15} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
        </button>
      </div>
      <Modal
        open={open}
        onClose={close}
        title="Accès administrateur"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Annuler
            </Button>
            <Button type="submit" form="admin-code-form" disabled={!code.trim() || busy} loading={busy}>
              Déverrouiller
            </Button>
          </>
        }
      >
        <form id="admin-code-form" onSubmit={submit} className="flex flex-col gap-3">
          <Field label="Code" error={error}>
            {(id) => (
              <Input
                id={id}
                type="password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                aria-invalid={!!error}
                autoFocus
              />
            )}
          </Field>
        </form>
      </Modal>
    </>
  )
}
