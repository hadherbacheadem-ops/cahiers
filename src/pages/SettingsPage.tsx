import { useRef, useState, type ReactNode } from 'react'
import { DownloadSimple, UploadSimple, Warning } from '@phosphor-icons/react'
import { db, exportBackup, importBackup, updateSettings } from '../db'
import { useSettings } from '../lib/useSettings'
import { applyTheme } from '../lib/theme'
import { GRAPH_REDIRECT_HINT, GRAPH_SETUP_STEPS } from '../lib/graphSetup'
import { EXERCISE_LABELS, EXERCISE_TYPES, type Settings } from '../types'
import { Button, Card, Field, Input, PageHeader, Select, Skeleton } from '../components/ui'

export default function SettingsPage() {
  const settings = useSettings()
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string }>()
  const fileRef = useRef<HTMLInputElement>(null)

  if (!settings) return <Skeleton className="h-40" />

  async function patch(p: Partial<Settings>) {
    await updateSettings(p)
    if (p.theme) applyTheme(p.theme)
  }

  async function download() {
    const backup = await exportBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cahiers-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
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

      <Section title="Génération avec Claude" description="Ton niveau est rappelé dans chaque prompt (exercices, fiches, compléments, cartes mentales). En dessous, les types d’exercices autorisés par défaut : le prompt demande autant d’exercices qu’il y a de points de cours, sans nombre imposé.">
        <Field label="Niveau d’études" hint="Ex. Terminale spécialité SVT, L2 droit, BTS MCO, prépa ECG…">
          {(id) => <Input id={id} defaultValue={settings.niveau ?? ''} onBlur={(e) => patch({ niveau: e.target.value.trim() || undefined })} className="max-w-md" placeholder="Terminale spécialité SVT" />}
        </Field>
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
