import { describe, expect, it } from 'vitest'
import { locateArrayElements, repairJson, repairedElements } from './repairJson'

/** Builds a JSON text where the string value carries SINGLE backslashes, as Claude sometimes writes them. */
function single(value: string): string {
  return `{"a": "${value}"}`
}

function parsedA(raw: string): { a: string; repairs: ReturnType<typeof repairJson>['repairs'] } {
  const r = repairJson(raw)
  return { a: (JSON.parse(r.text) as { a: string }).a, repairs: r.repairs }
}

describe('repairJson — LaTeX commands with a single backslash inside $…$', () => {
  const commands = ['\\frac{1}{2}', '\\forall x', '\\nabla f', 'a \\neq b', '\\theta', '\\tau', '2 \\times 3', '\\text{si}', '\\rho', '\\left( x \\right)', '\\beta', '\\bar{x}', '\\begin{cases} a \\end{cases}']

  for (const cmd of commands) {
    it(`restores ${cmd.split(/[{ (]/)[0]} (also the \\b \\f \\n \\r \\t escapes)`, () => {
      const { a, repairs } = parsedA(single(`$${cmd}$`))
      expect(a).toBe(`$${cmd}$`)
      const expected = (cmd.match(/\\/g) ?? []).length
      expect(repairs.doubledBackslashes).toBe(expected)
    })
  }

  it('works with \\( \\) and $$ $$ delimiters written with a single backslash', () => {
    expect(parsedA(single('\\(\\frac{a}{b}\\)')).a).toBe('\\(\\frac{a}{b}\\)')
    expect(parsedA(single('$$\\nabla \\cdot \\vec{E} = \\rho/\\varepsilon_0$$')).a).toBe('$$\\nabla \\cdot \\vec{E} = \\rho/\\varepsilon_0$$')
    expect(parsedA(single('\\[\\theta\\]')).a).toBe('\\[\\theta\\]')
  })

  it('counts every repair exactly', () => {
    const { repairs } = parsedA(single('$\\frac{1}{2} + \\theta$ et \\(\\nu\\)'))
    // \frac \theta \( \nu \)
    expect(repairs.doubledBackslashes).toBe(5)
    expect(repairs.commands).toEqual(['frac', 'theta', '(', 'nu', ')'])
    expect(repairs.trailingCommas).toBe(0)
  })
})

describe('repairJson — outside math', () => {
  it('keeps a real newline ("a\\nb") and repairs \\theta, \\frac, \\begin, \\right, \\tau', () => {
    expect(parsedA(single('a\\nb')).a).toBe('a\nb')
    expect(parsedA(single('ligne 1\\nligne 2')).a).toBe('ligne 1\nligne 2')
    expect(parsedA(single('\\theta')).a).toBe('\\theta')
    expect(parsedA(single('\\frac{1}{2}')).a).toBe('\\frac{1}{2}')
    expect(parsedA(single('\\begin{cases}')).a).toBe('\\begin{cases}')
    expect(parsedA(single('\\right)')).a).toBe('\\right)')
    expect(parsedA(single('\\tau')).a).toBe('\\tau')
  })

  it('doubles \\n only for known commands followed by a non-letter', () => {
    expect(parsedA(single('a \\neq b')).a).toBe('a \\neq b')
    expect(parsedA(single('\\nabla f')).a).toBe('\\nabla f')
    expect(parsedA(single('x \\notin A')).a).toBe('x \\notin A')
    expect(parsedA(single('\\nune ligne')).a).toBe('\nune ligne')
    expect(parsedA(single('fin\\n')).a).toBe('fin\n')
    expect(parsedA(single('\\neuf')).a).toBe('\neuf')
  })

  it('keeps \\t \\r \\b \\f escapes when no letter follows, treats them as commands otherwise', () => {
    // A tab glued to a letter does not happen in a fiche: "\tb" is a forgotten command.
    expect(parsedA(single('a\\tb')).a).toBe('a\\tb')
    expect(parsedA(single('a\\t b')).a).toBe('a\t b')
    expect(parsedA(single('x\\r\\n')).a).toBe('x\r\n')
    expect(parsedA(single('\\f')).a).toBe('\f')
  })
})

describe('repairJson — non-regression on correct JSON', () => {
  it('returns byte-identical text with zero repairs', () => {
    const correct = '{"a": "$\\\\frac{1}{2}$ et \\\\theta, guillemet \\" et é et \\u00e9\\nsuite", "b": [1, 2], "c": {"d": "\\\\(\\\\nabla\\\\)"}}'
    expect(() => JSON.parse(correct)).not.toThrow()
    const r = repairJson(correct)
    expect(r.text).toBe(correct)
    expect(r.repairs).toEqual({ doubledBackslashes: 0, trailingCommas: 0, commands: [], offsets: [] })
  })

  it('removes trailing commas and counts them', () => {
    const r = repairJson('{"a": [1, 2,], "b": {"c": 1,},}')
    expect(JSON.parse(r.text)).toEqual({ a: [1, 2], b: { c: 1 } })
    expect(r.repairs.trailingCommas).toBe(3)
    expect(r.repairs.doubledBackslashes).toBe(0)
  })

  it('never touches text outside strings', () => {
    const r = repairJson('[\n  "x",\n  "y"\n]')
    expect(r.text).toBe('[\n  "x",\n  "y"\n]')
  })
})

describe('locateArrayElements / repairedElements', () => {
  it('attributes repairs to the exercises that contain them', () => {
    const raw = '{"points": [], "exercises": [{"q": "ok"}, {"q": "$\\frac{1}{2}$"}, {"q": "fine \\\\theta"}, {"q": "$\\theta$"}]}'
    const r = repairJson(raw)
    const spans = locateArrayElements(r.text, 'exercises')
    expect(spans).toHaveLength(4)
    expect(r.text.slice(spans[0].start, spans[0].end)).toBe('{"q": "ok"}')
    expect([...repairedElements(spans, r.repairs.offsets)]).toEqual([1, 3])
  })

  it('handles a root array and nested arrays / strings with brackets', () => {
    const text = '[{"a": "x]y", "b": [1, [2]]}, "s", 3]'
    const spans = locateArrayElements(text, 'whatever')
    expect(spans.map((s) => text.slice(s.start, s.end))).toEqual(['{"a": "x]y", "b": [1, [2]]}', '"s"', '3'])
  })
})
