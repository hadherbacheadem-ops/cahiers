import { describe, expect, it } from 'vitest'
import type { Exercise, ExerciseType } from '../types'
import { newCard } from './fsrs'
import { hasAdjacentSiblings, interleave, isLeechAfter, nextFading, recallGrade, siblingsAhead } from './interleave'

const T0 = 1_700_000_000_000

function ex(id: string, chapitreId: string, pointId: string | null, type: ExerciseType = 'flashcard', cahierId = 'c', state: 0 | 1 | 2 | 3 = 2, due = T0): Exercise {
  return {
    id,
    cahierId,
    chapitreId,
    pointId,
    type,
    data: { type: 'flashcard', question: id, answer: 'a' },
    difficulty: 1,
    tags: [],
    status: 'active',
    origin: 'claude',
    fsrs: { ...newCard(T0), state, due },
    createdAt: T0,
    updatedAt: T0,
  }
}

describe('interleave', () => {
  it('never places two siblings back to back when an alternative exists (two fiches, mixed session)', () => {
    const queue = [
      ex('a1', 'A', 'pA1'),
      ex('a2', 'A', 'pA1', 'cloze'),
      ex('a3', 'A', 'pA1', 'mcq'),
      ex('a4', 'A', 'pA2'),
      ex('b1', 'B', 'pB1'),
      ex('b2', 'B', 'pB1', 'cloze'),
      ex('b3', 'B', 'pB2'),
    ]
    expect(hasAdjacentSiblings(queue)).toBe(true)
    const out = interleave(queue)
    expect(out).toHaveLength(queue.length)
    expect(new Set(out.map((e) => e.id)).size).toBe(queue.length)
    expect(hasAdjacentSiblings(out)).toBe(false)
    // Fiches alternate whenever possible.
    expect(out[0].chapitreId).not.toBe(out[1].chapitreId)
  })

  it('keeps learning cards first and keeps lexical cahiers blocked by fiche', () => {
    const queue = [
      ex('r1', 'A', 'p1', 'flashcard', 'sciences', 2),
      ex('l1', 'A', 'p9', 'flashcard', 'sciences', 1),
      ex('v1', 'V1', 'w1', 'flashcard', 'anglais', 2, T0 + 2),
      ex('v2', 'V2', 'w2', 'flashcard', 'anglais', 2, T0 + 1),
      ex('v3', 'V1', 'w3', 'flashcard', 'anglais', 2, T0),
    ]
    const out = interleave(queue, { lexicalCahiers: new Set(['anglais']) })
    expect(out[0].id).toBe('l1')
    const tail = out.slice(-3).map((e) => e.id)
    expect(tail).toEqual(['v3', 'v1', 'v2']) // fiche V1 (due order), then fiche V2
  })

  it('spreads a heavy point whatever the input order (no "a, a" tail)', () => {
    const items = [ex('b', 'A', 'pB'), ex('c1', 'B', 'pC'), ex('c2', 'B', 'pC'), ex('d', 'B', 'pD'), ex('a1', 'A', 'pA'), ex('a2', 'A', 'pA'), ex('a3', 'A', 'pA')]
    // Every rotation of the input must come out sibling-free.
    for (let r = 0; r < items.length; r++) {
      const rotated = [...items.slice(r), ...items.slice(0, r)]
      expect(hasAdjacentSiblings(interleave(rotated))).toBe(false)
    }
  })

  it('falls back on adjacency only when every remaining exercise is a sibling', () => {
    const out = interleave([ex('a', 'A', 'p'), ex('b', 'A', 'p'), ex('c', 'A', 'p')])
    expect(out.map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('siblingsAhead', () => {
  it('lists the later exercises of the same point', () => {
    const queue = [ex('a', 'A', 'p'), ex('b', 'A', 'q'), ex('c', 'A', 'p'), ex('d', 'A', 'p')]
    expect(siblingsAhead(queue, 1, queue[0]).map((e) => e.id)).toEqual(['c', 'd'])
    expect(siblingsAhead(queue, 1, ex('z', 'A', null))).toEqual([])
  })
})

describe('leech and fading', () => {
  it('flags a leech at the threshold, on a failure only', () => {
    expect(isLeechAfter(8, 1, 8)).toBe(true)
    expect(isLeechAfter(7, 1, 8)).toBe(false)
    expect(isLeechAfter(9, 3, 8)).toBe(false)
  })

  it('raises the fading level after two successes and lowers it on Encore', () => {
    let f = nextFading(undefined, 'good')
    expect(f).toEqual({ level: 1, streak: 1 })
    f = nextFading(f, 'easy')
    expect(f).toEqual({ level: 2, streak: 0 })
    f = nextFading(f, 'hard')
    expect(f).toEqual({ level: 2, streak: 0 })
    f = nextFading(f, 'good')
    f = nextFading(f, 'good')
    expect(f.level).toBe(3)
    f = nextFading(f, 'good')
    f = nextFading(f, 'good')
    expect(f.level).toBe(3)
    f = nextFading(f, 'again')
    expect(f).toEqual({ level: 2, streak: 0 })
  })

  it('maps free-recall scores onto ratings', () => {
    expect(recallGrade(2, 10, false)).toBe('again')
    expect(recallGrade(6, 10, false)).toBe('hard')
    expect(recallGrade(9, 10, true)).toBe('good')
    expect(recallGrade(10, 10, false)).toBe('good')
    expect(recallGrade(10, 10, true)).toBe('easy')
  })
})
