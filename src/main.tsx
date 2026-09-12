import { StrictMode } from 'react'
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
import { getSettings } from './db'
import { registerSW } from 'virtual:pwa-register'
import { startAutosave } from './lib/storage'

getSettings().then((s) => applyTheme(s.theme))
registerSW({ immediate: true })
startAutosave()

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
