// ---------------------------------------------------------------------------
// « Nuit d'encre » background: equations rising through five depth planes on a
// single full-screen canvas. Performance contract (see A1 of the night brief):
//   - every equation is rasterised ONCE per plane (font, blur, halo) into an
//     ImageBitmap; the frame loop only does drawImage + globalAlpha;
//   - object pool, no allocation per frame, dt-based motion;
//   - the loop stops when the tab is hidden, under reduced motion (one static
//     frame) or on low battery, and degrades itself when the median frame time
//     exceeds the budget (drop the farthest plane → fewer particles → static).
// No React in here; DepthField.tsx wires it to the app.
// ---------------------------------------------------------------------------

import { GENERIC_EQUATIONS, pickWeighted, type Equation } from './equations'

export interface PlaneSpec {
  size: number
  blur: number
  alpha: number
  /** px / s */
  speed: number
  /** Parallax amplitude in px for a full pointer excursion. */
  parallax: number
  /** 0–1: strength of the glow around the glyphs (dark theme). */
  halo: number
}

/** Far → near. */
export const PLANES: PlaneSpec[] = [
  // speed in px/s, upwards: a slow, visible rise (the front plane crosses a phone screen in ~25 s).
  { size: 12, blur: 3, alpha: 0.06, speed: 9, parallax: 3, halo: 0 },
  { size: 15, blur: 2.2, alpha: 0.09, speed: 13.5, parallax: 5, halo: 0 },
  { size: 18, blur: 1.4, alpha: 0.12, speed: 19, parallax: 8, halo: 0.3 },
  { size: 22, blur: 0.7, alpha: 0.16, speed: 25, parallax: 11, halo: 0.6 },
  { size: 27, blur: 0.5, alpha: 0.21, speed: 33, parallax: 14, halo: 1 },
]

export const COUNTS = { desktop: [30, 22, 18, 12, 8], mobile: [12, 9, 7, 5, 3] }
/** The pool holds the largest configuration (desktop, full quality): 90 particles. */
export const POOL_SIZE = Math.max(...Object.values(COUNTS).map((c) => c.reduce((a, b) => a + b, 0)))

export interface FieldTheme {
  /** "r g b" of the ink. */
  ink: [number, number, number]
  /** Global opacity multiplier (light theme: 0.5). */
  opacity: number
  halo: boolean
  /** Accent rgb for the lamp glow. */
  glow: [number, number, number]
}

export interface FieldStats {
  medianMs: number
  p95Ms: number
  fps: number
  particles: number
  planes: number
  level: number
  sprites: number
  running: boolean
  /** Total main-thread time spent rasterising sprites, and how many. */
  rasterMs: number
  rasterCount: number
}

interface Particle {
  active: boolean
  plane: number
  text: string
  /** Sprite resolved once per (text, plane, theme): no map lookup or key string per frame. */
  sprite: Sprite | null
  spriteTheme: string
  x: number
  y: number
  phase: number
  period: number
  amp: number
  rotPhase: number
  born: number
  dying: number
}

interface Sprite {
  bitmap: ImageBitmap | HTMLCanvasElement | OffscreenCanvas
  w: number
  h: number
  /** Frame counter at last draw (LRU eviction without reordering the map every frame). */
  lastUsed: number
  /** Where the text baseline-left sits inside the sprite, so drawing is centred on the glyphs. */
  cx: number
  cy: number
}

const MAX_SPRITES = 160
const FADE_MS = 3000
const FRAME_WINDOW = 60

type Level = 0 | 1 | 2 | 3

