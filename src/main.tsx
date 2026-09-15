import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App'
import Dashboard from './pages/Dashboard'
import { RouteError } from './components/RouteError'
import { Skeleton } from './components/ui'

// Every page but the dashboard is its own chunk, fetched on first visit and
// precached by the service worker for the next ones: the start-up bundle is
// the shell, the dashboard and the database.
const CahierPage = lazy(() => import('./pages/CahierPage'))
const ChapitrePage = lazy(() => import('./pages/ChapitrePage'))
const TrainPage = lazy(() => import('./pages/TrainPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const MindmapPage = lazy(() => import('./pages/MindmapPage'))
const ValidatePage = lazy(() => import('./pages/ValidatePage'))
const StatsPage = lazy(() => import('./pages/StatsPage'))
const CahiersPage = lazy(() => import('./pages/CahiersPage'))
const HelpPage = lazy(() => import('./pages/HelpPage'))
const SharePage = lazy(() => import('./pages/SharePage'))

/** While a page chunk arrives (a few ms from the cache, a round-trip the first time). */
function PageFallback() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}
const page = (el: React.ReactElement) => <Suspense fallback={<PageFallback />}>{el}</Suspense>
import { applyTheme } from './lib/theme'
import { db, exportContentOnly, getSettings, importBackup, mergeBackup, purgeOldTombstones, updateSettings } from './db'
import { registerSW } from 'virtual:pwa-register'
import { toast } from './components/ui'
import { requestPersistence } from './lib/storage'
import { handleGoogleRedirect } from './lib/googleAuth'
import type { Settings } from './types'

getSettings().then((s) => applyTheme(s.theme))
// Back from a Google sign-in by redirect (phones, installed app): the token is in the URL.
handleGoogleRedirect()
// A new build waits (registerType: prompt) until the user taps « Recharger » in the banner.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('cahiers:update'))
  },
})
window.__cahiersUpdate = () => updateSW(true)
// Sync engine and autosave are not needed to paint the first screen: fetched once the page is idle.
const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1500))
idle(
  () => {
    void import('./lib/storage').then((m) => m.startAutosave())
    void import('./lib/sync').then((m) => m.startAppSync())
    // The animated overlays (sheet, modal, toasts) are fetched now, so the first ⋯ tap does not wait for them.
    void import('./components/overlays')
  },
  { timeout: 5000 },
)

// Automation hook (screenshots, perf and demo scripts): seed a backup, switch the theme.
// Harmless for users: it only exposes what Réglages already offers.
declare global {
  interface Window {
    __cahiers?: {
      importBackup: typeof importBackup
      mergeBackup: typeof mergeBackup
      setTheme: (theme: Settings['theme']) => Promise<void>
      updateSettings: typeof updateSettings
      count: () => Promise<number>
      clear: () => Promise<void>
      exportContentOnly: typeof exportContentOnly
    }
  }
}
window.__cahiers = {
  importBackup,
  mergeBackup,
  updateSettings,
  setTheme: async (theme) => {
    await updateSettings({ theme })
    applyTheme(theme)
  },
  count: () => db.exercises.count(),
  exportContentOnly,
  clear: () => db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())).then(() => undefined)),
}

// Deletions older than 90 days no longer need to travel to the other devices;
// and once there is something to lose, ask the browser (again) to keep it.
db.open()
  .then(async () => {
    await purgeOldTombstones()
    // 13 September « débloat »: the confidence prompt and the typed flashcards become opt-in for everyone, once.
    if (!(await db.kv.get('ui.simplified.v1'))) {
      await updateSettings({ askConfidence: false, typedFlashcards: false })
      await db.kv.put({ key: 'ui.simplified.v1', value: Date.now() })
    }
    if ((await db.cahiers.count()) > 0 && navigator.storage?.persisted && !(await navigator.storage.persisted())) await requestPersistence()
  })
  .catch((e: unknown) => {
    // Private browsing on older Safari, a locked or corrupt database: say so instead of a silent, amnesic app.
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e)
    window.__cahiersStorageError = detail
    window.dispatchEvent(new CustomEvent('cahiers:storage-error', { detail }))
  })

// Writes that fail for lack of space (quota, private mode) surface as a toast instead of a silent failure.
window.addEventListener('unhandledrejection', (ev) => {
  const r = ev.reason as { name?: string; message?: string; inner?: { name?: string } } | undefined
  const name = r?.name ?? r?.inner?.name ?? ''
  // A view transition skipped by a second navigation is not an error worth a console line.
  if (name === 'AbortError' && /view transition/i.test(r?.message ?? '')) {
    ev.preventDefault()
    return
  }
  if (/Quota|OpenFailed|InvalidState|VersionError|MissingAPI/.test(name)) {
    ev.preventDefault()
    toast(`Stockage impossible (${name}) : espace plein ou navigation privée. Exporte une sauvegarde depuis Réglages.`, 'bad')
  }
})

// Touch keyboards: keep the focused field in view when the visual viewport shrinks.
window.visualViewport?.addEventListener('resize', () => {
  const el = document.activeElement
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
})

// The component gallery ships in development only (tree-shaken out of the build).
const DesignPage = import.meta.env.DEV ? lazy(() => import('./pages/DesignPage')) : null

/** `/` locally, `/<dépôt>` on GitHub Pages (Vite's base, without the trailing slash). */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      errorElement: <RouteError />,
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'cahiers', element: page(<CahiersPage />) },
        { path: 'aide', element: page(<HelpPage />) },
        { path: 'partager', element: page(<SharePage />) },
        ...(DesignPage
          ? [
              {
                path: 'design',
                element: (
                  <Suspense fallback={null}>
                    <DesignPage />
                  </Suspense>
                ),
              },
            ]
          : []),
        { path: 'cahier/:cahierId', element: page(<CahierPage />) },
        { path: 'cahier/:cahierId/fiche/:chapitreId', element: page(<ChapitrePage />) },
        { path: 'train', element: page(<TrainPage />) },
        { path: 'stats', element: page(<StatsPage />) },
        { path: 'carte/:mindmapId', element: page(<MindmapPage />) },
        { path: 'cahier/:cahierId/fiche/:chapitreId/valider', element: page(<ValidatePage />) },
        { path: 'settings', element: page(<SettingsPage />) },
      ],
    },
  ],
  { basename },
)

// First paint with the final fonts (they are local / precached, so this is a
// few dozen ms): no swap after render, no layout shift. Capped at 800 ms.
const fonts = document.fonts?.load
  ? Promise.all([document.fonts.load('16px "Inter Variable"'), document.fonts.load('600 24px "Fraunces Variable"'), document.fonts.load('14px "JetBrains Mono Variable"')])
  : Promise.resolve()
Promise.race([fonts, new Promise((r) => setTimeout(r, 800))])
  .catch(() => undefined)
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    )
  })
