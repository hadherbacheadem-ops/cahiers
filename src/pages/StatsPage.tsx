import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Brain, Calendar, ChartColumn, Flame, Target } from 'lucide-react'
import { db } from '../db'
import type { Cahier, Confidence, ReviewLog } from '../types'
import { activityByDay, calibration, estimatedRetention, forecast, hourlyAccuracy, lenientStreak, retentionByDay, trueRetention, type RetentionPoint } from '../lib/stats'
import { loadSessionContext, type SessionContext } from '../lib/session'
import { useSettings } from '../lib/useSettings'
import { Card, ColorDot, EmptyState, PageHeader, Skeleton, cx, plural } from '../components/ui'

const DAY = 86_400_000
const FREEZES_PER_MONTH = 2

type Window = 7 | 30 | 90
const WINDOWS: Window[] = [7, 30, 90]

// ---- Formatting helpers ----------------------------------------------------

const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
const monthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' })

function pct(rate: number | null): string {
  return rate === null ? '–' : `${Math.round(rate * 100)} %`
}

// ---- Shared SVG layout -----------------------------------------------------

const W = 600
const H = 150
const PAD = { l: 36, r: 6, t: 10, b: 22 }
const PLOT_W = W - PAD.l - PAD.r
const PLOT_H = H - PAD.t - PAD.b
const BASE = PAD.t + PLOT_H

function Section({ title, hint, actions, children }: { title: string; hint: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg">{title}</h2>
          <p className="mt-0.5 text-sm text-muted">{hint}</p>
        </div>
        {actions}
      </div>
      {children}
    </Card>
  )
}

function Tile({ icon, label, value, sub, extra }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; extra?: ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-sm text-muted">
        {icon}
        {label}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="font-display text-3xl tabular-nums">{value}</span>
        {sub && <span className="text-sm text-muted">{sub}</span>}
      </div>
      {extra && <div className="mt-1 text-xs text-muted">{extra}</div>}
    </Card>
  )
}

// ---- Charts ----------------------------------------------------------------

