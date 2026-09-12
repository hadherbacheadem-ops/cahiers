import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check } from 'lucide-react'
import { CAHIER_COLORS, type Cahier } from '../types'
import { createCahier, updateCahier } from '../db'
import { Button, Field, Input, Modal, cx } from './ui'

/** Create a cahier, or edit one when `cahier` is given. */
export function NewCahierModal({ open, onClose, cahier }: { open: boolean; onClose: () => void; cahier?: Cahier }) {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [color, setColor] = useState(CAHIER_COLORS[0].value)
  const [newPerDay, setNewPerDay] = useState('')
  const [reviewsMaxPerDay, setReviewsMaxPerDay] = useState('')
  const [lexical, setLexical] = useState(false)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setName(cahier?.name ?? '')
      setColor(cahier?.color ?? CAHIER_COLORS[Math.floor(Math.random() * CAHIER_COLORS.length)].value)
      setNewPerDay(cahier?.limits?.newPerDay?.toString() ?? '')
      setReviewsMaxPerDay(cahier?.limits?.reviewsMaxPerDay?.toString() ?? '')
      setLexical(cahier?.lexical ?? false)
      setError(undefined)
    }
  }, [open, cahier])

  function parseLimit(v: string): number | undefined {
    const n = Number.parseInt(v, 10)
    return Number.isFinite(n) && n >= 0 ? n : undefined
  }

  async function submit() {
    if (!name.trim()) {
      setError('Donne un nom à ce cahier.')
      return
    }
    setBusy(true)
    try {
      if (cahier) {
        const limits = { newPerDay: parseLimit(newPerDay), reviewsMaxPerDay: parseLimit(reviewsMaxPerDay) }
        await updateCahier(cahier.id, { name, color, lexical: lexical || undefined, limits: limits.newPerDay === undefined && limits.reviewsMaxPerDay === undefined ? undefined : limits })
      } else {
        const created = await createCahier(name, color)
        navigate(`/cahier/${created.id}`)
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={cahier ? 'Modifier le cahier' : 'Nouveau cahier'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            {cahier ? 'Enregistrer' : 'Créer le cahier'}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field label="Matière" error={error} hint="Un cahier par matière : Histoire, Biologie, Droit…">
          {(id) => <Input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Physique-Chimie" aria-invalid={!!error} />}
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Couleur</span>
          <div className="flex flex-wrap gap-2">
            {CAHIER_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={color === c.value}
                onClick={() => setColor(c.value)}
                className={cx('flex size-8 items-center justify-center rounded-lg press ring-focus', color === c.value && 'ring-2 ring-offset-2 ring-offset-surface')}
                style={{ background: c.value, ['--tw-ring-color' as string]: c.value }}
              >
                {color === c.value && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
        </div>
        {cahier && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-strong px-3 py-2 text-sm">
            <input type="checkbox" checked={lexical} onChange={(e) => setLexical(e.target.checked)} className="mt-0.5 size-4 accent-accent" />
            <span>
              Matière de vocabulaire / lexique
              <span className="block text-xs text-muted">Les révisions restent groupées par fiche au lieu d’être mélangées : l’entrelacement aide en maths et en sciences, il nuit au vocabulaire.</span>
            </span>
          </label>
        )}
        {cahier && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nouveaux par jour" hint="Vide = réglage global.">
              {(id) => <Input id={id} type="number" min={0} max={500} value={newPerDay} onChange={(e) => setNewPerDay(e.target.value)} placeholder="global" />}
            </Field>
            <Field label="Révisions max. par jour" hint="Vide = réglage global.">
              {(id) => <Input id={id} type="number" min={0} max={2000} value={reviewsMaxPerDay} onChange={(e) => setReviewsMaxPerDay(e.target.value)} placeholder="global" />}
            </Field>
          </div>
        )}
      </form>
    </Modal>
  )
}
