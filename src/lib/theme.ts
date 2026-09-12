import type { Settings } from '../types'

const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
let current: Settings['theme'] = 'auto'

/** Colour of the system bars (status bar, title bar of the installed app): --bg-0 of each theme. */
export const THEME_COLORS = { dark: '#0b1220', light: '#f2ede4' } as const

export function applyTheme(theme: Settings['theme']) {
  current = theme
  const dark = theme === 'dark' || (theme === 'auto' && !!mq?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  // Two <meta theme-color> with media queries serve the automatic theme; a forced theme overrides both.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (theme === 'auto') meta.content = meta.media.includes('dark') ? THEME_COLORS.dark : THEME_COLORS.light
    else meta.content = dark ? THEME_COLORS.dark : THEME_COLORS.light
  }
}

mq?.addEventListener('change', () => {
  if (current === 'auto') applyTheme('auto')
})
