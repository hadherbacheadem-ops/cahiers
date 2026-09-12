import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { requestPersistence } from '../lib/storage'
import { Button, IconButton } from './ui'

const DISMISS_KEY = 'cahiers.install.dismissed'

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
    // Installed apps keep their data longer; ask explicitly all the same.
    void requestPersistence()
  })
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Install hint, once: Android / desktop Chromium get the native prompt through
 * `beforeinstallprompt`; iOS Safari has no such event, so the banner explains
 * « Partager → Sur l’écran d’accueil ». Hidden when already installed or dismissed.
 */
export function InstallBanner() {
  const [, tick] = useState(0)
  const [hidden, setHidden] = useState(() => isStandalone() || dismissed())

  useEffect(() => {
    const l = () => tick((n) => n + 1)
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])

  if (hidden) return null
  const ios = isIosSafari()
  if (!deferred && !ios) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* private mode */
    }
    setHidden(true)
  }

  const install = async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    deferred = null
    if (outcome === 'accepted') setHidden(true)
    else dismiss()
  }

  return (
    <div role="region" aria-label="Installer l’application" className="glass mx-auto mb-4 flex w-full max-w-5xl items-center gap-3 rounded-[var(--radius-md)] border border-line px-4 py-3 text-sm shadow-elev-2">
      {ios ? <Share size={18} className="shrink-0 text-accent" aria-hidden="true" /> : <Download size={18} className="shrink-0 text-accent" aria-hidden="true" />}
      <p className="min-w-0 flex-1">
        {ios ? (
          <>
            <span className="font-medium">Ajoute Cahiers à l’écran d’accueil</span> <span className="text-muted">: bouton Partager, puis « Sur l’écran d’accueil ». L’app s’ouvre alors en plein écran et Safari ne purge plus ses données après 7 jours.</span>
          </>
        ) : (
          <>
            <span className="font-medium">Installe Cahiers</span> <span className="text-muted">: une icône sur l’écran d’accueil, plein écran, hors ligne.</span>
          </>
        )}
      </p>
      {!ios && (
        <Button size="sm" onClick={install}>
          Installer
        </Button>
      )}
      <IconButton label="Ne plus proposer" size="sm" onClick={dismiss}>
        <X size={16} />
      </IconButton>
    </div>
  )
}
