import { PageHeader } from '../components/ui'

/**
 * Component gallery, development only (see main.tsx). Filled in step A2:
 * every primitive in every state and both themes, so the design can be
 * reviewed on one page.
 */
export default function DesignPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow="Développement" title="Design" subtitle="Galerie des composants : tokens, boutons, cartes, champs, badges, modales, toasts, progression, squelettes, états vides." />
      <p className="text-sm text-muted">Vide pour l’instant (étape A0). Remplie à l’étape A2.</p>
    </div>
  )
}
