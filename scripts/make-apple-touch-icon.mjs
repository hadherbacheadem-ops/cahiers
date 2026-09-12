#!/usr/bin/env node
// Génère `public/apple-touch-icon.png` (180×180, opaque) à partir du dessin de
// `public/favicon.svg`, sans dépendance : le projet n'embarque ni sharp ni
// canvas, alors les trois formes du SVG (fond, contour de fiche, trois lignes)
// sont rastérisées ici avec sur-échantillonnage 4×4 et encodées en PNG via zlib.
//
//   node scripts/make-apple-touch-icon.mjs [sortie.png] [taille]

import { deflateSync } from 'node:zlib'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const BLUE = [0x3b, 0x5b, 0xdb]
const WHITE = [0xff, 0xff, 0xff]

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
 * Coverage of the white glyph at SVG coordinates (viewBox 0 0 32 32):
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

export function renderIconRgb(size = 180, supersample = 4) {
  const rgb = Buffer.alloc(size * size * 3)
  const scale = 32 / size
  const step = 1 / supersample
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0
      for (let sy = 0; sy < supersample; sy++) {
        for (let sx = 0; sx < supersample; sx++) {
          const x = (px + (sx + 0.5) * step) * scale
          const y = (py + (sy + 0.5) * step) * scale
          if (glyphAt(x, y)) hits++
        }
      }
      const a = hits / (supersample * supersample)
      const o = (py * size + px) * 3
      for (let c = 0; c < 3; c++) rgb[o + c] = Math.round(BLUE[c] * (1 - a) + WHITE[c] * a)
    }
  }
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
export function encodePng(rgb, size) {
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0 // filter: none
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
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

export function renderIconPng(size = 180) {
  return encodePng(renderIconRgb(size), size)
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  const out = process.argv[2] ?? fileURLToPath(new URL('../public/apple-touch-icon.png', import.meta.url))
  const size = Number(process.argv[3] ?? 180)
  const png = renderIconPng(size)
  await writeFile(out, png)
  console.log(`${out} : ${size}×${size}, ${png.length} octets`)
}
