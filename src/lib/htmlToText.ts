// Turns HTML coming from mammoth (.docx) or Microsoft Graph (OneNote) into a
// light markdown-ish plain text: headings, lists and tables survive, styling
// does not. This is the text stored on the chapitre and sent to Claude.

const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'blockquote', 'pre', 'figure'])

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // A drawn molecule has no text of its own: its SMILES (and name) stand for it, so exercises can be made from it.
  doc.querySelectorAll('[data-smiles]').forEach((el) => {
    const name = el.getAttribute('data-name')
    el.replaceWith(doc.createTextNode(` [structure : ${el.getAttribute('data-smiles')}${name ? ` — ${name}` : ''}] `))
  })
  doc.querySelectorAll('script, style, noscript, img, svg, canvas, iframe, object').forEach((n) => n.remove())
  const out: string[] = []
  walk(doc.body, out, { listDepth: 0, ordered: [], counters: [] })
  return tidy(out.join(''))
}

interface Ctx {
  listDepth: number
  ordered: boolean[]
  counters: number[]
}

function walk(node: Node, out: string[], ctx: Ctx) {
  if (node.nodeType === Node.TEXT_NODE) {
    const parent = node.parentElement
    const pre = parent?.closest('pre')
    const text = pre ? (node.textContent ?? '') : (node.textContent ?? '').replace(/\s+/g, ' ')
    out.push(text)
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()

  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6': {
      const level = Math.min(Number(tag[1]), 4)
      out.push('\n\n' + '#'.repeat(level) + ' ')
      children(el, out, ctx)
      out.push('\n\n')
      return
    }
    case 'br':
      out.push('\n')
      return
    case 'hr':
      out.push('\n\n---\n\n')
      return
    case 'ul':
    case 'ol': {
      out.push('\n')
      ctx.listDepth++
      ctx.ordered.push(tag === 'ol')
      ctx.counters.push(0)
      children(el, out, ctx)
      ctx.listDepth--
      ctx.ordered.pop()
      ctx.counters.pop()
      out.push('\n')
      return
    }
    case 'li': {
      const depth = Math.max(0, ctx.listDepth - 1)
      const ordered = ctx.ordered[ctx.ordered.length - 1]
      const idx = ++ctx.counters[ctx.counters.length - 1]
      out.push('\n' + '  '.repeat(depth) + (ordered ? `${idx}. ` : '- '))
      children(el, out, ctx)
      return
    }
    case 'table': {
      out.push('\n\n')
      const rows = Array.from(el.querySelectorAll('tr'))
      rows.forEach((tr, i) => {
        const cells = Array.from(tr.children).map((c) => cellText(c as HTMLElement))
        out.push('| ' + cells.join(' | ') + ' |\n')
        if (i === 0) out.push('|' + cells.map(() => ' --- ').join('|') + '|\n')
      })
      out.push('\n')
      return
    }
    case 'strong':
    case 'b': {
      const inner = collect(el, ctx).trim()
      if (inner) out.push(`**${inner}**`)
      return
    }
    case 'em':
    case 'i': {
      const inner = collect(el, ctx).trim()
      if (inner) out.push(`*${inner}*`)
      return
    }
    case 'code': {
      const inner = el.textContent ?? ''
      out.push(el.closest('pre') ? inner : `\`${inner}\``)
      return
    }
    case 'pre': {
      out.push('\n\n```\n')
      children(el, out, ctx)
      out.push('\n```\n\n')
      return
    }
    case 'a': {
      children(el, out, ctx)
      return
    }
    default: {
      const block = BLOCK.has(tag)
      if (block) out.push('\n')
      children(el, out, ctx)
      if (block) out.push('\n')
    }
  }
}

function children(el: HTMLElement, out: string[], ctx: Ctx) {
  el.childNodes.forEach((c) => walk(c, out, ctx))
}

function collect(el: HTMLElement, ctx: Ctx): string {
  const buf: string[] = []
  children(el, buf, ctx)
  return buf.join('')
}

function cellText(cell: HTMLElement): string {
  const buf: string[] = []
  walk(cell, buf, { listDepth: 0, ordered: [], counters: [] })
  return tidy(buf.join('')).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim()
}

function tidy(s: string): string {
  return s
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ {2,}/g, ' ')
    .trim()
}
