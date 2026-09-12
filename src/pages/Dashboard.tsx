import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, CalendarCheck, Fire, Lightning, Notebook, Plus, Target } from '@phosphor-icons/react'
import { db } from '../db'
import { computeStreak } from '../lib/format'
import { examPhase, formatCountdown, formatExamDay, nextSession } from '../lib/exam'
import { useSettings } from '../lib/useSettings'
import { buildReviewQueue, countToday, estimateMinutes, limitsFor, medianDurationMs } from '../lib/queue'
import { Button, Card, ColorDot, EmptyState, PageHeader, Skeleton, cx, plural } from '../components/ui'
import { NewCahierModal } from '../components/NewCahierModal'

const DAY = 86_400_000

export default function Dashboard() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const settings = useSettings()
  const cahiers = useLiveQuery(() => db.cahiers.orderBy('name').toArray(), [])
  const chapitres = useLiveQuery(() => db.chapitres.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const recent = useLiveQuery(() => db.reviewLogs.where('ts').above(Date.now() - 60 * DAY).toArray(), [])

  const stats = useMemo(() => {
    const now = Date.now()
    const week = recent?.filter((a) => a.ts > now - 7 * DAY) ?? []
    const correct = week.filter((a) => a.correct).length
    const perCahier = new Map<string, { fiches: number; exos: number; due: number }>()
    chapitres?.forEach((c) => {
      const s = perCahier.get(c.cahierId) ?? { fiches: 0, exos: 0, due: 0 }
      s.fiches++
      perCahier.set(c.cahierId, s)
    })
    exercises?.forEach((e) => {
      const s = perCahier.get(e.cahierId) ?? { fiches: 0, exos: 0, due: 0 }
      s.exos++
      perCahier.set(e.cahierId, s)
    })
    // "Due" = what today's review session would actually contain, daily limits included.
    const byId = new Map((cahiers ?? []).map((c) => [c.id, c]))
    const queue =
      settings && exercises
        ? buildReviewQueue({ exercises, limitsByCahier: (id) => limitsFor(byId.get(id), settings), countsByCahier: countToday(recent ?? [], now), now })
        : []
    queue.forEach((e) => {
      const s = perCahier.get(e.cahierId)
      if (s) s.due++
    })
    return {
      due: queue.length,
      minutes: estimateMinutes(queue.length, medianDurationMs(recent ?? [])),
      total: exercises?.length ?? 0,
      weekCount: week.length,
      accuracy: week.length ? Math.round((correct / week.length) * 100) : null,
      streak: computeStreak(recent?.map((a) => a.ts) ?? []),
      perCahier,
    }
  }, [exercises, chapitres, recent, cahiers, settings])

  const loading = !cahiers || !chapitres || !exercises || !settings

  const upcomingExams = useMemo(
    () =>
      (cahiers ?? [])
        .flatMap((c) => (c.examens ?? []).filter((e) => !e.archived && examPhase(e) !== 'past').map((exam) => ({ cahier: c, exam })))
        .sort((a, b) => a.exam.date - b.exam.date)
        .slice(0, 3),
    [cahiers],
  )

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Tableau de bord"
        subtitle={stats.total ? `${plural(stats.total, 'exercice')} dans ${plural(cahiers?.length ?? 0, 'cahier')}.` : 'Importe tes fiches de cours, génère des exercices avec Claude, puis entraîne-toi.'}
        actions={
          <Button onClick={() => setCreating(true)} variant="secondary">
            <Plus size={16} weight="bold" />
            Nouveau cahier
          </Button>
        }
      />

      {/* Today */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col justify-between gap-6 p-5 md:col-span-2">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted">
              <Target size={16} />
              À réviser aujourd’hui
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">{loading ? '–' : stats.due}</span>
              <span className="text-sm text-muted">
                {stats.due === 1 ? 'exercice' : 'exercices'}
                {stats.due > 0 ? ` · ~${stats.minutes} min` : ''}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!stats.due} onClick={() => navigate('/train?scope=all&mode=review&from=/')}>
              Lancer la révision
              <ArrowRight size={16} weight="bold" />
            </Button>
            <Button variant="secondary" disabled={!stats.total} onClick={() => navigate('/train?scope=all&mode=chrono&from=/')}>
              <Lightning size={16} weight="fill" />
              Mode chrono
            </Button>
          </div>
        </Card>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
          <Card className="p-5">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Fire size={16} />
              Série
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {stats.streak} <span className="text-sm font-normal text-muted">{stats.streak === 1 ? 'jour' : 'jours'}</span>
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-sm text-muted">Cette semaine</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {stats.weekCount}
              <span className="ml-1 text-sm font-normal text-muted">réponses{stats.accuracy !== null ? ` · ${stats.accuracy} %` : ''}</span>
            </div>
          </Card>
        </div>
      </section>

      {upcomingExams.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Examens à venir</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingExams.map(({ cahier, exam }) => {
              const next = nextSession(exam)
              const done = exam.sessions.filter((s) => s.done).length
              return (
                <li key={exam.id} className="flex flex-col gap-3 rounded-xl border border-accent/40 bg-surface p-4 shadow-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-xs text-muted">
                        <ColorDot color={cahier.color} /> {cahier.name}
                      </p>
                      <p className="mt-0.5 truncate font-medium">{exam.name}</p>
                      <p className="text-xs text-muted">{formatExamDay(exam.date)}</p>
                    </div>
                    <span className="shrink-0 rounded-md bg-accent-soft px-2 py-0.5 text-sm font-semibold text-accent tabular-nums">{formatCountdown(exam.date)}</span>
                  </div>
                  <div className="flex items-center gap-1" aria-label={`${done} séances sur ${exam.sessions.length} faites`}>
                    {exam.sessions.map((s, i) => (
                      <span key={i} className={cx('h-1.5 flex-1 rounded-full', s.done ? 'bg-ok' : next?.index === i ? 'bg-accent' : 'bg-line')} title={`Séance ${i + 1} · ${formatExamDay(s.at)}${s.done ? ' · faite' : ''}`} />
                    ))}
                  </div>
                  {next ? (
                    <Button size="sm" onClick={() => navigate(`/train?mode=exam&exam=${exam.id}&session=${next.index}&from=/`)}>
                      <CalendarCheck size={14} weight="fill" />
                      Séance {next.index + 1}
                      {next.late ? ' (en retard)' : ` · ${formatExamDay(next.session.at)}`}
                    </Button>
                  ) : (
                    <p className="text-sm text-ok">Plan terminé : les trois séances sont faites.</p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Cahiers */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold tracking-tight">Mes cahiers</h2>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : cahiers.length === 0 ? (
          <EmptyState
            icon={<Notebook size={24} />}
            title="Aucun cahier pour l’instant"
            description="Crée un cahier par matière. Tu y rangeras tes fiches de cours et les exercices générés."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} weight="bold" />
                Créer mon premier cahier
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cahiers.map((c) => {
              const s = stats.perCahier.get(c.id) ?? { fiches: 0, exos: 0, due: 0 }
              return (
                <Link
                  key={c.id}
                  to={`/cahier/${c.id}`}
                  className="group rounded-xl border border-line bg-surface p-5 shadow-card press ring-focus hover:border-line-strong"
                >
                  <div className="flex items-center gap-2.5">
                    <ColorDot color={c.color} className="size-3" />
                    <span className="truncate font-semibold">{c.name}</span>
                  </div>
                  <p className="mt-3 text-sm text-muted">
                    {plural(s.fiches, 'fiche')} · {plural(s.exos, 'exercice')}
                  </p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className={cx('text-sm font-medium', s.due ? 'text-accent' : 'text-muted')}>{s.exos === 0 ? 'Pas encore d’exercice' : s.due ? `${s.due} à revoir` : 'À jour'}</span>
                    <ArrowRight size={16} className="text-muted transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      <NewCahierModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
