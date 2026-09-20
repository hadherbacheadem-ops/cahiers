// Skeletal (topological) formulas from SMILES, drawn by SmilesDrawer (MIT, self-hosted: no
// service, works offline). Claude writes the SMILES; the app draws. The library is a separate
// chunk loaded on the first molecule.

import { LruCache } from './katexWorkerCore'

/** Colours: carbon and bonds follow the text colour; heteroatoms keep the usual hues, readable on both themes. */
const THEME = {
  C: 'currentColor',
  H: 'currentColor',
  O: '#e5604f',
  N: '#5b8def',
  F: '#3fb68b',
  CL: '#3fb68b',
  BR: '#c9822b',
  I: '#a06bd6',
  P: '#e08a2e',
  S: '#c9b21f',
  B: '#c98a6b',
  SI: '#9aa3b2',
  BACKGROUND: 'transparent',
}

interface SmilesDrawerModule {
  default: {
    SvgDrawer: new (options: Record<string, unknown>, clear?: boolean) => { draw: (tree: unknown, target: SVGSVGElement, theme: string, weights?: unknown, infoOnly?: boolean) => void }
    parse: (smiles: string, ok: (tree: unknown) => void, fail?: (e: Error) => void) => void
  }
}

let lib: Promise<SmilesDrawerModule['default']> | undefined
function load() {
  lib ??= import('smiles-drawer').then((m) => ((m as unknown as SmilesDrawerModule).default ?? (m as unknown as SmilesDrawerModule['default'])))
  return lib
}

const cache = new LruCache<string | null>(200)

export interface MoleculeOptions {
  /** Longest side of the drawing area, in CSS pixels. */
  size?: number
}

/**
 * The SVG of a molecule, or null when the SMILES cannot be read (the caller shows the SMILES text instead).
 * The SVG uses `currentColor` for carbon and bonds: it follows the text colour of its container.
 */
export async function renderSmiles(smiles: string, { size = 220 }: MoleculeOptions = {}): Promise<string | null> {
  const key = `${size}|${smiles}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const SD = await load()
  const svg = await new Promise<string | null>((resolve) => {
    try {
      SD.parse(
        smiles.trim(),
        (tree) => {
          try {
            const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
            el.setAttribute('width', String(size))
            el.setAttribute('height', String(Math.round(size * 0.7)))
            // scale 1: a fixed bond length, so a small molecule stays small next to a large one.
            const drawer = new SD.SvgDrawer({ width: size, height: Math.round(size * 0.7), scale: 1, bondLength: 34, padding: 10, bondThickness: 1.8, compactDrawing: false, fontSizeLarge: 14, fontSizeSmall: 10, themes: { app: THEME } })
            drawer.draw(tree, el, 'app')
            // The drawer sets a viewBox fitted to the molecule; the size then comes from CSS.
            if (!el.getAttribute('viewBox')) el.setAttribute('viewBox', `0 0 ${size} ${Math.round(size * 0.7)}`)
            // Natural size = the viewBox at bond length 34: a small molecule stays small next to a large one; CSS shrinks it on a narrow screen.
            const vb = (el.getAttribute('viewBox') ?? '').split(/\s+/).map(Number)
            if (vb.length === 4 && vb.every(Number.isFinite)) {
              el.setAttribute('width', String(Math.round(vb[2])))
              el.setAttribute('height', String(Math.round(vb[3])))
            }
            // Bonds toward a coloured atom fade through a gradient: a plain stroke reads better in a skeletal formula.
            resolve(el.outerHTML.replace(/(stroke|fill)="url\(#[^)]*\)"/g, '$1="currentColor"').replace(/<defs>[\s\S]*?<\/defs>/g, ''))
          } catch {
            resolve(null)
          }
        },
        () => resolve(null),
      )
    } catch {
      resolve(null)
    }
  })
  cache.set(key, svg)
  return svg
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/**
 * Replaces `<span class="mol" data-smiles="…" data-name="…"></span>` in a fiche's HTML by the drawing,
 * captioned with the name. An unreadable SMILES stays visible as text, so a typo is noticed.
 */
export async function renderMoleculesInHtml(html: string): Promise<string> {
  const re = /<span\b([^>]*\bdata-smiles\s*=\s*"([^"]*)"[^>]*)>\s*<\/span>/gi
  const found = [...html.matchAll(re)]
  if (!found.length) return html
  const svgs = await Promise.all(found.map((m) => renderSmiles(decodeEntities(m[2]))))
  let i = 0
  return html.replace(re, (_all, attrs: string, smiles: string) => {
    const svg = svgs[i++]
    const name = /\bdata-name\s*=\s*"([^"]*)"/i.exec(attrs)?.[1]
    const caption = name ? `<span class="mol-name">${name}</span>` : ''
    return svg ? `<span class="mol" title="${escapeAttr(decodeEntities(smiles))}">${svg}${caption}</span>` : `<span class="mol mol-error"><code>${smiles}</code>${caption}</span>`
  })
}

function decodeEntities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}
