import * as pdfjs from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Items whose baseline differs by less than this (PDF units) belong to the same line.
const LINE_TOLERANCE = 2

let workerReady = false
function ensureWorker() {
  if (workerReady) return
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  workerReady = true
}

interface Item {
  x: number
  y: number
  width: number
  str: string
}

/** Text of every page, lines rebuilt from glyph positions, pages separated by a blank line. */
export async function pdfToText(file: File): Promise<string> {
  ensureWorker()
  const data = new Uint8Array(await file.arrayBuffer())
  const task = pdfjs.getDocument({ data })
  const doc = await task.promise
  try {
    const pages: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      const items: Item[] = []
      for (const it of content.items) {
        if (!('str' in it)) continue
        const t = it as TextItem
        if (!t.str.trim()) continue
        items.push({ x: t.transform[4], y: t.transform[5], width: t.width, str: t.str })
      }
      pages.push(linesFromItems(items))
    }
    return pages.filter(Boolean).join('\n\n').trim()
  } finally {
    await task.destroy()
  }
}

function linesFromItems(items: Item[]): string {
  // Top of the page has the largest y, so sort descending before grouping.
  const sorted = [...items].sort((a, b) => b.y - a.y)
  const lines: Item[][] = []
  for (const it of sorted) {
    const line = lines[lines.length - 1]
    if (line && Math.abs(line[0].y - it.y) <= LINE_TOLERANCE) line.push(it)
    else lines.push([it])
  }
  return lines
    .map((line) => {
      line.sort((a, b) => a.x - b.x)
      let out = ''
      let prev: Item | undefined
      for (const it of line) {
        if (prev) {
          const gap = it.x - (prev.x + prev.width)
          const charWidth = prev.width / Math.max(1, prev.str.length)
          if (gap > charWidth * 0.8 && !out.endsWith(' ') && !it.str.startsWith(' ')) out += ' '
        }
        out += it.str
        prev = it
      }
      return out.replace(/\s+/g, ' ').trim()
    })
    .filter(Boolean)
    .join('\n')
}
