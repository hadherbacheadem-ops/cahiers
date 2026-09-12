import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChartBar, GearSix, House, Notebook, Plus } from '@phosphor-icons/react'
import { useState } from 'react'
import { db } from './db'
import { ColorDot, cx } from './components/ui'
import { NewCahierModal } from './components/NewCahierModal'

const navClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm press ring-focus',
    isActive ? 'bg-accent-soft font-medium text-accent' : 'text-ink hover:bg-surface-2',
  )

export default function App() {
  const cahiers = useLiveQuery(() => db.cahiers.orderBy('name').toArray(), [])
  const [creating, setCreating] = useState(false)
  const location = useLocation()
  const bare = location.pathname.startsWith('/train') || location.pathname.startsWith('/carte') || location.pathname.endsWith('/valider')

  if (bare) {
    // Training and mind maps take the whole viewport: no sidebar, nothing to distract.
    return <Outlet />
  }

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[248px_1fr]">
      <aside className="hidden border-r border-line bg-surface md:flex md:flex-col">
        <div className="flex h-16 items-center gap-2 px-5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
            <Notebook size={16} weight="bold" />
          </span>
          <span className="font-semibold tracking-tight">Cahiers</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          <NavLink to="/" end className={navClass}>
            <House size={18} />
            Tableau de bord
          </NavLink>
          <NavLink to="/stats" className={navClass}>
            <ChartBar size={18} />
            Statistiques
          </NavLink>

          <div className="mt-4 mb-1 flex items-center justify-between px-2.5">
            <span className="text-xs font-medium text-muted">Mes cahiers</span>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink press ring-focus"
              aria-label="Nouveau cahier"
              title="Nouveau cahier"
            >
              <Plus size={14} weight="bold" />
            </button>
          </div>
          {cahiers?.map((c) => (
            <NavLink key={c.id} to={`/cahier/${c.id}`} className={navClass}>
              <ColorDot color={c.color} />
              <span className="truncate">{c.name}</span>
            </NavLink>
          ))}
          {cahiers && cahiers.length === 0 && <p className="px-2.5 py-1 text-xs text-muted">Aucun cahier pour l’instant.</p>}
        </nav>
        <div className="border-t border-line p-3">
          <NavLink to="/settings" className={navClass}>
            <GearSix size={18} />
            Réglages
          </NavLink>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-4 md:hidden">
          <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <Notebook size={16} weight="bold" />
            </span>
            Cahiers
          </NavLink>
          <NavLink to="/settings" className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-2" aria-label="Réglages">
            <GearSix size={20} />
          </NavLink>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8 md:py-10">
          <Outlet />
        </main>
      </div>

      <NewCahierModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
