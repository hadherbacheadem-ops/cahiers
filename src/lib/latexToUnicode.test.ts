import { describe, expect, it } from 'vitest'
import { formulasOf, latexToUnicode } from './latexToUnicode'

describe('latexToUnicode', () => {
  const ok: [string, string][] = [
    ['E = mc^2', 'E = mc²'],
    ['\\nabla \\cdot \\vec{E} = \\rho / \\varepsilon_0', '∇·E⃗ = ρ/ε₀'],
    ['\\oint \\vec{B} \\cdot d\\vec{l} = \\mu_0 I', '∮ B⃗·dl⃗ = μ₀ I'],
    ['\\Delta G = \\Delta H - T \\Delta S', 'ΔG = ΔH − T ΔS'],
    ['\\sum 1/n^2 = \\pi^2/6', '∑ 1/n² = π²/6'],
    ['\\frac{1}{2} m v^2', '1/2 m v²'],
    ['\\dfrac{q}{4\\pi\\varepsilon_0 r^2}', 'q/(4πε₀ r²)'],
    ['x_{ij}', 'xᵢⱼ'],
    ['e^{i\\pi} + 1 = 0', 'e^(iπ) + 1 = 0'],
    ['\\sqrt{2gh}', '√(2gh)'],
    ['\\sqrt{x}', '√x'],
    ['T_0 = 2\\pi\\sqrt{m/k}', 'T₀ = 2π√(m/k)'],
    ['\\partial^2 u / \\partial t^2', '∂² u/∂t²'],
    ['\\frac{\\partial^2 u}{\\partial t^2} + \\omega^2 u = 0', '(∂² u)/(∂t²) + ω² u = 0'],
    ['x^{abc}', 'x^(abc)'],
    ['\\Delta_r H^\\circ = -92', 'Δᵣ H° = −92'],
    ['E_c = \\frac{1}{2} m v^2', 'Ec = 1/2 m v²'],
    ['a \\leq b \\neq c', 'a ≤ b ≠ c'],
    ['\\mathrm{m\\cdot s^{-1}}', 'm·s⁻¹'],
    ['\\ce{2H2 + O2 -> 2H2O}', '2H₂ + O₂ → 2H₂O'],
    ['\\ce{H3O+}', 'H₃O⁺'],
    ['\\hat{H}\\psi = E\\psi', 'Ĥψ = Eψ'],
    ['\\vec{F} = m\\vec{a}', 'F⃗ = ma⃗'],
    ['\\left( x + y \\right)^2', '( x + y )²'],
  ]
  for (const [latex, expected] of ok) {
    it(`converts ${latex}`, () => {
      expect(latexToUnicode(latex)).toBe(expected)
    })
  }

  const rejected = [
    '\\frac{a + b + c + d + e}{f}', // numerator too long to write inline
    '\\begin{cases} a & b \\\\ c & d \\end{cases}', // unknown command
    '\\underbrace{a+b}_{n}', // unknown command
    'x^{abcdef}', // 6-character exponent
    '\\int_0^{+\\infty} e^{-x^2}\\,\\mathrm{d}x = \\frac{\\sqrt{\\pi}}{2} \\text{ pour tout } x', // too long
  ]
  for (const latex of rejected) {
    it(`rejects ${latex.slice(0, 30)}`, () => {
      expect(latexToUnicode(latex)).toBeNull()
    })
  }

  it('keeps the result under 28 characters and never leaks braces or backslashes', () => {
    expect(latexToUnicode('a'.repeat(30))).toBeNull()
    expect(latexToUnicode('\\vec{ab}')).toBeNull()
    expect(latexToUnicode('{')).toBeNull()
  })
})

describe('formulasOf', () => {
  it('extracts inline formulas of a fiche, converted and deduplicated, and skips prose-only maths', () => {
    const fiche = 'Le champ vaut $\\vec{E} = \\dfrac{q}{4\\pi\\varepsilon_0 r^2}$ ; $E = mc^2$ et encore $E = mc^2$. Bloc : $$\\int_0^1 x$$. Prix : 5 $ ou 6 $. Texte $x$ seul.'
    expect(formulasOf(fiche)).toEqual(['E⃗ = q/(4πε₀ r²)', 'E = mc²'])
  })
})
