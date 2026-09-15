import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ChartColumn, House, Notebook, PanelLeftClose, PanelLeftOpen, Plus, Settings } from 'lucide-react'
import { db } from './db'
import { ColorDot, Toaster, Tooltip, actionName, cx } from './components/ui'
import { NewCahierModal } from './components/NewCahierModal'
import { DepthField } from './components/DepthField'
import { InstallBanner } from './components/InstallBanner'
import { UpdateBanner } from './components/UpdateBanner'
import { VIEW_TRANSITIONS, isStandalone } from './lib/media'

const COLLAPSE_KEY = 'cahiers.nav.collapsed'

/** The bottom bar's own pages: no « back » there, the tabs are the navigation. */
const ROOT_PATHS = new Set(['/', '/cahiers', '/stats', '/settings', '/aide'])

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

/** Sidebar link: label hidden when the bar is collapsed (icon + tooltip instead). */
function NavItem({ to, end, icon, label, collapsed, accent }: { to: string; end?: boolean; icon: React.ReactNode; label: string; collapsed: boolean; accent?: string }) {
  const link = (
    <NavLink
      to={to}
      end={end}
      viewTransition={VIEW_TRANSITIONS}
      data-action={accent ? 'nav-cahier' : `nav-${actionName(label) ?? 'cahier'}`}
      aria-label={collapsed ? label : undefined}
      style={accent ? ({ '--cahier': accent } as React.CSSProperties) : undefined}
      className={({ isActive }) =>
        cx(
          'flex h-9 items-center gap-2.5 rounded-[var(--radius-sm)] text-sm press ring-focus',
          collapsed ? 'w-9 justify-center' : 'px-2.5',
          isActive ? 'bg-accent-soft font-medium text-accent-text' : 'text-ink hover:bg-surface-2',
        )
      }
    >
      <span className="flex size-[18px] shrink-0 items-center justify-center">{icon}</span>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  )
  return collapsed ? <Tooltip label={label}>{link}</Tooltip> : link
}

