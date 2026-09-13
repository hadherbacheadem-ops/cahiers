// ---------------------------------------------------------------------------
// Typed answers (pure): tolerant comparison for prose and for LaTeX, plus a
// word-level diff for the feedback. The comparison is an aid — the student
// still confirms right / wrong.
// ---------------------------------------------------------------------------

import { normalizeText } from './dedupe'
import { latexToPlain } from './latexToUnicode'

/**
 * Normalises a LaTeX fragment: delimiters, \left \right, thin spaces, braces
 * around single tokens, spacing commands, and \frac{a}{b} vs a/b are treated
 * alike. Returns '' for text without maths.
 */
export function normalizeLatex(s: string): string {
  let t = s.trim()
  t = t.replace(/^\$+|\$+$/g, '')
  t = t.replace(/\\\(|\\\)|\\\[|\\\]/g, '')
  t = t.replace(/\\left|\\right|\\displaystyle|\\textstyle/g, '')
  t = t.replace(/\\[,;:!]|\\quad|\\qquad|~/g, '')
  // Wrappers may contain one level of nested braces (\mathrm{m\cdot s^{-1}}).
  t = t.replace(/\\(?:mathrm|mathbf|text|textrm|operatorname)\{((?:[^{}]|\{[^{}]*\})*)\}/g, '$1')
  t = t.replace(/\\times/g, '\\cdot')
  t = t.replace(/\\dfrac|\\tfrac/g, '\\frac') // before \frac is rewritten
  t = t.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
  t = t.replace(/\^\{([A-Za-z0-9])\}/g, '^$1') // x^{2} → x^2
  t = t.replace(/(^|[^\\A-Za-z])\{([A-Za-z0-9])\}/g, '$1$2') // {x} → x, but not inside a command name
  t = t.replace(/\s+/g, '')
  return t.toLowerCase()
}

/** Greek letters folded to what a keyboard produces: ω → w, φ → phi… (both spellings then compare equal). */
const GREEK_FOLD: Record<string, string> = {
  α: 'alpha',
  β: 'beta',
  γ: 'gamma',
  δ: 'delta',
  ε: 'eps',
  ζ: 'zeta',
  η: 'eta',
  θ: 'theta',
  ι: 'iota',
  κ: 'kappa',
  λ: 'lambda',
  μ: 'mu',
  ν: 'nu',
  ξ: 'xi',
  π: 'pi',
  ρ: 'rho',
  σ: 'sigma',
  τ: 'tau',
  φ: 'phi',
  ϕ: 'phi',
  χ: 'chi',
  ψ: 'psi',
  ω: 'w',
  Δ: 'delta',
  Ω: 'w',
  Φ: 'phi',
  Γ: 'gamma',
  Λ: 'lambda',
  Θ: 'theta',
  Π: 'pi',
  Σ: 'sigma',
  Ψ: 'psi',
  Ξ: 'xi',
  ϵ: 'eps',
  ϑ: 'theta',
  ϖ: 'pi',
  ϱ: 'rho',
  ς: 'sigma',
  υ: 'upsilon',
  Υ: 'upsilon',
}
const GREEK_WORDS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  eps: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  iota: 'ι',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  xi: 'ξ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
}
const SUP_TO_ASCII: Record<string, string> = {
  '⁰': '0',
  '¹': '1',
  '²': '2',
  '³': '3',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
  '⁺': '+',
  '⁻': '-',
  '⁼': '=',
  '⁽': '(',
  '⁾': ')',
  ⁿ: 'n',
  ⁱ: 'i',
  ˣ: 'x',
  ᵗ: 't',
  ᵏ: 'k',
  ᵐ: 'm',
  ᵖ: 'p',
  ᵃ: 'a',
  ᵇ: 'b',
  ᶜ: 'c',
  ᵈ: 'd',
  ᵉ: 'e',
  ʲ: 'j',
  ᵒ: 'o',
  ʳ: 'r',
  ˢ: 's',
  ᵘ: 'u',
  ᵛ: 'v',
  ʸ: 'y',
  ᶻ: 'z',
  ᵀ: 't',
}
const SUB_TO_ASCII: Record<string, string> = {
  '₀': '0',
  '₁': '1',
  '₂': '2',
  '₃': '3',
  '₄': '4',
  '₅': '5',
  '₆': '6',
  '₇': '7',
  '₈': '8',
  '₉': '9',
  '₊': '+',
  '₋': '-',
  '₌': '=',
  '₍': '(',
  '₎': ')',
  ₐ: 'a',
  ₑ: 'e',
  ₕ: 'h',
  ᵢ: 'i',
  ⱼ: 'j',
  ₖ: 'k',
  ₗ: 'l',
  ₘ: 'm',
  ₙ: 'n',
  ₒ: 'o',
  ₚ: 'p',
  ᵣ: 'r',
  ₛ: 's',
  ₜ: 't',
  ᵤ: 'u',
  ᵥ: 'v',
  ₓ: 'x',
}

