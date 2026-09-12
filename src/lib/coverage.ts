// ---------------------------------------------------------------------------
// Coverage of a fiche: which points have no exercise, and which passages of
// the fiche are not anchored by any point (retrieval-induced forgetting:
// revising only part of a chapter makes the rest fade, so gaps must be visible).
// ---------------------------------------------------------------------------

import type { Exercise, PointDeCours } from '../types'
import { normalizeText } from './dedupe'

export interface FicheBlock {
  /** Raw markdown of the block (heading + its paragraph, a bullet, a paragraph). */
  text: string
  /** Nearest heading above the block, for display. */
  heading?: string
}

/**
 * Splits a fiche into testable blocks: each paragraph and each list item
 * becomes a block; headings are attached to the blocks under them, not blocks
 * themselves (a title alone has nothing to test).
 */
export function splitBlocks(content: string): FicheBlock[] {
  const blocks: FicheBlock[] = []
  let heading: string | undefined
  let paragraph: string[] = []
  const flush = () => {
    const text = paragraph.join(' ').trim()
    if (text) blocks.push({ text, heading })
    paragraph = []
  }
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) {
      flush()
      continue
    }
    const h = line.match(/^#{1,6}\s+(.*)$/)
    if (h) {
      flush()
      heading = h[1].trim()
      continue
    }
    if (/^([-*+]|\d+[.)])\s+/.test(line)) {
      flush()
      blocks.push({ text: line.replace(/^([-*+]|\d+[.)])\s+/, ''), heading })
      continue
    }
    if (/^\|/.test(line) || /^[-|:\s]+$/.test(line)) continue // tables: skipped (anchors rarely quote them)
    paragraph.push(line)
  }
  flush()
  // Very short blocks (a lone word, a "Définition :" label) carry no fact.
  return blocks.filter((b) => normalizeText(b.text).split(' ').length >= 4)
}

function overlaps(anchor: string, block: string): boolean {
  const a = normalizeText(anchor)
  const b = normalizeText(block)
  if (!a || !b) return false
  if (b.includes(a) || a.includes(b)) return true
  // Partial quote: a 30-char window of the anchor inside the block.
  if (a.length >= 30) {
    for (let i = 0; i + 30 <= a.length; i += 15) if (b.includes(a.slice(i, i + 30))) return true
  }
  return false
}

export interface Coverage {
  /** Points with no exercise (any status but suspended/leech counts as covered once active/pending exists). */
  pointsWithoutExercise: PointDeCours[]
  /** Blocks of the fiche no point anchors. */
  blocksWithoutPoint: FicheBlock[]
  totalBlocks: number
}

export function computeCoverage(content: string, points: PointDeCours[], exercises: Exercise[]): Coverage {
  const counted = new Set(exercises.filter((e) => e.status === 'active' || e.status === 'pending').map((e) => e.pointId))
  const pointsWithoutExercise = points.filter((p) => !counted.has(p.id))
  const blocks = splitBlocks(content)
  const blocksWithoutPoint = blocks.filter((b) => !points.some((p) => p.anchor && overlaps(p.anchor, b.text)))
  return { pointsWithoutExercise, blocksWithoutPoint, totalBlocks: blocks.length }
}
