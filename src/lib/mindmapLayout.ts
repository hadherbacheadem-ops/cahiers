import type { MindmapNode } from '../types'
import { plainMath } from './latexToUnicode'

// ---------------------------------------------------------------------------
// Pure layout for the mind-map viewer: no DOM, no React. Text metrics are
// estimated (average glyph width ≈ 0.55 em) so the same layout is produced on
// screen and in the exported SVG/PNG.
// Coordinates: `x`/`y` are the CENTRE of each node; the root sits at (0, 0).
// ---------------------------------------------------------------------------

export interface LaidNode {
  /** Path-based id ('r', 'r.0', 'r.0.2'): stable across re-layouts so collapse state survives. */
  id: string
  node: MindmapNode
  depth: number
  x: number
  y: number
  w: number
  h: number
  /** '' for the root (the page decides); otherwise the colour of its top-level branch. */
  color: string
  parentId?: string
  /** 1 = right of the root, -1 = left. */
  side: 1 | -1
  lines: string[]
  noteLines: string[]
  collapsed: boolean
  hasChildren: boolean
}

export interface Layout {
  nodes: LaidNode[]
  edges: { from: LaidNode; to: LaidNode }[]
  bbox: { x: number; y: number; w: number; h: number }
}

// ---- Metrics -----------------------------------------------------------------

export const LABEL_FONT = 13
export const ROOT_FONT = 16
export const NOTE_FONT = 11
export const LABEL_LINE_H = 17
export const ROOT_LINE_H = 20
export const NOTE_LINE_H = 14
export const CHAR_W = 0.55

const LABEL_MAX_CHARS = 26
const ROOT_MAX_CHARS = 22
const LABEL_MAX_LINES = 4
const NOTE_MAX_CHARS = 34
const NOTE_MAX_LINES = 3

const PAD_X = 28
const ROOT_PAD_X = 36
const PAD_Y = 12
const ROOT_PAD_Y = 16
const NOTE_GAP = 4
const MIN_W = 80
const MAX_W = 240

const V_GAP = 14
const H_GAP = 56
const H_GAP_DEEP = 44
const MARGIN = 40

// ---- Text wrapping -----------------------------------------------------------

