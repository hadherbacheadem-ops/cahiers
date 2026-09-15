import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from 'react'
import { ChevronsUpDown, Maximize, Minus, Plus, X } from 'lucide-react'
import type { MindmapNode } from '../../types'
import { CAHIER_COLORS } from '../../types'
import { Card, IconButton, cx } from '../ui'
import { LABEL_FONT, LABEL_LINE_H, NOTE_FONT, NOTE_LINE_H, ROOT_FONT, ROOT_LINE_H, layoutMindmap, type LaidNode, type Layout } from '../../lib/mindmapLayout'
import { plainMath } from '../../lib/latexToUnicode'
import { Markdown } from '../Markdown'

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
const EXPORT_FONT = '"Inter Variable", "Segoe UI", system-ui, sans-serif'

/** Light-theme fallbacks used when a CSS variable cannot be read (e.g. in tests). */
const FALLBACK_TOKENS: Record<string, string> = {
  bg: '#f7f3ec',
  surface: '#fffdf9',
  'surface-2': '#f3eee5',
  ink: '#14161f',
  muted: '#5b6070',
  line: '#e0dcd3',
  'line-strong': '#c9c4ba',
  accent: '#8f5f0c',
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v))
}

// ---------------------------------------------------------------------------

export function MindmapCanvas({ root, palette, className, ref }: { root: MindmapNode; palette?: string[]; className?: string; ref?: Ref<MindmapCanvasHandle> }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  /** Node whose full text is shown in the detail card (labels and notes are truncated in the drawing). */
  const [selected, setSelected] = useState<string | null>(null)
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
  const drag = useRef<{ id: number; x: number; y: number; tx: number; ty: number; moved: boolean; nodeId: string | null; onToggle: boolean } | null>(null)
  // Touch: two fingers pinch-zoom around their midpoint; a double tap zooms in where it lands.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const pinch = useRef<{ dist: number; k: number; tx: number; ty: number; cx: number; cy: number } | null>(null)
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null)

  const localPoint = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) }
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    e.currentTarget.setPointerCapture(e.pointerId)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const mid = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2)
      const v = viewRef.current
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: v.k, tx: v.tx, ty: v.ty, cx: mid.x, cy: mid.y }
      drag.current = null
      return
    }
    const target = e.target as Element
    const nodeEl = target.closest('[data-node]')
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      tx: viewRef.current.tx,
      ty: viewRef.current.ty,
      moved: false,
      nodeId: nodeEl?.getAttribute('data-node') ?? null,
      onToggle: !!target.closest('[data-toggle]'),
    }
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const p = pinch.current
    if (p && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1
      const mid = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2)
      const k = clamp((p.k * dist) / p.dist, MIN_K, MAX_K)
      const ratio = k / p.k
      // The map point that was under the fingers' midpoint stays under it while they move.
      setView({ k, tx: mid.x - (p.cx - p.tx) * ratio, ty: mid.y - (p.cy - p.ty) * ratio })
      return
    }
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    d.moved = true
    setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }))
  }
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (pinch.current) {
      // The pinch ends when the second finger lifts; the remaining finger does not start a pan.
      if (pointers.current.size < 2) pinch.current = null
      drag.current = null
      return
    }
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    if (d.moved || e.type !== 'pointerup') return
    if (e.pointerType === 'touch') {
      const now = Date.now()
      const prev = lastTap.current
      lastTap.current = { t: now, x: e.clientX, y: e.clientY }
      if (prev && now - prev.t < 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
        lastTap.current = null
        const at = localPoint(e.clientX, e.clientY)
        zoomAt(2, at.x, at.y)
        return
      }
    }
    // A press that did not move (> 4px): on the ± disc it folds the branch, on a node it opens its
    // full text (the drawing truncates long notes), on the background it closes the card.
    if (d.nodeId && d.onToggle) toggle(d.nodeId)
    else setSelected(d.nodeId)
  }

  // ---- Collapse ----------------------------------------------------------------

  const onNodeKey = (e: KeyboardEvent<SVGGElement>, n: LaidNode) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (n.hasChildren && n.depth > 0) toggle(n.id)
      else setSelected((s) => (s === n.id ? null : n.id))
    } else if (e.key === 'Escape') setSelected(null)
  }

  const selectedNode = selected ? (layout.nodes.find((n) => n.id === selected) ?? null) : null
  useEffect(() => {
    if (!selectedNode) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedNode])

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
    clone.querySelectorAll('[class], [role], [tabindex], [aria-label], [aria-expanded], [style], [data-node], [data-toggle]').forEach((el) => {
      for (const attr of ['class', 'role', 'tabindex', 'aria-label', 'aria-expanded', 'style', 'data-node', 'data-toggle']) el.removeAttribute(attr)
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
            <Node key={n.id} n={n} onKey={onNodeKey} onFocus={() => setSelected(n.id)} selected={n.id === selected} />
          ))}
        </g>
      </svg>

      <p className="pointer-events-none absolute bottom-3 left-3 hidden text-xs text-muted md:block">Molette : zoom · Glisser : déplacer · Clic sur un nœud : texte complet · ± : plier/déplier</p>
      <p className="pointer-events-none absolute bottom-3 left-3 max-w-[60%] text-xs text-muted md:hidden">Pincer : zoom · Double-toucher : agrandir · Toucher un nœud : texte complet</p>

      {selectedNode && (
        <Card
          elevation={3}
          className="absolute inset-x-3 top-3 flex max-h-[45%] flex-col gap-2 overflow-y-auto p-4 md:inset-x-auto md:right-3 md:max-w-sm"
          role="dialog"
          aria-label={`Détail : ${plainMath(selectedNode.node.label)}`}
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1 font-semibold leading-snug" style={{ color: selectedNode.color || undefined }}>
              <Markdown inline text={selectedNode.node.label} />
            </div>
            <IconButton label="Fermer" size="sm" className="-mt-1 -mr-1 shrink-0" onClick={() => setSelected(null)}>
              <X size={16} />
            </IconButton>
          </div>
          {selectedNode.node.note?.trim() ? (
            <div className="text-sm leading-relaxed text-ink">
              <Markdown inline text={selectedNode.node.note} />
            </div>
          ) : (
            <p className="text-sm text-muted">Pas de note sur ce nœud.</p>
          )}
        </Card>
      )}

      <Card className="absolute right-3 bottom-3 flex items-center gap-0.5 p-1">
        <IconButton label="Zoom avant" onClick={() => zoomCentre(1.25)}>
          <Plus size={18} />
        </IconButton>
        <IconButton label="Zoom arrière" onClick={() => zoomCentre(0.8)}>
          <Minus size={18} />
        </IconButton>
        <IconButton label="Ajuster" onClick={fit}>
          <Maximize size={18} />
        </IconButton>
        <IconButton label="Tout déplier" disabled={collapsed.size === 0} onClick={() => setCollapsed(new Set())}>
          <ChevronsUpDown size={18} />
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
        return <path key={to.id} d={`M ${x1} ${from.y} C ${mx} ${from.y}, ${mx} ${to.y}, ${x2} ${to.y}`} stroke={to.color || 'var(--ink)'} strokeWidth={to.depth >= 3 ? 1.5 : 2} strokeOpacity={0.8} />
      })}
    </g>
  )
}

