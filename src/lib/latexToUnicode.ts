// ---------------------------------------------------------------------------
// LaTeX → plain Unicode, for the background field only (never for display of
// the fiches, KaTeX does that). Conservative by design: any unknown command,
// any construct that cannot be written in Unicode, or a result longer than
// MAX_LENGTH makes the conversion fail — better nothing than a broken text.
// ---------------------------------------------------------------------------

export const MAX_LENGTH = 28

const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ',
  chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
}

const SYMBOLS: Record<string, string> = {
  int: '∫', iint: '∬', iiint: '∭', oint: '∮', sum: '∑', prod: '∏', partial: '∂', nabla: '∇', infty: '∞', cdot: '·', times: '×', pm: '±', mp: '∓',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠', approx: '≈', simeq: '≃', sim: '∼', equiv: '≡', propto: '∝', to: '→', rightarrow: '→', leftarrow: '←',
  Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', leftrightarrow: '↔', mapsto: '↦', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', cup: '∪', cap: '∩',
  forall: '∀', exists: '∃', emptyset: '∅', varnothing: '∅', ell: 'ℓ', hbar: 'ℏ', degree: '°', circ: '∘', bullet: '•', ldots: '…', cdots: '⋯', dots: '…',
  langle: '⟨', rangle: '⟩', perp: '⊥', parallel: '∥', angle: '∠', wedge: '∧', vee: '∨', oplus: '⊕', otimes: '⊗', star: '⋆', prime: '′', lvert: '|', rvert: '|',
  ',': ' ', ';': ' ', '!': '', ' ': ' ', quad: '  ', qquad: '   ', '{': '{', '}': '}', '%': '%', '&': '&', '_': '_', '#': '#', '|': '‖',
  mathbb: '', mathcal: '', mathbf: '', mathit: '', boldsymbol: '', displaystyle: '', textstyle: '', left: '', right: '', big: '', Big: '', bigl: '', bigr: '', middle: '',
}

const SUPERSCRIPT: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', t: 'ᵗ', k: 'ᵏ', m: 'ᵐ', p: 'ᵖ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', j: 'ʲ', o: 'ᵒ', r: 'ʳ', s: 'ˢ', u: 'ᵘ', v: 'ᵛ', y: 'ʸ', z: 'ᶻ', T: 'ᵀ', '*': '*', "'": '′' }
const SUBSCRIPT: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ' }

const ACCENTS: Record<string, string> = { vec: '⃗', hat: '̂', bar: '̄', dot: '̇', ddot: '̈', tilde: '̃', overline: '̅' }

class Reject extends Error {}

/** Reads a balanced `{…}` group starting at `i` (which must point at `{`), returns [inner, indexAfter]. */
function group(s: string, i: number): [string, number] {
  if (s[i] !== '{') throw new Reject('group expected')
  let depth = 0
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') depth++
    else if (s[j] === '}') {
      depth--
      if (depth === 0) return [s.slice(i + 1, j), j + 1]
    }
  }
  throw new Reject('unbalanced')
}

/** Argument of a command: a `{group}`, a `\command`, or a single character. */
function argument(s: string, i: number): [string, number] {
  while (s[i] === ' ') i++
  if (s[i] === '{') return group(s, i)
  if (s[i] === '\\') {
    const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i))
    if (!m) throw new Reject('bad command')
    return [m[0], i + m[0].length]
  }
  if (i >= s.length) throw new Reject('missing argument')
  return [s[i], i + 1]
}

function script(text: string, table: Record<string, string>, caret: string): string {
  const inner = convert(text)
  if (inner.length === 0) throw new Reject('empty script')
  // One or two convertible characters → Unicode; up to four → caret form (e^(iπ)); longer → give up.
  const chars = [...inner]
  if (inner === '∘' && caret === '^') return '°' // x^\circ → x°
  if (chars.length <= 2 && chars.every((ch) => table[ch])) return chars.map((ch) => table[ch]).join('')
  if (chars.length > 4) throw new Reject('script too long')
  // Unicode has no subscript for c, d, f, g… : write the index plain (E_c → Ec), like handwriting.
  if (caret === '_' && chars.length <= 2 && chars.every((ch) => /[A-Za-z]/.test(ch))) return inner
  return `${caret}(${inner})`
}

