import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { DepthFieldEngine, type FieldStats, type FieldTheme } from '../lib/depthField'
import { formulasOf } from '../lib/latexToUnicode'
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
export function DepthField() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<DepthFieldEngine | null>(null)
  const settings = useSettings()
  const context = useSyncExternalStore(subscribeFieldContext, getFieldContext, getFieldContext)
  const chapitres = useLiveQuery(() => db.chapitres.toArray(), [])
  const mode = effectiveBackground(settings?.background)

  // Formulas of the user's fiches: current cahier first, never the fiches of a running session.
  const userTexts = useMemo(() => {
    if (!chapitres) return []
    const excluded = new Set(context.excludeChapitreIds)
    const pool = chapitres.filter((c) => !excluded.has(c.id))
    const own = context.cahierId ? pool.filter((c) => c.cahierId === context.cahierId) : []
    const source = own.length ? own : pool
    const out: string[] = []
    for (const c of source) for (const f of formulasOf(c.content)) if (out.length < 200 && !out.includes(f)) out.push(f)
    return out
  }, [chapitres, context.cahierId, context.excludeChapitreIds])

  // Engine lifecycle.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || mode === 'off') return
    let engine: DepthFieldEngine
    try {
      engine = new DepthFieldEngine(canvas, { mobile: !!COARSE?.matches })
    } catch {
      return
    }
    engineRef.current = engine
    const { theme, key } = readTheme()
    engine.setTheme(theme, key)
    engine.setQuality(mode)
    engine.setReducedMotion(!!REDUCED?.matches)
    window.__depthField = { stats: () => engine.stats() }

    let started = false
    const begin = () => {
      if (started) return
      started = true
      engine.start()
    }
    // Rasterise with the maths font once it is available (fallback after 1.5 s).
    const fontLoad = document.fonts?.load ? document.fonts.load('20px "STIX Two Math"').then(begin, begin) : Promise.resolve().then(begin)
    const timer = window.setTimeout(begin, 1500)
    void fontLoad

    const onResize = () => engine.resize()
    const onVisibility = () => engine.setHidden(document.hidden)
    const onReduced = () => engine.setReducedMotion(!!REDUCED?.matches)
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
  }, [mode])

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
