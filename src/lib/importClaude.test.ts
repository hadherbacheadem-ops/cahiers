import { describe, expect, it } from 'vitest'
import { parseFicheResponse, parseSupplementResponse, repairJson } from './importClaude'
import { renderMarkdown } from './markdown'

describe('repairJson', () => {
  it('doubles single backslashes before LaTeX commands and drops trailing commas', () => {
    const raw = '{"a": "$\\dfrac{1}{2}$ et \\ce{H2O} \\n fin", "b": ["x",],}'
    const parsed = JSON.parse(repairJson(raw)) as { a: string; b: string[] }
    expect(parsed.a).toBe('$\\dfrac{1}{2}$ et \\ce{H2O} \n fin')
    expect(parsed.b).toEqual(['x'])
  })

  it('leaves valid escapes alone', () => {
    const raw = '{"a": "guillemet \\" et \\u00e9 et \\\\dfrac"}'
    expect(repairJson(raw)).toBe(raw)
    expect(JSON.parse(repairJson(raw))).toEqual({ a: 'guillemet " et é et \\dfrac' })
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
