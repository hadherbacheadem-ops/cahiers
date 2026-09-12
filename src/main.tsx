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
import { applyTheme } from './lib/theme'
import { db, getSettings, importBackup, updateSettings } from './db'
import { registerSW } from 'virtual:pwa-register'
import { startAutosave } from './lib/storage'
import type { Settings } from './types'

getSettings().then((s) => applyTheme(s.theme))
registerSW({ immediate: true })
startAutosave()

// Automation hook (screenshots, perf and demo scripts): seed a backup, switch the theme.
// Harmless for users: it only exposes what Réglages already offers.
declare global {
  interface Window {
    __cahiers?: {
      importBackup: typeof importBackup
      setTheme: (theme: Settings['theme']) => Promise<void>
      updateSettings: typeof updateSettings
      count: () => Promise<number>
      clear: () => Promise<void>
    }
  }
}
window.__cahiers = {
  importBackup,
  updateSettings,
  setTheme: async (theme) => {
    await updateSettings({ theme })
    applyTheme(theme)
  },
  count: () => db.exercises.count(),
  clear: () => db.transaction('rw', db.tables, () => Promise.all(db.tables.map((t) => t.clear())).then(() => undefined)),
}

// The component gallery ships in development only (tree-shaken out of the build).
const DesignPage = import.meta.env.DEV ? lazy(() => import('./pages/DesignPage')) : null

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      ...(DesignPage ? [{ path: 'design', element: <Suspense fallback={null}><DesignPage /></Suspense> }] : []),
      { path: 'cahier/:cahierId', element: <CahierPage /> },
      { path: 'cahier/:cahierId/fiche/:chapitreId', element: <ChapitrePage /> },
      { path: 'train', element: <TrainPage /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'carte/:mindmapId', element: <MindmapPage /> },
      { path: 'cahier/:cahierId/fiche/:chapitreId/valider', element: <ValidatePage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
])

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
