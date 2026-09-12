import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DownloadSimple, UploadSimple, Warning } from '@phosphor-icons/react'
import { db, exportBackup, exportReviewLogCsv, importBackup, updateSettings } from '../db'
import { useSettings } from '../lib/useSettings'
import { applyTheme } from '../lib/theme'
import { GRAPH_REDIRECT_HINT, GRAPH_SETUP_STEPS } from '../lib/graphSetup'
import { RETENTION_MAX, RETENTION_MIN, estimateReviewsPerDay } from '../lib/fsrs'
import { EXERCISE_LABELS, EXERCISE_TYPES, type Settings } from '../types'
import { Button, Card, Field, Input, PageHeader, Select, Skeleton } from '../components/ui'

/** Monday-first, matching French calendars; values are JS getDay() numbers. */
const WEEKDAYS: { day: number; label: string }[] = [
  { day: 1, label: 'Lun' },
  { day: 2, label: 'Mar' },
  { day: 3, label: 'Mer' },
  { day: 4, label: 'Jeu' },
  { day: 5, label: 'Ven' },
  { day: 6, label: 'Sam' },
  { day: 0, label: 'Dim' },
]

function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function SettingsPage() {
  const settings = useSettings()
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string }>()
  const fileRef = useRef<HTMLInputElement>(null)
  const activeCards = useLiveQuery(() => db.exercises.where('status').equals('active').toArray().then((rows) => rows.map((e) => e.fsrs)), [])
  const [retentionDraft, setRetentionDraft] = useState<number | null>(null)

  const retention = retentionDraft ?? settings?.desiredRetention ?? 0.9
  const perDay = useMemo(() => (activeCards && settings ? estimateReviewsPerDay(activeCards, retention, settings.maximumInterval) : null), [activeCards, retention, settings])

  if (!settings) return <Skeleton className="h-40" />

  async function patch(p: Partial<Settings>) {
    await updateSettings(p)
    if (p.theme) applyTheme(p.theme)
  }

  async function download() {
    const backup = await exportBackup()
    downloadText(JSON.stringify(backup, null, 2), `cahiers-${new Date().toISOString().slice(0, 10)}.json`, 'application/json')
  }

  async function downloadCsv() {
    downloadText(await exportReviewLogCsv(), `cahiers-revlog-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv')
  }

  async function restore(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const imported = await importBackup(parsed)
      setMessage({ tone: 'ok', text: `Sauvegarde restaurée : ${imported.cahiers.length} cahiers, ${imported.exercises.length} exercices, ${imported.reviewLogs.length} réponses.` })
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof Error ? e.message : 'Fichier illisible.' })
    }
  }

  async function wipe() {
    if (!window.confirm('Tout effacer ? Cahiers, fiches, exercices et historique seront supprimés définitivement.')) return
    await db.transaction('rw', [db.cahiers, db.chapitres, db.exercises, db.reviewLogs, db.points, db.supplements, db.mindmaps], async () => {
      await Promise.all([db.reviewLogs.clear(), db.points.clear(), db.supplements.clear(), db.mindmaps.clear(), db.exercises.clear(), db.chapitres.clear(), db.cahiers.clear()])
    })
    setMessage({ tone: 'ok', text: 'Toutes les données ont été effacées.' })
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Réglages" subtitle="Tout est stocké dans ce navigateur. Pense à exporter une sauvegarde de temps en temps." />

      <Section title="Apparence">
        <Field label="Thème">
          {(id) => (
            <Select id={id} value={settings.theme} onChange={(e) => patch({ theme: e.target.value as Settings['theme'] })} className="max-w-xs">
              <option value="auto">Automatique (système)</option>
              <option value="light">Clair</option>
              <option value="dark">Sombre</option>
            </Select>
          )}
        </Field>
      </Section>

      <Section title="Mode chrono" description="Valeurs par défaut quand tu lances un chrono.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Durée (secondes)">
            {(id) => <Input id={id} type="number" min={15} max={1800} step={15} value={settings.chronoSeconds} onChange={(e) => patch({ chronoSeconds: clamp(e.target.valueAsNumber, 15, 1800) })} />}
          </Field>
          <Field label="Nombre de questions">
            {(id) => <Input id={id} type="number" min={3} max={100} value={settings.chronoCount} onChange={(e) => patch({ chronoCount: clamp(e.target.valueAsNumber, 3, 100) })} />}
          </Field>
        </div>
      </Section>

      <Section title="Planification (FSRS)" description="Le planificateur FSRS prédit ton oubli et programme chaque exercice juste avant. Plus la rétention visée est haute, plus tu révises souvent.">
        <Field label={`Rétention visée : ${Math.round(retention * 100)} %`} hint={perDay === null ? undefined : `≈ ${Math.round(perDay)} révisions par jour avec tes exercices actuels. 90 % est le meilleur compromis ; au-delà de 95 % on retombe dans la répétition massée.`}>
          {(id) => (
            <input
              id={id}
              type="range"
              min={RETENTION_MIN}
              max={RETENTION_MAX}
              step={0.01}
              value={retention}
              onChange={(e) => setRetentionDraft(e.target.valueAsNumber)}
              onPointerUp={() => {
                if (retentionDraft !== null) patch({ desiredRetention: retentionDraft })
              }}
              onKeyUp={() => {
                if (retentionDraft !== null) patch({ desiredRetention: retentionDraft })
              }}
              className="w-full max-w-md accent-accent"
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nouveaux exercices par jour" hint="Par cahier ; modifiable cahier par cahier.">
            {(id) => <Input id={id} type="number" min={0} max={500} value={settings.newPerDay} onChange={(e) => patch({ newPerDay: clamp(e.target.valueAsNumber, 0, 500) })} />}
          </Field>
          <Field label="Révisions max. par jour" hint="Les cartes en apprentissage ne comptent pas.">
            {(id) => <Input id={id} type="number" min={0} max={2000} value={settings.reviewsMaxPerDay} onChange={(e) => patch({ reviewsMaxPerDay: clamp(e.target.valueAsNumber, 0, 2000) })} />}
          </Field>
          <Field label="Intervalle maximal (jours)" hint="Un examen déclaré le plafonne davantage.">
            {(id) => <Input id={id} type="number" min={7} max={3650} value={settings.maximumInterval} onChange={(e) => patch({ maximumInterval: clamp(e.target.valueAsNumber, 7, 3650) })} />}
          </Field>
          <Field label="Seuil leech (échecs)" hint="Au-delà, l’exercice est mis de côté comme probablement mal formulé.">
            {(id) => <Input id={id} type="number" min={2} max={30} value={settings.leechThreshold} onChange={(e) => patch({ leechThreshold: clamp(e.target.valueAsNumber, 2, 30) })} />}
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Jours légers</span>
          <p className="text-sm text-muted">Le planificateur évite d’y placer des échéances (les intervalles de trois jours et plus sont décalés d’un jour ou deux).</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map(({ day, label }) => {
              const on = settings.lightDays.includes(day)
              return (
                <label key={day} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${on ? 'border-accent bg-accent-soft' : 'border-line-strong'}`}>
                  <input type="checkbox" checked={on} onChange={(e) => patch({ lightDays: e.target.checked ? [...settings.lightDays, day] : settings.lightDays.filter((d) => d !== day) })} className="accent-accent" />
                  {label}
                </label>
              )
            })}
          </div>
        </div>
        <div>
          <Button variant="secondary" size="sm" onClick={downloadCsv}>
            <DownloadSimple size={16} />
            Exporter le journal pour l’optimiseur FSRS (CSV)
          </Button>
          <p className="mt-1.5 text-xs text-muted">Format fsrs4anki : card_id, review_time, review_rating, review_state, review_duration. Les paramètres optimisés se calculent hors ligne avec l’optimiseur Python.</p>
        </div>
      </Section>

      <Section title="Génération avec Claude" description="Ton niveau est rappelé dans chaque prompt (exercices, fiches, compléments, cartes mentales). En dessous, les types d’exercices autorisés par défaut : le prompt demande autant d’exercices qu’il y a de points de cours, sans nombre imposé.">
        <Field label="Niveau d’études" hint="Ex. Terminale spécialité SVT, L2 droit, BTS MCO, prépa ECG…">
          {(id) => <Input id={id} defaultValue={settings.niveau ?? ''} onBlur={(e) => patch({ niveau: e.target.value.trim() || undefined })} className="max-w-md" placeholder="Terminale spécialité SVT" />}
        </Field>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-strong px-3 py-2 text-sm">
          <input type="checkbox" checked={settings.autoValidate} onChange={(e) => patch({ autoValidate: e.target.checked })} className="mt-0.5 size-4 accent-accent" />
          <span>
            Toujours tout garder sans valider
            <span className="block text-xs text-muted">Par défaut, les exercices générés passent par une file « à valider » (J garder, K ignorer, E modifier) avec les défauts repérés par le linter. Coche pour les activer directement.</span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {EXERCISE_TYPES.map((t) => {
            const on = settings.promptTypes.includes(t)
            return (
              <label key={t} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-strong px-3 py-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => patch({ promptTypes: e.target.checked ? [...settings.promptTypes, t] : settings.promptTypes.filter((x) => x !== t) })}
                  className="size-4 accent-accent"
                />
                <span className="text-sm">{EXERCISE_LABELS[t]}</span>
              </label>
            )
          })}
        </div>
      </Section>

      <Section title="OneNote (Microsoft Graph)" description="Pour importer tes pages OneNote directement, il faut une inscription d’application gratuite chez Microsoft. Une seule fois, cinq minutes.">
        <Field label="ID d’application (client)" hint={`URI de redirection à déclarer : ${GRAPH_REDIRECT_HINT()}`}>
          {(id) => (
            <Input
              id={id}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              defaultValue={settings.graphClientId ?? ''}
              onBlur={(e) => patch({ graphClientId: e.target.value.trim() || undefined })}
              className="max-w-md font-mono text-sm"
              spellCheck={false}
            />
          )}
        </Field>
        <details className="group rounded-lg border border-line px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium">Comment obtenir cet identifiant</summary>
          <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted">
            {GRAPH_SETUP_STEPS.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </details>
      </Section>

      <Section title="Données">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download}>
            <DownloadSimple size={16} />
            Exporter une sauvegarde
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <UploadSimple size={16} />
            Restaurer une sauvegarde
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) restore(f)
              e.target.value = ''
            }}
          />
          <Button variant="ghost" className="text-bad hover:bg-bad-soft" onClick={wipe}>
            <Warning size={16} />
            Tout effacer
          </Button>
        </div>
        {message && <p className={message.tone === 'ok' ? 'text-sm text-ok' : 'text-sm text-bad'}>{message.text}</p>}
      </Section>
    </div>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      <Card className="flex flex-col gap-4 p-5">{children}</Card>
    </section>
  )
}

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}