function Node({ n, onKey, onFocus, selected }: { n: LaidNode; onKey: (e: KeyboardEvent<SVGGElement>, n: LaidNode) => void; onFocus: () => void; selected: boolean }) {
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
  const full = plainMath(n.node.note ? `${n.node.label} — ${n.node.note}` : n.node.label)

  return (
    <g
      data-node={n.id}
      data-action="noeud"
      className="cursor-pointer ring-focus"
      role="button"
      tabIndex={0}
      aria-label={collapsible ? `${plainMath(n.node.label)} : ${n.collapsed ? 'déplier' : 'plier'} (Entrée), texte complet au clic` : `${plainMath(n.node.label)} : texte complet`}
      aria-expanded={collapsible ? !n.collapsed : undefined}
      onKeyDown={(e) => onKey(e, n)}
      onFocus={onFocus}
    >
      {truncated && <title>{full}</title>}
      <rect
        x={left}
        y={top}
        width={n.w}
        height={n.h}
        rx={10}
        fill={isRoot ? 'var(--ink)' : 'var(--surface-2)'}
        stroke={selected ? 'var(--accent)' : stroke}
        strokeWidth={selected ? 2.5 : isRoot ? 0 : 1.5}
        strokeOpacity={isRoot && !selected ? 1 : 0.95}
      />
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
        <g data-toggle stroke={stroke} strokeWidth={1.5} strokeLinecap="round">
          {/* Larger invisible hit zone: the ± disc is the fold control, the rest of the node opens the text. */}
          <circle cx={toggleX} cy={n.y} r={TOGGLE_R * 2.2} fill="transparent" stroke="none" />
          <circle cx={toggleX} cy={n.y} r={TOGGLE_R} fill="var(--surface)" />
          <line x1={toggleX - 3.5} y1={n.y} x2={toggleX + 3.5} y2={n.y} />
          {n.collapsed && <line x1={toggleX} y1={n.y - 3.5} x2={toggleX} y2={n.y + 3.5} />}
        </g>
      )}
    </g>
  )
}
