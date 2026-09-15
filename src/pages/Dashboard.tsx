import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { VIEW_TRANSITIONS } from '../lib/media'
import { updateAppBadge } from '../lib/badge'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowRight, CalendarCheck, Flame, Plus, Zap } from 'lucide-react'
import { db } from '../db'
import { examPhase, formatCountdown, formatExamDay, nextSession, overridesFor } from '../lib/exam'
import { makeScheduler } from '../lib/fsrs'
import { activityByDay, estimatedRetention, lenientStreak } from '../lib/stats'
import { useSettings } from '../lib/useSettings'
import { buildReviewQueue, countToday, estimateMinutes, limitsFor, medianDurationMs } from '../lib/queue'
import { Button, Card, ColorDot, Counter, EmptyState, PageHeader, ProgressRing, SegmentedBar, Skeleton, cx, plural } from '../components/ui'
import { NewCahierModal } from '../components/NewCahierModal'

const DAY = 86_400_000
const HEAT_WEEKS = 16

export default function Dashboard() {
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const settings = useSettings()
  const cahiers = useLiveQuery(() => db.cahiers.orderBy('name').toArray(), [])
  const chapitres = useLiveQuery(() => db.chapitres.toArray(), [])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const recent = useLiveQuery(
    () =>
      db.reviewLogs
        .where('ts')
        .above(Date.now() - (HEAT_WEEKS * 7 + 7) * DAY)
        .toArray(),
    [],
  )

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
        ? buildReviewQueue({
            exercises,
            limitsByCahier: (id) => limitsFor(byId.get(id), settings),
            countsByCahier: countToday(recent ?? [], now),
            now,
          })
        : []
    queue.forEach((e) => {
      const s = perCahier.get(e.cahierId)
      if (s) s.due++
    })
    // Knowledge kept: mean retrievability of the active cards under the current schedulers.
    let retention: number | null = null
    if (settings && exercises && cahiers) {
      const overrides = overridesFor(
        cahiers.flatMap((c) => c.examens ?? []),
        settings.maximumInterval,
        now,
      )
      const base = makeScheduler({
        desiredRetention: settings.desiredRetention,
        maximumInterval: settings.maximumInterval,
      })
      const cache = new Map<number, ReturnType<typeof makeScheduler>>()
      const schedulerFor = (e: { chapitreId: string }) => {
        const o = overrides.get(e.chapitreId)
        if (!o) return base
        let s = cache.get(o.maximumInterval)
        if (!s) {
          s = makeScheduler({
            desiredRetention: o.desiredRetention ?? settings.desiredRetention,
            maximumInterval: o.maximumInterval,
          })
          cache.set(o.maximumInterval, s)
        }
        return s
      }
      retention = estimatedRetention(exercises, schedulerFor, now).mean
    }
    return {
      due: queue.length,
      minutes: estimateMinutes(queue.length, medianDurationMs(recent ?? [])),
      total: exercises?.length ?? 0,
      weekCount: week.length,
      accuracy: week.length ? Math.round((correct / week.length) * 100) : null,
      streak: lenientStreak(recent ?? [], settings?.minimalGoal ?? 10, 2, now),
      today: recent?.filter((a) => a.ts >= new Date(now).setHours(0, 0, 0, 0)).length ?? 0,
      retention,
      activity: activityByDay(recent ?? [], HEAT_WEEKS * 7, now),
      perCahier,
    }
  }, [exercises, chapitres, recent, cahiers, settings])

  const loading = !cahiers || !chapitres || !exercises || !settings

  // The number due, on the app icon (installed app).
  useEffect(() => {
    if (!loading) updateAppBadge(stats.due)
  }, [loading, stats.due])
  const dailyGoal = settings?.dailyGoal ?? 50

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
        subtitle={
          loading ? (
            <span className="inline-block h-5 w-56 rounded bg-surface-2 align-top" />
          ) : stats.total ? (
            `${plural(stats.total, 'exercice')} dans ${plural(cahiers.length, 'cahier')}.`
          ) : (
            'Importe tes fiches de cours, génère des exercices avec Claude, puis entraîne-toi.'
          )
        }
        actions={
          <Button onClick={() => setCreating(true)} variant="secondary">
            <Plus size={16} />
            Nouveau cahier
          </Button>
        }
      />

      {/* Today: one main action, two rings. */}
      <section className="grid gap-4 lg:grid-cols-[1fr_minmax(280px,34%)]">
        <Card elevation={3} className="relative flex min-h-[188px] flex-col justify-between gap-6 overflow-hidden p-6">
          <div>
            <p className="text-sm text-muted">Aujourd’hui</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="inline-block min-w-[2ch] font-display text-5xl leading-none">{loading ? <span className="inline-block h-12 w-16 rounded bg-surface-2 align-middle" /> : <Counter value={stats.due} />}</span>
              <span className="text-base text-muted">{stats.due === 1 ? 'exercice à revoir' : 'exercices à revoir'}</span>
            </div>
            <p className="mt-2 min-h-5 text-sm text-muted">
              {loading
                ? ' '
                : stats.due > 0
                  ? `≈ ${stats.minutes} min · ${plural([...stats.perCahier.values()].filter((s) => s.due > 0).length, 'cahier')}`
                  : stats.total
                    ? 'Tout est à jour. Reviens demain, ou entraîne-toi librement.'
                    : 'Ajoute une fiche pour commencer.'}
            </p>
          </div>
          {loading ? (
            <div className="flex h-12 items-center">
              <Skeleton className="h-12 w-72" />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="lg" disabled={!stats.due} onClick={() => navigate('/train?scope=all&mode=review&from=/')}>
                Réviser
                {stats.due > 0 && (
                  <span className="text-accent-fg">
                    · {stats.due} {stats.due === 1 ? 'du' : 'dus'} · ~{stats.minutes} min
                  </span>
                )}
                <ArrowRight size={18} />
              </Button>
              <Button variant="ghost" size="lg" disabled={!stats.total} onClick={() => navigate('/train?scope=all&mode=chrono&from=/')}>
                <Zap size={16} />
                Chrono
              </Button>
            </div>
          )}
        </Card>

        <Card className="flex items-center justify-around gap-4 p-5">
          <div className="flex flex-col items-center gap-2 text-center">
            <ProgressRing value={loading ? 0 : Math.min(1, stats.today / dailyGoal)} size={84} stroke={7} label={`${stats.today} réponses sur un objectif de ${dailyGoal}`}>
              <span className="text-base">
                {loading ? '–' : stats.today}
                <span className="text-[10px] text-muted">/{dailyGoal}</span>
              </span>
            </ProgressRing>
            <p className="text-xs text-muted">Objectif du jour</p>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <ProgressRing
              value={stats.retention ?? 0}
              size={84}
              stroke={7}
              tone="ok"
              label={stats.retention === null ? 'Connaissance conservée : pas encore de carte révisée' : `Connaissance conservée : ${Math.round(stats.retention * 100)} %`}
            >
              <span className="text-base">{stats.retention === null ? '–' : `${Math.round(stats.retention * 100)} %`}</span>
            </ProgressRing>
            <p className="text-xs text-muted">Connaissance conservée</p>
          </div>
        </Card>
      </section>

      {/* Streak, week, activity */}
      <section className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.6fr]">
        <Card className="p-5">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Flame size={16} aria-hidden="true" />
            Série
          </div>
          <div className="mt-2 font-display text-3xl">
            {loading ? '–' : stats.streak.days} <span className="font-sans text-sm text-muted">{stats.streak.days === 1 ? 'jour' : 'jours'}</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            {loading
              ? ' '
              : stats.streak.minimalReached
                ? `Minimum atteint aujourd’hui (${stats.streak.today} / ${settings.minimalGoal})`
                : `${stats.streak.today} / ${settings.minimalGoal} aujourd’hui · ${stats.streak.freezesLeft} gel${stats.streak.freezesLeft > 1 ? 's' : ''} ce mois`}
          </p>
        </Card>
        <Card className="p-5">
          <div className="text-sm text-muted">Cette semaine</div>
          <div className="mt-2 font-display text-3xl">
            {loading ? '–' : stats.weekCount}
            <span className="ml-1.5 font-sans text-sm text-muted">
              réponses
              {stats.accuracy !== null ? ` · ${stats.accuracy} % justes` : ''}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">{loading ? ' ' : stats.weekCount ? 'Tous modes confondus.' : 'Aucune réponse ces sept derniers jours.'}</p>
        </Card>
        <Card className="p-5">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Activité</span>
            <Link to="/stats" data-action="statistiques" className="tap rounded-md text-xs text-accent-text ring-focus hover:underline">
              Statistiques →
            </Link>
          </div>
          <div className="mt-3">
            <MiniHeatmap days={stats.activity} />
          </div>
        </Card>
      </section>

      {/* Cahiers */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl">Mes cahiers</h2>
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[132px]" />
            ))}
          </div>
        ) : cahiers.length === 0 ? (
          <EmptyState
            illustration="notebook"
            title="Aucun cahier pour l’instant"
            description="Crée un cahier par matière. Tu y rangeras tes fiches de cours et les exercices générés."
            action={
              <Button onClick={() => setCreating(true)}>
                <Plus size={16} />
                Créer mon premier cahier
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {cahiers.map((c) => {
              const s = stats.perCahier.get(c.id) ?? {
                fiches: 0,
                exos: 0,
                due: 0,
              }
              return (
                <Link
                  data-action="ouvrir-le-cahier"
                  key={c.id}
                  to={`/cahier/${c.id}`}
                  viewTransition={VIEW_TRANSITIONS}
                  style={{ '--cahier': c.color } as React.CSSProperties}
                  className="group relative flex min-h-[132px] flex-col justify-between overflow-hidden rounded-[var(--radius-md)] border border-line bg-surface p-5 shadow-elev-2 transition-[transform,box-shadow,border-color] duration-200 ease-out ring-focus hover:-translate-y-0.5 hover:border-line-strong hover:shadow-elev-3 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-cahier" />
                  <div>
                    <div className="flex items-center gap-2.5">
                      <ColorDot color={c.color} className="size-3" />
                      <span className="truncate font-display text-lg">{c.name}</span>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {plural(s.fiches, 'fiche')} · {plural(s.exos, 'exercice')}
                    </p>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className={cx('text-sm font-medium', s.due ? 'text-cahier-text' : 'text-muted')}>{s.exos === 0 ? 'Pas encore d’exercice' : s.due ? `${s.due} à revoir` : 'À jour'}</span>
                    <ArrowRight size={16} className="text-muted transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {upcomingExams.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl">Examens à venir</h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingExams.map(({ cahier, exam }) => {
              const next = nextSession(exam)
              return (
                <li key={exam.id}>
                  <Card elevation={2} className="flex flex-col gap-3 p-4" style={{ '--cahier': cahier.color } as React.CSSProperties}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-xs text-muted">
                          <ColorDot color={cahier.color} /> {cahier.name}
                        </p>
                        <p className="mt-0.5 truncate font-medium">{exam.name}</p>
                        <p className="text-xs text-muted">{formatExamDay(exam.date)}</p>
                      </div>
                      <span className="shrink-0 rounded-md bg-accent-soft px-2 py-0.5 font-display text-base text-accent-text tabular-nums">{formatCountdown(exam.date)}</span>
                    </div>
                    <SegmentedBar
                      segments={exam.sessions.map((s, i) => (s.done ? 'done' : next?.index === i && next.late ? 'late' : 'todo'))}
                      label={`${exam.sessions.filter((s) => s.done).length} séances sur ${exam.sessions.length} faites`}
                    />
                    {next ? (
                      <Button size="sm" variant="secondary" onClick={() => navigate(`/train?mode=exam&exam=${exam.id}&session=${next.index}&from=/`)}>
                        <CalendarCheck size={14} />
                        Séance {next.index + 1}
                        {next.late ? ' (en retard)' : ` · ${formatExamDay(next.session.at)}`}
                      </Button>
                    ) : (
                      <p className="text-sm text-ok">Plan terminé : les trois séances sont faites.</p>
                    )}
                  </Card>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <NewCahierModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

const shortDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
})

/** Sixteen weeks of answers, seven rows, cells coloured by count — sober, no labels. */
function MiniHeatmap({ days }: { days: { day: number; count: number }[] }) {
  const cell = 10
  const step = 13
  const w0 = days.length ? (new Date(days[0].day).getDay() + 6) % 7 : 0
  const cols = Math.ceil((w0 + days.length) / 7)
  const max = Math.max(1, ...days.map((d) => d.count))
  return (
    <svg viewBox={`0 0 ${cols * step} ${7 * step}`} width="100%" role="img" aria-label={`Réponses par jour sur les ${HEAT_WEEKS} dernières semaines`} className="block max-h-24">
      {days.map(({ day, count }, i) => {
        const col = Math.floor((w0 + i) / 7)
        const row = (w0 + i) % 7
        const k = count === 0 ? 0 : 0.25 + 0.75 * Math.min(1, count / max)
        return (
          <rect key={day} x={col * step} y={row * step} width={cell} height={cell} rx="2.5" fill={count === 0 ? 'var(--line)' : 'var(--accent)'} fillOpacity={count === 0 ? 1 : k}>
            <title>
              {shortDate.format(day)} · {plural(count, 'réponse')}
            </title>
          </rect>
        )
      })}
    </svg>
  )
}
