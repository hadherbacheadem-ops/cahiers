import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Download, GitMerge, HardDrive, Save, TriangleAlert, Upload } from 'lucide-react'
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { backupIsOlderThanData, db, exportBackup, exportReviewLogCsv, importBackup, listMigrationBackups, mergeBackup, updateSettings, wipeAll } from '../db'
import { AUTOSAVE_WARN_BYTES, autosavePermission, autosaveSupported, chooseAutosaveFile, getAutosaveState, persistenceStatus, requestPersistence, resumeAutosave, stopAutosave, type AutosaveState, type PersistenceStatus } from '../lib/storage'
import { exercisesToDelimited } from '../lib/exportCsv'
import { buildApkg } from '../lib/apkg'
import { useSettings } from '../lib/useSettings'
import { applyTheme } from '../lib/theme'
import { GRAPH_REDIRECT_HINT, GRAPH_SETUP_STEPS } from '../lib/graphSetup'
import { RETENTION_MAX, RETENTION_MIN, simulateReviewsPerDay } from '../lib/fsrs'
import { EXERCISE_LABELS, GENERATABLE_TYPES, type Settings } from '../types'
import { Button, Card, Field, Input, PageHeader, Select, Skeleton } from '../components/ui'
import { SyncSection } from '../components/SyncSection'

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
  const mergeRef = useRef<HTMLInputElement>(null)
  const activeCards = useLiveQuery(() => db.exercises.where('status').equals('active').toArray().then((rows) => rows.map((e) => ({ id: e.id, card: e.fsrs }))), [])
  const [retentionDraft, setRetentionDraft] = useState<number | null>(null)

  const retention = retentionDraft ?? settings?.desiredRetention ?? 0.9
  const perDay = useMemo(
    () => (activeCards && settings ? simulateReviewsPerDay(activeCards, { desiredRetention: retention, maximumInterval: settings.maximumInterval }).perDay : null),
    [activeCards, retention, settings],
  )

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

  async function downloadExercises(sep: ',' | '\t') {
    const [exercises, chapitres, cahiers] = await Promise.all([db.exercises.toArray(), db.chapitres.toArray(), db.cahiers.toArray()])
    const text = exercisesToDelimited(exercises, new Map(chapitres.map((c) => [c.id, c])), new Map(cahiers.map((c) => [c.id, c])), sep)
    downloadText(text, `cahiers-exercices-${new Date().toISOString().slice(0, 10)}.${sep === ',' ? 'csv' : 'tsv'}`, sep === ',' ? 'text/csv' : 'text/tab-separated-values')
  }

  async function downloadApkg() {
    setMessage(undefined)
    try {
      const [exercises, chapitres, cahiers] = await Promise.all([db.exercises.toArray(), db.chapitres.toArray(), db.cahiers.toArray()])
      const chapitreById = new Map(chapitres.map((c) => [c.id, c]))
      const cahierById = new Map(cahiers.map((c) => [c.id, c]))
      const result = await buildApkg({
        deckName: 'Cahiers',
        exercises: exercises.filter((e) => e.status === 'active' || e.status === 'pending'),
        deckFor: (e) => `Cahiers::${cahierById.get(e.cahierId)?.name ?? 'Cahier'}::${chapitreById.get(e.chapitreId)?.title ?? 'Fiche'}`,
        locateSqlWasm: () => sqlWasmUrl,
      })
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cahiers-${new Date().toISOString().slice(0, 10)}.apkg`
      a.click()
      URL.revokeObjectURL(url)
      setMessage({ tone: 'ok', text: `Paquet Anki : ${result.notes} notes, ${result.cards} cartes${result.skipped ? `, ${result.skipped} exercices non exportables` : ''}.` })
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof Error ? e.message : 'Export Anki impossible.' })
    }
  }

  async function restore(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (await backupIsOlderThanData(parsed)) {
        const ok = window.confirm('Cette sauvegarde est plus ancienne que tes données actuelles. La restaurer fusionne les deux : les éléments présents dans le fichier reprennent leur ancienne version. Continuer ?')
        if (!ok) return
      }
      const imported = await importBackup(parsed)
      setMessage({ tone: 'ok', text: `Sauvegarde restaurée : ${imported.cahiers.length} cahiers, ${imported.exercises.length} exercices, ${imported.reviewLogs.length} réponses.` })
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof Error ? e.message : 'Fichier illisible.' })
    }
  }

  /** Merge, not restore: what is newer on each side wins, deletions propagate, nothing is lost. */
  async function merge(file: File) {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const s = await mergeBackup(parsed)
      const added = Object.values(s.added).reduce((a, b) => a + b, 0)
      const updated = Object.values(s.updated).reduce((a, b) => a + b, 0)
      const deleted = Object.values(s.deleted).reduce((a, b) => a + b, 0)
      const parts = [`${added} ajout${added > 1 ? 's' : ''}`, `${updated} mise${updated > 1 ? 's' : ''} à jour`, `${deleted} suppression${deleted > 1 ? 's' : ''}`]
      if (s.replayed) parts.push(`${s.replayed} exercice${s.replayed > 1 ? 's' : ''} révisé${s.replayed > 1 ? 's' : ''} des deux côtés, historique rejoué`)
      if (s.settingsChanged.length) parts.push(`réglages : ${s.settingsChanged.join(', ')}`)
      setMessage({ tone: 'ok', text: `Sauvegarde fusionnée : ${parts.join(', ')}.` })
    } catch (e) {
      setMessage({ tone: 'bad', text: e instanceof Error ? e.message : 'Fichier illisible.' })
    }
  }

  async function wipe() {
    if (!window.confirm('Tout effacer ? Cahiers, fiches, exercices et historique seront supprimés définitivement, ici et sur les appareils synchronisés.')) return
    await wipeAll()
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
        <Field label="Fond animé" hint="Des équations qui montent en profondeur derrière le contenu. En session, le fond passe à 40 % et ralentit de moitié. Désactivé automatiquement si tu as demandé moins d’animations au système, sur batterie faible, et onglet caché.">
          {(id) => (
            <Select id={id} value={settings.background ?? 'auto'} onChange={(e) => patch({ background: e.target.value === 'auto' ? undefined : (e.target.value as Settings['background']) })} className="max-w-xs">
              <option value="auto">Automatique (plein sur ordinateur, discret sur mobile)</option>
              <option value="full">Plein</option>
              <option value="discreet">Discret</option>
              <option value="off">Désactivé</option>
            </Select>
          )}
        </Field>
        <label className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm">
          <input type="checkbox" className="mt-0.5" checked={settings.swipeToGrade !== false} onChange={(e) => patch({ swipeToGrade: e.target.checked })} />
          <span>
            <span className="font-medium">Balayer les flashcards</span>
            <span className="block text-xs text-muted">Sur écran tactile, une fois la réponse affichée : vers la gauche « Encore », vers la droite « Bien », au-delà de 40 % de la largeur. L’intervalle s’affiche pendant le geste.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-lg border border-line px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!!settings.motionParallax}
            onChange={async (e) => {
              const on = e.target.checked
              const DO = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }) | undefined
              if (on && typeof DO?.requestPermission === 'function') {
                // iOS: the permission dialog needs this click.
                const state = await DO.requestPermission().catch(() => 'denied')
                if (state !== 'granted') {
                  setMessage({ tone: 'bad', text: 'Le mouvement n’a pas été autorisé par le système.' })
                  return
                }
              }
              await patch({ motionParallax: on })
            }}
          />
          <span>
            <span className="font-medium">Activer le mouvement</span>
            <span className="block text-xs text-muted">Sur téléphone ou tablette, incliner l’appareil décale légèrement les plans du fond (gyroscope, ±8 px). Réglage propre à cet appareil.</span>
          </span>
        </label>
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
        <Field label={`Rétention visée : ${Math.round(retention * 100)} %`} hint={perDay === null ? undefined : `≈ ${Math.round(perDay)} révisions par jour avec tes exercices actuels (simulation FSRS sur 90 jours, moyenne des 30 derniers, hors nouvelles cartes). 90 % est le meilleur compromis ; au-delà de 95 % on retombe dans la répétition massée.`}>
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
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-strong px-3 py-2 text-sm">
          <input type="checkbox" checked={settings.askConfidence} onChange={(e) => patch({ askConfidence: e.target.checked })} className="mt-0.5 size-4 accent-accent" />
          <span>
            Demander la confiance avant la réponse
            <span className="block text-xs text-muted">« Sûr / Hésitant / Aucune idée » (S, H, A) avant de révéler. Une erreur commise avec confiance est retestée à J+1 et J+7 ; la page Statistiques montre ta calibration.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-strong px-3 py-2 text-sm">
          <input type="checkbox" checked={settings.weightedMcq} onChange={(e) => patch({ weightedMcq: e.target.checked })} className="mt-0.5 size-4 accent-accent" />
          <span>
            QCM pondéré par la confiance
            <span className="block text-xs text-muted">Tu peux répartir ta confiance entre deux choix ; le score est la part mise sur la bonne réponse (42 % contre 35 % de rétention pour le QCM standard dans une étude, Sparck 2016 : preuve unique, désactivé par défaut).</span>
          </span>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Objectif minimal (réponses par jour)" hint="Ce qui maintient la série. Petit exprès : 2 gels par mois sont accordés automatiquement.">
            {(id) => <Input id={id} type="number" min={1} max={500} value={settings.minimalGoal} onChange={(e) => patch({ minimalGoal: clamp(e.target.valueAsNumber, 1, 500) })} />}
          </Field>
          <Field label="Objectif du jour (réponses)" hint="Indicatif, jamais culpabilisant.">
            {(id) => <Input id={id} type="number" min={1} max={2000} value={settings.dailyGoal} onChange={(e) => patch({ dailyGoal: clamp(e.target.valueAsNumber, 1, 2000) })} />}
          </Field>
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-strong px-3 py-2 text-sm">
          <input type="checkbox" checked={settings.burySiblings} onChange={(e) => patch({ burySiblings: e.target.checked })} className="mt-0.5 size-4 accent-accent" />
          <span>
            Enterrer les exercices frères
            <span className="block text-xs text-muted">Après une réponse, les autres exercices du même point de cours dus aujourd’hui passent à demain : on ne teste pas deux fois la même notion dans la même séance.</span>
          </span>
        </label>
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
            <Download size={16} />
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
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-strong px-3 py-2 text-sm">
          <input type="checkbox" checked={settings.autoInverse} onChange={(e) => patch({ autoInverse: e.target.checked })} className="mt-0.5 size-4 accent-accent" />
          <span>
            Cartes inverses automatiques
            <span className="block text-xs text-muted">Pour chaque flashcard d’une définition ou d’une formule, la carte réponse → question est ajoutée (à valider). Une définition doit aussi rappeler son terme.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-strong px-3 py-2 text-sm">
          <input type="checkbox" checked={settings.mindmapExercisesActive} onChange={(e) => patch({ mindmapExercisesActive: e.target.checked })} className="mt-0.5 size-4 accent-accent" />
          <span>
            Activer directement les exercices de carte mentale
            <span className="block text-xs text-muted">Chaque carte de fiche crée deux exercices (carte à trous, reconstruction). Par défaut ils attendent dans la file « à valider » pour ne pas alourdir la révision quotidienne.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-strong px-3 py-2 text-sm">
          <input type="checkbox" checked={settings.typedFlashcards} onChange={(e) => patch({ typedFlashcards: e.target.checked })} className="mt-0.5 size-4 accent-accent" />
          <span>
            Toujours saisir la réponse des flashcards
            <span className="block text-xs text-muted">Sinon, seules les flashcards marquées « à saisir » (formules, valeurs) demandent une saisie. La comparaison tolère casse, accents, espaces et variantes d’écriture LaTeX ; tu tranches.</span>
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {GENERATABLE_TYPES.map((t) => {
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

      <StorageSection />

      <SyncSection Section={Section} />

      <Section title="Données" description="Sauvegarde complète (JSON) restaurable ou fusionnable ici ; exports pour d’autres outils.">
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download}>
            <Download size={16} />
            Exporter une sauvegarde
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={16} />
            Restaurer une sauvegarde
          </Button>
          <Button variant="secondary" onClick={() => mergeRef.current?.click()}>
            <GitMerge size={16} />
            Fusionner une sauvegarde
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
          <input
            ref={mergeRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Fichier de sauvegarde à fusionner"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) merge(f)
              e.target.value = ''
            }}
          />
          <Button variant="ghost" className="text-bad hover:bg-bad-soft" onClick={wipe}>
            <TriangleAlert size={16} />
            Tout effacer
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="secondary" size="sm" onClick={downloadApkg}>
            <Download size={16} />
            Exporter pour Anki (.apkg)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => downloadExercises(',')}>
            <Download size={16} />
            Exercices en CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => downloadExercises('\t')}>
            <Download size={16} />
            Exercices en TSV
          </Button>
        </div>
        <p className="text-xs text-muted">
          <strong>Restaurer</strong> : le fichier remplace ce qu’il contient (les éléments absents du fichier restent). <strong>Fusionner</strong> : pour chaque élément, la version la plus récente gagne, les réponses des deux côtés sont réunies et un exercice révisé des deux côtés voit son historique rejoué ; les suppressions faites depuis le fichier s’appliquent aussi. C’est le mode à utiliser entre deux appareils sans compte Microsoft.
        </p>
        <p className="text-xs text-muted">Anki : flashcards, textes à trous (cloze), QCM, vrai/faux, associations, classements, démonstrations et rappels libres, un paquet par fiche (« Cahiers::Matière::Fiche »). L’historique FSRS n’est pas transféré.</p>
        {message && <p className={message.tone === 'ok' ? 'text-sm text-ok' : 'text-sm text-bad'}>{message.text}</p>}
        <MigrationBackups onExport={download} />
      </Section>
    </div>
  )
}

/** Copies taken automatically before each schema migration; downloadable and restorable like any backup. */
function MigrationBackups({ onExport }: { onExport: () => void }) {
  const backups = useLiveQuery(() => listMigrationBackups(), [])
  if (backups === undefined) return null
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-4">
      <p className="text-sm font-medium">Sauvegardes de migration</p>
      <p className="text-xs text-muted">Copie de tes données prise juste avant chaque changement de format de la base. À garder quelque temps ; restaurable via « Restaurer une sauvegarde ».</p>
      {backups.length === 0 && (
        // A base already in v5 before this protection existed will never get a backup_before_v3.
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
          Aucune sauvegarde de migration : cette base a été migrée avant l’ajout de cette protection.
          <Button size="sm" variant="secondary" onClick={onExport}>
            <Download size={14} />
            Exporter maintenant
          </Button>
        </p>
      )}
      <ul className="flex flex-col gap-1.5">
        {backups.map((b) => (
          <li key={b.key} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm">
            <span>
              Avant le schéma v{b.version} <span className="text-muted">· {new Date(b.exportedAt).toLocaleDateString('fr-FR')} · {formatBytes(b.bytes)}</span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => downloadText(JSON.stringify(b.value, null, 2), `cahiers-avant-v${b.version}.json`, 'application/json')}>
              <Download size={14} />
              Télécharger
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatBytes(n?: number): string {
  if (n === undefined) return '?'
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} ko`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} Go`
}

/** Persistent storage status and the automatic backup file. */
function StorageSection() {
  const [status, setStatus] = useState<PersistenceStatus | null>(null)
  const [auto, setAuto] = useState<AutosaveState | null>(null)
  const [permission, setPermission] = useState<PermissionState | 'none'>('none')
  const [error, setError] = useState<string>()

  const refresh = async () => {
    setStatus(await persistenceStatus())
    setAuto(await getAutosaveState())
    setPermission(await autosavePermission())
  }

  useEffect(() => {
    void refresh()
    const id = window.setInterval(() => {
      getAutosaveState().then(setAuto)
    }, 5000)
    return () => window.clearInterval(id)
  }, [])

  async function persist() {
    await requestPersistence()
    await refresh()
  }

  async function choose() {
    setError(undefined)
    try {
      await chooseAutosaveFile()
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setError(e instanceof Error ? e.message : 'Impossible de choisir le fichier.')
    }
    await refresh()
  }

  const supported = autosaveSupported()

  return (
    <Section title="Stockage" description="Tout vit dans ce navigateur. La persistance évite que le navigateur efface tes données quand il manque de place ; la sauvegarde automatique les double dans un fichier.">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm">
        <HardDrive size={18} className="shrink-0 text-muted" />
        {status === null ? (
          <span className="text-muted">Vérification…</span>
        ) : !status.supported ? (
          <span className="text-muted">Ce navigateur ne permet pas de demander un stockage persistant.</span>
        ) : status.persisted ? (
          <span>
            <span className="font-medium text-ok">Stockage persistant accordé.</span> {status.usageBytes !== undefined && <span className="text-muted">{formatBytes(status.usageBytes)} utilisés sur {formatBytes(status.quotaBytes)}.</span>}
          </span>
        ) : (
          <>
            <span>
              <span className="font-medium text-warn">Stockage non persistant</span> <span className="text-muted">: le navigateur pourrait effacer les données sous pression.</span>
            </span>
            <Button size="sm" variant="secondary" onClick={persist}>
              Demander la persistance
            </Button>
          </>
        )}
      </div>
      {status?.safari && (
        <p className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm">
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-warn" />
          Safari peut effacer les données d’un site non visité depuis 7 jours. Exporte une sauvegarde régulièrement (ou installe l’application sur l’écran d’accueil, qui n’est pas concernée).
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Save size={18} className="text-muted" />
          Sauvegarde automatique dans un fichier
        </div>
        {!supported ? (
          <p className="text-sm text-muted">Disponible sur Chrome et Edge (API File System Access). Ici, utilise « Exporter une sauvegarde » de temps en temps.</p>
        ) : auto?.fileName ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              Fichier : <span className="font-mono text-xs">{auto.fileName}</span>
              {auto.lastSavedAt ? <span className="text-muted"> · dernière écriture {new Date(auto.lastSavedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span> : null}
              {auto.bytes !== undefined ? <span className="text-muted"> · {formatBytes(auto.bytes)}</span> : null}
            </p>
            {auto.bytes !== undefined && auto.bytes > AUTOSAVE_WARN_BYTES && (
              <p className="text-warn">
                Le fichier dépasse {formatBytes(AUTOSAVE_WARN_BYTES)} : il est réécrit en entier à chaque modification, ce qui peut ralentir l’app. Exporte une sauvegarde manuelle et pense à archiver les cahiers terminés.
              </p>
            )}
            {permission !== 'granted' && (
              <p className="flex flex-wrap items-center gap-2 text-warn">
                Autorisation d’écriture à renouveler après le rechargement.
                <Button size="sm" variant="secondary" onClick={() => resumeAutosave().then(refresh)}>
                  Reprendre la sauvegarde automatique
                </Button>
              </p>
            )}
            {auto.lastError && permission === 'granted' && <p className="text-bad">{auto.lastError}</p>}
            <div>
              <Button size="sm" variant="ghost" onClick={() => stopAutosave().then(refresh)}>
                Arrêter
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">Choisis un fichier une fois, idéalement dans un dossier synchronisé (Drive, OneDrive, Dropbox) : l’app le réécrit après chaque modification.</p>
            <div>
              <Button size="sm" variant="secondary" onClick={choose}>
                <Save size={16} />
                Choisir le fichier de sauvegarde
              </Button>
            </div>
          </div>
        )}
        {error && <p className="text-sm text-bad">{error}</p>}
      </div>
    </Section>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-lg">{title}</h2>
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
