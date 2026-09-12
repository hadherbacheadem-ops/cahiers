import { describe, expect, it } from 'vitest'
import { extractMath, hasUnbalancedLatex, renderMarkdown } from './markdown'

describe('extractMath', () => {
  it('replaces display and inline math with tokens and renders them with KaTeX', () => {
    const { text, math } = extractMath('Soit $$\\int_0^1 x\\,dx$$ et $E = mc^2$ ; prix : 5 $ et 10 $.')
    expect(text).toContain('%%KATEX_0%%')
    expect(text).toContain('%%KATEX_1%%')
    expect(text).toContain('5 $ et 10 $')
    expect(math).toHaveLength(2)
    expect(math[0]).toContain('katex-display')
    expect(math[1]).toContain('class="katex"')
  })

  it('keeps escaped dollars literal and handles \\( \\) delimiters', () => {
    const { text, math } = extractMath('Un \\$ échappé et \\(a+b\\).')
    expect(text).toContain('Un $ échappé')
    expect(math).toHaveLength(1)
  })
})

describe('renderMarkdown', () => {
  it('renders headings, lists, bold and math in block mode', () => {
    const html = renderMarkdown('## Titre\n- **gras** avec $x_1$\n- deuxième')
    expect(html).toContain('<h2')
    expect(html).toContain('<strong>gras</strong>')
    expect(html).toContain('<li>')
    expect(html).toContain('class="katex"')
    expect(html).not.toContain('%%KATEX')
  })

  it('renders inline mode without block wrappers', () => {
    const html = renderMarkdown('La *valeur* $\\varepsilon_0$', { inline: true })
    expect(html).not.toContain('<p>')
    expect(html).toContain('<em>valeur</em>')
    expect(html).toContain('katex')
  })

  it('does not let markdown mangle underscores inside formulas', () => {
    const html = renderMarkdown('$Q_{int}/\\varepsilon_0$ puis $a_b$')
    expect(html).not.toContain('<em>')
  })

  it('survives invalid LaTeX', () => {
    expect(() => renderMarkdown('$\\frac{1}{$')).not.toThrow()
  })
})

describe('hasUnbalancedLatex', () => {
  it('detects odd dollars and unbalanced braces', () => {
    expect(hasUnbalancedLatex('Valeur de $x$')).toBe(false)
    expect(hasUnbalancedLatex('Valeur de $x')).toBe(true)
    expect(hasUnbalancedLatex('$\\frac{1}{2$')).toBe(true)
    expect(hasUnbalancedLatex('\\(a+b\\) et \\[c\\]')).toBe(false)
    expect(hasUnbalancedLatex('\\(a+b')).toBe(true)
    expect(hasUnbalancedLatex('Prix : 5 \\$')).toBe(false)
  })
})

describe('fiche callouts', () => {
  it('frames « L’essentiel » and « À compléter » sections, nothing else', () => {
    const html = renderMarkdown('## Cours\n\nTexte.\n\n## L’essentiel\n\n- un\n- deux\n\n## À compléter\n\n- trois')
    expect(html).toContain('<section class="fiche-callout fiche-essentiel"><h2')
    expect(html).toContain('<section class="fiche-callout fiche-todo"><h2')
    expect((html.match(/<section/g) ?? []).length).toBe(2)
    expect(html.indexOf('<section')).toBeGreaterThan(html.indexOf('Texte.'))
  })
})
