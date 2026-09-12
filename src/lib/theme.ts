import type { Settings } from '../types'

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
let current: Settings['theme'] = 'auto'

export function applyTheme(theme: Settings['theme']) {
  current = theme
  const dark = theme === 'dark' || (theme === 'auto' && !!mq?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
}

mq?.addEventListener('change', () => {
  if (current === 'auto') applyTheme('auto')
})
