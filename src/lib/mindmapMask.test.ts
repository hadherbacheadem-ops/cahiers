import { describe, expect, it } from 'vitest'
import type { MindmapNode } from '../types'
import { branchesOf, flattenMap, pickMasked } from './mindmapMask'

const map: MindmapNode = {
  label: 'Racine',
  children: [
    { label: 'A', children: [{ label: 'A1' }, { label: 'A2', children: [{ label: 'A2a' }] }] },
    { label: 'B', children: [{ label: 'B1' }] },
    { label: 'C' },
  ],
}

describe('flattenMap', () => {
  it('assigns path ids, depths and level-1 branch indexes', () => {
    const flat = flattenMap(map)
    expect(flat.map((n) => n.id)).toEqual(['r', 'r.0', 'r.0.0', 'r.0.1', 'r.0.1.0', 'r.1', 'r.1.0', 'r.2'])
    expect(flat.find((n) => n.id === 'r.0.1.0')).toMatchObject({ depth: 3, parentId: 'r.0.1', branch: 0 })
    expect(flat[0].branch).toBeUndefined()
  })
})

describe('pickMasked', () => {
  it('hides 30–50 % of the non-root nodes, never the root, deterministically, and leaves a branch partly visible', () => {
    const flat = flattenMap(map)
    const a = pickMasked(flat, 'ex-1', 3)
    const b = pickMasked(flat, 'ex-1', 3)
    expect([...a]).toEqual([...b])
    expect(a.has('r')).toBe(false)
    expect(a.size).toBeGreaterThanOrEqual(2)
    expect(a.size).toBeLessThanOrEqual(4) // 7 non-root nodes × 50 % rounded
    // Branch A has 4 nodes: at most 3 hidden.
    expect([...a].filter((id) => id.startsWith('r.0')).length).toBeLessThanOrEqual(3)
    expect([...pickMasked(flat, 'ex-1', 4)]).not.toEqual([...a]) // another review, another mask (salt)
  })

  it('returns nothing for a root without children', () => {
    expect(pickMasked(flattenMap({ label: 'seul' }), 'x').size).toBe(0)
  })
})

describe('branchesOf', () => {
  it('lists level-1 branches with their descendants', () => {
    const b = branchesOf(map)
    expect(b.map((x) => x.label)).toEqual(['A', 'B', 'C'])
    expect(b[0].descendants.map((n) => n.label)).toEqual(['A1', 'A2', 'A2a'])
    expect(b[2].descendants).toEqual([])
  })
})
