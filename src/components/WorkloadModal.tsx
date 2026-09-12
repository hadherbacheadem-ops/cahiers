import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Check } from '@phosphor-icons/react'
import type { Cahier } from '../types'
import { bulkUpdateFsrs, db } from '../db'
import { useSettings } from '../lib/useSettings'
import { makeScheduler } from '../lib/fsrs'
import { advanceable, planAdvance, planPostpone, postponable } from '../lib/workload'
import { Button, Field, Input, Modal, plural } from './ui'

export type WorkloadKind = 'postpone' | 'advance'

/**
 * Reporter / Avancer: moves due dates only (memory state untouched). Postponing
 * picks the cards that lose the least; advancing the ones most at risk.
 */
export function WorkloadModal({ open, onClose, cahier, kind }: { open: boolean; onClose: () => void; cahier: Cahier; kind: WorkloadKind }) {
  const settings = useSettings()
  const exercises = useLiveQuery(() => db.exercises.where('cahierId').equals(cahier.id).toArray(), [cahier.id])
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)

  const now = Date.now()
  const candidates = useMemo(() => (exercises ? (kind === 'postpone' ? postponable(exercises, now) : advanceable(exercises, now)).length : 0), [exercises, kind, now])

  useEffect(() => {
    if (open) setCount(Math.max(1, Math.round(candidates * 0.25)))
  }, [open, candidates])

  const plan = useMemo(() => {
    if (!settings || !exercises) return null
    const scheduler = makeScheduler({ desiredRetention: settings.desiredRetention, maximumInterval: settings.maximumInterval })
    return kind === 'postpone' ? planPostpone(scheduler, exercises, count, now) : planAdvance(scheduler, exercises, count, now)
  }, [settings, exercises, kind, count, now])

  async function apply() {
    if (!plan?.changes.length) return
    setBusy(true)
    try {
      await bulkUpdateFsrs(plan.changes)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const pct = (v: number) => `${Math.round(v * 100)} %`
  const isPostpone = kind === 'postpone'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isPostpone ? 'Reporter des révisions' : 'Avancer des révisions'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={apply} disabled={busy || !plan?.changes.length}>
            <Check size={16} weight="bold" />
            {isPostpone ? 'Reporter' : 'Avancer'} {plan ? plural(plan.changes.length, 'exercice') : ''}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          {isPostpone
            ? 'Repousse les exercices dus dont la mémoire est la plus solide (ceux qui perdent le moins à attendre), d’au moins un jour. Le planificateur n’oublie rien : ils reviendront.'
            : 'Fait revenir aujourd’hui les exercices pas encore dus dont le souvenir est le plus fragile. Utile avant une échéance ou un jour où tu as du temps.'}
        </p>
        <Field label={isPostpone ? 'Nombre d’exercices à reporter' : 'Nombre d’exercices à avancer'} hint={`${plural(candidates, 'exercice')} ${isPostpone ? 'dus' : 'pas encore dus'} dans ce cahier.`}>
          {(id) => <Input id={id} type="number" min={0} max={candidates} value={count} onChange={(e) => setCount(Math.max(0, Math.min(candidates, e.target.valueAsNumber || 0)))} className="max-w-40" />}
        </Field>
        {plan && plan.changes.length > 0 && (
          <div className="rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm">
            <p className="font-medium">Impact estimé sur ces {plan.changes.length} exercices</p>
            <p className="mt-1 text-muted">
              Probabilité de rappel moyenne : {pct(plan.retentionBefore)} → <span className="text-ink">{pct(plan.retentionAfter)}</span>
              {isPostpone ? ' au moment où ils reviendront.' : ' aujourd’hui, au lieu d’attendre leur date prévue.'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
