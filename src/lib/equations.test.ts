import { describe, expect, it } from 'vitest'
import { GENERIC_EQUATIONS, pickWeighted } from './equations'
import { MAX_LENGTH } from './latexToUnicode'

describe('generic equations', () => {
  it('has about eighty short Unicode equations, none with LaTeX left over', () => {
    expect(GENERIC_EQUATIONS.length).toBeGreaterThanOrEqual(75)
    for (const e of GENERIC_EQUATIONS) {
      expect(e.text.length).toBeLessThanOrEqual(MAX_LENGTH)
      expect(e.text).not.toMatch(/[\\{}]/)
      expect(e.weight).toBeGreaterThan(0)
    }
  })

  it('picks by weight: the heaviest come back more often', () => {
    const list = [
      { text: 'rare', weight: 1 },
      { text: 'common', weight: 9 },
    ]
    let common = 0
    for (let i = 0; i < 100; i++) if (pickWeighted(list, i / 100) === 'common') common++
    expect(common).toBe(90)
    expect(pickWeighted(list, 0.999)).toBe('common')
    expect(pickWeighted(list, 0)).toBe('rare')
  })
})