export class DepthFieldEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private dpr = 1
  private width = 0
  private height = 0
  private pool: Particle[] = []
  private counts: number[] = COUNTS.desktop
  private planeIndexes: number[] = [0, 1, 2, 3, 4]
  private alphaMul = 1
  private user: string[] = []
  private generic: Equation[] = GENERIC_EQUATIONS
  private sprites = new Map<string, Sprite>()
  private inflight = new Set<string>()
  private themeKey = 'dark'
  private theme: FieldTheme = { ink: [232, 237, 247], opacity: 1, halo: true, glow: [242, 183, 92] }
  private glowSprite: OffscreenCanvas | HTMLCanvasElement | null = null
  private pointer = { x: 0, y: 0 }
  private pointerSmooth = { x: 0, y: 0 }
  private pointerPx = { x: -1, y: -1 }
  private pointerPxSmooth = { x: -1, y: -1 }
  private calm = false
  private intensity = 1
  private speedMul = 1
  private raf = 0
  private last = 0
  private running = false
  private reducedMotion = false
  private lowBattery = false
  private hidden = false
  private frameTimes: number[] = []
  private frameCursor = 0
  private level: Level = 0
  private underBudgetMs = 0
  private budgetMs = 2
  private mobile = false
  private random: () => number
  private fpsWindow = { frames: 0, since: 0, fps: 0 }
  private filterSupported = true
  private destroyed = false

  constructor(canvas: HTMLCanvasElement, opts: { mobile: boolean; random?: () => number }) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) throw new Error('canvas 2d indisponible')
    this.ctx = ctx
    this.mobile = opts.mobile
    this.budgetMs = opts.mobile ? 3 : 2
    this.counts = opts.mobile ? COUNTS.mobile : COUNTS.desktop
    this.random = opts.random ?? Math.random
    this.filterSupported = 'filter' in ctx
    for (let i = 0; i < POOL_SIZE; i++) this.pool.push({ active: false, plane: 0, text: '', sprite: null, spriteTheme: '', x: 0, y: 0, phase: 0, period: 8, amp: 10, rotPhase: 0, born: 0, dying: 0 })
    this.resize()
  }

  // ---- Configuration ---------------------------------------------------------

  /** 'full': five planes; 'discreet': three far planes, half the particles, opacities × 0.7. */
  setQuality(quality: 'full' | 'discreet') {
    const base = this.mobile ? COUNTS.mobile : COUNTS.desktop
    if (quality === 'discreet') {
      this.planeIndexes = [0, 1, 2]
      this.counts = base.map((n) => Math.max(1, Math.round(n / 2)))
      this.alphaMul = 0.7
    } else {
      this.planeIndexes = [0, 1, 2, 3, 4]
      this.counts = base
      this.alphaMul = 1
    }
    this.level = 0
    this.applyLevel()
  }

  setTheme(theme: FieldTheme, key: string) {
    this.theme = theme
    this.themeKey = key
    for (const s of this.sprites.values()) closeBitmap(s.bitmap)
    this.sprites.clear()
    this.inflight.clear()
    this.queue.length = 0
    this.glowSprite = null
    for (const p of this.pool) p.sprite = null
    if (!this.running) this.drawFrame(performance.now(), 0)
  }

  /** Texts: 60 % from the user's fiches (when any), 40 % generic. Changing them crossfades over 3 s. */
  setTexts(user: string[], generic: Equation[] = GENERIC_EQUATIONS) {
    const same = user.length === this.allUser.length && user.every((t, i) => t === this.allUser[i])
    this.allUser = user
    this.generic = generic.length ? generic : GENERIC_EQUATIONS
    if (same) return
    this.sampleVocabulary()
    const now = performance.now()
    for (const p of this.pool) if (p.active && !p.dying) p.dying = now
    if (!this.running) this.drawFrame(now, 0)
  }

  private allUser: string[] = []
  private vocabularyAt = 0

  /**
   * Active vocabulary: at most 24 of the user's formulas at a time (re-sampled
   * every two minutes with a crossfade). Keeps the sprite cache stable instead
   * of thrashing through hundreds of text × plane combinations.
   */
  private sampleVocabulary() {
    const pool = [...this.allUser]
    const out: string[] = []
    while (pool.length && out.length < 24) out.push(pool.splice(Math.floor(this.random() * pool.length), 1)[0])
    this.user = out
    this.vocabularyAt = performance.now()
  }

  setCalm(calm: boolean) {
    this.calm = calm
  }

  setReducedMotion(reduced: boolean) {
    this.reducedMotion = reduced
    if (reduced) {
      this.stopLoop()
      this.scatter()
      this.drawFrame(performance.now(), 0)
    } else if (!this.hidden && !this.lowBattery) this.startLoop()
  }

  setLowBattery(low: boolean) {
    this.lowBattery = low
    if (low) {
      this.stopLoop()
      this.drawFrame(performance.now(), 0)
    } else if (!this.hidden && !this.reducedMotion) this.startLoop()
  }

  setHidden(hidden: boolean) {
    this.hidden = hidden
    if (hidden) this.stopLoop()
    else if (!this.reducedMotion && !this.lowBattery && this.level < 3) this.startLoop()
  }

  /** Pointer position in [-1, 1] (or gyroscope tilt scaled likewise), plus pixel position for the lamp. */
  setPointer(nx: number, ny: number, px = -1, py = -1) {
    this.pointer.x = Math.max(-1, Math.min(1, nx))
    this.pointer.y = Math.max(-1, Math.min(1, ny))
    this.pointerPx.x = px
    this.pointerPx.y = py
  }

  resize() {
    // iOS caps canvas memory (~16 M px per canvas): 1.5× is invisible on a phone and halves the raster cost of 3×.
    const dpr = Math.min(this.mobile ? 1.5 : 2, window.devicePixelRatio || 1)
    const w = window.innerWidth
    const h = window.innerHeight
    if (w === this.width && h === this.height && dpr === this.dpr) return
    const sx = this.width ? w / this.width : 1
    const sy = this.height ? h / this.height : 1
    this.dpr = dpr
    this.width = w
    this.height = h
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    for (const p of this.pool) {
      p.x *= sx
      p.y *= sy
    }
    if (!this.running) this.drawFrame(performance.now(), 0)
  }

  start() {
    this.applyLevel()
    if (this.reducedMotion) {
      this.scatter()
      this.drawFrame(performance.now(), 0)
      return
    }
    this.scatter()
    this.startLoop()
  }

  destroy() {
    this.destroyed = true
    this.stopLoop()
    for (const s of this.sprites.values()) closeBitmap(s.bitmap)
    this.sprites.clear()
  }

  stats(): FieldStats {
    const sorted = [...this.frameTimes].sort((a, b) => a - b)
    return {
      medianMs: +(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(2),
      p95Ms: +(sorted[Math.floor(sorted.length * 0.95)] ?? 0).toFixed(2),
      fps: this.fpsWindow.fps,
      particles: this.pool.filter((p) => p.active).length,
      planes: this.planeIndexes.length,
      level: this.level,
      sprites: this.sprites.size,
      running: this.running,
      rasterMs: +this.rasterMs.toFixed(1),
      rasterCount: this.rasterCount,
    }
  }

  // ---- Particles -------------------------------------------------------------

  private pickText(): string {
    if (this.user.length && this.random() < 0.6) return this.user[Math.floor(this.random() * this.user.length)]
    return pickWeighted(this.generic, this.random())
  }

  private spawn(p: Particle, plane: number, y: number, now: number) {
    p.active = true
    p.plane = plane
    p.text = this.pickText()
    p.sprite = null
    p.x = this.random() * this.width
    p.y = y
    p.phase = this.random() * Math.PI * 2
    p.period = 6 + this.random() * 6
    p.amp = 6 + this.random() * 8
    p.rotPhase = this.random() * Math.PI * 2
    p.born = now
    p.dying = 0
  }

  /** Fills the pool according to the current planes/counts; spreads particles over the whole screen. */
  private scatter() {
    const now = performance.now()
    let i = 0
    for (const plane of this.planeIndexes) {
      const n = this.counts[plane]
      for (let k = 0; k < n && i < this.pool.length; k++, i++) {
        const p = this.pool[i]
        if (!p.active || p.plane !== plane) this.spawn(p, plane, this.random() * this.height, now - FADE_MS)
      }
    }
    for (; i < this.pool.length; i++) this.pool[i].active = false
  }

  private applyLevel() {
    // Level 1: drop the farthest plane. Level 2: 60 % of the particles. Level 3: static.
    const base = this.mobile ? COUNTS.mobile : COUNTS.desktop
    const quality = this.alphaMul < 1 ? 'discreet' : 'full'
    let planes = quality === 'discreet' ? [0, 1, 2] : [0, 1, 2, 3, 4]
    let counts = quality === 'discreet' ? base.map((n) => Math.max(1, Math.round(n / 2))) : [...base]
    if (this.level >= 1) planes = planes.slice(1)
    if (this.level >= 2) counts = counts.map((n) => Math.max(1, Math.round(n * 0.6)))
    this.planeIndexes = planes
    this.counts = counts
    this.scatter()
  }

  // ---- Sprites ---------------------------------------------------------------

  private spriteFor(text: string, plane: number): Sprite | null {
    const key = `${this.themeKey}|${plane}|${text}`
    const cached = this.sprites.get(key)
    if (cached) {
      cached.lastUsed = this.frameCursor
      return cached
    }
    if (!this.inflight.has(key)) {
      this.inflight.add(key)
      this.queue.push({ text, plane, key })
      this.pumpQueue()
    }
    return null
  }

  private queue: { text: string; plane: number; key: string }[] = []
  private pumping = false

  /** Rasterises at most one sprite per animation frame: the warm-up never stalls a frame. */
  private pumpQueue() {
    if (this.pumping || this.destroyed) return
    const next = this.queue.shift()
    if (!next) return
    this.pumping = true
    void this.rasterise(next.text, next.plane, next.key).finally(() => {
      this.pumping = false
      if (this.queue.length) requestAnimationFrame(() => this.pumpQueue())
    })
  }

  private rasterMs = 0
  private rasterCount = 0

  private async rasterise(text: string, plane: number, key: string) {
    const t0 = performance.now()
    const spec = PLANES[plane]
    const dpr = this.dpr
    const size = spec.size
    // Phones: no halo shadow and no blur filter, the two costly passes of a sprite (each is a long task at CPU ×4).
    const haloPx = this.theme.halo && !this.mobile ? 8 * spec.halo : 0
    const pad = Math.ceil(spec.blur * 3 + haloPx + 4)
    const measure = measureContext()
    measure.font = `${size}px "STIX Two Math", "Cambria Math", serif`
    const textWidth = Math.ceil(measure.measureText(text).width)
    const w = textWidth + pad * 2
    const h = Math.ceil(size * 1.4) + pad * 2
    const [r, g, b] = this.theme.ink

    const layer = makeCanvas(w * dpr, h * dpr)
    const lctx = layer.getContext('2d') as CanvasRenderingContext2D
    lctx.scale(dpr, dpr)
    lctx.font = measure.font
    lctx.textBaseline = 'alphabetic'
    lctx.fillStyle = `rgb(${r} ${g} ${b})`
    if (haloPx > 0) {
      lctx.shadowColor = `rgba(${r}, ${g}, ${b}, 0.85)`
      lctx.shadowBlur = haloPx
    }
    lctx.fillText(text, pad, pad + size)

    let final: OffscreenCanvas | HTMLCanvasElement = layer
    if (spec.blur > 0 && this.filterSupported && !this.mobile) {
      const blurred = makeCanvas(w * dpr, h * dpr)
      const bctx = blurred.getContext('2d') as CanvasRenderingContext2D
      bctx.filter = `blur(${spec.blur * dpr}px)`
      bctx.drawImage(layer, 0, 0)
      final = blurred
    }
    this.rasterMs += performance.now() - t0
    this.rasterCount++
    let bitmap: Sprite['bitmap'] = final
    if (typeof createImageBitmap === 'function') {
      try {
        bitmap = await createImageBitmap(final)
      } catch {
        bitmap = final
      }
    }
    if (this.destroyed) {
      closeBitmap(bitmap)
      return
    }
    this.inflight.delete(key)
    this.sprites.set(key, { bitmap, w, h, cx: pad + textWidth / 2, cy: pad + size * 0.65, lastUsed: this.frameCursor })
    if (this.sprites.size > MAX_SPRITES) {
      // Evict the least recently drawn sprite (one scan, only when over capacity).
      let oldestKey = ''
      let oldest = Infinity
      for (const [k, sp] of this.sprites) {
        if (sp.lastUsed < oldest) {
          oldest = sp.lastUsed
          oldestKey = k
        }
      }
      const s = this.sprites.get(oldestKey)
      if (s) {
        closeBitmap(s.bitmap)
        for (const p of this.pool) if (p.sprite === s) p.sprite = null
      }
      this.sprites.delete(oldestKey)
    }
    if (!this.running) this.drawFrame(performance.now(), 0)
  }

  private glow(): OffscreenCanvas | HTMLCanvasElement {
    if (this.glowSprite) return this.glowSprite
    const size = 600
    const c = makeCanvas(size, size)
    const g = c.getContext('2d') as CanvasRenderingContext2D
    const [r, gg, b] = this.theme.glow
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, `rgba(${r}, ${gg}, ${b}, 1)`)
    grad.addColorStop(0.5, `rgba(${r}, ${gg}, ${b}, 0.35)`)
    grad.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`)
    g.fillStyle = grad
    g.fillRect(0, 0, size, size)
    this.glowSprite = c
    return c
  }

  // ---- Loop ------------------------------------------------------------------

  private startLoop() {
    if (this.running || this.destroyed) return
    this.running = true
    this.last = performance.now()
    this.fpsWindow = { frames: 0, since: this.last, fps: 0 }
    const tick = (now: number) => {
      if (!this.running) return
      const dt = Math.min(0.05, (now - this.last) / 1000)
      this.last = now
      const t0 = performance.now()
      this.step(now, dt)
      this.drawFrame(now, dt)
      this.recordFrame(performance.now() - t0, now)
      this.raf = requestAnimationFrame(tick)
    }
    this.raf = requestAnimationFrame(tick)
  }

  private stopLoop() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  private recordFrame(ms: number, now: number) {
    this.frameTimes[this.frameCursor % FRAME_WINDOW] = ms
    this.frameCursor++
    this.fpsWindow.frames++
    if (now - this.fpsWindow.since >= 1000) {
      this.fpsWindow.fps = Math.round((this.fpsWindow.frames * 1000) / (now - this.fpsWindow.since))
      this.fpsWindow.frames = 0
      this.fpsWindow.since = now
    }
    if (this.frameCursor % FRAME_WINDOW !== 0) return
    const sorted = [...this.frameTimes].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0
    if (median > this.budgetMs) {
      this.underBudgetMs = 0
      if (this.level < 3) {
        this.level = (this.level + 1) as Level
        if (this.level === 3) {
          this.stopLoop()
          this.drawFrame(now, 0)
        } else this.applyLevel()
      }
    } else if (median < this.budgetMs * 0.6) {
      this.underBudgetMs += (FRAME_WINDOW * 1000) / 60
      if (this.underBudgetMs >= 10_000 && this.level > 0) {
        this.level = (this.level - 1) as Level
        this.underBudgetMs = 0
        this.applyLevel()
      }
    } else this.underBudgetMs = 0
  }

  private step(now: number, dt: number) {
    if (this.allUser.length > 24 && now - this.vocabularyAt > 120_000) {
      this.sampleVocabulary()
      for (const p of this.pool) if (p.active && !p.dying) p.dying = now
    }
    const targetIntensity = this.calm ? 0.4 : 1
    const targetSpeed = this.calm ? 0.5 : 1
    const k = Math.min(1, dt * 2)
    this.intensity += (targetIntensity - this.intensity) * k
    this.speedMul += (targetSpeed - this.speedMul) * k
    const kp = Math.min(1, dt * 4)
    this.pointerSmooth.x += (this.pointer.x - this.pointerSmooth.x) * kp
    this.pointerSmooth.y += (this.pointer.y - this.pointerSmooth.y) * kp
    if (this.pointerPx.x >= 0) {
      if (this.pointerPxSmooth.x < 0) this.pointerPxSmooth = { ...this.pointerPx }
      this.pointerPxSmooth.x += (this.pointerPx.x - this.pointerPxSmooth.x) * kp
      this.pointerPxSmooth.y += (this.pointerPx.y - this.pointerPxSmooth.y) * kp
    }
    const H = this.height
    for (const p of this.pool) {
      if (!p.active) continue
      const spec = PLANES[p.plane]
      p.y -= spec.speed * this.speedMul * dt
      if (p.dying && now - p.dying >= FADE_MS) {
        this.spawn(p, p.plane, this.random() * H, now)
        continue
      }
      if (p.y < -spec.size * 2) this.spawn(p, p.plane, H + spec.size + this.random() * 40, now)
    }
  }

  private drawFrame(now: number, _dt: number) {
    const ctx = this.ctx
    const { width: W, height: H, dpr } = this
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const base = this.theme.opacity * this.alphaMul * this.intensity

    // Lamp: a diffuse glow following the pointer, far plane.
    if (this.theme.halo && this.pointerPxSmooth.x >= 0 && !this.reducedMotion) {
      const g = this.glow()
      ctx.globalAlpha = 0.04 * this.intensity
      ctx.drawImage(g, this.pointerPxSmooth.x - 300 + this.pointerSmooth.x * 3, this.pointerPxSmooth.y - 300, 600, 600)
    }

    const t = now / 1000
    for (const plane of this.planeIndexes) {
      const spec = PLANES[plane]
      const shiftX = this.pointerSmooth.x * spec.parallax
      const shiftY = this.pointerSmooth.y * spec.parallax * 0.5
      for (const p of this.pool) {
        if (!p.active || p.plane !== plane) continue
        if (!p.sprite || p.spriteTheme !== this.themeKey) {
          p.sprite = this.spriteFor(p.text, plane)
          p.spriteTheme = this.themeKey
          if (!p.sprite) continue
        }
        const sprite = p.sprite
        sprite.lastUsed = this.frameCursor
        let alpha = spec.alpha * base
        // Birth / death crossfades.
        alpha *= Math.min(1, (now - p.born) / FADE_MS)
        if (p.dying) alpha *= Math.max(0, 1 - (now - p.dying) / FADE_MS)
        // Born under the bottom edge, extinguished 15 % → 5 % from the top.
        alpha *= Math.max(0, Math.min(1, (H + spec.size - p.y) / (spec.size + 40)))
        alpha *= Math.max(0, Math.min(1, (p.y - 0.05 * H) / (0.1 * H)))
        if (alpha <= 0.002) continue
        const wobble = Math.sin((t / p.period) * Math.PI * 2 + p.phase) * p.amp
        const rot = Math.sin((t / (p.period * 1.7)) * Math.PI * 2 + p.rotPhase) * (Math.PI / 60)
        ctx.globalAlpha = alpha
        ctx.setTransform(dpr, 0, 0, dpr, (p.x + wobble + shiftX) * dpr, (p.y + shiftY) * dpr)
        ctx.rotate(rot)
        ctx.drawImage(sprite.bitmap, -sprite.cx, -sprite.cy, sprite.w, sprite.h)
      }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalAlpha = 1
  }
}

let measureCtx: CanvasRenderingContext2D | null = null
/** One shared context for measureText: creating a canvas per sprite was the costliest part of a rasterisation. */
function measureContext(): CanvasRenderingContext2D {
  if (!measureCtx) measureCtx = makeCanvas(1, 1).getContext('2d') as CanvasRenderingContext2D
  return measureCtx
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(Math.max(1, w), Math.max(1, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, w)
  c.height = Math.max(1, h)
  return c
}

function closeBitmap(b: Sprite['bitmap']) {
  if (typeof ImageBitmap !== 'undefined' && b instanceof ImageBitmap) b.close()
}
