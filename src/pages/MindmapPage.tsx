import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Download, Dumbbell, Network, Sparkles, Trash } from 'lucide-react'
import { db, deleteMindmap } from '../db'
import { CAHIER_COLORS } from '../types'
import { Badge, Button, ColorDot, EmptyState, IconButton, Skeleton } from '../components/ui'
import { MindmapCanvas, type MindmapCanvasHandle } from '../components/mindmap/MindmapCanvas'
import { MindmapPanel } from '../components/MindmapPanel'

const updatedFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' })

function slug(text: string) {
  const s = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return s || 'carte'
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function MindmapPage() {
  const { mindmapId = '' } = useParams()
  const navigate = useNavigate()
  const canvas = useRef<MindmapCanvasHandle>(null)
  const [regen, setRegen] = useState(false)
  const [busy, setBusy] = useState<'png' | 'svg' | null>(null)
  const [error, setError] = useState<string | null>(null)

  // undefined = loading, null = not found (Dexie's get() resolves to undefined for both).
  const map = useLiveQuery(async () => (await db.mindmaps.get(mindmapId)) ?? null, [mindmapId])
  const cahierId = map?.cahierId
  const chapitreId = map?.chapitreId
  const cahier = useLiveQuery(async () => (cahierId ? ((await db.cahiers.get(cahierId)) ?? null) : undefined), [cahierId])
  const chapitre = useLiveQuery(async () => (chapitreId ? ((await db.chapitres.get(chapitreId)) ?? null) : undefined), [chapitreId])

  const back = cahierId ? (chapitreId ? `/cahier/${cahierId}/fiche/${chapitreId}` : `/cahier/${cahierId}`) : '/'

  const palette = useMemo(() => {
    if (!cahier) return undefined
    return [cahier.color, ...CAHIER_COLORS.map((c) => c.value).filter((v) => v !== cahier.color)]
  }, [cahier])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !regen) {
        e.preventDefault()
        navigate(back)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, back, regen])

  useEffect(() => {
    if (!error) return
    const id = window.setTimeout(() => setError(null), 5000)
    return () => window.clearTimeout(id)
  }, [error])

  const exportAs = useCallback(
    async (kind: 'png' | 'svg') => {
      const handle = canvas.current
      if (!handle || !map || busy) return
      setBusy(kind)
      setError(null)
      try {
        const name = `carte-${slug(map.title)}.${kind}`
        if (kind === 'svg') download(new Blob([handle.exportSvg()], { type: 'image/svg+xml;charset=utf-8' }), name)
        else download(await handle.exportPng(2), name)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'L’export a échoué.')
      } finally {
        setBusy(null)
      }
    },
    [map, busy],
  )

  const remove = useCallback(async () => {
    if (!map) return
    if (!window.confirm(`Supprimer la carte mentale « ${map.title} » ?${map.chapitreId ? '\n\nSes deux exercices (carte à trous, reconstruction) et leur historique de révision seront perdus. Pour garder cet historique, régénère la carte plutôt que de la supprimer.' : ''}`)) return
    await deleteMindmap(map.id)
    navigate(back)
  }, [map, back, navigate])

  // ---- States -----------------------------------------------------------------

  const notFound = map === null || cahier === null
  if (!notFound && (map === undefined || cahier === undefined)) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3 md:px-4">
          <Skeleton className="size-9" />
          <Skeleton className="h-5 w-56" />
        </header>
        <div className="flex flex-1 items-center justify-center">
          <Skeleton className="h-64 w-full max-w-2xl" />
        </div>
      </div>
    )
  }

  if (!map || !cahier) {
    return (
      <div className="flex min-h-dvh flex-col bg-bg">
        <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
          <EmptyState
            icon={<Network size={24} />}
            title="Carte introuvable"
            description="Elle a peut-être été supprimée ou régénérée."
            action={
              <Link to="/" className="text-sm font-medium text-accent-text">
                Retour au tableau de bord
              </Link>
            }
          />
        </main>
      </div>
    )
  }

  // ---- Page -------------------------------------------------------------------

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 md:gap-3 md:px-4">
        <IconButton label="Retour" onClick={() => navigate(back)}>
          <ArrowLeft size={18} />
        </IconButton>

        <div className="flex min-w-0 flex-1 flex-col justify-center">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-ink md:text-base">{map.title}</h1>
            <Badge tone="accent" className="hidden shrink-0 sm:inline-flex">
              {map.chapitreId ? 'Fiche' : 'Synthèse du cahier'}
            </Badge>
          </div>
          <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted">
            <ColorDot color={cahier.color} />
            <span className="truncate">{cahier.name}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0">mise à jour le {updatedFormat.format(map.updatedAt)}</span>
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1 md:gap-2">
          <Button variant="secondary" size="sm" aria-label="Télécharger PNG" title="Télécharger PNG" disabled={busy !== null} onClick={() => exportAs('png')} className="px-2 md:px-3">
            <Download size={16} />
            <span className="hidden md:inline">{busy === 'png' ? 'Export…' : 'PNG'}</span>
          </Button>
          <Button variant="secondary" size="sm" aria-label="Télécharger SVG" title="Télécharger SVG" disabled={busy !== null} onClick={() => exportAs('svg')} className="px-2 md:px-3">
            <Download size={16} />
            <span className="hidden md:inline">SVG</span>
          </Button>
          {map.chapitreId && (
            <Button
              variant="secondary"
              size="sm"
              aria-label="S’entraîner"
              title="Lire la carte n’est pas réviser : les exercices « carte à trous » et « reconstruction » de la fiche la font retrouver de mémoire."
              onClick={() => navigate(`/train?scope=chapitre&id=${map.chapitreId}&mode=practice&types=carte_trous&from=/carte/${map.id}`)}
              className="px-2 md:px-3"
            >
              <Dumbbell size={16} />
              <span className="hidden md:inline">S’entraîner</span>
            </Button>
          )}
          <Button size="sm" aria-label="Régénérer" title="Régénérer" onClick={() => setRegen(true)} className="px-2 md:px-3">
            <Sparkles size={16} />
            <span className="hidden md:inline">Régénérer</span>
          </Button>
          <IconButton label="Supprimer" onClick={remove} className="hover:text-bad">
            <Trash size={18} />
          </IconButton>
        </div>
      </header>

      <div className="relative flex-1">
        <MindmapCanvas ref={canvas} root={map.root} palette={palette} className="absolute inset-0" />
        {error && (
          <p role="alert" className="absolute top-3 left-1/2 -translate-x-1/2 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-bad shadow-elev-2">
            {error}
          </p>
        )}
      </div>

      <MindmapPanel open={regen} onClose={() => setRegen(false)} cahier={cahier} chapitre={chapitre ?? undefined} />
    </div>
  )
}