/** Word-based wrapping; words longer than `maxChars` are hard-split. Truncated output ends with an ellipsis. */
export function wrapText(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0 || maxLines <= 0 || maxChars <= 0) return []
  const lines: string[] = []
  let line = ''
  const chunker = new RegExp(`.{1,${maxChars}}`, 'gu')
  for (const word of words) {
    const chunks = [...word].length > maxChars ? (word.match(chunker) ?? [word]) : [word]
    for (const chunk of chunks) {
      if (!line) line = chunk
      else if ([...line].length + 1 + [...chunk].length <= maxChars) line += ' ' + chunk
      else {
        lines.push(line)
        line = chunk
      }
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  const last = [...kept[maxLines - 1]]
  const trimmed =
    last.length >= maxChars
      ? last
          .slice(0, maxChars - 1)
          .join('')
          .trimEnd()
      : last.join('')
  kept[maxLines - 1] = trimmed + '…'
  return kept
}

function textWidth(line: string, font: number) {
  return [...line].length * font * CHAR_W
}

// ---- Measuring -----------------------------------------------------------------

interface Measured {
  id: string
  node: MindmapNode
  depth: number
  lines: string[]
  noteLines: string[]
  w: number
  h: number
  hasChildren: boolean
  collapsed: boolean
  /** Children that will actually be laid out (empty when collapsed). */
  children: Measured[]
  /** Height of the whole visible subtree, used for vertical packing. */
  subH: number
}

function measure(node: MindmapNode, id: string, depth: number, collapsedIds: Set<string>): Measured {
  const isRoot = depth === 0
  const font = isRoot ? ROOT_FONT : LABEL_FONT
  // SVG text cannot host KaTeX: formulas are drawn in plain Unicode (the exercises keep KaTeX).
  const lines = wrapText(plainMath(node.label) || '…', isRoot ? ROOT_MAX_CHARS : LABEL_MAX_CHARS, LABEL_MAX_LINES)
  const noteLines = node.note ? wrapText(plainMath(node.note), NOTE_MAX_CHARS, NOTE_MAX_LINES) : []

  let longest = 0
  for (const l of lines) longest = Math.max(longest, textWidth(l, font))
  for (const l of noteLines) longest = Math.max(longest, textWidth(l, NOTE_FONT))
  const w = Math.round(Math.min(MAX_W, Math.max(MIN_W, longest + (isRoot ? ROOT_PAD_X : PAD_X))))

  const padY = isRoot ? ROOT_PAD_Y : PAD_Y
  const lineH = isRoot ? ROOT_LINE_H : LABEL_LINE_H
  const h = padY + lines.length * lineH + (noteLines.length ? NOTE_GAP + noteLines.length * NOTE_LINE_H : 0) + padY

  const hasChildren = (node.children?.length ?? 0) > 0
  const collapsed = hasChildren && collapsedIds.has(id)
  const children = hasChildren && !collapsed ? (node.children ?? []).map((c, i) => measure(c, `${id}.${i}`, depth + 1, collapsedIds)) : []

  return { id, node, depth, lines, noteLines, w, h, hasChildren, collapsed, children, subH: Math.max(h, stackHeight(children)) }
}

function stackHeight(items: Measured[]) {
  if (items.length === 0) return 0
  return items.reduce((sum, c) => sum + c.subH, 0) + V_GAP * (items.length - 1)
}

// ---- Placing -------------------------------------------------------------------

export function layoutMindmap(root: MindmapNode, opts: { collapsed: Set<string>; palette: string[] }): Layout {
  const nodes: LaidNode[] = []
  const edges: Layout['edges'] = []
  const { palette } = opts

  const place = (m: Measured, x: number, y: number, side: 1 | -1, color: string, parent?: LaidNode): LaidNode => {
    const laid: LaidNode = {
      id: m.id,
      node: m.node,
      depth: m.depth,
      x,
      y,
      w: m.w,
      h: m.h,
      color,
      parentId: parent?.id,
      side,
      lines: m.lines,
      noteLines: m.noteLines,
      collapsed: m.collapsed,
      hasChildren: m.hasChildren,
    }
    nodes.push(laid)
    if (parent) edges.push({ from: parent, to: laid })
    // Every descendant inherits the colour of its top-level branch.
    placeChildren(laid, m.children, side, () => color)
    return laid
  }

  const branchColor = (i: number) => (palette.length ? palette[i % palette.length] : '')

  const placeChildren = (parent: LaidNode, children: Measured[], side: 1 | -1, colorOf: (index: number) => string, indexOffset = 0) => {
    if (children.length === 0) return
    const gap = parent.depth >= 1 ? H_GAP_DEEP : H_GAP
    let cursor = parent.y - stackHeight(children) / 2
    children.forEach((c, i) => {
      const cy = cursor + c.subH / 2
      const cx = parent.x + side * (parent.w / 2 + gap + c.w / 2)
      place(c, cx, cy, side, colorOf(indexOffset + i), parent)
      cursor += c.subH + V_GAP
    })
  }

  const measured = measure(root, 'r', 0, opts.collapsed)
  const rootLaid: LaidNode = {
    id: measured.id,
    node: measured.node,
    depth: 0,
    x: 0,
    y: 0,
    w: measured.w,
    h: measured.h,
    color: '',
    side: 1,
    lines: measured.lines,
    noteLines: measured.noteLines,
    collapsed: measured.collapsed,
    hasChildren: measured.hasChildren,
  }
  nodes.push(rootLaid)

  // Two-sided map: the first ceil(n/2) branches go right, the rest go left.
  const top = measured.children
  const split = Math.ceil(top.length / 2)
  placeChildren(rootLaid, top.slice(0, split), 1, branchColor, 0)
  placeChildren(rootLaid, top.slice(split), -1, branchColor, split)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.w / 2)
    maxX = Math.max(maxX, n.x + n.w / 2)
    minY = Math.min(minY, n.y - n.h / 2)
    maxY = Math.max(maxY, n.y + n.h / 2)
  }

  return {
    nodes,
    edges,
    bbox: { x: minX - MARGIN, y: minY - MARGIN, w: maxX - minX + 2 * MARGIN, h: maxY - minY + 2 * MARGIN },
  }
}