/** `^(…)` with balanced parentheses → `^…` : e^(j(ωt+φ)) and e^j(ωt+φ) meet. */
function unwrapExponents(t: string): string {
  let out = ''
  let i = 0
  while (i < t.length) {
    if (t[i] === '^' && t[i + 1] === '(') {
      let depth = 0
      let j = i + 1
      for (; j < t.length; j++) {
        if (t[j] === '(') depth++
        else if (t[j] === ')') {
          depth--
          if (depth === 0) break
        }
      }
      if (j < t.length) {
        out += '^' + t.slice(i + 2, j)
        i = j + 1
        continue
      }
    }
    out += t[i]
    i++
  }
  return out
}

/**
 * True when two formulas have the same canonical spelling. A typed answer
 * without `=` may give only one side of an expected equality: `U0 e^(jωt)`
 * fits `u(t) = U0 exp(jωt)` — the blank asked for the expression, the name
 * on the left is context.
 */
export function formulaEquals(input: string, expected: string): boolean {
  const a = canonicalMath(input)
  const b = canonicalMath(expected)
  if (!a || !b) return false
  if (a === b) return true
  if (!a.includes('=') && b.includes('=')) return b.split('=').some((side) => side === a)
  return false
}

/**
 * One canonical spelling for a formula, whether it was typed by hand
 * (`F = q1 q2 / (4 pi eps0 r^2)`) or stored in LaTeX (`$\vec{F} = \frac{q_1
 * q_2}{4\pi\varepsilon_0 r^2}$`): LaTeX is flattened to plain maths, Greek
 * letters spelled out become letters, sub/superscripts, products, spaces and
 * case are normalised, and parentheses that only group a product are dropped.
 * Signs, exponents, factors and the parentheses of sums are kept: `a/(b+c)`
 * still differs from `a/b+c`, and `-mc^2` from `mc^2`.
 */
export function canonicalMath(s: string): string {
  let t = s
    .trim()
    .replace(/^\$+|\$+$/g, '')
    .replace(/\\\(|\\\)|\\\[|\\\]/g, '')
  t = latexToPlain(t)
  // Hand-typed shortcuts.
  t = t.replace(/\b(alpha|beta|gamma|delta|epsilon|eps|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|phi|chi|psi|omega)(?=\d|\b)/gi, (m) => GREEK_WORDS[m.toLowerCase()] ?? m)
  t = t
    .replace(/\bsqrt\b/gi, '√')
    .replace(/\binf(?:ty|ini)?\b/gi, '∞')
    .replace(/->/g, '→')
    .replace(/<=/g, '≤')
    .replace(/>=/g, '≥')
    .replace(/!=/g, '≠')
  // Sub/superscripts back to a single ASCII form: x² → x^2, q₁ → q1 (indices are glued, like handwriting).
  t = t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁿⁱˣᵗᵏᵐᵖᵃᵇᶜᵈᵉʲᵒʳˢᵘᵛʸᶻᵀ]+/g, (m) => `^${[...m].map((c) => SUP_TO_ASCII[c] ?? c).join('')}`)
  t = t.replace(/[₀-₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+/g, (m) => [...m].map((c) => SUB_TO_ASCII[c] ?? c).join(''))
  t = t.replace(/_\(([^()]*)\)/g, '$1').replace(/_/g, '')
  // Products are implicit; minus signs and decimal commas in one form.
  t = t
    .replace(/[·×*]|\\cdot|\\times/g, '')
    .replace(/−/g, '-')
    .replace(/(\d),(\d)/g, '$1.$2')
  t = t.replace(/[{}\\]/g, '').replace(/\s+/g, '')
  // exp(x) and e^x are the same function; a parenthesised exponent loses its parentheses.
  t = t.replace(/exp\(/g, 'e^(')
  t = unwrapExponents(t)
  // Greek letters as typed on a keyboard, so that ω = w, φ = phi, λ = lambda (both sides fold alike).
  t = t.replace(/[\u0370-\u03ff\u1f00-\u1fff]/g, (c) => GREEK_FOLD[c] ?? c)
  // Parentheses that only group a product (no sum inside) are a matter of writing: (4πε0r^2) = 4πε0r^2.
  for (let i = 0; i < 4; i++) t = t.replace(/\(([^()+\-]*)\)/g, '$1')
  return t.toLowerCase()
}

export function looksLikeLatex(s: string): boolean {
  return /\$|\\[a-zA-Z]+|[_^]/.test(s)
}

/**
 * A formula is what the answer is when it carries math delimiters, a LaTeX
 * command or backslash, an `=`, `^` or `_`, a Greek letter, a digit glued to a
 * letter (2x, 10m) or a unit quotient (m/s), or when symbols outnumber letters
 * (2πr, 9,81 m/s²). When in doubt, formula: a wrong "text" verdict can put
 * "Bien" forward on a sign error, a wrong "formula" verdict only withholds the
 * suggestion. `F = ma (deuxième loi de Newton)` is therefore a formula.
 */
export function isFormula(answer: string): boolean {
  const s = answer.trim()
  if (!s) return false
  if (/\$|\\/.test(s)) return true
  if (/[=^_]/.test(s)) return true
  if (/[Ͱ-Ͽ]/.test(s)) return true // Greek, as Unicode (α, Δ, ω…)
  if (/\d\p{L}|\p{L}\d/u.test(s)) return true // 2x, 10m, x2
  if (/\p{L}\/\p{L}/u.test(s)) return true // m/s, J/K
  if (/[²³¹⁰-⁹½⅓¼]/.test(s)) return true
  const letters = (s.match(/\p{L}/gu) ?? []).length
  const symbols = (s.match(/[\d=+\-*/^_()[\]{}<>≤≥≈·×πΔ∑∫√°%,.]/g) ?? []).length
  return symbols > 0 && symbols >= letters
}

export interface TypedMatchOptions {
  /** The exercise tests a formula / theorem point or carries a "formule" tag: compare as a formula regardless of the text. */
  forceFormula?: boolean
}

export type Suggestion = 'good' | 'again' | null

export interface TypedMatch {
  /** Exact after normalisation. */
  exact: boolean
  /** Dice similarity on normalised text, 0–1. */
  score: number
  /** Which stored answer matched best. */
  best: string
  /** The expected answer is a formula: only an exact match may be suggested as right. */
  formula: boolean
  /** Exact once both spellings are canonicalised, although the raw texts differ (typed plain maths vs stored LaTeX). */
  equivalent?: boolean
  /** Button to put forward, or none when the comparison is inconclusive. */
  suggestion: Suggestion
  /** Character diff on the canonical maths (formulas only, when not exact). */
  charDiff?: DiffPart[]
}

/** Text: ≥ 0.85 → "Bien" suggested, < 0.6 → "Encore", in between no suggestion. Formulas: exact only. */
export const TEXT_ACCEPT = 0.85
export const TEXT_REJECT = 0.6

function trigrams(s: string): Set<string> {
  const padded = `  ${s} `
  const out = new Set<string>()
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3))
  return out
}

