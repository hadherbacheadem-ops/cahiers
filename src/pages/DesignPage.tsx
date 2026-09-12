import { useState } from 'react'
import { Download, Pencil, Plus, Sparkles, Trash } from 'lucide-react'
import { EXERCISE_TYPES, type ExerciseStatus } from '../types'
import { Badge, Button, Card, Checkbox, Counter, Drawer, EmptyState, ExerciseTypeBadge, Field, Glass, IconButton, InkIllustration, Input, Kbd, Modal, PageHeader, ProgressBar, ProgressRing, SegmentedBar, Select, Skeleton, StatusBadge, Textarea, Tooltip, toast } from '../components/ui'
import { applyTheme } from '../lib/theme'

/**
 * Component gallery, development only (see main.tsx): every primitive in every
 * state, so the design can be reviewed on one page in both themes.
 */
export default function DesignPage() {
  const [modal, setModal] = useState(false)
  const [drawer, setDrawer] = useState(false)
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Développement"
        title="Design"
        subtitle="Galerie des composants : tokens, boutons, cartes, champs, badges, modales, toasts, progression, squelettes, états vides."
        actions={
          <>
            <Button variant="secondary" onClick={() => applyTheme('light')}>
              Thème clair
            </Button>
            <Button variant="secondary" onClick={() => applyTheme('dark')}>
              Thème marine
            </Button>
          </>
        }
      />

      <Section title="Tokens">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {['--bg-0', '--bg-1', '--bg-2', '--surface-1', '--surface-2', '--surface-3', '--accent', '--accent-soft', '--ok', '--bad', '--warn', '--text-1', '--text-2', '--text-3', '--line', '--line-strong'].map((t) => (
            <div key={t} className="flex flex-col gap-1.5">
              <div className="h-12 rounded-[var(--radius-sm)] border border-line" style={{ background: `var(${t})` }} />
              <code className="text-[11px] text-muted">{t}</code>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap items-end gap-6">
          <div>
            <p className="text-xs text-muted">Titre (Fraunces)</p>
            <p className="font-display text-4xl">Nuit d’encre</p>
          </div>
          <div>
            <p className="text-xs text-muted">Interface (Inter)</p>
            <p className="text-base">Le champ dérive d’un potentiel.</p>
          </div>
          <div>
            <p className="text-xs text-muted">Code (JetBrains Mono)</p>
            <p className="font-mono text-sm">\dfrac{'{'}q{'}'}{'{'}4\pi\varepsilon_0 r^2{'}'}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Maths (STIX Two Math)</p>
            <p className="font-[family-name:var(--font-math)] text-xl">∇·E = ρ/ε₀ · ∑ 1/n² = π²/6</p>
          </div>
        </div>
      </Section>

      <Section title="Boutons">
        <div className="flex flex-wrap items-center gap-3">
          <Button>
            <Sparkles size={16} /> Primaire
          </Button>
          <Button variant="secondary">
            <Download size={16} /> Secondaire
          </Button>
          <Button variant="ghost">
            <Pencil size={16} /> Fantôme
          </Button>
          <Button variant="danger">
            <Trash size={16} /> Danger
          </Button>
          <Button disabled>Désactivé</Button>
          <Button loading>Chargement</Button>
          <Button size="sm">Petit</Button>
          <Button size="lg">Grand</Button>
          <IconButton label="Ajouter">
            <Plus size={18} />
          </IconButton>
          <Tooltip label="Info-bulle au survol ou au focus">
            <Button variant="secondary" size="sm">
              Survole-moi
            </Button>
          </Tooltip>
          <Button variant="secondary" onClick={() => toast('Sauvegarde exportée.', 'ok')}>
            Toast ok
          </Button>
          <Button variant="secondary" onClick={() => toast('Le JSON est invalide.', 'bad')}>
            Toast erreur
          </Button>
        </div>
      </Section>

      <Section title="Cartes (4 élévations) et verre">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {([1, 2, 3, 4] as const).map((e) => (
            <Card key={e} elevation={e} interactive className="p-4">
              <p className="text-sm font-medium">Élévation {e}</p>
              <p className="text-xs text-muted">Ombres multicouches teintées marine, liseré clair en haut.</p>
            </Card>
          ))}
          <Glass className="p-4">
            <p className="text-sm font-medium">Verre</p>
            <p className="text-xs text-muted">Navigation et panneaux flottants seulement.</p>
          </Glass>
        </div>
      </Section>

      <Section title="Champs">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom du cahier" hint="Visible dans la barre latérale.">
            {(id) => <Input id={id} placeholder="Physique" />}
          </Field>
          <Field label="Avec erreur" error="Ce nom existe déjà.">
            {(id) => <Input id={id} defaultValue="Physique" aria-invalid />}
          </Field>
          <Field label="Sélection">
            {(id) => (
              <Select id={id} defaultValue="b">
                <option value="a">Automatique</option>
                <option value="b">Plein</option>
              </Select>
            )}
          </Field>
          <Field label="Texte long">{(id) => <Textarea id={id} placeholder="Colle la réponse de Claude…" />}</Field>
          <Checkbox label="Demander la confiance" description="Sûr / Hésitant / Aucune idée avant la réponse." defaultChecked />
          <Checkbox label="QCM pondéré" description="Désactivé par défaut." />
        </div>
      </Section>

      <Section title="Badges">
        <div className="flex flex-wrap items-center gap-2">
          {EXERCISE_TYPES.map((t) => (
            <ExerciseTypeBadge key={t} type={t} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {(['pending', 'active', 'suspended', 'leech'] as ExerciseStatus[]).map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <Badge tone="accent">Accent</Badge>
          <Badge tone="neutral">Neutre</Badge>
          <Kbd>Ctrl</Kbd>
          <Kbd>J</Kbd>
        </div>
      </Section>

      <Section title="Progression">
        <div className="flex flex-wrap items-center gap-6">
          <ProgressRing value={0.72} label="72 % révisés">
            72 %
          </ProgressRing>
          <ProgressRing value={0.35} size={40} stroke={4} tone="ok" label="35 %" />
          <div className="w-64">
            <ProgressBar value={0.6} label="60 %" />
            <ProgressBar value={0.3} label="30 %" thin className="mt-3" tone="bad" />
            <SegmentedBar segments={['done', 'done', 'todo']} label="2 séances sur 3" className="mt-3" />
          </div>
          <p className="text-3xl">
            <Counter value={1284} /> <span className="text-sm text-muted">réponses</span>
          </p>
        </div>
      </Section>

      <Section title="Squelettes et états vides">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-3 p-4">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-10 w-32" />
          </Card>
          <EmptyState illustration="cards" title="Aucun exercice" description="Génère des exercices depuis une fiche pour commencer." action={<Button>Générer</Button>} />
          <EmptyState illustration="notebook" title="Aucun cahier" description="Un cahier par matière." />
          <EmptyState illustration="map" title="Pas de carte mentale" />
          <div className="flex items-center gap-6 text-text-3">
            <InkIllustration kind="stars" />
          </div>
        </div>
      </Section>

      <Section title="Modale et tiroir">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setModal(true)}>
            Ouvrir la modale
          </Button>
          <Button variant="secondary" onClick={() => setDrawer(true)}>
            Ouvrir le tiroir
          </Button>
        </div>
        <Modal open={modal} onClose={() => setModal(false)} title="Nouveau cahier" footer={<Button onClick={() => setModal(false)}>Créer</Button>}>
          <Field label="Nom">{(id) => <Input id={id} autoFocus placeholder="Chimie" />}</Field>
        </Modal>
        <Drawer open={drawer} onClose={() => setDrawer(false)} title="Raccourcis clavier">
          <p className="text-sm text-muted">
            <Kbd>J</Kbd> garder · <Kbd>K</Kbd> ignorer · <Kbd>E</Kbd> modifier · <Kbd>Échap</Kbd> quitter
          </p>
        </Drawer>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl">{title}</h2>
      {children}
    </section>
  )
}
