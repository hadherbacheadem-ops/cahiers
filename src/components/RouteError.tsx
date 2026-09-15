import { Link, useRouteError } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Button } from './ui'

/**
 * What the user sees instead of a white screen when a page throws: the error,
 * a reload and a way home. Installed apps have no address bar to retry from,
 * so both buttons matter there.
 */
export function RouteError() {
  const error = useRouteError() as { message?: string; statusText?: string; status?: number } | undefined
  const message = error?.message ?? error?.statusText ?? 'Erreur inconnue'
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col items-center justify-center gap-4 px-6 py-10 text-center" role="alert">
      <h1 className="text-2xl">Cette page a planté</h1>
      <p className="text-sm text-muted">Tes données sont intactes : elles sont dans la base locale, pas dans la page. Recharge, ou reviens à l’accueil.</p>
      <pre className="max-w-full overflow-x-auto rounded-md border border-line bg-surface-2 px-3 py-2 text-left text-xs text-muted" data-wrap-anywhere>
        {message}
      </pre>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button data-action="recharger" onClick={() => window.location.reload()}>
          <RefreshCw size={16} />
          Recharger
        </Button>
        <Link to="/" data-action="accueil" reloadDocument className="inline-flex min-h-11 items-center rounded-[var(--radius-sm)] border border-line px-4 text-sm font-medium text-ink ring-focus">
          Accueil
        </Link>
      </div>
    </main>
  )
}
