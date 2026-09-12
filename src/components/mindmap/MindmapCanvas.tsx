import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from 'react'
import { ArrowsOutLineVertical, CornersOut, Minus, Plus } from '@phosphor-icons/react'
import type { MindmapNode } from '../../types'
import { CAHIER_COLORS } from '../../types'
import { Card, IconButton, cx } from '../ui'
import { LABEL_FONT, LABEL_LINE_H, NOTE_FONT, NOTE_LINE_H, ROOT_FONT, ROOT_LINE_H, layoutMindmap, type LaidNode, type Layout } from '../../lib/mindmapLayout'

export interface MindmapCanvasHandle {
  fit(): void
  /** Standalone SVG of the current collapse state, at scale 1, with every CSS variable resolved. */
  exportSvg(): string
  exportPng(scale?: number): Promise<Blob>
}

interface View {
  k: number
  tx: number
  ty: number
}

const MIN_K = 0.2
const MAX_K = 3
const FIT_MAX_K = 1.25
const FIT_PADDING = 32
const DRAG_THRESHOLD = 4
const NODE_PAD_Y = 12
const ROOT_PAD_Y = 16
const NOTE_GAP = 4
const TOGGLE_R = 8

const DEFAULT_PALETTE = CAHIER_COLORS.map((c) => c.value)
const EXPORT_FONT = '"Geist Variable", "Segoe UI", system-ui, sans-serif'

