import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Sparkles, Target } from 'lucide-react'
import type { Chapitre, Exercise, PointDeCours } from '../types'
import { POINT_NATURE_LABELS } from '../types'
import { computeCoverage } from '../lib/coverage'
import { Badge, Button, ProgressBar, cx, plural } from './ui'
import { Markdown } from './Markdown'
import type { GenerateFocus } from './GeneratePanel'

/**
 * What the exercises do not cover yet: points without exercise, passages
 * without point. One click generates for exactly those.
 */
export function CoverageSection({ chapitre, points, exercises, onGenerate }: { chapitre: Chapitre; points: PointDeCours[]; exercises: Exercise[]; onGenerate: (focus: GenerateFocus) => void }) {
  const [open, setOpen] = useState(false)
  const coverage = useMemo(() => computeCoverage(chapitre.content, points, exercises), [chapitre.content, points, exercises])
  const gaps = coverage.pointsWithoutExercise.length + coverage.blocksWithoutPoint.length

  if (points.length === 0 && exercises.length === 0) return null

  const covered = coverage.totalBlocks - coverage.blocksWithoutPoint.length
  const pct = coverage.totalBlocks ? Math.round((covered / coverage.totalBlocks) * 100) : 100

  return (
    <section className={cx('rounded-xl border p-4', gaps ? 'border-warn/50 bg-warn-soft/40' : 'border-line bg-surface')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-lg', gaps ? 'bg-warn-soft text-warn' : 'bg-ok-soft text-ok')}>
            <Target size={18} />
          </span>
          <div>
            <h2 className="font-medium">Couverture de la fiche</h2>
            <p className="text-sm text-muted">
              {gaps === 0
                ? `Tout est couvert : ${plural(points.length, 'point de cours', 'points de cours')}, ${coverage.totalBlocks ? `${pct} % des passages ancrés` : 'fiche vide'}.`
                : `${plural(coverage.pointsWithoutExercise.length, 'point sans exercice', 'points sans exercice')} · ${plural(coverage.blocksWithoutPoint.length, 'passage sans point', 'passages sans point')} (${pct} % ancré). Réviser une partie seulement fait oublier le reste.`}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ProgressBar value={pct / 100} label={`${pct} % des passages ancrés`} tone={gaps ? 'accent' : 'ok'} thin className="w-28 shrink-0" />
          {gaps > 0 && (
            <Button size="sm" onClick={() => onGenerate({ points: coverage.pointsWithoutExercise, passages: coverage.blocksWithoutPoint.map((b) => b.text), label: 'points manquants' })}>
              <Sparkles size={14} />
              Générer pour ces points
            </Button>
          )}
          {gaps > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Détail
            </Button>
          )}
        </div>
      </div>
      {open && gaps > 0 && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {coverage.pointsWithoutExercise.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Points sans exercice</h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {coverage.pointsWithoutExercise.map((p) => (
                  <li key={p.id} className="flex items-start gap-2 text-sm">
                    <Badge tone="neutral" className="mt-0.5 shrink-0">
                      {POINT_NATURE_LABELS[p.nature]}
                    </Badge>
                    <span>
                      <Markdown inline text={p.title} />
                      {p.anchor && <span className="block text-xs text-muted">« {p.anchor} »</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {coverage.blocksWithoutPoint.length > 0 && (
            <div>
              <h3 className="text-sm font-medium">Passages sans point de cours</h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {coverage.blocksWithoutPoint.slice(0, 30).map((b, i) => (
                  <li key={i} className="text-sm">
                    {b.heading && <span className="text-xs text-muted">{b.heading} · </span>}
                    <Markdown inline text={b.text.length > 160 ? `${b.text.slice(0, 160)}…` : b.text} />
                  </li>
                ))}
                {coverage.blocksWithoutPoint.length > 30 && <li className="text-xs text-muted">… et {coverage.blocksWithoutPoint.length - 30} autres.</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
