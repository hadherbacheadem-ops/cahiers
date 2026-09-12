import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const scriptPath = fileURLToPath(new URL('../../scripts/make-apple-touch-icon.mjs', import.meta.url))
const shipped = fileURLToPath(new URL('../../public/apple-touch-icon.png', import.meta.url))

function pngHeader(bytes: Buffer) {
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), depth: bytes[24], colour: bytes[25] }
}

describe('apple-touch-icon', () => {
  it('the script writes an opaque 180×180 PNG', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cahiers-icon-'))
    const file = join(dir, 'icon.png')
    execFileSync(process.execPath, [scriptPath, file, '180'], { encoding: 'utf8' })
    const bytes = readFileSync(file)
    expect(pngHeader(bytes)).toEqual({ width: 180, height: 180, depth: 8, colour: 2 })
    // Last chunk: length (4) + "IEND" (4) + crc (4).
    expect(bytes.subarray(bytes.length - 8, bytes.length - 4).toString('ascii')).toBe('IEND')
  })

  it('the shipped icon is present and 180×180', () => {
    expect(existsSync(shipped)).toBe(true)
    expect(pngHeader(readFileSync(shipped))).toMatchObject({ width: 180, height: 180 })
  })
})
