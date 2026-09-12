import { describe, expect, it } from 'vitest'
import { blankInsideMath, clozeDisplayText, clozeToPlain, countBlanks, parseCloze } from './cloze'

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