export default function App() {
  const cahiers = useLiveQuery(() => db.cahiers.orderBy('name').toArray(), [])
  const [creating, setCreating] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const location = useLocation()
  const navigate = useNavigate()
  // Installed app: no browser chrome, so pages below the tabs get a back button in the header.
  const showBack = isStandalone() && !ROOT_PATHS.has(location.pathname)
  const bare = location.pathname.startsWith('/train') || location.pathname.startsWith('/carte') || location.pathname.endsWith('/valider')

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* private mode */
    }
  }, [collapsed])

  if (bare) {
    // Training and mind maps take the whole viewport: no sidebar, nothing to distract.
    return (
      <>
        <DepthField />
        <Outlet />
        <Toaster />
        <UpdateBanner />
      </>
    )
  }

  return (
    <div className={cx('min-h-dvh md:grid', collapsed ? 'md:grid-cols-[64px_1fr]' : 'md:grid-cols-[240px_1fr]')}>
      <DepthField />
      {/* Sticky, viewport-high, translucent: the bottom block never moves when the page content grows (CLS 0). */}
      <aside className={cx('glass hidden border-r border-line md:sticky md:top-0 md:flex md:h-dvh md:flex-col', collapsed && 'md:items-center')}>
        <div className={cx('flex h-16 items-center gap-2', collapsed ? 'justify-center' : 'px-5')}>
          <span className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-accent-fg shadow-elev-1">
            <Notebook size={16} />
          </span>
          {!collapsed && <span className="font-display text-lg">Cahiers</span>}
        </div>
        <nav className={cx('flex flex-1 flex-col gap-1 px-3', collapsed && 'items-center')} aria-label="Navigation principale">
          <NavItem to="/" end icon={<House size={18} />} label="Tableau de bord" collapsed={collapsed} />
          <NavItem to="/stats" icon={<ChartColumn size={18} />} label="Statistiques" collapsed={collapsed} />

          <div className={cx('mt-4 mb-1 flex items-center', collapsed ? 'justify-center' : 'justify-between px-2.5')}>
            {!collapsed && <span className="text-xs font-medium text-muted">Mes cahiers</span>}
            <Tooltip label="Nouveau cahier">
              <button
                type="button"
                data-action="nouveau-cahier"
                onClick={() => setCreating(true)}
                className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink press ring-focus"
                aria-label="Nouveau cahier"
              >
                <Plus size={14} />
              </button>
            </Tooltip>
          </div>
          {cahiers?.map((c) => (
            <NavItem key={c.id} to={`/cahier/${c.id}`} icon={<ColorDot color={c.color} />} label={c.name} collapsed={collapsed} accent={c.color} />
          ))}
          {cahiers && cahiers.length === 0 && !collapsed && <p className="px-2.5 py-1 text-xs text-muted">Aucun cahier pour l’instant.</p>}
        </nav>
        <div className={cx('flex border-t border-line p-3', collapsed ? 'flex-col items-center gap-1' : 'items-center justify-between gap-1')}>
          <NavItem to="/settings" icon={<Settings size={18} />} label="Réglages" collapsed={collapsed} />
          <Tooltip label={collapsed ? 'Déplier la barre' : 'Replier la barre'}>
            <button
              type="button"
              data-action="replier-la-barre"
              onClick={() => setCollapsed((c) => !c)}
              className="flex size-9 items-center justify-center rounded-[var(--radius-sm)] text-muted hover:bg-surface-2 hover:text-ink press ring-focus"
              aria-label={collapsed ? 'Déplier la barre latérale' : 'Replier la barre latérale'}
              aria-expanded={!collapsed}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </Tooltip>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="glass sticky top-0 z-30 flex min-h-14 items-center justify-between border-b border-line pt-[env(safe-area-inset-top)] pr-[max(1rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] md:hidden">
          <div className="flex items-center gap-1">
            {showBack && (
              <button type="button" data-action="retour" onClick={() => navigate(-1)} aria-label="Retour" className="-ml-2 flex size-11 items-center justify-center rounded-[var(--radius-sm)] text-muted hover:bg-surface-2 ring-focus">
                <ArrowLeft size={20} />
              </button>
            )}
          <NavLink to="/" viewTransition={VIEW_TRANSITIONS} data-action="accueil" className="flex min-h-11 items-center gap-2 rounded-md font-display text-lg ring-focus">
            <span className="flex size-7 items-center justify-center rounded-[var(--radius-sm)] bg-accent text-accent-fg">
              <Notebook size={16} />
            </span>
            Cahiers
          </NavLink>
          </div>
          <NavLink to="/settings" data-action="nav-reglages" className="flex size-11 items-center justify-center rounded-[var(--radius-sm)] text-muted hover:bg-surface-2 ring-focus" aria-label="Réglages">
            <Settings size={20} />
          </NavLink>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(5rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] md:px-8 md:py-10 md:pr-8 md:pl-8">
          <InstallBanner />
          <Outlet />
        </main>
      </div>

      {/* Mobile: bottom bar, four entries, thumb-reachable, safe area respected. */}
      <nav className="glass fixed inset-x-0 bottom-0 z-40 flex border-t border-line pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] md:hidden" aria-label="Navigation principale">
        {[
          { to: '/', end: true, icon: <House size={22} />, label: 'Aujourd’hui' },
          { to: '/cahiers', icon: <Notebook size={22} />, label: 'Cahiers' },
          { to: '/stats', icon: <ChartColumn size={22} />, label: 'Statistiques' },
          { to: '/settings', icon: <Settings size={22} />, label: 'Réglages' },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            viewTransition={VIEW_TRANSITIONS}
            data-action={`nav-${actionName(item.label)}`}
            className={({ isActive }) => cx('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ring-focus', isActive ? 'text-accent-text' : 'text-muted')}
          >
            {({ isActive }) => (
              <>
                <span className={cx('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-accent-soft')}>{item.icon}</span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <NewCahierModal open={creating} onClose={() => setCreating(false)} />
      <Toaster />
      <UpdateBanner />
    </div>
  )
}
