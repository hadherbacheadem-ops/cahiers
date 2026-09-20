import { describe, expect, it } from 'vitest'
import { normalizeReactionType, offeredTypes, reactionLabel } from './reactionTypes'
import { parseMechanismSteps, stepsToText } from './mechanism'
import { parseClaudeResponse } from './importClaude'
import { buildPrompt } from './prompt'
import { exerciseAnswerText, exercisePromptText } from './session'
import type { Exercise } from '../types'

describe('reaction types', () => {
  it('reads the usual spellings', () => {
    expect(normalizeReactionType('SN2')).toBe('SN2')
    expect(normalizeReactionType(' sn1 ')).toBe('SN1')
    expect(normalizeReactionType('AN')).toBe('AdN')
    expect(normalizeReactionType('ADN')).toBe('AdN')
    expect(normalizeReactionType('addition nucléophile')).toBe('AdN')
    expect(normalizeReactionType('Addition-élimination')).toBe('AdN-E')
    expect(normalizeReactionType('acido-basique')).toBe('acide-base')
    expect(normalizeReactionType('Acide/base')).toBe('acide-base')
    expect(normalizeReactionType('oxydo-réduction')).toBe('redox')
    expect(normalizeReactionType('Substitution électrophile aromatique')).toBe('SEAr')
    expect(normalizeReactionType('Diels-Alder')).toBe('pericyclique')
  })

  it('refuses what it does not know', () => {
    expect(normalizeReactionType('')).toBeNull()
    expect(normalizeReactionType('wittig')).toBeNull()
  })

  it('offers the answers plus the common types, in the list order', () => {
    const ids = offeredTypes(['SEAr', 'redox']).map((t) => t.id)
    expect(ids).toContain('SEAr')
    expect(ids).toContain('SN2')
    expect(ids).not.toContain('complexation')
    expect(ids.indexOf('SN1')).toBeLessThan(ids.indexOf('redox'))
  })
})

describe('mechanism steps as text', () => {
  const steps = [
    { text: 'Le doublet du nucléophile attaque le carbone.', reactants: ['CCBr', '[OH-]'], products: ['CCO', '[Br-]'], conditions: 'éthanol, 50 °C', answer: 'SN2', explanation: 'Concerté, inversion.' },
    { text: 'Protonation.', reactants: ['CCO', '[H+]'], products: ['CC[OH2+]'], answer: 'acide-base', alsoAccept: ['AdE'] },
  ]

  it('round-trips', () => {
    const back = parseMechanismSteps(stepsToText(steps))
    expect(back.unknownTypes).toEqual([])
    expect(back.steps).toEqual(steps)
  })

  it('reports an unknown type with its step number, and a missing type', () => {
    const r = parseMechanismSteps('Étape un.\ntype : wittig\n\nÉtape deux.\nréactifs : CCO')
    expect(r.unknownTypes).toEqual([{ step: 1, value: 'wittig' }])
    expect(r.steps[1].answer).toBe('')
    expect(r.steps[1].reactants).toEqual(['CCO'])
  })

  it('keeps a colon that belongs to the sentence', () => {
    const r = parseMechanismSteps('Attention : le doublet attaque.\ntype : SN2')
    expect(r.steps[0].text).toBe('Attention : le doublet attaque.')
  })
})

const json = (o: unknown) => '```json\n' + JSON.stringify(o) + '\n```'
const mecanisme = (over: Record<string, unknown> = {}) => ({
  pointId: 'p1',
  type: 'mecanisme',
  title: 'Hydrolyse du 2-bromo-2-méthylpropane',
  statement: 'Donne le type de chaque étape.',
  steps: [
    { text: 'Le bromure part.', reactants: ['CC(C)(C)Br'], products: ['C[C+](C)C', '[Br-]'], answer: 'SN1', explanation: 'Étape lente.' },
    { text: 'L’eau attaque le carbocation.', reactants: ['C[C+](C)C', 'O'], products: ['CC(C)(C)[OH2+]'], answer: 'ADN' },
    { text: 'Perte d’un proton.', answer: 'Acide-base', alsoAccept: ['E1', 'nope'] },
  ],
  ...over,
})

describe('mecanisme import', () => {
  it('validates, and folds the answers to the vocabulary', () => {
    const r = parseClaudeResponse(json({ points: [{ id: 'p1', title: 'SN1', nature: 'methode', anchor: 'SN1' }], exercises: [mecanisme()] }))
    expect(r.rejected).toEqual([])
    const d = r.exercises[0].data
    expect(d.type).toBe('mecanisme')
    if (d.type !== 'mecanisme') return
    expect(d.steps.map((s) => s.answer)).toEqual(['SN1', 'AdN', 'acide-base'])
    expect(d.steps[2].alsoAccept).toEqual(['E1'])
    expect(d.steps[0].reactants).toEqual(['CC(C)(C)Br'])
    expect(d.steps[2].reactants).toBeUndefined()
  })

  it('rejects an unknown type of reaction and a single-step mechanism', () => {
    const bad = mecanisme({ steps: [{ text: 'Une étape.', answer: 'wittig' }, { text: 'Deux.', answer: 'SN2' }] })
    const one = mecanisme({ steps: [{ text: 'Seule étape.', answer: 'SN2' }] })
    const r = parseClaudeResponse(json({ points: [], exercises: [bad, one, mecanisme()] }))
    expect(r.exercises).toHaveLength(1)
    expect(r.rejected).toHaveLength(2)
    expect(r.rejected[0].reason).toMatch(/type de réaction inconnu|Invalid|invalid/i)
  })

  it('has its line in the exercise prompt only when the type is allowed', () => {
    const base = { cahierName: 'Chimie', title: 'Substitutions', content: 'Le cours.' }
    expect(buildPrompt({ ...base, types: ['flashcard'] })).not.toContain('"mecanisme" (chimie')
    const p = buildPrompt({ ...base, types: ['flashcard', 'mecanisme'] })
    expect(p).toContain('"mecanisme" (chimie')
    expect(p).toContain('"AdN-E"')
    expect(p).toContain('SMILES')
  })

  it('reads in the results screen', () => {
    const r = parseClaudeResponse(json({ points: [], exercises: [mecanisme()] }))
    const ex = { id: 'x', type: 'mecanisme', data: r.exercises[0].data } as unknown as Exercise
    expect(exercisePromptText(ex)).toContain('Hydrolyse')
    expect(exerciseAnswerText(ex)).toBe(`1. ${reactionLabel('SN1')} · 2. AdN · 3. Acido-basique`)
  })
})
