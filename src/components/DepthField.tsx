import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import type { DepthFieldEngine, FieldStats, FieldTheme } from '../lib/depthField'
import { formulasOf } from '../lib/latexToUnicode'
import { isMathBusy, onMathIdle } from '../lib/mathBusy'
import { getFieldContext, subscribeFieldContext } from '../lib/fieldContext'
import { useSettings } from '../lib/useSettings'
import type { Settings } from '../types'

declare global {
  interface Window {
    __depthField?: { stats: () => FieldStats }
  }
}

const REDUCED = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
const COARSE = typeof window !== 'undefined' ? window.matchMedia('(pointer: coarse)') : null
const HOVER_FINE = typeof window !== 'undefined' ? window.matchMedia('(hover: hover) and (pointer: fine)') : null

/** Effective background mode: the setting, else full on desktop and discreet on touch devices. */
export function effectiveBackground(setting: Settings['background']): 'full' | 'discreet' | 'off' {
  if (setting) return setting
  return COARSE?.matches ? 'discreet' : 'full'
}

function readTheme(): { theme: FieldTheme; key: string } {
  const cs = getComputedStyle(document.documentElement)
  const ink = cs.getPropertyValue('--field-ink').trim().split(/\s+/).map(Number) as [number, number, number]
  const opacity = Number(cs.getPropertyValue('--field-opacity')) || 1
  const halo = cs.getPropertyValue('--field-halo').trim() === '1'
  const key = document.documentElement.dataset.theme ?? 'dark'
  return { theme: { ink: ink.length === 3 && ink.every(Number.isFinite) ? ink : [232, 237, 247], opacity, halo, glow: [242, 183, 92] }, key }
}

/**
 * The animated background: a canvas behind everything. Reads the settings
 * (mode, gyroscope), the theme (data-theme on <html>), the field context
 * (current cahier, session) and the fiches' formulas.
 */
/** Phones: the whole field (reading the fiches, extracting formulas, building the engine) waits for this. */
const INTERACTIONS = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const
const isPhoneLike = () => !!COARSE?.matches || window.innerWidth < 768
function afterLoad(cb: () => void, ms: number): number {
  if (document.readyState === 'complete') return window.setTimeout(cb, ms)
  window.addEventListener('load', () => window.setTimeout(cb, ms), { once: true })
  return 0
}

