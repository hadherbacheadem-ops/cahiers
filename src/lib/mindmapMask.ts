// ---------------------------------------------------------------------------
// Mind-map retrieval exercises (pure). Reading a map is the weakest use of
// it (Schroeder 2018; Karpicke & Blunt 2011); recalling its nodes is not.
// ---------------------------------------------------------------------------

import type { MindmapNode } from '../types'

export interface FlatNode {
  /** Path id, 'r', 'r.0', 'r.0.2' (same scheme as the canvas layout). */
  id: string
  label: string
  note?: string
  depth: number
  parentId?: string
  /** Index of the level-1 branch this node belongs to (undefined for the root). */
  branch?: number
}

export function flattenMap(root: MindmapNode): FlatNode[] {
  const out: FlatNode[] = []
  const walk = (node: MindmapNode, id: string, depth: number, parentId: string | undefined, branch: number | undefined) => {
    out.push({ id, label: node.label, note: node.note, depth, parentId, branch })
    node.children?.forEach((child, i) => walk(child, `${id}.${i}`, depth + 1, id, depth === 0 ? i : branch))
  }
  walk(root, 'r', 0, undefined, undefined)
  return out
}

/** Deterministic pseudo-random in [0, 1) from a string and a salt. */
export function seeded(seed: string, salt: number): () => number {
  let h = 2166136261 ^ salt
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519)
    h = Math.imul(h ^ (h >>> 13), 3266489917)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

/**
 * Picks 30–50 % of the non-root nodes to hide (at least one), spread across
 * the branches: never the root, never a whole branch at once when it has
 * several nodes.
 */
export function pickMasked(nodes: FlatNode[], seed: string, salt = 0): Set<string> {
  const candidates = nodes.filter((n) => n.depth > 0)
  if (!candidates.length) return new Set()
  const rand = seeded(seed, salt)
  const share = 0.3 + rand() * 0.2
  const target = Math.max(1, Math.round(candidates.length * share))
  const shuffled = [...candidates].sort(() => rand() - 0.5)
  const picked = new Set<string>()
  const perBranch = new Map<number, number>()
  const branchSize = new Map<number, number>()
  for (const n of candidates) if (n.branch !== undefined) branchSize.set(n.branch, (branchSize.get(n.branch) ?? 0) + 1)
  for (const n of shuffled) {
    if (picked.size >= target) break
    const b = n.branch ?? -1
    const size = branchSize.get(b) ?? 1
    const used = perBranch.get(b) ?? 0
    // Leave at least one visible node in branches of two or more.
    if (size >= 2 && used >= size - 1) continue
    picked.add(n.id)
    perBranch.set(b, used + 1)
  }
  return picked
}

/** Level-1 branches with their whole subtree flattened (for the reconstruction variant). */
export function branchesOf(root: MindmapNode): { label: string; note?: string; descendants: FlatNode[] }[] {
  const flat = flattenMap(root)
  return (root.children ?? []).map((child, i) => ({
    label: child.label,
    note: child.note,
    descendants: flat.filter((n) => n.branch === i && n.depth >= 2),
  }))
}
