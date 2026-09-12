import { describe, expect, it } from 'vitest'
import type { Exercise, PointDeCours } from '../types'
import { computeCoverage, splitBlocks } from './coverage'

const fiche = `# Électrostatique

## Loi de Coulomb
La force entre deux charges ponctuelles est proportionnelle au produit des charges et inversement proportionnelle au carré de la distance.

## Théorème de Gauss
- Le flux du champ électrique à travers une surface fermée vaut $Q_{int}/\\varepsilon_0$.
- La permittivité du vide vaut 8,85·10⁻¹² F/m.

Définition :
Le potentiel électrique est l'énergie potentielle par unité de charge.`

const point = (id: string, anchor: string): PointDeCours => ({ id, chapitreId: 'ch', cahierId: 'c', anchor, title: id, nature: 'autre', order: 0, createdAt: 0 })
const exercise = (pointId: string | null, status: Exercise['status'] = 'active') => ({ pointId, status }) as Exercise

describe('splitBlocks', () => {
  it('yields one block per paragraph or bullet, tagged with the nearest heading, skipping bare labels', () => {
    const blocks = splitBlocks(fiche)
    expect(blocks.map((b) => b.heading)).toEqual(['Loi de Coulomb', 'Théorème de Gauss', 'Théorème de Gauss', 'Théorème de Gauss'])
    expect(blocks[1].text).toMatch(/^Le flux/)
    // "Définition :" is not a blank-separated paragraph: it stays attached to its definition.
    expect(blocks[3].text).toMatch(/^Définition : Le potentiel/)
  })
})

describe('computeCoverage', () => {
  it('reports points without exercise and blocks without point', () => {
    const points = [point('gauss', 'Le flux du champ électrique à travers une surface fermée'), point('eps', 'La permittivité du vide vaut 8,85·10⁻¹² F/m.')]
    const exercises = [exercise('gauss'), exercise('eps', 'suspended'), exercise(null)]
    const cov = computeCoverage(fiche, points, exercises)
    expect(cov.pointsWithoutExercise.map((p) => p.id)).toEqual(['eps'])
    expect(cov.blocksWithoutPoint.map((b) => b.heading)).toEqual(['Loi de Coulomb', 'Théorème de Gauss'])
    expect(cov.blocksWithoutPoint[1].text).toMatch(/potentiel/)
    expect(cov.totalBlocks).toBe(4)
  })

  it('accepts partial or reformatted anchors', () => {
    const points = [point('coulomb', 'inversement proportionnelle au carré de la distance')]
    const cov = computeCoverage(fiche, points, [exercise('coulomb', 'pending')])
    expect(cov.blocksWithoutPoint.map((b) => b.heading)).not.toContain('Loi de Coulomb')
    expect(cov.pointsWithoutExercise).toEqual([])
  })
})
