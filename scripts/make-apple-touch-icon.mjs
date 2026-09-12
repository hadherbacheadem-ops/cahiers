#!/usr/bin/env node
// Génère les icônes PNG et les écrans de lancement iOS à partir du dessin de
// `public/favicon.svg`, sans dépendance : le projet n'embarque ni sharp ni
// canvas, alors les formes du SVG (fond, contour de fiche, trois lignes) sont
// rastérisées ici avec sur-échantillonnage 4×4 et encodées en PNG via zlib.
//
//   node scripts/make-apple-touch-icon.mjs              → tout (icônes 180/192/512, écrans de lancement)
//   node scripts/make-apple-touch-icon.mjs sortie.png 180 [--maskable]   → une icône
//
// Icône « maskable » : fond plein bord à bord, glyphe réduit dans la zone sûre
// (cercle de 80 % du côté) pour qu'Android puisse rogner en cercle ou en goutte.

import { deflateSync } from 'node:zlib'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

/** Palette « nuit d'encre » de l'app : marine profond et ambre. */
export const BACKGROUND = [0x10, 0x1a, 0x30]
export const SPLASH_BACKGROUND = [0x0b, 0x12, 0x20]
export const GLYPH = [0xf2, 0xb7, 0x5c]

/** Écrans de lancement iOS (portrait) : largeur logique, hauteur logique, densité. */
export const SPLASH_DEVICES = [
  { w: 430, h: 932, r: 3 }, // iPhone 15 Pro Max, 14 Pro Max
  { w: 393, h: 852, r: 3 }, // iPhone 15, 15 Pro, 14 Pro
  { w: 390, h: 844, r: 3 }, // iPhone 14, 13, 12
  { w: 414, h: 896, r: 3 }, // iPhone 11 Pro Max, XS Max
  { w: 414, h: 896, r: 2 }, // iPhone 11, XR
  { w: 375, h: 812, r: 3 }, // iPhone X, XS, 11 Pro, 13 mini
  { w: 375, h: 667, r: 2 }, // iPhone 8, SE 2 / 3
  { w: 810, h: 1080, r: 2 }, // iPad 10.2
  { w: 834, h: 1194, r: 2 }, // iPad Pro 11, Air
]

export const splashName = (d) => `splash-${d.w * d.r}x${d.h * d.r}.png`

/** Distance from p to the segment [a, b]. */
function segmentDistance(px, py, ax, ay, bx, by) {
  const vx = bx - ax
  const vy = by - ay
  const wx = px - ax
  const wy = py - ay
  const len2 = vx * vx + vy * vy || 1
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2))
  const dx = px - (ax + t * vx)
  const dy = py - (ay + t * vy)
  return Math.hypot(dx, dy)
}

/** Signed distance to a rounded rectangle (negative inside). */
function roundedRectDistance(px, py, x, y, w, h, r) {
  const cx = Math.max(x + r - px, 0, px - (x + w - r))
  const cy = Math.max(y + r - py, 0, py - (y + h - r))
  const outside = Math.hypot(cx, cy) - r
  const inside = Math.min(Math.max(px - x, x + w - px, 0), Math.max(py - y, y + h - py, 0))
  return outside > 0 ? outside : -Math.min(r, inside)
}

/**
 * Coverage of the glyph at SVG coordinates (viewBox 0 0 32 32):
 * a 14×18 rounded rectangle outline (stroke 2, rx 2) at (9,7) and three
 * round-capped lines (stroke 2) at y = 12, 16, 20.
 */
function glyphAt(x, y) {
  const d = roundedRectDistance(x, y, 9, 7, 14, 18, 2)
  if (Math.abs(d) <= 1) return true
  const lines = [
    [12, 12, 20, 12],
    [12, 16, 20, 16],
    [12, 20, 17, 20],
  ]
  return lines.some(([ax, ay, bx, by]) => segmentDistance(x, y, ax, ay, bx, by) <= 1)
}