/** Light-theme fallbacks used when a CSS variable cannot be read (e.g. in tests). */
const FALLBACK_TOKENS: Record<string, string> = {
  bg: '#fafafb',
  surface: '#ffffff',
  'surface-2': '#f1f1f4',
  ink: '#1f2129',
  muted: '#6c707e',
  line: '#e3e4e9',
  'line-strong': '#c8cbd3',
  accent: '#3b6cf6',
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

// ---------------------------------------------------------------------------

export function MindmapCanvas({ root, palette, className, ref }: { root: MindmapNode; palette?: string[]; className?: string; ref?: Ref<MindmapCanvasHandle> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 })
  const viewRef = useRef(view)
  viewRef.current = view

  const colours = useMemo(() => (palette && palette.length ? palette : DEFAULT_PALETTE), [palette])
  const layout = useMemo(() => layoutMindmap(root, { collapsed, palette: colours }), [root, collapsed, colours])
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  // ---- Fit / zoom ------------------------------------------------------------

  const fit = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const { width: W, height: H } = el.getBoundingClientRect()
    if (W === 0 || H === 0) return
    const { bbox } = layoutRef.current
    const k = clamp(Math.min((W - 2 * FIT_PADDING) / bbox.w, (H - 2 * FIT_PADDING) / bbox.h, FIT_MAX_K), MIN_K, MAX_K)
    setView({ k, tx: W / 2 - (bbox.x + bbox.w / 2) * k, ty: H / 2 - (bbox.y + bbox.h / 2) * k })
  }, [])

  /** Zooms by `factor` around the container point (px, py). */
  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      const k = clamp(v.k * factor, MIN_K, MAX_K)
      const ratio = k / v.k
      return { k, tx: px - (px - v.tx) * ratio, ty: py - (py - v.ty) * ratio }
    })
  }, [])

  const zoomCentre = useCallback(
    (factor: number) => {
      const el = containerRef.current
      if (!el) return
      zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2)
    },
    [zoomAt],
  )

  // Fit on mount and whenever the map itself changes (not on collapse, which would be jarring).
  useLayoutEffect(() => {
    setCollapsed(new Set())
    // The layout is recomputed synchronously by the next render; fit after it has settled.
    const id = window.requestAnimationFrame(fit)
    return () => window.cancelAnimationFrame(id)
  }, [root, fit])

  // Keep the drawing centred when the container is resized (sidebar, orientation, window).
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    let last = { w: el.clientWidth, h: el.clientHeight }
    const ro = new ResizeObserver(() => {
      const next = { w: el.clientWidth, h: el.clientHeight }
      const dx = (next.w - last.w) / 2
      const dy = (next.h - last.h) / 2
      last = next
      if (dx || dy) setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Wheel must be registered non-passive so the page never scrolls behind the map.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoomAt(Math.exp(-delta * 0.0015), e.clientX - rect.left, e.clientY - rect.top)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt])

  // ---- Pan ---------------------------------------------------------------------

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Pointer capture keeps the drag alive outside the container, but it also redirects `click`
  // to the capturing element, so node toggling is resolved here on pointerup instead.
  const drag = useRef<{ id: number; x: number; y: number; tx: number; ty: number; moved: boolean; nodeId: string | null } | null>(null)

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const nodeEl = (e.target as Element).closest('[data-node]')
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty, moved: false, nodeId: nodeEl?.getAttribute('data-node') ?? null }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    d.moved = true
    setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }))
  }
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    // A press that did not move (> 4px) on a collapsible node toggles it.
    if (!d.moved && d.nodeId && e.type === 'pointerup') toggle(d.nodeId)
  }

  // ---- Collapse ----------------------------------------------------------------

  const onNodeKey = (e: KeyboardEvent<SVGGElement>, n: LaidNode) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle(n.id)
    }
  }

  // ---- Export ----------------------------------------------------------------------

  const exportSvg = useCallback((): string => {
    const src = svgRef.current
    if (!src) throw new Error('La carte n’est pas encore affichée.')
    const { bbox } = layoutRef.current
    const w = Math.ceil(bbox.w)
    const h = Math.ceil(bbox.h)

    const clone = src.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    clone.setAttribute('width', String(w))
    clone.setAttribute('height', String(h))
    clone.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.w} ${bbox.h}`)
    for (const attr of ['class', 'style', 'role', 'aria-label']) clone.removeAttribute(attr)
    clone.setAttribute('font-family', EXPORT_FONT)
    const viewport = clone.querySelector('[data-viewport]')
    viewport?.removeAttribute('transform')
    clone.querySelectorAll('[class], [role], [tabindex], [aria-label], [aria-expanded], [style], [data-node]').forEach((el) => {
      for (const attr of ['class', 'role', 'tabindex', 'aria-label', 'aria-expanded', 'style', 'data-node']) el.removeAttribute(attr)
    })
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
    bgRect.setAttribute('x', String(bbox.x))
    bgRect.setAttribute('y', String(bbox.y))
    bgRect.setAttribute('width', String(bbox.w))
    bgRect.setAttribute('height', String(bbox.h))
    bgRect.setAttribute('fill', 'var(--bg)')
    clone.insertBefore(bgRect, clone.firstChild)

    const styles = getComputedStyle(document.documentElement)
    const resolve = (name: string) => styles.getPropertyValue(`--${name}`).trim() || FALLBACK_TOKENS[name] || '#000000'
    const xml = new XMLSerializer().serializeToString(clone)
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + xml.replace(/var\(--([\w-]+)(?:\s*,[^)]*)?\)/g, (_, name: string) => resolve(name))
  }, [])

  const exportPng = useCallback(
    async (scale = 2): Promise<Blob> => {
      const svg = exportSvg()
      const { bbox } = layoutRef.current
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Impossible de convertir la carte en image.'))
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
      })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(bbox.w * scale)
      canvas.height = Math.ceil(bbox.h * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Le navigateur ne permet pas de dessiner l’image.')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('L’export PNG a échoué.'))), 'image/png')
      })
    },
    [exportSvg],
  )

  useImperativeHandle(ref, () => ({ fit, exportSvg, exportPng }), [fit, exportSvg, exportPng])

  // ---- Render ----------------------------------------------------------------------

  // The overlays need a positioned ancestor; only add `relative` when the caller has not positioned us (e.g. `absolute inset-0`).
  const positioned = /\b(absolute|fixed|relative|sticky)\b/.test(className ?? '')

  return (
    <div ref={containerRef} className={cx(!positioned && 'relative', 'overflow-hidden bg-bg select-none', className)}>
      <svg
        ref={svgRef}
        className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
        style={{ fontFamily: 'var(--font-sans, ui-sans-serif)' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="group"
        aria-label={`Carte mentale : ${root.label}`}
      >
        <g data-viewport transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          <Edges layout={layout} />
          {layout.nodes.map((n) => (
            <Node key={n.id} n={n} onKey={onNodeKey} />
          ))}
        </g>
      </svg>

      <p className="pointer-events-none absolute bottom-3 left-3 hidden text-xs text-muted md:block">Molette : zoom · Glisser : déplacer · Clic sur un nœud : plier/déplier</p>

      <Card className="absolute right-3 bottom-3 flex items-center gap-0.5 p-1">
        <IconButton label="Zoom avant" onClick={() => zoomCentre(1.25)}>
          <Plus size={18} weight="bold" />
        </IconButton>
        <IconButton label="Zoom arrière" onClick={() => zoomCentre(0.8)}>
          <Minus size={18} weight="bold" />
        </IconButton>
        <IconButton label="Ajuster" onClick={fit}>
          <CornersOut size={18} weight="bold" />
        </IconButton>
        <IconButton label="Tout déplier" disabled={collapsed.size === 0} onClick={() => setCollapsed(new Set())}>
          <ArrowsOutLineVertical size={18} weight="bold" />
        </IconButton>
      </Card>
    </div>
  )
}

// ---- Pieces ------------------------------------------------------------------------

function Edges({ layout }: { layout: Layout }) {
  return (
    <g fill="none" strokeLinecap="round">
      {layout.edges.map(({ from, to }) => {
        const x1 = from.x + to.side * (from.w / 2)
        const x2 = to.x - to.side * (to.w / 2)
        const mx = (x1 + x2) / 2
        return <path key={to.id} d={`M ${x1} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${x2} ${to.y}`} stroke={to.color || 'var(--ink)'} strokeWidth={to.depth >= 3 ? 1.5 : 2} strokeOpacity={0.9} />
      })}
    </g>
  )
}

function Node({ n, onKey }: { n: LaidNode; onKey: (e: KeyboardEvent<SVGGElement>, n: LaidNode) => void }) {
  const isRoot = n.depth === 0
  const collapsible = n.hasChildren && !isRoot
  const left = n.x - n.w / 2
  const top = n.y - n.h / 2
  const font = isRoot ? ROOT_FONT : LABEL_FONT
  const lineH = isRoot ? ROOT_LINE_H : LABEL_LINE_H
  const padY = isRoot ? ROOT_PAD_Y : NODE_PAD_Y
  const stroke = isRoot ? 'var(--ink)' : n.color || 'var(--line-strong)'
  const textFill = isRoot ? 'var(--bg)' : 'var(--ink)'
  const truncated = n.lines.at(-1)?.endsWith('…') || n.noteLines.at(-1)?.endsWith('…')

  // Baselines: centre of the line box + a third of the font size reads as vertically centred.
  const labelBase = top + padY + lineH / 2 + font * 0.35
  const noteTop = top + padY + n.lines.length * lineH + NOTE_GAP
  const noteBase = noteTop + NOTE_LINE_H / 2 + NOTE_FONT * 0.35

  const toggleX = n.x + n.side * (n.w / 2)
  const full = n.node.note ? `${n.node.label} — ${n.node.note}` : n.node.label

  return (
    <g
      data-node={collapsible ? n.id : undefined}
      className={collapsible ? 'cursor-pointer ring-focus' : undefined}
      role={collapsible ? 'button' : undefined}
      tabIndex={collapsible ? 0 : undefined}
      aria-label={collapsible ? `${n.node.label} : ${n.collapsed ? 'déplier' : 'plier'}` : undefined}
      aria-expanded={collapsible ? !n.collapsed : undefined}
      onKeyDown={collapsible ? (e) => onKey(e, n) : undefined}
    >
      {truncated && <title>{full}</title>}
      <rect x={left} y={top} width={n.w} height={n.h} rx={10} fill={isRoot ? 'var(--ink)' : 'var(--surface)'} stroke={stroke} strokeWidth={isRoot ? 0 : 1.5} />
      <text x={n.x} textAnchor="middle" fontSize={font} fontWeight={600} fill={textFill}>
        {n.lines.map((line, i) => (
          <tspan key={i} x={n.x} y={labelBase + i * lineH}>
            {line}
          </tspan>
        ))}
      </text>
      {n.noteLines.length > 0 && (
        <text x={n.x} textAnchor="middle" fontSize={NOTE_FONT} fill={isRoot ? 'var(--bg)' : 'var(--muted)'} fillOpacity={isRoot ? 0.8 : 1}>
          {n.noteLines.map((line, i) => (
            <tspan key={i} x={n.x} y={noteBase + i * NOTE_LINE_H}>
              {line}
            </tspan>
          ))}
        </text>
      )}
      {collapsible && (
        <g stroke={stroke} strokeWidth={1.5} strokeLinecap="round">
          <circle cx={toggleX} cy={n.y} r={TOGGLE_R} fill="var(--surface)" />
          <line x1={toggleX - 3.5} y1={n.y} x2={toggleX + 3.5} y2={n.y} />
          {n.collapsed && <line x1={toggleX} y1={n.y - 3.5} x2={toggleX} y2={n.y + 3.5} />}
        </g>
      )}
    </g>
  )
}
