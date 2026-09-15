import { describe, expect, it } from 'vitest'
import katex from 'katex'
import 'katex/contrib/mhchem'
import { LruCache, handleRequest, mathKey, renderTexWith } from './katexWorkerCore'

describe('LruCache', () => {
  it('evicts the least recently used entry beyond its capacity', () => {
    const c = new LruCache<number>(3)
    c.set('a', 1)
    c.set('b', 2)
    c.set('c', 3)
    expect(c.get('a')).toBe(1) // a becomes the most recent
    c.set('d', 4) // evicts b
    expect(c.has('b')).toBe(false)
    expect(c.has('a')).toBe(true)
    expect(c.has('c')).toBe(true)
    expect(c.has('d')).toBe(true)
    expect(c.size).toBe(3)
  })

  it('overwrites without growing and refreshes the entry', () => {
    const c = new LruCache<string>(2)
    c.set('x', '1')
    c.set('y', '2')
    c.set('x', '3')
    c.set('z', '4') // evicts y, the oldest untouched
    expect(c.get('x')).toBe('3')
    expect(c.has('y')).toBe(false)
    expect(c.size).toBe(2)
  })

  it('keys distinguish inline from display and ignore surrounding spaces', () => {
    expect(mathKey(' x^2 ', false)).toBe(mathKey('x^2', false))
    expect(mathKey('x^2', true)).not.toBe(mathKey('x^2', false))
  })
})

describe('worker protocol', () => {
  it('answers with the same id and KaTeX HTML', () => {
    const res = handleRequest(katex, { id: 7, latex: '\\frac{a}{b}', display: false })
    expect(res.id).toBe(7)
    expect(res.html).toContain('class="katex"')
    expect(res.html).toContain('mfrac')
  })

  it('renders display mode and mhchem', () => {
    expect(handleRequest(katex, { id: 1, latex: 'E = mc^2', display: true }).html).toContain('katex-display')
    expect(renderTexWith(katex, '\\ce{H2O}', false)).toContain('katex')
  })

  it('never throws: a parse error is rendered, a crash falls back to the source', () => {
    expect(renderTexWith(katex, '\\frac{', false)).toContain('katex-error')
    const broken = { renderToString: () => { throw new Error('boom') } } as unknown as typeof katex
    expect(renderTexWith(broken, 'a<b', false)).toBe('<code>a&lt;b</code>')
  })
})