/**
 * Renders the glyph over a background. `glyphScale` is the fraction of the
 * side the 32-unit glyph box occupies (1 = the SVG as is, 0.6 = maskable
 * safe zone); the box is centred.
 */
export function renderIconRgb(size = 180, supersample = 4, { glyphScale = 1, background = BACKGROUND } = {}) {
  const rgb = Buffer.alloc(size * size * 3)
  const box = size * glyphScale
  const offset = (size - box) / 2
  const scale = 32 / box
  const step = 1 / supersample
  // Only the glyph's bounding box needs supersampling; the rest is flat background.
  const gx0 = Math.floor(offset + (8 / 32) * box) - 1
  const gx1 = Math.ceil(offset + (24 / 32) * box) + 1
  const gy0 = Math.floor(offset + (6 / 32) * box) - 1
  const gy1 = Math.ceil(offset + (26 / 32) * box) + 1
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let a = 0
      if (px >= gx0 && px <= gx1 && py >= gy0 && py <= gy1) {
        let hits = 0
        for (let sy = 0; sy < supersample; sy++) {
          for (let sx = 0; sx < supersample; sx++) {
            const x = (px + (sx + 0.5) * step - offset) * scale
            const y = (py + (sy + 0.5) * step - offset) * scale
            if (glyphAt(x, y)) hits++
          }
        }
        a = hits / (supersample * supersample)
      }
      const o = (py * size + px) * 3
      for (let c = 0; c < 3; c++) rgb[o + c] = Math.round(background[c] * (1 - a) + GLYPH[c] * a)
    }
  }
  return rgb
}

/** Launch screen: flat background with the glyph centred, 22 % of the short side. */
export function renderSplashRgb(width, height) {
  const rgb = Buffer.alloc(width * height * 3)
  for (let i = 0; i < width * height; i++) for (let c = 0; c < 3; c++) rgb[i * 3 + c] = SPLASH_BACKGROUND[c]
  const side = Math.round(Math.min(width, height) * 0.22)
  const icon = renderIconRgb(side, 4, { background: SPLASH_BACKGROUND })
  const x0 = Math.round((width - side) / 2)
  const y0 = Math.round((height - side) / 2)
  for (let y = 0; y < side; y++) icon.copy(rgb, ((y0 + y) * width + x0) * 3, y * side * 3, (y + 1) * side * 3)
  return rgb
}

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typeAndData))
  return Buffer.concat([len, typeAndData, crc])
}

/** Encodes an RGB buffer (8 bits, no alpha: iOS wants an opaque icon) as PNG. */
export function encodePng(rgb, width, height = width) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0 // filter: none
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

export function renderIconPng(size = 180, { maskable = false } = {}) {
  return encodePng(renderIconRgb(size, 4, { glyphScale: maskable ? 0.6 : 1 }), size)
}

export function renderSplashPng(width, height) {
  return encodePng(renderSplashRgb(width, height), width, height)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const maskable = process.argv.includes('--maskable')
  const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
  if (positional.length) {
    const out = positional[0]
    const size = Number(positional[1] ?? 180)
    const png = renderIconPng(size, { maskable })
    await mkdir(dirname(resolve(out)), { recursive: true })
    await writeFile(out, png)
    console.log(`${out} : ${size}×${size}${maskable ? ' (maskable)' : ''}, ${png.length} octets`)
  } else {
    const jobs = [
      ['apple-touch-icon.png', renderIconPng(180)],
      ['icon-192.png', renderIconPng(192, { maskable: true })],
      ['icon-512.png', renderIconPng(512, { maskable: true })],
      ...SPLASH_DEVICES.map((d) => [splashName(d), renderSplashPng(d.w * d.r, d.h * d.r)]),
    ]
    for (const [name, png] of jobs) {
      await writeFile(resolve(publicDir, name), png)
      console.log(`public/${name} : ${png.length} octets`)
    }
  }
}
