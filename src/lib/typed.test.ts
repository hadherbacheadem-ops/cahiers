import { describe, expect, it } from 'vitest'
import { canonicalMath, charDiff, isFormula, normalizeLatex, typedMatch, wordDiff } from './typed'

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

  it('classes formulas wrapped in prose as formulas, and prose as text (Revue 2)', () => {
    expect(isFormula('F = ma (deuxième loi de Newton)')).toBe(true)
    expect(isFormula('E_c = ½mv² (énergie cinétique)')).toBe(true)
    expect(isFormula('div E = rho/epsilon0')).toBe(true)
    expect(isFormula("Le champ est nul à l'intérieur d'un conducteur à l'équilibre")).toBe(false)
    // Greek letters, digit glued to a letter, unit quotient.
    expect(isFormula('λ (longueur d’onde)')).toBe(true)
    expect(isFormula('2x')).toBe(true)
    expect(isFormula('vitesse en m/s')).toBe(true)
  })

  it('never suggests Bien on a near-miss once the answer is treated as a formula', () => {
    expect(typedMatch('F = -ma (deuxième loi de Newton)', ['F = ma (deuxième loi de Newton)']).suggestion).toBeNull()
    // A prose answer tested as a formula / theorem point compares as a formula too.
    const prose = typedMatch('le champ est nul dans un conducteur', ['Le champ est nul dans un conducteur à l’équilibre'], { forceFormula: true })
    expect(prose.formula).toBe(true)
    expect(prose.suggestion).toBeNull()
    expect(typedMatch('le champ est nul dans un conducteur', ['Le champ est nul dans un conducteur à l’équilibre']).formula).toBe(false)
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
    expect(long.score).toBeGreaterThan(0.8)
    expect(long.suggestion).toBeNull()
    expect(sign.charDiff?.some((p) => p.kind === 'added' && p.text === '-')).toBe(true)

    const exp = typedMatch('x^2', ['x^3'])
    expect(exp.suggestion).toBeNull()
    expect(exp.charDiff).toEqual([
      { kind: 'same', text: 'x^' },
      { kind: 'added', text: '2' },
      { kind: 'missing', text: '3' },
    ])
    expect(typedMatch('a/(b+c)', ['$\\frac{a}{b} + c$']).suggestion).toBeNull()
    expect(typedMatch('F = q1 q2 / (4 pi eps0 r^3)', ['$\\frac{q_1 q_2}{4\\pi\\varepsilon_0 r^2}$']).suggestion).toBeNull()
    expect(typedMatch('2\\pi r', ['$\\pi r$']).suggestion).toBeNull()
  })

  it('is exact across equivalent LaTeX spellings', () => {
    expect(typedMatch('\\frac{1}{2}mv^2', ['$\\dfrac{1}{2} m v^{2}$']).exact).toBe(true)
    expect(typedMatch('E=mc^2', ['$E = m c^{2}$']).suggestion).toBe('good')
    expect(typedMatch('Q_{int}/\\varepsilon_0', ['$\\frac{Q_{int}}{\\varepsilon_0}$']).suggestion).toBe('good')
  })

  it('accepts plain typing against stored LaTeX: Greek spelled out, indices glued, product parentheses, vectors', () => {
    const coulomb = typedMatch('F = q1 q2 / (4 pi eps0 r^2)', ['$\\vec{F} = \\frac{q_1 q_2}{4\\pi\\varepsilon_0 r^2}$'])
    expect(coulomb.exact).toBe(true)
    expect(coulomb.equivalent).toBe(true)
    expect(coulomb.suggestion).toBe('good')
    expect(typedMatch('E = 1/2 C U^2', ['$E = \\frac{1}{2} C U^2$']).suggestion).toBe('good')
    expect(typedMatch('v = d/t', ['$v = \\dfrac{d}{t}$']).suggestion).toBe('good')
    expect(typedMatch('omega = 2 pi f', ['$\\omega = 2\\pi f$']).suggestion).toBe('good')
    expect(typedMatch('ε0 = 8,85·10^-12 F/m', ['$\\varepsilon_0 = 8{,}85 \\cdot 10^{-12}\\ \\mathrm{F/m}$']).suggestion).toBe('good')
    expect(typedMatch('U = Z * I', ['$\\underline{U} = \\underline{Z}\\,\\underline{I}$']).suggestion).toBe('good')
    expect(typedMatch('$E = mc^2$', ['$E = mc^2$']).equivalent).toBeUndefined()
  })

  it('folds Greek letters to their keyboard spelling, exp to e^, and accepts the right-hand side alone', () => {
    // The user's case: the blank held the whole equality, the answer was typed as U0 e^j(wt+phi).
    expect(typedMatch('U0e^j(wt+phi)', ['$\\underline{u}(t) = U_0 \\exp(j(\\omega t + \\varphi))$']).exact).toBe(true)
    expect(typedMatch('u(t) = U0 exp(j(ωt+φ))', ['$\\underline{u}(t) = U_0 \\exp(j(\\omega t + \\varphi))$']).exact).toBe(true)
    expect(typedMatch('w0 = 1/sqrt(LC)', ['$\\omega_0 = \\dfrac{1}{\\sqrt{LC}}$']).exact).toBe(true)
    expect(typedMatch('lambda = c/f', ['$\\lambda = \\dfrac{c}{f}$']).exact).toBe(true)
    // One side alone works only when the typed answer has no « = » itself, and never on the wrong side content.
    expect(typedMatch('U0e^j(wt-phi)', ['$\\underline{u}(t) = U_0 \\exp(j(\\omega t + \\varphi))$']).exact).toBe(false)
    expect(typedMatch('x = 2', ['$y = 2$']).exact).toBe(false)
  })

  it('canonicalMath keeps what matters and drops what is only writing', () => {
    expect(canonicalMath('$\\frac{q_1 q_2}{4\\pi\\varepsilon_0 r^2}$')).toBe('q1q2/4pieps0r^2')
    expect(canonicalMath('F = q1 q2 / (4 pi eps0 r^2)')).toBe('f=q1q2/4pieps0r^2')
    expect(canonicalMath('a/(b+c)')).toBe('a/(b+c)')
    expect(canonicalMath('x²')).toBe('x^2')
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
