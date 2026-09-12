import { describe, expect, it } from 'vitest'
import { parseClaudeResponse, parseFicheResponse, parseSupplementResponse, runWithRepairs } from './importClaude'
import { renderMarkdown } from './markdown'

describe('repairs are reported, never silent', () => {
  it('counts the repaired backslashes on the result and through runWithRepairs', () => {
    const raw = '```json\n{"supplements":[{"title":"T","kind":"manque","reason":"r","content":"$\\frac{1}{2}$ et \\theta"}]}\n```'
    const { result, repairs } = runWithRepairs(() => parseSupplementResponse(raw))
    expect(result.supplements[0].content).toBe('$\\frac{1}{2}$ et \\theta')
    expect(result.repairs.doubledBackslashes).toBe(2)
    expect(repairs.doubledBackslashes).toBe(2)
    expect(repairs.commands).toEqual(['frac', 'theta'])
  })

  it('flags the exercises that were repaired and keeps the raw text of rejected items', () => {
    const raw = JSON.stringify({
      points: [],
      exercises: [
        { type: 'flashcard', question: 'Q1', answer: 'A1', difficulty: 1, tags: [] },
        { type: 'flashcard', question: 'Q2', answer: '$E = \\\\frac{1}{2}mv^2$', difficulty: 1, tags: [] },
        { type: 'cloze', text: 'sans trou', difficulty: 1, tags: [] },
      ],
    }).replace('\\\\frac', '\\frac')
    const r = parseClaudeResponse(raw)
    expect(r.repairs.doubledBackslashes).toBe(1)
    expect(r.exercises.map((e) => e.repaired ?? false)).toEqual([false, true])
    expect(r.rejected).toHaveLength(1)
    expect(r.rejected[0].raw).toContain('"sans trou"')
    expect(r.rejected[0].reason).toContain('trou')
  })

  it('reports zero repairs on a correct answer', () => {
    const raw = '{"supplements":[{"title":"T","kind":"manque","reason":"r","content":"$\\\\frac{1}{2}$"}]}'
    const { repairs } = runWithRepairs(() => parseSupplementResponse(raw))
    expect(repairs.doubledBackslashes).toBe(0)
  })
})

describe('fiches written by Claude render in <Markdown>', () => {
  const content = [
    '## Cinématique',
    '- **Vitesse** : $v = \\dfrac{d}{t}$, en $\\mathrm{m\\cdot s^{-1}}$',
    '',
    '$$\\vec{F} = m\\vec{a}$$',
    '',
    '- Combustion : $\\ce{2H2 + O2 -> 2H2O}$, $g = 9{,}8\\ \\mathrm{m\\cdot s^{-2}}$',
  ].join('\n')

  it('accepts the doubled-backslash JSON the prompt asks for', () => {
    const response = '```json\n' + JSON.stringify({ fiches: [{ title: 'Cinématique', content }] }) + '\n```'
    const parsed = parseFicheResponse(response)
    expect(parsed.rejected).toEqual([])
    expect(parsed.fiches[0].content).toBe(content)
    const html = renderMarkdown(parsed.fiches[0].content)
    expect(html).toContain('<h2')
    expect(html).toContain('katex-display')
    expect((html.match(/class="katex"/g) ?? []).length).toBeGreaterThanOrEqual(4)
    // mhchem turns \ce{…} into ordinary KaTeX output (no error span).
    expect(html).not.toContain('katex-error')
    expect(html).toContain('H')
  })

  it('also accepts single backslashes (repaired) in a supplement', () => {
    const response = '{"supplements":[{"title":"Énergie cinétique","kind":"manque","reason":"BO","content":"$E_c = \\dfrac{1}{2} m v^2$"}]}'
    const parsed = parseSupplementResponse(response)
    expect(parsed.rejected).toEqual([])
    expect(parsed.supplements[0].content).toBe('$E_c = \\dfrac{1}{2} m v^2$')
    expect(renderMarkdown(parsed.supplements[0].content, { inline: true })).not.toContain('katex-error')
  })
})