function dice(a: string, b: string): number {
  const ta = trigrams(a)
  const tb = trigrams(b)
  if (!ta.size || !tb.size) return a === b ? 1 : 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  return (2 * shared) / (ta.size + tb.size)
}

/**
 * Compares the input with each accepted answer, prose and LaTeX aware. A
 * formula is compared on its canonical spelling (canonicalMath), so plain
 * typing matches stored LaTeX; but a sign, exponent or factor error still
 * scores > 0.85 on trigrams, so similarity never puts "Bien" forward: exact
 * canonical match or nothing.
 */
export function typedMatch(input: string, answers: string[], options: TypedMatchOptions = {}): TypedMatch {
  const formula = !!options.forceFormula || answers.some(isFormula) || looksLikeLatex(input)
  let best: { exact: boolean; score: number; best: string; a: string; b: string; equivalent: boolean } = { exact: false, score: 0, best: answers[0] ?? '', a: '', b: '', equivalent: false }
  for (const answer of answers) {
    const a = formula ? canonicalMath(input) : normalizeText(input)
    const b = formula ? canonicalMath(answer) : normalizeText(answer)
    const exact = formula ? formulaEquals(input, answer) : !!a && a === b
    const score = exact ? 1 : dice(a, b)
    const equivalent = exact && formula && normalizeLatex(input) !== normalizeLatex(answer)
    if (exact || score > best.score) best = { exact, score, best: answer, a, b, equivalent }
    if (exact) break
  }
  let suggestion: Suggestion
  if (formula) suggestion = best.exact ? 'good' : null
  else suggestion = best.exact || best.score >= TEXT_ACCEPT ? 'good' : best.score < TEXT_REJECT ? 'again' : null
  const out: TypedMatch = { exact: best.exact, score: best.score, best: best.best, formula, suggestion }
  if (best.equivalent) out.equivalent = true
  if (formula && !best.exact) out.charDiff = charDiff(best.a, best.b)
  return out
}

export type DiffPart = { kind: 'same' | 'added' | 'missing'; text: string }

/** Character-level diff (LCS) between the typed and the expected canonical maths. */
export function charDiff(typed: string, expected: string): DiffPart[] {
  const a = [...typed]
  const b = [...expected]
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffPart[] = []
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.text += text
    else out.push({ kind, text })
  }
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      push('same', b[j])
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push('added', a[i++])
    else push('missing', b[j++])
  }
  while (i < m) push('added', a[i++])
  while (j < n) push('missing', b[j++])
  return out
}

/** Word-level diff (LCS) between what was typed and the expected answer. */
export function wordDiff(typed: string, expected: string): DiffPart[] {
  const a = typed.trim().split(/\s+/).filter(Boolean)
  const b = expected.trim().split(/\s+/).filter(Boolean)
  const norm = (w: string) => normalizeText(w)
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) dp[i][j] = norm(a[i]) === norm(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (norm(a[i]) === norm(b[j])) {
      out.push({ kind: 'same', text: b[j] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ kind: 'added', text: a[i] })
      i++
    } else {
      out.push({ kind: 'missing', text: b[j] })
      j++
    }
  }
  while (i < m) out.push({ kind: 'added', text: a[i++] })
  while (j < n) out.push({ kind: 'missing', text: b[j++] })
  return out
}
