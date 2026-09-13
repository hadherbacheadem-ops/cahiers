import { describe, expect, it } from 'vitest'
import { buildFichePrompt, buildPrompt, buildSupplementPrompt } from './prompt'

const LATEX_MARKERS = ['$…$ en ligne', '$$…$$ en bloc', '\\mathrm', '\\ce{…}', 'équation-bilan', 'jamais en texte brut']

describe('LaTeX requirement in the prompts', () => {
  it('« Rédiger avec Claude » demands LaTeX for formulas, units and reaction equations, with examples', () => {
    const prompt = buildFichePrompt({ cahierName: 'Physique', sources: [{ label: 'Cours', content: 'La vitesse…' }], split: 'one' })
    for (const m of LATEX_MARKERS) expect(prompt).toContain(m)
    expect(prompt).toContain('$g = 9{,}8\\ \\mathrm{m\\cdot s^{-2}}$')
    expect(prompt).toContain('$\\ce{2H2 + O2 -> 2H2O}$')
    // The JSON example shows doubled backslashes and the reminder.
    expect(prompt).toContain('\\\\dfrac{d}{t}')
    expect(prompt).toContain('chaque antislash LaTeX est doublé')
  })

  it('photographed pages: transcription rule first, photos listed as a source, text sources optional', () => {
    const prompt = buildFichePrompt({ cahierName: 'Histoire', sources: [], photos: 3, split: 'auto' })
    expect(prompt).toMatch(/\n0\. Les 3 photos jointes/)
    expect(prompt).toContain('[illisible]')
    expect(prompt).toContain('### Photos jointes (3)')
    expect(prompt).toMatch(/\n1\. Lis toutes les sources/)
    const one = buildFichePrompt({ cahierName: 'Histoire', sources: [{ label: 'Notes', content: 'x' }], photos: 1, split: 'one' })
    expect(one).toContain('La photo jointe à ce message est une page')
    expect(one).toContain('### Source 1 — Notes')
    expect(buildFichePrompt({ cahierName: 'Histoire', sources: [{ label: 'Notes', content: 'x' }], split: 'one' })).not.toMatch(/\n0\. |Photos jointes/)
  })

  it('asks for a short, telegraphic fiche and forbids describing the diagrams', () => {
    const prompt = buildFichePrompt({ cahierName: 'Physique', sources: [{ label: 'Cours', content: 'x' }], split: 'one', photos: 2 })
    expect(prompt).toContain('complète mais COURTE')
    expect(prompt).toContain('Nœud** : là où au moins trois fils se rejoignent')
    expect(prompt).toContain('ne sont PAS décrits')
    expect(prompt).toContain('Ne décris pas les schémas')
    expect(prompt).not.toContain('schémas décrits en mots')
  })

  it('numbers the programme rule after the LaTeX rule', () => {
    const prompt = buildFichePrompt({ cahierName: 'Physique', sources: [{ label: 'Cours', content: 'x' }], split: 'auto', programme: 'BO 2026' })
    expect(prompt).toMatch(/\n6\. Toute formule/)
    expect(prompt).toMatch(/\n7\. Utilise le programme officiel/)
  })

  it('« Compléter » demands LaTeX as well', () => {
    const prompt = buildSupplementPrompt({ cahierName: 'Chimie', title: 'Oxydoréduction', content: 'Fiche…' })
    for (const m of LATEX_MARKERS) expect(prompt).toContain(m)
    expect(prompt).toMatch(/\n6\. Toute formule/)
    expect(prompt).toContain('chaque antislash LaTeX est doublé')
  })

  it('the exercise prompt keeps its own LaTeX rule', () => {
    const prompt = buildPrompt({ cahierName: 'Physique', title: 'Gauss', content: 'Fiche…', types: ['flashcard'] } as Parameters<typeof buildPrompt>[0])
    expect(prompt).toContain('en LaTeX')
    expect(prompt).toContain('\\ce{…}')
  })
})