function convert(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const ch = src[i]
    if (ch === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i))
      if (!m) throw new Reject('bad command')
      const name = m[1]
      i += m[0].length
      // LaTeX swallows the spaces after a letter command (\Delta G → ΔG).
      if (/^[A-Za-z]+$/.test(name)) while (src[i] === ' ') i++
      if (name === 'frac' || name === 'dfrac' || name === 'tfrac') {
        const [a, ia] = argument(src, i)
        const [b, ib] = argument(src, ia)
        const ca = convert(a)
        const cb = convert(b)
        if (ca.length > 8 || cb.length > 8) throw new Reject('fraction too long')
        const wrap = (t: string) => (t.length > 1 ? `(${t})` : t)
        out += `${wrap(ca)}/${wrap(cb)}`
        i = ib
        continue
      }
      if (name === 'sqrt') {
        const [a, ia] = argument(src, i)
        const ca = convert(a)
        out += ca.length > 1 ? `√(${ca})` : `√${ca}`
        i = ia
        continue
      }
      if (name === 'mathrm' || name === 'text' || name === 'textrm' || name === 'operatorname' || name === 'mathbf' || name === 'mathcal' || name === 'mathbb' || name === 'boldsymbol' || name === 'mathit') {
        if (src[i] === '{') {
          const [a, ia] = group(src, i)
          out += name === 'text' || name === 'textrm' ? a : convert(a)
          i = ia
          continue
        }
        continue // \mathbf x → x
      }
      if (name === 'ce') {
        const [a, ia] = group(src, i)
        out += chem(a)
        i = ia
        continue
      }
      if (name in ACCENTS) {
        const [a, ia] = argument(src, i)
        const ca = convert(a)
        if (ca.length !== 1) throw new Reject('accent on several characters')
        out += ca + ACCENTS[name]
        i = ia
        continue
      }
      if (name in GREEK) {
        out += GREEK[name]
        continue
      }
      if (name in SYMBOLS) {
        out += SYMBOLS[name]
        continue
      }
      throw new Reject(`unknown command \\${name}`)
    }
    if (ch === '^' || ch === '_') {
      const [a, ia] = argument(src, i + 1)
      out += ch === '^' ? script(a, SUPERSCRIPT, '^') : script(a, SUBSCRIPT, '_')
      i = ia
      continue
    }
    if (ch === '{' ) {
      const [a, ia] = group(src, i)
      out += convert(a)
      i = ia
      continue
    }
    if (ch === '}') throw new Reject('stray brace')
    if (ch === '&' || ch === '~') {
      out += ' '
      i++
      continue
    }
    out += ch === '-' ? '−' : ch
    i++
  }
  return out
}

/** mhchem subset: formulas with digits as subscripts, arrows, charges. */
function chem(src: string): string {
  let s = src.replace(/<=>/g, ' ⇌ ').replace(/->/g, ' → ').replace(/<-/g, ' ← ')
  s = s.replace(/([A-Za-z\)\]])(\d+)/g, (_, a: string, d: string) => a + [...d].map((c) => SUBSCRIPT[c]).join(''))
  s = s.replace(/\^(\d*[+-])/g, (_, c: string) => [...c].map((x) => SUPERSCRIPT[x] ?? x).join(''))
  s = s.replace(/([A-Za-z\d₀-₉\)])([+-])(?=\s|$)/g, (_, a: string, c: string) => a + SUPERSCRIPT[c])
  if (/[\\{}^_]/.test(s)) throw new Reject('unsupported chemistry')
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * Converts a LaTeX fragment (without `$`) to Unicode, or returns null when the
 * result would be wrong or too long for a particle.
 */
export function latexToUnicode(latex: string): string | null {
  let s = latex.trim()
  s = s.replace(/^\$+|\$+$/g, '').replace(/^\\\(|\\\)$/g, '').replace(/^\\\[|\\\]$/g, '').trim()
  if (!s) return null
  try {
    let out = convert(s).normalize('NFC')
    // Typography: relations spaced, products and quotients tight, big operators followed by a space.
    out = out.replace(/\s*([=≤≥≠≈±∓→←⇒⇐⇔↔⇌∼≃≡∝∈∉⊂⊆∪∩∧∨⊕⊗↦])\s*/g, ' $1 ')
    out = out.replace(/\s*([·×\/])\s*/g, '$1')
    out = out.replace(/([∫∬∭∮∑∏])(?=\S)/g, '$1 ')
    out = out.replace(/\s+/g, ' ').trim()
    if (!out || out.length > MAX_LENGTH) return null
    if (/[\\{}]/.test(out)) return null
    return out
  } catch {
    return null
  }
}

/** Every `$…$` (not `$$…$$`) of a text, converted and deduplicated. */
export function formulasOf(text: string): string[] {
  const out = new Set<string>()
  const re = /(?<!\$)\$([^$\n]{2,120}?)\$(?!\$)/g
  for (const m of text.matchAll(re)) {
    const u = latexToUnicode(m[1])
    if (u && /[=∫∑∂∇→⇌√≤≥≠≈±·×^⁰-⁹₀-₉αβγδεζηθλμνξπρστφχψωΔΩΦΓ]/.test(u)) out.add(u)
  }
  return [...out]
}
