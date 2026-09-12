import { describe, expect, it } from 'vitest'
import { CORRECTION_GRADES, trueFalseOutcome } from './truefalse'

describe('trueFalseOutcome', () => {
  const expected = 'Le cycle de Calvin a lieu dans le stroma.'

  it('a wrong verdict is Encore and not negotiable', () => {
    const o = trueFalseOutcome(true, false, '', expected)
    expect(o).toMatchObject({ correct: false, suggested: 'again', open: false })
  })

  it('a paraphrased but right correction is only *suggested* Difficile: Bien stays available', () => {
    const o = trueFalseOutcome(false, false, 'Calvin : dans la partie liquide du chloroplaste, pas dans les thylakoïdes', expected)
    expect(o.correct).toBe(true)
    expect(o.open).toBe(true)
    expect(o.suggested).toBe('hard')
    expect(CORRECTION_GRADES).toContain('good')
  })

  it('a close correction is suggested Bien', () => {
    const o = trueFalseOutcome(false, false, 'Le cycle de Calvin se déroule dans le stroma.', expected)
    expect(o.suggested).toBe('good')
    expect(o.open).toBe(true)
  })

  it('a right "Vrai" needs no correction: Bien, no choice offered', () => {
    expect(trueFalseOutcome(true, true, '', undefined)).toMatchObject({ correct: true, suggested: 'good', open: false })
  })
})
