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

/** A review never asks for more than this many nodes: a map of 30 nodes is four short sessions, not one long one. */
export const MAX_MASKED = 8
/** Level-1 branches worked on in one review (the others stay folded in the list). */
export const BRANCHES_PER_REVIEW = 2

/**
 * Which level-1 branches a review focuses on: rotates with the salt (the
 * exercise's review count), so successive reviews walk through the map.
 */
export function focusBranches(nodes: FlatNode[], salt = 0, perReview = BRANCHES_PER_REVIEW): Set<number> {
  const branches = [...new Set(nodes.filter((n) => n.depth > 0 && n.branch !== undefined).map((n) => n.branch as number))].sort((a, b) => a - b)
  if (branches.length <= perReview) return new Set(branches)
  const start = ((salt % branches.length) + branches.length) % branches.length
  const out = new Set<number>()
  for (let k = 0; k < perReview; k++) out.add(branches[(start * perReview + k) % branches.length])
  return out
}

/**
 * Picks the nodes to hide for one review: 30–50 % of the nodes of the focus
 * branches, capped at MAX_MASKED (at least one), never the root, never a whole
 * branch at once when it has several nodes. Deterministic for a given
 * (exercise id, review count): the same review shows the same mask after a
 * reload, the next review another one.
 */
export function pickMasked(nodes: FlatNode[], seed: string, salt = 0, max = MAX_MASKED): Set<string> {
  const focus = focusBranches(nodes, salt)
  const candidates = nodes.filter((n) => n.depth > 0 && (n.branch === undefined || focus.has(n.branch)))
  if (!candidates.length) return new Set()
  const rand = seeded(seed, salt)
  const share = 0.3 + rand() * 0.2
  const target = Math.min(max, Math.max(1, Math.round(candidates.length * share)))
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
