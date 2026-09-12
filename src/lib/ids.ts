export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'x'.repeat(24).replace(/x/g, () => Math.floor(Math.random() * 16).toString(16))
}
