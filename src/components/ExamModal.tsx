import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Cahier, Exam } from '../types'
import { addExam, db, updateExam } from '../db'
import { DEFAULT_BOOST_DAYS, dayStart } from '../lib/exam'
import { Button, Field, Input, Modal, cx } from './ui'

function toInputDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fromInputDate(s: string): number | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return dayStart(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime())
}

/** Create or edit an exam: name, day, fiches concerned, retention boost window. */
export function ExamModal({ open, onClose, cahier, exam }: { open: boolean; onClose: () => void; cahier: Cahier; exam?: Exam }) {
  const chapitres = useLiveQuery(() => db.chapitres.where('cahierId').equals(cahier.id).sortBy('createdAt'), [cahier.id])
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [boost, setBoost] = useState(DEFAULT_BOOST_DAYS)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(exam?.name ?? '')
    setDate(exam ? toInputDate(exam.date) : '')
    setSelected(new Set(exam?.chapitreIds ?? chapitres?.map((c) => c.id) ?? []))
    setBoost(exam?.boostFromDays ?? DEFAULT_BOOST_DAYS)
    setError(undefined)
    // Preselecting every fiche when creating: `chapitres` is only needed on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exam])

  async function submit() {
    const ts = fromInputDate(date)
    if (!name.trim()) return setError('Donne un nom à cet examen (DS n° 2, colle, partiel…).')
    if (!ts) return setError('Indique la date de l’examen.')
    if (ts < dayStart(Date.now())) return setError('La date est déjà passée.')
    if (selected.size === 0) return setError('Choisis au moins une fiche.')
    setBusy(true)
    try {
      if (exam) await updateExam(cahier.id, exam.id, { name, date: ts, chapitreIds: [...selected], boostFromDays: boost })
      else await addExam(cahier.id, { name, date: ts, chapitreIds: [...selected], boostFromDays: boost })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={exam ? 'Modifier l’examen' : 'Nouvel examen'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy}>
            {exam ? 'Enregistrer' : 'Planifier'}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" error={error && !name.trim() ? error : undefined}>
            {(id) => <Input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="DS de physique n° 2" />}
          </Field>
          <Field label="Date" error={error && name.trim() && (!fromInputDate(date) || fromInputDate(date)! < dayStart(Date.now())) ? error : undefined}>
            {(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Fiches au programme</span>
          {!chapitres?.length ? (
            <p className="text-sm text-muted">Ce cahier n’a pas encore de fiche.</p>
          ) : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {chapitres.map((c) => (
                <li key={c.id}>
                  <label className={cx('flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm', selected.has(c.id) ? 'border-accent bg-accent-soft' : 'border-line-strong')}>
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="size-4 accent-accent" />
                    <span className="truncate">{c.title}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {error && selected.size === 0 && <p className="text-sm text-bad">{error}</p>}
        </div>
        <Field label="Rétention relevée à 95 % à partir de" hint="Jours avant l’examen. Les intervalles des fiches concernées sont de toute façon plafonnés à la moitié du temps restant.">
          {(id) => <Input id={id} type="number" min={0} max={90} value={boost} onChange={(e) => setBoost(Math.max(0, Math.min(90, e.target.valueAsNumber || 0)))} className="max-w-32" />}
        </Field>
        <p className="text-sm text-muted">
          L’app planifie trois séances de <strong className="font-medium text-ink">réapprentissage successif</strong> avant la date : à chaque séance, chaque exercice doit être rappelé correctement une fois (36 % de rétention sans, ~60 % avec une séance, ~80 % avec trois).
        </p>
      </form>
    </Modal>
  )
}