function RetentionChart({ data }: { data: { day: number; point: RetentionPoint }[] }) {
  const n = data.length
  const step = PLOT_W / n
  const barW = Math.max(1.5, step * 0.68)
  const every = n <= 7 ? 1 : n <= 30 ? 7 : 30
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`True retention par jour sur ${n} jours`} className="block">
      <title>True retention par jour sur {n} jours</title>
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + PLOT_H * (1 - g)} y2={PAD.t + PLOT_H * (1 - g)} stroke="var(--line)" strokeWidth="1" />
          <text x={PAD.l - 6} y={PAD.t + PLOT_H * (1 - g) + 3.5} fontSize="10" textAnchor="end" fill="var(--muted)">
            {Math.round(g * 100)} %
          </text>
        </g>
      ))}
      {data.map(({ day, point }, i) => {
        const x = PAD.l + i * step + (step - barW) / 2
        const label = (n - 1 - i) % every === 0
        return (
          <g key={day}>
            {point.rate === null ? (
              <rect x={x} y={BASE - 2} width={barW} height={2} fill="var(--line-strong)" rx="1">
                <title>{longDate.format(day)} · aucune révision planifiée</title>
              </rect>
            ) : (
              <rect x={x} y={PAD.t + PLOT_H * (1 - point.rate)} width={barW} height={Math.max(1, PLOT_H * point.rate)} fill="var(--accent)" rx="1">
                <title>
                  {longDate.format(day)} · {plural(point.answered, 'révision')} · {pct(point.rate)}
                </title>
              </rect>
            )}
            {label && (
              <text x={x + barW / 2} y={H - 6} fontSize="10" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fill="var(--muted)">
                {shortDate.format(day)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function ForecastChart({ data }: { data: { day: number; count: number }[] }) {
  const n = data.length
  const max = Math.max(1, ...data.map((d) => d.count))
  const step = PLOT_W / n
  const barW = Math.max(2, step * 0.68)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Exercices à réviser par jour sur ${n} jours`} className="block">
      <title>Exercices à réviser par jour sur {n} jours</title>
      <line x1={PAD.l} x2={W - PAD.r} y1={BASE} y2={BASE} stroke="var(--line)" strokeWidth="1" />
      <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t} y2={PAD.t} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 3" />
      <text x={PAD.l - 6} y={PAD.t + 3.5} fontSize="10" textAnchor="end" fill="var(--muted)">
        {max}
      </text>
      <text x={PAD.l - 6} y={BASE + 3.5} fontSize="10" textAnchor="end" fill="var(--muted)">
        0
      </text>
      {data.map(({ day, count }, i) => {
        const x = PAD.l + i * step + (step - barW) / 2
        const h = (count / max) * PLOT_H
        const label = i % 7 === 0 || i === n - 1
        return (
          <g key={day}>
            <rect x={x} y={BASE - Math.max(count ? 1 : 0, h)} width={barW} height={Math.max(count ? 1 : 0, h)} fill={i === 0 ? 'var(--accent)' : 'var(--muted)'} opacity={i === 0 ? 1 : 0.4} rx="1">
              <title>
                {i === 0 ? `Aujourd'hui (${longDate.format(day)}, retard inclus)` : longDate.format(day)} · {plural(count, 'exercice')}
              </title>
            </rect>
            {label && (
              <text x={x + barW / 2} y={H - 6} fontSize="10" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fill="var(--muted)">
                {i === 0 ? 'Auj.' : shortDate.format(day)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

const HEAT_CELL = 11
const HEAT_STEP = 13
const HEAT_LEFT = 22
const HEAT_TOP = 14
const HEAT_COLS = 53
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function heatFill(count: number): string {
  if (count === 0) return 'var(--surface-2)'
  const share = count <= 5 ? 25 : count <= 15 ? 45 : count <= 30 ? 70 : 100
  return `color-mix(in oklab, var(--accent) ${share}%, var(--surface-2))`
}

function Heatmap({ days }: { days: { day: number; count: number }[] }) {
  const w0 = days.length ? (new Date(days[0].day).getDay() + 6) % 7 : 0
  const months: { col: number; label: string }[] = []
  let lastCol = -10
  days.forEach(({ day }, i) => {
    const d = new Date(day)
    if (d.getDate() !== 1) return
    const col = Math.floor((w0 + i) / 7)
    if (col - lastCol < 3 || col > HEAT_COLS - 2) return
    months.push({ col, label: monthShort.format(d) })
    lastCol = col
  })
  const width = HEAT_LEFT + HEAT_COLS * HEAT_STEP
  const height = HEAT_TOP + 7 * HEAT_STEP
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label="Réponses par jour sur les 365 derniers jours" className="block min-w-[640px]">
      <title>Réponses par jour sur les 365 derniers jours</title>
      {months.map((m) => (
        <text key={m.col} x={HEAT_LEFT + m.col * HEAT_STEP} y={9} fontSize="9" fill="var(--muted)">
          {m.label}
        </text>
      ))}
      {WEEKDAYS.map((l, r) => (
        <text key={r} x={HEAT_LEFT - 8} y={HEAT_TOP + r * HEAT_STEP + HEAT_CELL - 2} fontSize="9" textAnchor="middle" fill="var(--muted)">
          {l}
        </text>
      ))}
      {days.map(({ day, count }, i) => {
        const col = Math.floor((w0 + i) / 7)
        const row = (w0 + i) % 7
        return (
          <rect key={day} x={HEAT_LEFT + col * HEAT_STEP} y={HEAT_TOP + row * HEAT_STEP} width={HEAT_CELL} height={HEAT_CELL} rx="2" fill={heatFill(count)}>
            <title>
              {longDate.format(day)} · {plural(count, 'réponse')}
            </title>
          </rect>
        )
      })}
    </svg>
  )
}

function HourlyChart({ rows }: { rows: { hour: number; answered: number; rate: number | null }[] }) {
  const step = PLOT_W / 24
  const barW = step * 0.68
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Taux de réussite par heure de la journée" className="block">
      <title>Taux de réussite par heure de la journée</title>
      {[0, 0.5, 1].map((g) => (
        <g key={g}>
          <line x1={PAD.l} x2={W - PAD.r} y1={PAD.t + PLOT_H * (1 - g)} y2={PAD.t + PLOT_H * (1 - g)} stroke="var(--line)" strokeWidth="1" />
          <text x={PAD.l - 6} y={PAD.t + PLOT_H * (1 - g) + 3.5} fontSize="10" textAnchor="end" fill="var(--muted)">
            {Math.round(g * 100)} %
          </text>
        </g>
      ))}
      {rows.map(({ hour, answered, rate }) => {
        const x = PAD.l + hour * step + (step - barW) / 2
        const opacity = answered < 5 ? 0.25 : 0.45 + 0.55 * Math.min(1, answered / 40)
        return (
          <g key={hour}>
            {rate === null ? (
              <rect x={x} y={BASE - 2} width={barW} height={2} fill="var(--line-strong)" rx="1">
                <title>
                  {hour}h–{hour + 1}h · aucune réponse
                </title>
              </rect>
            ) : (
              <rect x={x} y={PAD.t + PLOT_H * (1 - rate)} width={barW} height={Math.max(1, PLOT_H * rate)} fill="var(--accent)" opacity={opacity} rx="1">
                <title>
                  {hour}h–{hour + 1}h · {plural(answered, 'réponse')} · {pct(rate)}
                </title>
              </rect>
            )}
            {hour % 6 === 0 && (
              <text x={x + barW / 2} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">
                {hour}h
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** Best two-hour band with at least 20 answers. */
function bestBand(rows: { hour: number; answered: number; rate: number | null }[]): { start: number; rate: number } | null {
  let best: { start: number; rate: number } | null = null
  for (let h = 0; h < 23; h++) {
    const a = rows[h].answered + rows[h + 1].answered
    if (a < 20) continue
    const c = Math.round((rows[h].rate ?? 0) * rows[h].answered) + Math.round((rows[h + 1].rate ?? 0) * rows[h + 1].answered)
    const rate = c / a
    if (!best || rate > best.rate) best = { start: h, rate }
  }
  return best
}

const CONFIDENCE_LABELS: Record<Confidence, string> = { 3: 'Sûr', 2: 'Hésitant', 1: 'Aucune idée' }

// ---- Page ------------------------------------------------------------------

export default function StatsPage() {
  // Fixed once per mount so every computation shares the same clock.
  const [now] = useState(() => Date.now())
  const settings = useSettings()
  const logs = useLiveQuery(() => db.reviewLogs.where('ts').above(now - 400 * DAY).toArray(), [now])
  const exercises = useLiveQuery(() => db.exercises.toArray(), [])
  const cahiers = useLiveQuery(() => db.cahiers.toArray(), [])
  const [ctx, setCtx] = useState<SessionContext | null>(null)
  const [win, setWin] = useState<Window>(30)

  useEffect(() => {
    let alive = true
    loadSessionContext(now).then((c) => {
      if (alive) setCtx(c)
    })
    return () => {
      alive = false
    }
  }, [now])

  const cahierById = useMemo(() => new Map<string, Cahier>((cahiers ?? []).map((c) => [c.id, c])), [cahiers])
  const safeLogs: ReviewLog[] = useMemo(() => logs ?? [], [logs])

  const estimated = useMemo(() => (exercises && ctx ? estimatedRetention(exercises, ctx.schedulerFor, now) : null), [exercises, ctx, now])
  const retention30 = useMemo(() => trueRetention(safeLogs, 30, now), [safeLogs, now])
  const streak = useMemo(() => lenientStreak(safeLogs, settings?.minimalGoal ?? 1, FREEZES_PER_MONTH, now), [safeLogs, settings?.minimalGoal, now])
  const byDay = useMemo(() => retentionByDay(safeLogs, win, now), [safeLogs, win, now])
  const byCahier = useMemo(() => {
    const m = trueRetention(safeLogs, win, now).byCahier
    return [...m].sort((a, b) => b[1].answered - a[1].answered)
  }, [safeLogs, win, now])
  const load = useMemo(() => forecast(exercises ?? [], 30, now), [exercises, now])
  const loadTotal = useMemo(() => load.reduce((s, d) => s + d.count, 0), [load])
  const activity = useMemo(() => activityByDay(safeLogs, 365, now), [safeLogs, now])
  const activeDays = useMemo(() => activity.filter((d) => d.count > 0).length, [activity])
  const hourly = useMemo(() => hourlyAccuracy(safeLogs), [safeLogs])
  const band = useMemo(() => bestBand(hourly), [hourly])
  const calib = useMemo(() => calibration(safeLogs, 90, now), [safeLogs, now])
  const hasConfidence = useMemo(() => calib.rows.some((r) => r.answered > 0), [calib])

  const loading = !logs || !exercises || !cahiers || !settings || !ctx

  if (loading) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Statistiques" subtitle="Tout ici se recalcule à partir de ton journal de révisions." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
        <Skeleton className="h-56" />
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title="Statistiques" subtitle="Tout ici se recalcule à partir de ton journal de révisions." />
        <EmptyState
          icon={<ChartColumn size={24} />}
          title="Pas encore de statistiques"
          description="Tout ici se recalcule à partir de ton journal de révisions. Lance une première session et reviens ici."
          action={
            <Link to="/" className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] bg-accent px-4 text-sm font-medium text-accent-fg shadow-elev-1 press ring-focus hover:bg-accent-hover">
              Aller au tableau de bord
            </Link>
          }
        />
      </div>
    )
  }

  const streakValue = streak.days === 0 ? <span className="text-lg font-medium">Prêt à commencer</span> : `${streak.days} ${streak.days === 1 ? 'jour' : 'jours'}`

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Statistiques" subtitle={`${plural(logs.length, 'réponse')} enregistrées sur les 400 derniers jours. Tout ici se recalcule à partir de ton journal de révisions.`} />

      {/* 1. En ce moment */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">En ce moment</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            icon={<Brain size={16} />}
            label="Connaissance conservée"
            value={estimated?.mean == null ? '–' : `${Math.round(estimated.mean * 100)} %`}
            sub={estimated && estimated.cards > 0 ? `sur ${plural(estimated.cards, 'exercice')}` : 'aucun exercice déjà revu'}
            extra="Probabilité moyenne de rappel des exercices en cours, estimée par FSRS."
          />
          <Tile
            icon={<Target size={16} />}
            label="True retention 30 j"
            value={pct(retention30.total.rate)}
            sub={retention30.total.answered > 0 ? plural(retention30.total.answered, 'révision') : 'pas encore de révision planifiée'}
            extra="Réussite des révisions planifiées sur les 30 derniers jours."
          />
          <Tile
            icon={<Flame size={16} />}
            label="Série"
            value={streakValue}
            extra={`${plural(streak.freezesUsed, 'gel utilisé', 'gels utilisés')} · ${plural(streak.freezesLeft, 'restant')} ce mois`}
          />
          <Tile
            icon={<Calendar size={16} />}
            label="Aujourd'hui"
            value={streak.today}
            sub={`/ ${settings.minimalGoal} minimum · objectif ${settings.dailyGoal}`}
            extra={streak.minimalReached ? <span className="text-ok">Minimum du jour atteint.</span> : `${plural(Math.max(0, settings.minimalGoal - streak.today), 'réponse')} pour valider la journée.`}
          />
        </div>
      </section>

      {/* 2. True retention */}
      <Section
        title="True retention"
        hint="Part des révisions planifiées réussies (cartes déjà connues, hors apprentissage et hors entraînement libre)."
        actions={
          <div className="flex items-center gap-1 rounded-lg bg-surface-2 p-1" role="group" aria-label="Fenêtre">
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWin(w)}
                aria-pressed={win === w}
                className={cx('h-7 rounded-md px-2.5 text-xs font-medium press ring-focus', win === w ? 'bg-surface text-ink shadow-elev-2' : 'text-muted hover:text-ink')}
              >
                {w} jours
              </button>
            ))}
          </div>
        }
      >
        <RetentionChart data={byDay} />
        {byCahier.length > 0 ? (
          <div className="overflow-x-auto ring-focus" tabIndex={0} role="region" aria-label="True retention par cahier">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-1.5 pr-3 font-medium">Cahier</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Révisions</th>
                  <th className="py-1.5 text-right font-medium">Taux</th>
                </tr>
              </thead>
              <tbody>
                {byCahier.map(([id, point]) => {
                  const cahier = cahierById.get(id)
                  return (
                    <tr key={id} className="border-t border-line">
                      <td className="py-2 pr-3">
                        <span className="flex items-center gap-2">
                          <ColorDot color={cahier?.color ?? 'var(--muted)'} />
                          <span className="truncate">{cahier?.name ?? 'Cahier supprimé'}</span>
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{point.answered}</td>
                      <td className="py-2 text-right font-medium tabular-nums">{pct(point.rate)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Aucune révision planifiée sur cette période.</p>
        )}
      </Section>

      {/* 3. Prévision de charge */}
      <Section title="Prévision de charge (30 jours)" hint="Exercices qui arrivent à échéance chaque jour ; la première barre inclut le retard.">
        <ForecastChart data={load} />
        <p className="text-sm text-muted">
          <span className="font-medium text-ink tabular-nums">{plural(loadTotal, 'exercice')}</span> sur 30 jours · en moyenne{' '}
          <span className="font-medium text-ink tabular-nums">{(loadTotal / 30).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}</span> par jour
        </p>
      </Section>

      {/* 4. Activité de l'année */}
      <Section title="Activité de l'année" hint="Réponses par jour, tous modes confondus, sur les 365 derniers jours.">
        <div className="overflow-x-auto ring-focus" tabIndex={0} role="region" aria-label="Activité de l’année">
          <Heatmap days={activity} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>
            {plural(activeDays, 'jour actif', 'jours actifs')} · {plural(activity.reduce((s, d) => s + d.count, 0), 'réponse')}
          </span>
          <span className="flex items-center gap-1.5">
            Moins
            {[0, 3, 10, 20, 40].map((c) => (
              <span key={c} aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ background: heatFill(c) }} />
            ))}
            Plus
          </span>
        </div>
      </Section>

      {/* 5. Quand tu révises le mieux */}
      <Section title="Quand tu révises le mieux" hint="Taux de réussite des révisions planifiées selon l'heure ; les heures peu fréquentées sont estompées.">
        <HourlyChart rows={hourly} />
        <p className="text-sm text-muted">
          {band ? (
            <>
              Meilleure tranche : <span className="font-medium text-ink tabular-nums">{band.start}h–{band.start + 2}h</span>, <span className="font-medium text-ink tabular-nums">{pct(band.rate)}</span>
            </>
          ) : (
            'Pas encore assez de données'
          )}
        </p>
      </Section>

      {/* 6. Calibration */}
      <Section title="Calibration" hint="Ce que tu annonces avant de répondre, comparé à ce qui se passe vraiment (90 derniers jours).">
        {hasConfidence ? (
          <div className="flex flex-col gap-3">
            {([3, 2, 1] as Confidence[]).map((c) => {
              const row = calib.rows.find((r) => r.confidence === c)
              const rate = row?.rate ?? null
              const answered = row?.answered ?? 0
              return (
                <div key={c} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-sm">
                  <span className="font-medium">{CONFIDENCE_LABELS[c]}</span>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={rate === null ? 0 : Math.round(rate * 100)} aria-label={`${CONFIDENCE_LABELS[c]} : ${pct(rate)}`}>
                    <div className="h-full rounded-full bg-accent" style={{ width: rate === null ? 0 : `${Math.round(rate * 100)}%` }} />
                  </div>
                  <span className="text-right text-muted tabular-nums">
                    <span className="font-medium text-ink">{pct(rate)}</span> · {plural(answered, 'réponse')}
                  </span>
                </div>
              )
            })}
            {calib.warn && (
              <div className="rounded-lg bg-warn-soft px-4 py-3 text-sm text-ink">
                Quand tu te dis « sûr », tu as raison {pct(calib.rows[2].rate)} du temps (&lt; 85 %). Les erreurs commises avec confiance sont les plus tenaces : elles sont retestées à J+1 et J+7.
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">
            Pas encore de donnée de confiance. La question « Sûr / Hésitant / Aucune idée » est posée avant chaque réponse
            {settings.askConfidence ? '.' : ' : active-la dans les réglages.'}
          </p>
        )}
      </Section>
    </div>
  )
}
