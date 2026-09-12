import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, CalendarCheck, Check, Lightning, Pencil, Plus, Trash } from '@phosphor-icons/react'
import type { Cahier, Exam } from '../types'
import { removeExam, updateExam } from '../db'
import { examPhase, formatCountdown, formatExamDay, nextSession } from '../lib/exam'
import { Badge, Button, IconButton, cx, plural } from './ui'
import { ExamModal } from './ExamModal'

/** Exams of a cahier: countdown, the three-session plan, cramming, archive after the day. */
export function ExamsSection({ cahier, chapitreCount }: { cahier: Cahier; chapitreCount: number }) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState<Exam | 'new' | null>(null)
  const exams = (cahier.examens ?? []).filter((e) => !e.archived).sort((a, b) => a.date - b.date)
  const from = `/cahier/${cahier.id}`

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Examens</h2>
        <Button variant="secondary" size="sm" onClick={() => setEditing('new')} disabled={chapitreCount === 0} title={chapitreCount === 0 ? 'Ajoute d’abord des fiches' : undefined}>
          <Plus size={14} weight="bold" />
          Ajouter un examen
        </Button>
      </div>
      {exams.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-sm text-muted">
          Déclare un DS, une colle ou un partiel : les intervalles des fiches concernées sont plafonnés, la rétention visée monte à 95 % à l’approche, et trois séances de réapprentissage sont planifiées.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {exams.map((exam) => {
            const phase = examPhase(exam)
            const next = nextSession(exam)
            const done = exam.sessions.filter((s) => s.done).length
            return (
              <li key={exam.id} className={cx('rounded-xl border bg-surface p-4 shadow-card', phase === 'past' ? 'border-line' : 'border-accent/40')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{exam.name}</h3>
                      <Badge tone={phase === 'past' ? 'neutral' : phase === 'today' ? 'warn' : 'accent'}>{formatCountdown(exam.date)}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-muted">
                      {formatExamDay(exam.date)} · {plural(exam.chapitreIds.length, 'fiche')} · rétention 95 % à partir de J−{exam.boostFromDays}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {phase !== 'past' && (
                      <IconButton label="Modifier l’examen" onClick={() => setEditing(exam)}>
                        <Pencil size={16} />
                      </IconButton>
                    )}
                    <IconButton
                      label="Supprimer l’examen"
                      onClick={() => {
                        if (window.confirm(`Supprimer l’examen « ${exam.name} » ?`)) removeExam(cahier.id, exam.id)
                      }}
                    >
                      <Trash size={16} />
                    </IconButton>
                  </div>
                </div>

                {phase === 'past' ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                    <span>L’examen est passé : la rétention visée et l’intervalle maximal des fiches reviennent aux réglages généraux.</span>
                    <Button size="sm" variant="secondary" onClick={() => updateExam(cahier.id, exam.id, { archived: true })}>
                      <Archive size={14} />
                      Archiver
                    </Button>
                  </div>
                ) : (
                  <>
                    <ol className="mt-3 grid gap-2 sm:grid-cols-3">
                      {exam.sessions.map((s, i) => {
                        const isNext = next?.index === i
                        return (
                          <li key={i} className={cx('flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm', s.done ? 'border-ok bg-ok-soft' : isNext ? 'border-accent bg-accent-soft' : 'border-line-strong')}>
                            <span className={cx('flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold', s.done ? 'bg-ok text-white' : 'bg-surface-2 text-muted')}>{s.done ? <Check size={14} weight="bold" /> : i + 1}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-medium">Séance {i + 1}</span>
                              <span className="block text-xs text-muted">
                                {formatExamDay(s.at)}
                                {isNext && next?.late ? ' · en retard' : ''}
                                {s.done ? ' · faite' : ''}
                              </span>
                            </span>
                          </li>
                        )
                      })}
                    </ol>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {next ? (
                        <Button size="sm" onClick={() => navigate(`/train?mode=exam&exam=${exam.id}&session=${next.index}&from=${from}`)}>
                          <CalendarCheck size={14} weight="fill" />
                          Lancer la séance {next.index + 1}
                        </Button>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm text-ok">
                          <Check size={14} weight="bold" /> {plural(done, 'séance faite', 'séances faites')} : plan terminé.
                        </span>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/train?mode=cramming&exam=${exam.id}&from=${from}`)} title="Tout revoir, du plus fragile au plus solide, sans toucher au planning">
                        <Lightning size={14} weight="fill" />
                        Réviser tout maintenant
                      </Button>
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <ExamModal open={editing !== null} onClose={() => setEditing(null)} cahier={cahier} exam={editing && editing !== 'new' ? editing : undefined} />
    </section>
  )
}
