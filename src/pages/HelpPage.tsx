import { Link } from 'react-router-dom'
import { HelpSections } from '../components/KeyboardHelp'
import { Card, PageHeader } from '../components/ui'

/** The « ? » help as a page: on a phone there is no keyboard, every shortcut has its button in the session. */
export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={<Link to="/" data-action="fil-d-ariane">Tableau de bord</Link>} title="Aide" subtitle="En session, chaque action a son bouton sur l’écran ; au clavier, voici les raccourcis." />
      <Card className="p-5">
        <h2 className="text-lg">Sur téléphone</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Une flashcard révélée se balaye : vers la gauche « Encore », vers la droite « Bien » ; l’intervalle s’affiche pendant le geste. Désactivable dans Réglages → Apparence.</li>
          <li>Sous chaque exercice : Modifier, Demain, Suspendre et cette aide.</li>
          <li>Pour Claude : « Partager le prompt » ouvre l’app Claude via la feuille de partage, puis « Coller » lit le presse-papiers (le système demande confirmation sur iPhone).</li>
        </ul>
      </Card>
      <Card className="p-5">
        <h2 className="mb-4 text-lg">Raccourcis clavier</h2>
        <HelpSections mode="review" />
      </Card>
    </div>
  )
}
