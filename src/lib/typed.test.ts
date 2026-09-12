import { describe, expect, it } from 'vitest'
import { normalizeLatex, typedMatch, wordDiff } from './typed'

describe('normalizeLatex', () => {
  it('ignores delimiters, sizing, spacing and single-token braces', () => {
    expect(normalizeLatex('$\\left( x^{2} + 1 \\right)$')).toBe('(x^2+1)')
    expect(normalizeLatex('E = m c^2')).toBe('e=mc^2')
    expect(normalizeLatex('\\frac{1}{2}\\,\\mathrm{m\\cdot s^{-1}}')).toBe('(1)/(2)m*s^{-1}')
  })
})

describe('typedMatch', () => {
  it('accepts prose variants regardless of case, accents and punctuation', () => {
    expect(typedMatch('le chloroplaste', ['Le chloroplaste.']).exact).toBe(true)
    expect(typedMatch('Chloroplaste', ['le chloroplaste', 'chloroplaste']).exact).toBe(true)
    expect(typedMatch('la mitochondrie', ['le chloroplaste']).score).toBeLessThan(0.5)
  })

  it('compares formulas on normalised LaTeX', () => {
    expect(typedMatch('E=mc^2', ['$E = m c^{2}$']).exact).toBe(true)
    expect(typedMatch('$\\frac{Q}{\\varepsilon_0}$', ['Q/ε0']).exact).toBe(false)
    expect(typedMatch('Q_{int}/\\varepsilon_0', ['$\\frac{Q_{int}}{\\varepsilon_0}$']).score).toBeGreaterThan(0.5)
  })

  it('returns the best stored answer', () => {
    const m = typedMatch('atp', ['adénosine triphosphate', 'ATP'])
    expect(m.exact).toBe(true)
    expect(m.best).toBe('ATP')
  })
})

describe('wordDiff', () => {
  it('marks missing and added words', () => {
    const d = wordDiff('le flux est nul', 'le flux total est nul')
    expect(d).toEqual([
      { kind: 'same', text: 'le' },
      { kind: 'same', text: 'flux' },
      { kind: 'missing', text: 'total' },
      { kind: 'same', text: 'est' },
      { kind: 'same', text: 'nul' },
    ])
    expect(wordDiff('a b x', 'a b').filter((p) => p.kind === 'added')).toEqual([{ kind: 'added', text: 'x' }])
  })
})
