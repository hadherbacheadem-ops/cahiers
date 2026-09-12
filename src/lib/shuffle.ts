export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Shuffles until the order differs from the input (when that is possible). */
export function shuffleDistinct<T>(arr: readonly T[]): T[] {
  if (arr.length < 2) return arr.slice()
  for (let tries = 0; tries < 10; tries++) {
    const s = shuffle(arr)
    if (s.some((v, i) => v !== arr[i])) return s
  }
  return shuffle(arr)
}

export function sample<T>(arr: readonly T[], n: number): T[] {
  return shuffle(arr).slice(0, n)
}
