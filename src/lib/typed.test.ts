import { describe, expect, it } from 'vitest'
import { charDiff, isFormula, normalizeLatex, typedMatch, wordDiff } from './typed'

describe('normalizeLatex', () => {
  it('ignores delimiters, sizing, spacing and single-token braces', () => {
    expect(normalizeLatex('$\\left( x^{2} + 1 \\right)$')).toBe('(x^2+1)')
    expect(normalizeLatex('E = m c^2')).toBe('e=mc^2')
    expect(normalizeLatex('\\frac{1}{2}\\,\\mathrm{m\\cdot s^{-1}}')).toBe('(1)/(2)m\\cdots^{-1}')
    expect(normalizeLatex('\\displaystyle \\dfrac{1}{2} m v^{2}')).toBe(normalizeLatex('\\frac{1}{2}mv^2'))
    expect(normalizeLatex('a \\times b')).toBe(normalizeLatex('a \\cdot b'))
    expect(normalizeLatex('\\frac{1}{2}')).not.toBe(normalizeLatex('\\frac{2}{1}')) // order is never normalised
  })
})

describe('isFormula', () => {
  it('recognises formulas by delimiters, commands or symbol density', () => {
    expect(isFormula('$E = mc^2$')).toBe(true)
    expect(isFormula('\\frac{1}{2}mv^2')).toBe(true)
    expect(isFormula('E = mc^2')).toBe(true)
    expect(isFormula('9,81 m/s²')).toBe(true)
    expect(isFormula('Le chloroplaste')).toBe(false)
    expect(isFormula('Une force est une action mécanique')).toBe(false)
  })
})

describe('typedMatch on text', () => {
  it('accepts prose variants regardless of case, accents and punctuation', () => {
    expect(typedMatch('le chloroplaste', ['Le chloroplaste.']).exact).toBe(true)
    expect(typedMatch('Chloroplaste', ['le chloroplaste', 'chloroplaste']).exact).toBe(true)
    expect(typedMatch('la mitochondrie', ['le chloroplaste']).score).toBeLessThan(0.5)
  })

  it('suggests Bien above 0.85, nothing between 0.6 and 0.85, Encore below 0.6', () => {
    expect(typedMatch('le chloroplaste', ['Le chloroplaste']).suggestion).toBe('good')
    expect(typedMatch('production de matiere organique par les vegetaux', ['production de matière organique par les végétaux']).suggestion).toBe('good')
    expect(typedMatch('production de matière organique par les plantes', ['production de matière organique par les végétaux']).suggestion).toBeNull()
    expect(typedMatch('la mitochondrie', ['le chloroplaste']).suggestion).toBe('again')
  })

  it('returns the best stored answer', () => {
    const m = typedMatch('atp', ['adénosine triphosphate', 'ATP'])
    expect(m.exact).toBe(true)
    expect(m.best).toBe('ATP')
  })
})

describe('typedMatch on formulas', () => {
  it('never suggests Bien on a sign, exponent or factor error, and shows a character diff', () => {
    const sign = typedMatch('E = -mc^2', ['$E = mc^2$'])
    expect(sign.formula).toBe(true)
    expect(sign.exact).toBe(false)
    expect(sign.suggestion).toBeNull()
    // A longer formula with one sign flipped scores above the text threshold: similarity must not decide.
    const long = typedMatch('\\frac{1}{2}mv^2 - mgh + \\frac{1}{2}I\\omega^2 = E', ['$\\frac{1}{2}mv^2 + mgh + \\frac{1}{2}I\\omega^2 = E$'])
    expect(long.score).toBeGreaterThan(0.85)
    expect(long.suggestion).toBeNull()
    expect(sign.charDiff?.some((p) => p.kind === 'added' && p.text === '-')).toBe(true)

    const exp = typedMatch('x^2', ['x^3'])
    expect(exp.suggestion).toBeNull()
    expect(exp.charDiff).toEqual([
      { kind: 'same', text: 'x^' },
      { kind: 'added', text: '2' },
      { kind: 'missing', text: '3' },
    ])
    expect(typedMatch('2\\pi r', ['$\\pi r$']).suggestion).toBeNull()
  })

  it('is exact across equivalent LaTeX spellings', () => {
    expect(typedMatch('\\frac{1}{2}mv^2', ['$\\dfrac{1}{2} m v^{2}$']).exact).toBe(true)
    expect(typedMatch('E=mc^2', ['$E = m c^{2}$']).suggestion).toBe('good')
    expect(typedMatch('Q_{int}/\\varepsilon_0', ['$\\frac{Q_{int}}{\\varepsilon_0}$']).suggestion).toBeNull()
  })
})

describe('diffs', () => {
  it('wordDiff marks missing and added words', () => {
    const d = wordDiff('le flux est nul', 'le flux total est nul')
    expect(d).toEqual([
      { kind: 'same', text: 'le' },
      { kind: 'same', text: 'flux' },
      { kind: 'missing', text: 'total' },
      { kind: 'same', text: 'est' },
      { kind: 'same', text: 'nul' },
    ])
  })

  it('charDiff merges runs', () => {
    expect(charDiff('abc', 'abd')).toEqual([
      { kind: 'same', text: 'ab' },
      { kind: 'added', text: 'c' },
      { kind: 'missing', text: 'd' },
    ])
  })
})
