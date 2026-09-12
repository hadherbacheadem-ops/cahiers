import { describe, expect, it } from 'vitest'
import type { ExerciseData } from '../types'
import { anchorFound, lintBatch, lintExercise } from './lint'
import { findDuplicates, similarity } from './dedupe'

const ok: ExerciseData[] = [
  { type: 'flashcard', question: 'En électrostatique, quelle est l’unité du champ électrique ?', answer: 'Le volt par mètre (V/m).' },
  { type: 'cloze', text: 'Le théorème de Gauss relie le flux de $\\vec{E}$ à la {{charge intérieure}}.' },
  {
    type: 'mcq',
    question: 'Quelle expression donne le flux du champ électrique à travers une surface fermée ?',
    choices: ['$Q_{int}/\\varepsilon_0$', '$Q_{int}\\varepsilon_0$', '$\\varepsilon_0/Q_{int}$', '$Q_{int}/\\mu_0$'],
    correct: [0],
    explanation: 'Théorème de Gauss.',
    distractorReasons: ['', 'Produit au lieu du quotient', 'Inverse', 'Mauvaise constante'],
  },
  { type: 'truefalse', statement: 'Le flux à travers une surface fermée ne dépend que des charges intérieures.', answer: true, correctedStatement: 'Le flux à travers une surface fermée ne dépend que des charges intérieures.' },
]

describe('lintExercise on good exercises', () => {
  it('flags nothing', () => {
    for (const d of ok) expect(lintExercise(d).filter((i) => i.severity === 'warn')).toEqual([])
  })
})

describe('lintBatch catches the known defects', () => {
  const bad: ExerciseData[] = [
    // 1 answer too long
    { type: 'flashcard', question: 'Que dit le théorème de Gauss ?', answer: 'Le flux du champ électrique à travers une surface fermée quelconque est égal à la somme des charges intérieures divisée par la permittivité du vide, ce qui permet de calculer le champ dans les situations à haute symétrie comme la sphère, le cylindre infini ou le plan infini.' },
    // 2 double question
    { type: 'flashcard', question: 'Quelle est la charge de l’électron et comment la mesure-t-on ?', answer: '−1,6·10⁻¹⁹ C' },
    // 3 enumeration
    { type: 'flashcard', question: 'Cite les trois lois de Newton.', answer: 'Inertie, PFD, action-réaction' },
    // 4 dangling pronoun
    { type: 'flashcard', question: 'Elle vaut combien dans le vide ?', answer: '3·10⁸ m/s' },
    // 5 cloze on a stopword
    { type: 'cloze', text: 'Le champ est {{de}} nature vectorielle.' },
    // 6 cloze answer visible
    { type: 'cloze', text: 'La permittivité du vide, notée epsilon zéro, vaut {{permittivité du vide}}.' },
    // 7 mcq long choice
    { type: 'mcq', question: 'Quelle est l’unité de la charge ?', choices: ['Le coulomb, unité dérivée du SI égale à un ampère-seconde', 'Le volt', 'L’ampère', 'Le tesla'], correct: [0], distractorReasons: ['', 'a', 'b', 'c'] },
    // 8 truefalse without correction
    { type: 'truefalse', statement: 'La charge se mesure en volts.', answer: false },
    // 9 unbalanced latex
    { type: 'flashcard', question: 'Valeur de $\\varepsilon_0 ?', answer: '$8,85 \\cdot 10^{-12}$ F/m' },
    // 10 duplicate of an existing exercise
    { type: 'flashcard', question: 'En électrostatique, quelle est l’unité du champ électrique ?', answer: 'Le volt par mètre (V/m)' },
    // 11-13 same position MCQs
    { type: 'mcq', question: 'Q1 ?', choices: ['bonne', 'b', 'c', 'd'], correct: [0], distractorReasons: ['', 'x', 'y', 'z'] },
    { type: 'mcq', question: 'Q2 ?', choices: ['bonne', 'b', 'c', 'd'], correct: [0], distractorReasons: ['', 'x', 'y', 'z'] },
    { type: 'mcq', question: 'Q3 ?', choices: ['bonne', 'b', 'c', 'd'], correct: [0], distractorReasons: ['', 'x', 'y', 'z'] },
  ]

  const reports = lintBatch(bad, { existingKeys: ['En électrostatique, quelle est l’unité du champ électrique ? Le volt par mètre (V/m).'] })
  const codes = (i: number) => reports[i].issues.map((x) => x.code)

  it('flags at least 9 of the 10 seeded defects', () => {
    const expected = ['answer_too_long', 'double_question', 'enumeration', 'dangling_pronoun', 'cloze_stopword', 'cloze_visible', 'mcq_long_choice', 'truefalse_no_correction', 'latex_unbalanced', 'duplicate'] as const
    const found = expected.filter((code, i) => codes(i).includes(code))
    expect(found.length).toBeGreaterThanOrEqual(9)
    expect(found).toEqual(expected)
  })

  it('flags MCQs whose correct answer always sits at the same position', () => {
    expect(codes(10)).toContain('mcq_same_position')
    expect(codes(11)).toContain('mcq_same_position')
    expect(codes(12)).toContain('mcq_same_position')
    expect(codes(6)).toContain('mcq_same_position') // the long-choice MCQ also has index 0
  })

  it('does not flag the same-position rule with fewer than three MCQs', () => {
    const r = lintBatch([bad[10], bad[11]], { existingKeys: [] })
    expect(r.flatMap((x) => x.issues.map((i) => i.code))).not.toContain('mcq_same_position')
  })
})

