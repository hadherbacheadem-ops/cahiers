import { describe, expect, it } from 'vitest'
import { ADMIN_CHECK, checkCode, deriveCode, type CodeCheck } from './admin'

const SALT = '00112233445566778899aabbccddeeff'

async function checkFor(code: string, iterations = 1000): Promise<CodeCheck> {
  return { saltHex: SALT, hashHex: await deriveCode(code, SALT, iterations), iterations }
}

describe('administrator code', () => {
  it('derives a stable 256-bit hash that depends on the code and on the salt', async () => {
    const a = await deriveCode('un-code', SALT, 1000)
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await deriveCode('un-code', SALT, 1000)).toBe(a)
    expect(await deriveCode('un-autre', SALT, 1000)).not.toBe(a)
    expect(await deriveCode('un-code', 'ff' + SALT.slice(2), 1000)).not.toBe(a)
  })

  it('accepts the right code, and only it, ignoring surrounding spaces', async () => {
    const check = await checkFor('Sésame_12')
    expect(await checkCode('Sésame_12', check)).toBe(true)
    expect(await checkCode('  Sésame_12  ', check)).toBe(true)
    expect(await checkCode('sésame_12', check)).toBe(false)
    expect(await checkCode('Sésame_1', check)).toBe(false)
    expect(await checkCode('', check)).toBe(false)
    expect(await checkCode('   ', check)).toBe(false)
  })

  it('has a real hash in the source, not a placeholder, and refuses guesses', async () => {
    expect(ADMIN_CHECK.hashHex).toMatch(/^[0-9a-f]{64}$/)
    expect(ADMIN_CHECK.saltHex).toMatch(/^[0-9a-f]{32}$/)
    expect(await checkCode('admin')).toBe(false)
    expect(await checkCode('password')).toBe(false)
  })
})
