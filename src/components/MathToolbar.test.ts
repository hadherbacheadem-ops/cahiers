import { describe, expect, it } from 'vitest'
import { formulaAtCaret } from './MathToolbar'

describe('formulaAtCaret', () => {
  it('returns the formula the caret is inside of', () => {
    const v = 'Force : $F = qE$ et champ $E = k q / r^2$.'
    expect(formulaAtCaret(v, v.indexOf('qE'))).toBe('F = qE')
    expect(formulaAtCaret(v, v.indexOf('r^2'))).toBe('E = k q / r^2')
  })

  it('falls back to the last formula before the caret, then the first on the line', () => {
    const v = '$a$ texte $b$ fin'
    expect(formulaAtCaret(v, v.length)).toBe('b')
    expect(formulaAtCaret(v, 0)).toBe('a')
  })

  it('previews an unclosed formula being typed', () => {
    const v = 'On a $E = \\frac{q}{'
    expect(formulaAtCaret(v, v.length)).toBe('E = \\frac{q}{')
  })

  it('looks at the caret line only and returns null without maths', () => {
    const v = '$x$\nligne sans formule'
    expect(formulaAtCaret(v, v.length)).toBeNull()
    expect(formulaAtCaret('rien', 2)).toBeNull()
  })

  it('handles display formulas', () => {
    const v = 'Loi : $$\\oint E \\cdot dS = Q/\\varepsilon_0$$'
    expect(formulaAtCaret(v, v.length)).toBe('\\oint E \\cdot dS = Q/\\varepsilon_0')
  })
})
