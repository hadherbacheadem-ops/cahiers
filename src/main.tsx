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
import { applyTheme } from './lib/theme'
import { getSettings } from './db'

getSettings().then((s) => applyTheme(s.theme))

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'cahier/:cahierId', element: <CahierPage /> },
      { path: 'cahier/:cahierId/fiche/:chapitreId', element: <ChapitrePage /> },
      { path: 'train', element: <TrainPage /> },
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