describe('dedupe', () => {
  it('scores copies high and different questions low', () => {
    expect(similarity('Quelle est la charge de l’électron ?', 'Quelle est la charge de l’electron?')).toBeGreaterThan(0.9)
    expect(similarity('Quelle est la charge de l’électron ?', 'Énoncer le théorème de Gauss.')).toBeLessThan(0.4)
  })

  it('finds near-duplicates against existing texts and earlier candidates', () => {
    const hits = findDuplicates(['Définition du flux électrique', 'Definition du flux electrique !', 'Unité du champ'], ['Le potentiel électrique'])
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ index: 1, against: { kind: 'candidate', index: 0 } })
    const hits2 = findDuplicates(['le potentiel electrique'], ['Le potentiel électrique'])
    expect(hits2[0]).toMatchObject({ index: 0, against: { kind: 'existing', index: 0 } })
  })
})

describe('cloze display with formulas', async () => {
  const { blankInsideMath, clozeDisplayText } = await import('./cloze')
  it('detects a blank inside $…$ and renders a boxed gap there, ____ elsewhere', () => {
    expect(blankInsideMath('Équation : $6\\,CO_2 \\rightarrow {{C_6H_{12}O_6}}$')).toBe(true)
    expect(blankInsideMath('La {{mitochondrie}} produit $ATP$')).toBe(false)
    expect(clozeDisplayText('$a + {{b}}$ et {{c}}')).toBe('$a + \\boxed{\\,?\\,}$ et ____')
    expect(clozeDisplayText('$a + {{b}}$ et {{c|d}}', true)).toBe('$a + \\boxed{b}$ et **c**')
  })
})

describe('parseClaudeResponse accepts the new types', async () => {
  const { parseClaudeResponse } = await import('./importClaude')
  it('parses demonstration and rappel_libre, with a null pointId', () => {
    const r = parseClaudeResponse(
      JSON.stringify({
        points: [{ id: 'p1', title: 'T', nature: 'methode', anchor: 'x' }],
        exercises: [
          { pointId: 'p1', type: 'demonstration', title: 'D', statement: 'S', steps: [{ text: 'a', why: 'b' }, 'c'] },
          { pointId: null, type: 'rappel_libre', topic: 'F', checklist: [{ text: 'a', pointId: 'p1' }, 'b', { text: 'c', pointId: null }] },
        ],
      }),
    )
    expect(r.rejected).toEqual([])
    expect(r.exercises[0].data.type).toBe('demonstration')
    expect(r.exercises[0].localPointId).toBe('p1')
    expect(r.exercises[1].data.type).toBe('rappel_libre')
    expect(r.exercises[1].localPointId).toBeUndefined()
    if (r.exercises[1].data.type === 'rappel_libre') expect(r.exercises[1].data.checklist.map((c) => c.pointId)).toEqual(['p1', undefined, undefined])
  })
})

describe('anchorFound', () => {
  const fiche = '## Théorème de Gauss\nLe flux du champ électrique à travers une surface fermée vaut $Q_{int}/\\varepsilon_0$.\n- La permittivité du vide vaut 8,85·10⁻¹² F/m.'
  it('matches quotes regardless of case, accents and punctuation', () => {
    expect(anchorFound('la permittivite du vide vaut 8,85·10⁻¹² F/m', fiche)).toBe(true)
    expect(anchorFound('Le flux du champ électrique à travers une surface fermée', fiche)).toBe(true)
  })
  it('rejects quotes that are not in the fiche', () => {
    expect(anchorFound('La loi de Coulomb est en 1/r²', fiche)).toBe(false)
    expect(anchorFound('', fiche)).toBe(false)
  })
})
