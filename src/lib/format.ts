const DAY = 86_400_000

const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const fullDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

export function formatDate(ts: number): string {
  const now = Date.now()
  if (now - ts < DAY && new Date(ts).getDate() === new Date(now).getDate()) return "aujourd'hui"
  if (now - ts < 2 * DAY) return 'hier'
  return shortDate.format(ts)
}

export function formatFullDate(ts: number): string {
  return fullDate.format(ts)
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function formatChars(n: number): string {
  if (n < 1000) return `${n} caractères`
  return `${(n / 1000).toFixed(1).replace('.', ',')} k caractères`
}

/** Number of consecutive days (ending today or yesterday) with at least one attempt. */
export function computeStreak(timestamps: number[], now = Date.now()): number {
  const days = new Set(timestamps.map((t) => Math.floor((t - tzOffset(t)) / DAY)))
  let day = Math.floor((now - tzOffset(now)) / DAY)
  if (!days.has(day)) day -= 1
  let streak = 0
  while (days.has(day)) {
    streak++
    day--
  }
  return streak
}

function tzOffset(ts: number) {
  return new Date(ts).getTimezoneOffset() * 60_000
}
