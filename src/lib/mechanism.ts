import type { MechanismStep } from '../types'
import { normalizeReactionType, reactionLabel } from './reactionTypes'

// Text form of a mechanism's steps, for the edit form: one block per step, blank line between blocks.
//
//   Le doublet de HO⁻ attaque le carbone.
//   réactifs : CCBr + [OH-]
//   produits : CCO + [Br-]
//   conditions : éthanol, 50 °C
//   type : SN2
//   explication : concerté, inversion de configuration

const KEYS = { reactifs: 'reactants', produits: 'products', conditions: 'conditions', type: 'answer', autres: 'alsoAccept', explication: 'explanation' } as const

function foldKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')
}

const splitSpecies = (s: string): string[] =>
  s
    .split(/\s+\+\s+|\s*;\s*/)
    .map((x) => x.trim())
    .filter(Boolean)

export function stepsToText(steps: MechanismStep[]): string {
  return steps
    .map((s) =>
      [
        s.text,
        s.reactants?.length ? `réactifs : ${s.reactants.join(' + ')}` : '',
        s.products?.length ? `produits : ${s.products.join(' + ')}` : '',
        s.conditions ? `conditions : ${s.conditions}` : '',
        `type : ${reactionLabel(s.answer)}`,
        s.alsoAccept?.length ? `autres : ${s.alsoAccept.map(reactionLabel).join(', ')}` : '',
        s.explanation ? `explication : ${s.explanation}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')
}

export interface ParsedMechanismSteps {
  steps: MechanismStep[]
  /** Types that are not in the vocabulary, per step (1-based), so the form can say which line is wrong. */
  unknownTypes: { step: number; value: string }[]
}

export function parseMechanismSteps(text: string): ParsedMechanismSteps {
  const steps: MechanismStep[] = []
  const unknownTypes: ParsedMechanismSteps['unknownTypes'] = []
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  blocks.forEach((block, index) => {
    const words: string[] = []
    const step: MechanismStep = { text: '', answer: '' }
    for (const line of block.split('\n')) {
      const m = /^\s*([^:]{2,14}?)\s*:\s*(.*)$/.exec(line)
      const key = m ? KEYS[foldKey(m[1]) as keyof typeof KEYS] : undefined
      if (!m || !key) {
        words.push(line.trim())
        continue
      }
      const value = m[2].trim()
      if (key === 'reactants' || key === 'products') step[key] = splitSpecies(value)
      else if (key === 'answer') {
        const id = normalizeReactionType(value)
        if (id) step.answer = id
        else unknownTypes.push({ step: index + 1, value })
      } else if (key === 'alsoAccept') {
        const ids = value.split(/[,;]/).map((v) => normalizeReactionType(v)).filter((v): v is string => !!v)
        if (ids.length) step.alsoAccept = ids
      } else if (value) step[key] = value
    }
    step.text = words.filter(Boolean).join(' ')
    steps.push(step)
  })
  return { steps, unknownTypes }
}