export function DepthField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<DepthFieldEngine | null>(null)
  const settings = useSettings()
  const context = useSyncExternalStore(subscribeFieldContext, getFieldContext, getFieldContext)
  // Phones: armed at the first interaction or 4 s after `load`, whichever comes first. Until then the
  // component does nothing at all: no database read, no formula extraction, no engine, no frame.
  const [armed, setArmed] = useState(() => !isPhoneLike())
  useEffect(() => {
    if (armed) return
    const arm = () => {
      for (const ev of INTERACTIONS) window.removeEventListener(ev, arm)
      setArmed(true)
    }
    for (const ev of INTERACTIONS) window.addEventListener(ev, arm, { passive: true })
    const timer = afterLoad(arm, 4000)
    return () => {
      window.clearTimeout(timer)
      for (const ev of INTERACTIONS) window.removeEventListener(ev, arm)
    }
  }, [armed])
  const chapitres = useLiveQuery(async () => (armed ? await db.chapitres.toArray() : undefined), [armed])
  const mode = effectiveBackground(settings?.background)
  // The system's « reduce motion » only rules the automatic mode: a background chosen
  // by hand in Réglages (plein / discret) is an explicit wish to see it move.
  const explicit = !!settings?.background
  const reducedMotion = () => !!REDUCED?.matches && !explicit

  // Formulas of the user's fiches: current cahier first, never the fiches of a running session.
  const userTexts = useMemo(() => {
    if (!chapitres) return []
    const excluded = new Set(context.excludeChapitreIds)
    const pool = chapitres.filter((c) => !excluded.has(c.id))
    const own = context.cahierId ? pool.filter((c) => c.cahierId === context.cahierId) : []
    const source = own.length ? own : pool
    const out: string[] = []
    // Phones rasterise a smaller pool: 40 formulas is plenty for 36 particles.
    const max = COARSE?.matches ? 40 : 200
    for (const c of source) for (const f of formulasOf(c.content)) if (out.length < max && !out.includes(f)) out.push(f)
    return out
  }, [chapitres, context.cahierId, context.excludeChapitreIds])

  // Engine lifecycle.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || mode === 'off' || !armed) return
    const quality: 'full' | 'discreet' = mode
    // The engine (raster, sprites, physics) is not needed to paint the page: fetched after it.
    let disposed = false
    let cleanup: (() => void) | undefined
    void import('../lib/depthField').then(({ DepthFieldEngine }) => {
      if (!disposed) cleanup = mount(DepthFieldEngine)
    })
    return () => {
      disposed = true
      cleanup?.()
    }

    function mount(Engine: typeof DepthFieldEngine): (() => void) | undefined {
    let engine: DepthFieldEngine
    try {
      engine = new Engine(canvas!, { mobile: !!COARSE?.matches })
    } catch {
      return undefined
    }
    engineRef.current = engine
    const { theme, key } = readTheme()
    engine.setTheme(theme, key)
    engine.setQuality(quality)
    engine.setReducedMotion(reducedMotion())
    window.__depthField = { stats: () => engine.stats() }

    let started = false
    let unsubscribeIdle: (() => void) | undefined
    const begin = () => {
      if (started) return
      // Never under a KaTeX render: wait for the queue to drain, then start.
      if (isMathBusy()) {
        unsubscribeIdle?.()
        unsubscribeIdle = onMathIdle(begin)
        return
      }
      started = true
      engine.start()
    }
    // Rasterise with the maths font once it is available (fallback after 1.5 s). Phones skip the
    // 400 KB font and draw with the system maths face: the background is discreet there anyway.
    // Phones are armed already (see above): start now, unless a maths render is in flight (begin()).
    // Desktop: rasterise with the maths font once it is available, 1.5 s at most.
    const phone = isPhoneLike()
    const fontLoad = phone
      ? Promise.resolve().then(begin)
      : typeof document.fonts?.load === 'function'
        ? document.fonts.load('20px "STIX Two Math"').then(begin, begin)
        : Promise.resolve().then(begin)
    const timer = phone ? 0 : window.setTimeout(begin, 1500)
    void fontLoad

    const onResize = () => engine.resize()
    const onVisibility = () => engine.setHidden(document.hidden)
    const onReduced = () => engine.setReducedMotion(reducedMotion())
    const onTheme = () => {
      const t = readTheme()
      engine.setTheme(t.theme, t.key)
    }
    const observer = new MutationObserver(onTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)
    REDUCED?.addEventListener('change', onReduced)

    // Pointer parallax on fine pointers only; the lamp follows the pointer.
    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth) * 2 - 1
      const ny = (e.clientY / window.innerHeight) * 2 - 1
      engine.setPointer(nx, ny, e.clientX, e.clientY)
    }
    if (HOVER_FINE?.matches) window.addEventListener('pointermove', onMove, { passive: true })

    // Battery: static under 20 % on battery.
    let battery: { level: number; charging: boolean; addEventListener: (t: string, f: () => void) => void; removeEventListener: (t: string, f: () => void) => void } | null = null
    const onBattery = () => {
      if (battery) engine.setLowBattery(battery.level < 0.2 && !battery.charging)
    }
    const nav = navigator as Navigator & { getBattery?: () => Promise<typeof battery> }
    nav.getBattery?.().then((b) => {
      battery = b
      onBattery()
      b?.addEventListener('levelchange', onBattery)
      b?.addEventListener('chargingchange', onBattery)
    }, () => undefined)

    return () => {
      window.clearTimeout(timer)
      unsubscribeIdle?.()
      observer.disconnect()
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      REDUCED?.removeEventListener('change', onReduced)
      window.removeEventListener('pointermove', onMove)
      battery?.removeEventListener('levelchange', onBattery)
      battery?.removeEventListener('chargingchange', onBattery)
      engine.destroy()
      engineRef.current = null
      delete window.__depthField
    }
    }
  }, [mode, explicit, armed])

  // Gyroscope parallax (touch devices), only when the setting is on and no dialog is needed.
  useEffect(() => {
    if (!settings?.motionParallax || !COARSE?.matches || mode === 'off') return
    const DO = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
    const onOrientation = (e: DeviceOrientationEvent) => {
      const gamma = e.gamma ?? 0 // left/right, −90..90
      const beta = e.beta ?? 0 // front/back
      // ±8 px on the nearest plane (14 px for a full pointer excursion): scale 8/14.
      engineRef.current?.setPointer((Math.max(-30, Math.min(30, gamma)) / 30) * (8 / 14), (Math.max(-30, Math.min(30, beta - 40)) / 30) * (8 / 14))
    }
    let attached = false
    const attach = () => {
      window.addEventListener('deviceorientation', onOrientation)
      attached = true
    }
    if (typeof DO?.requestPermission === 'function') {
      // iOS: only if already granted (the request itself needs a user gesture, done from Réglages).
      DO.requestPermission().then((state) => {
        if (state === 'granted') attach()
      }, () => undefined)
    } else attach()
    return () => {
      if (attached) window.removeEventListener('deviceorientation', onOrientation)
    }
  }, [settings?.motionParallax, mode])

  useEffect(() => {
    engineRef.current?.setTexts(userTexts)
  }, [userTexts])

  useEffect(() => {
    engineRef.current?.setCalm(context.calm)
  }, [context.calm])

  if (mode === 'off') return null
  // z-index −1: above the body's gradient (body::before, −2), below every content.
  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0" style={{ zIndex: -1, contain: 'strict' }} />
}
