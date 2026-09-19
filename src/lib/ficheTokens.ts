// Theme tokens copied into a rich fiche's iframe (kept apart from ficheKit so the page does not load KaTeX for them).

/** Tokens copied into the iframe: everything the kit (and a fiche's own CSS) may use. */
export const FICHE_TOKENS = [
  '--bg-0', '--bg-1', '--surface-1', '--surface-2', '--surface-3',
  '--text-1', '--text-2', '--text-3', '--line', '--line-strong',
  '--accent', '--accent-text', '--accent-soft', '--ok', '--ok-soft', '--bad', '--bad-soft',
  '--cahier', '--cahier-soft', '--cahier-text',
  '--radius-sm', '--radius-md', '--radius-lg', '--elev-1', '--elev-2',
] as const

/** Reads the current values of the tokens on `el` (the cahier colour lives on a wrapper). */
export function collectTokens(el: Element): Record<string, string> {
  const cs = getComputedStyle(el)
  const out: Record<string, string> = {}
  for (const name of FICHE_TOKENS) out[name] = cs.getPropertyValue(name).trim()
  out['color-scheme'] = cs.colorScheme || 'normal'
  return out
}
