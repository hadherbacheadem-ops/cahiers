// Generic equations for the background field, written directly in Unicode
// (physics, chemistry, maths of prépa). `weight` is a frequency: the most
// beautiful ones come back more often. Never rendered with KaTeX.

export interface Equation {
  text: string
  weight: number
}

export const GENERIC_EQUATIONS: Equation[] = [
  { text: 'e^(iπ) + 1 = 0', weight: 5 },
  { text: '∇·E = ρ/ε₀', weight: 4 },
  { text: '∇·B = 0', weight: 3 },
  { text: '∇×E = −∂B/∂t', weight: 4 },
  { text: '∮ B·dl = μ₀ I', weight: 4 },
  { text: '∮ E·dS = Q/ε₀', weight: 3 },
  { text: 'E = mc²', weight: 5 },
  { text: 'F = ma', weight: 3 },
  { text: 'F = G m₁m₂/r²', weight: 3 },
  { text: 'F = q(E + v×B)', weight: 3 },
  { text: 'ΔG = ΔH − TΔS', weight: 4 },
  { text: 'dS ≥ δQ/T', weight: 4 },
  { text: 'dU = δQ + δW', weight: 3 },
  { text: 'pV = nRT', weight: 4 },
  { text: 'S = k ln Ω', weight: 5 },
  { text: 'ΔrG° = −RT ln K°', weight: 3 },
  { text: 'k = A e^(−Ea/RT)', weight: 3 },
  { text: 'pH = pKa + log([A⁻]/[AH])', weight: 2 },
  { text: 'E = E° + (0,06/n) log Q', weight: 2 },
  { text: '∑ 1/n² = π²/6', weight: 5 },
  { text: '∑ 1/n! = e', weight: 3 },
  { text: '∫₀^∞ e^(−x²) dx = √π/2', weight: 4 },
  { text: '∫ f′g = [fg] − ∫ fg′', weight: 3 },
  { text: 'ψ(x,t)', weight: 3 },
  { text: 'iℏ ∂ψ/∂t = Ĥψ', weight: 5 },
  { text: 'Δx·Δp ≥ ℏ/2', weight: 4 },
  { text: 'E = hν', weight: 4 },
  { text: 'λ = h/p', weight: 3 },
  { text: '∂²u/∂t² = c²∇²u', weight: 4 },
  { text: '∇²φ = 0', weight: 3 },
  { text: 'x″ + ω₀²x = 0', weight: 3 },
  { text: 'T₀ = 2π√(m/k)', weight: 3 },
  { text: 'T = 2π√(l/g)', weight: 3 },
  { text: 'v = dx/dt', weight: 2 },
  { text: 'a = v²/R', weight: 2 },
  { text: 'Ec = ½ m v²', weight: 3 },
  { text: 'Ep = mgz', weight: 2 },
  { text: 'P = U I', weight: 2 },
  { text: 'U = R I', weight: 2 },
  { text: 'τ = RC', weight: 2 },
  { text: 'ω₀ = 1/√(LC)', weight: 3 },
  { text: 'Q = ω₀/Δω', weight: 2 },
  { text: 'n₁ sin i₁ = n₂ sin i₂', weight: 3 },
  { text: '1/f′ = 1/OA′ − 1/OA', weight: 2 },
  { text: 'c = 1/√(ε₀μ₀)', weight: 3 },
  { text: 'I = I₀ cos²θ', weight: 2 },
  { text: 'δ = λ D/a', weight: 2 },
  { text: 'PV^γ = cte', weight: 3 },
  { text: 'η = 1 − Tf/Tc', weight: 3 },
  { text: 'C = ε₀S/e', weight: 2 },
  { text: 'W = ½ C U²', weight: 2 },
  { text: 'B = μ₀ n I', weight: 2 },
  { text: 'e = −dΦ/dt', weight: 4 },
  { text: 'ℒ = T − V', weight: 3 },
  { text: 'd/dt(∂ℒ/∂q̇) = ∂ℒ/∂q', weight: 3 },
  { text: 'H = T + V', weight: 2 },
  { text: 'det(A − λI) = 0', weight: 3 },
  { text: 'A = PDP⁻¹', weight: 2 },
  { text: 'tr(AB) = tr(BA)', weight: 2 },
  { text: '⟨u, v⟩ = ‖u‖ ‖v‖ cos θ', weight: 3 },
  { text: '|⟨u,v⟩| ≤ ‖u‖·‖v‖', weight: 3 },
  { text: 'f(x) = ∑ aₙ xⁿ', weight: 3 },
  { text: 'eˣ = ∑ xⁿ/n!', weight: 4 },
  { text: 'cos²θ + sin²θ = 1', weight: 2 },
  { text: 'e^(iθ) = cos θ + i sin θ', weight: 4 },
  { text: 'lim (1 + 1/n)ⁿ = e', weight: 3 },
  { text: 'n! ∼ √(2πn) (n/e)ⁿ', weight: 4 },
  { text: '∫ₐᵇ f = F(b) − F(a)', weight: 2 },
  { text: 'P(A|B) = P(A∩B)/P(B)', weight: 3 },
  { text: 'E[X] = ∑ xᵢ pᵢ', weight: 2 },
  { text: 'V(X) = E[X²] − E[X]²', weight: 3 },
  { text: 'ζ(s) = ∑ n⁻ˢ', weight: 3 },
  { text: 'Γ(n+1) = n!', weight: 2 },
  { text: 'a² + b² = c²', weight: 2 },
  { text: '∀ε>0 ∃η>0', weight: 3 },
  { text: 'f′(x) = lim Δf/Δx', weight: 2 },
  { text: 'div(rot A) = 0', weight: 2 },
  { text: 'rot(grad f) = 0', weight: 2 },
  { text: 'Δf = div(grad f)', weight: 2 },
  { text: 'φ = (1 + √5)/2', weight: 3 },
  { text: 'N(t) = N₀ e^(−λt)', weight: 3 },
  { text: 't₁/₂ = ln 2 / λ', weight: 2 },
  { text: 'M = ε₀ c² ?', weight: 0 },
].filter((e) => e.weight > 0)

/** Picks a text from a weighted list with a [0,1) random value. */
export function pickWeighted(list: Equation[], u: number): string {
  const total = list.reduce((s, e) => s + e.weight, 0)
  let r = u * total
  for (const e of list) {
    r -= e.weight
    if (r < 0) return e.text
  }
  return list[list.length - 1]?.text ?? ''
}
