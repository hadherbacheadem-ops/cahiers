import { describe, expect, it } from 'vitest'
import { blankInsideMath, clozeDisplayText, clozeToPlain, countBlanks, parseCloze, matchesAnswer, editDistance } from './cloze'

function answersOf(text: string): string[][] {
  return parseCloze(text).flatMap((s) => (s.kind === 'blank' ? [s.answers] : []))
}

describe('cloze blanks with LaTeX inside', () => {
  it('accepts braces inside a blank ({{$\\dfrac{1}{2}mv^2$}})', () => {
    const t = 'Énergie cinétique : {{$E_c = \\dfrac{1}{2} m v^{2}$}}.'
    expect(countBlanks(t)).toBe(1)
    expect(answersOf(t)).toEqual([['$E_c = \\dfrac{1}{2} m v^{2}$']])
    expect(clozeToPlain(t)).toBe('Énergie cinétique : $E_c = \\dfrac{1}{2} m v^{2}$.')
    expect(clozeDisplayText(t)).toBe('Énergie cinétique : ____.')
    expect(blankInsideMath(t)).toBe(false)
  })

  it('handles deeper nesting and several blanks', () => {
    const t = 'A {{$e^{x^{2}}$}} puis {{b|c}} fin'
    expect(answersOf(t)).toEqual([['$e^{x^{2}}$'], ['b', 'c']])
    expect(clozeToPlain(t)).toBe('A $e^{x^{2}}$ puis b fin')
  })

  it('keeps an escaped pipe (norm \\|) inside the answer', () => {
    const t = 'Cauchy-Schwarz : $|u\\cdot v| \\leq {{\\|u\\|\\,\\|v\\|}}$'
    expect(answersOf(t)).toEqual([['\\|u\\|\\,\\|v\\|']])
    expect(blankInsideMath(t)).toBe(true)
  })

  it('ignores an unbalanced or empty blank', () => {
    expect(countBlanks('{{}} et {{a} b}}')).toBe(0)
    expect(countBlanks('pas de trou')).toBe(0)
  })
})

describe('matchesAnswer (smart comparison)', () => {
  it('formula blanks compare on canonical maths: spacing, products, LaTeX spelling', () => {
    expect(matchesAnswer('q(t)=Cu(t)', ['$q(t) = C u(t)$'])).toBe(true)
    expect(matchesAnswer('q(t) = C·u(t)', ['$q(t) = C\\,u(t)$'])).toBe(true)
    expect(matchesAnswer('E = 1/2 C U^2', ['$E = \\frac{1}{2} C U^2$'])).toBe(true)
    expect(matchesAnswer('omega0 = 1/sqrt(LC)', ['$\\omega_0 = \\dfrac{1}{\\sqrt{LC}}$'])).toBe(true)
    // A sign, a factor or an exponent still matters.
    expect(matchesAnswer('q(t)=C/u(t)', ['$q(t) = C u(t)$'])).toBe(false)
    expect(matchesAnswer('E = C U^2', ['$E = \\frac{1}{2} C U^2$'])).toBe(false)
    expect(matchesAnswer('x^3', ['$x^2$'])).toBe(false)
  })

  it('text blanks forgive case, accents, a leading article and a typo from five letters', () => {
    expect(matchesAnswer('Mitochondrie', ['mitochondrie'])).toBe(true)
    expect(matchesAnswer('la mitochondrie', ['mitochondrie'])).toBe(true)
    expect(matchesAnswer('mitocondrie', ['mitochondrie'])).toBe(true) // one typo, 12 letters
    expect(matchesAnswer('mitocondri', ['mitochondrie'])).toBe(true) // two typos, ≥ 10 letters
    expect(matchesAnswer('photosynthese', ['photosynthèse'])).toBe(true)
    expect(matchesAnswer('ribosome', ['mitochondrie'])).toBe(false)
    // Short words stay strict: ADN is not ARN.
    expect(matchesAnswer('ARN', ['ADN'])).toBe(false)
    expect(matchesAnswer('1789', ['1798'])).toBe(false)
    expect(matchesAnswer('', ['mitochondrie'])).toBe(false)
  })

  it('editDistance counts transpositions as one', () => {
    expect(editDistance('chat', 'chta')).toBe(1)
    expect(editDistance('abc', 'abc')).toBe(0)
    expect(editDistance('abc', 'xyz')).toBe(3)
  })
})
