import { useState } from 'react'
import { Button, PageHeader } from '../components/ui'
import { RichFiche } from '../components/RichFiche'
import { applyTheme } from '../lib/theme'
import { SAMPLE_FICHE } from '../lib/ficheSample'

const ACCENTS = [
  { name: 'Physique', color: '#8b7cf6' },
  { name: 'Maths', color: '#3fb6a8' },
  { name: 'Chimie', color: '#e0805a' },
]

/** Development prototype of rich (HTML) fiches: one sample, both themes, three cahier colours. */
export default function FicheRichePrototype() {
  const [accent, setAccent] = useState(ACCENTS[0].color)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Prototype"
        title="Fiche riche"
        subtitle="Une fiche HTML dans une iframe isolée, avec le thème de l'app, KaTeX et le kit de composants."
        actions={
          <>
            <Button variant="secondary" onClick={() => applyTheme('light')}>
              Clair
            </Button>
            <Button variant="secondary" onClick={() => applyTheme('dark')}>
              Marine
            </Button>
          </>
        }
      />
      <div className="flex flex-wrap gap-2">
        {ACCENTS.map((a) => (
          <Button key={a.name} variant={a.color === accent ? 'primary' : 'secondary'} onClick={() => setAccent(a.color)}>
            {a.name}
          </Button>
        ))}
      </div>
      <RichFiche html={SAMPLE_FICHE} accent={accent} title="Mécanique céleste" />
    </div>
  )
}
