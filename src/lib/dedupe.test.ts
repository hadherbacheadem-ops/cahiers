import { describe, expect, it } from 'vitest'
import type { Exercise } from '../types'
import { newCard } from './fsrs'
import { findFlashcardDuplicates } from './dedupe'

const T0 = 1_700_000_000_000

function card(id: string, question: string, answer: string, o: Partial<Exercise> & { typed?: boolean; reps?: number } = {}): Exercise {
  const { typed, reps, ...rest } = o
  const fsrs = { ...newCard(T0), reps: reps ?? 0 }
  return {
    id,
    chapitreId: 'ch',
    cahierId: 'c',
    pointId: null,
    type: 'flashcard',
    data: { type: 'flashcard', question, answer, ...(typed ? { typed: true } : {}) },
    difficulty: 1,
    tags: [],
    status: 'active',
    origin: 'claude',
    fsrs,
    createdAt: T0,
    updatedAt: T0,
    ...rest,
  }
}

describe('findFlashcardDuplicates', () => {
  it('pairs a typed card with its flip twin and keeps the flip one', () => {
    const typed = card('t', 'Formule de la loi de Coulomb ?', '$F = q_1 q_2 / (4\\pi\\varepsilon_0 r^2)$', { typed: true, status: 'pending' })
    const flip = card('f', 'Formule de la loi de Coulomb ?', '$F = q_1 q_2 / (4\\pi\\varepsilon_0 r^2)$', { status: 'pending' })
    const pairs = findFlashcardDuplicates([typed, flip])
    expect(pairs).toHaveLength(1)
    expect(pairs[0].survivor.id).toBe('f')
    expect(pairs[0].removed.id).toBe('t')
  })

  it('keeps the card that has a review history even if it is the typed one', () => {
    const typed = card('t', 'Unité du champ électrique ?', 'V/m', { typed: true, reps: 4 })
    const flip = card('f', 'Unité du champ électrique ?', 'V/m', { status: 'pending' })
    const [p] = findFlashcardDuplicates([flip, typed])
    expect(p.survivor.id).toBe('t')
    expect(p.removed.id).toBe('f')
  })

  it('tolerates small wording differences but not different questions or answers', () => {
    const a = card('a', 'Quelle est l’unité du champ électrique ?', 'Le volt par mètre (V/m)')
    const b = card('b', 'Quelle est l’unité du champ électrique', 'volt par mètre, V/m')
    const c = card('c', 'Quelle est l’unité du potentiel électrique ?', 'Le volt (V)')
    const d = card('d', 'Quelle est l’unité du champ électrique ?', 'Le newton par coulomb')
    expect(findFlashcardDuplicates([a, b, c]).map((p) => [p.survivor.id, p.removed.id])).toEqual([['a', 'b']])
    expect(findFlashcardDuplicates([a, d])).toEqual([])
  })

  it('prefers active over pending, then the older card; ignores suspended cards and other types', () => {
    const active = card('act', 'Définition d’un dipôle ?', 'Deux bornes', { status: 'active', createdAt: T0 + 5 })
    const pending = card('pen', 'Définition d’un dipôle ?', 'Deux bornes', { status: 'pending', createdAt: T0 })
    expect(findFlashcardDuplicates([pending, active])[0].survivor.id).toBe('act')
    const older = card('old', 'Définition d’un dipôle ?', 'Deux bornes', { createdAt: T0 })
    const newer = card('new', 'Définition d’un dipôle ?', 'Deux bornes', { createdAt: T0 + 1 })
    expect(findFlashcardDuplicates([newer, older])[0].survivor.id).toBe('old')
    const suspended = card('sus', 'Définition d’un dipôle ?', 'Deux bornes', { status: 'suspended' })
    expect(findFlashcardDuplicates([older, suspended])).toEqual([])
  })
})
