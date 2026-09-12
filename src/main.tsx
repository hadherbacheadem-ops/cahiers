import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import 'katex/dist/katex.min.css'
import './index.css'
import App from './App'
import Dashboard from './pages/Dashboard'
import CahierPage from './pages/CahierPage'
import ChapitrePage from './pages/ChapitrePage'
import TrainPage from './pages/TrainPage'
import SettingsPage from './pages/SettingsPage'
import MindmapPage from './pages/MindmapPage'
import ValidatePage from './pages/ValidatePage'
import StatsPage from './pages/StatsPage'
import CahiersPage from './pages/CahiersPage'
import HelpPage from './pages/HelpPage'
import { applyTheme } from './lib/theme'
import { db, getSettings, importBackup, mergeBackup, purgeOldTombstones, updateSettings } from './db'
import { registerSW } from 'virtual:pwa-register'
import { startAutosave } from './lib/storage'
import { startAppSync } from './lib/sync'
import type { Settings } from './types'

getSettings().then((s) => applyTheme(s.theme))
registerSW({ immediate: true })
startAutosave()
startAppSync()

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
  clear: () => db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())).then(() => undefined)),
}

// Deletions older than 90 days no longer need to travel to the other devices.
db.open()
  .then(() => purgeOldTombstones())
  .catch(() => undefined)

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
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'cahiers', element: <CahiersPage /> },
        { path: 'aide', element: <HelpPage /> },
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
        { path: 'cahier/:cahierId', element: <CahierPage /> },
        { path: 'cahier/:cahierId/fiche/:chapitreId', element: <ChapitrePage /> },
        { path: 'train', element: <TrainPage /> },
        { path: 'stats', element: <StatsPage /> },
        { path: 'carte/:mindmapId', element: <MindmapPage /> },
        { path: 'cahier/:cahierId/fiche/:chapitreId/valider', element: <ValidatePage /> },
        { path: 'settings', element: <SettingsPage /> },
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
