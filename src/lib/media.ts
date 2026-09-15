// Media queries as React state, plus the few environment tests the mobile
// patterns hinge on (phone-sized viewport, installed app, touch screen).

import { useSyncExternalStore } from 'react'

const lists = new Map<string, MediaQueryList>()

function list(query: string): MediaQueryList {
  let m = lists.get(query)
  if (!m) {
    m = window.matchMedia(query)
    lists.set(query, m)
  }
  return m
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const m = list(query)
      m.addEventListener('change', onChange)
      return () => m.removeEventListener('change', onChange)
    },
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? list(query).matches : false),
    () => false,
  )
}

/** Phone-sized viewport (Tailwind's `sm` breakpoint): bottom sheets, toolbars above the keyboard. */
export const PHONE_QUERY = '(max-width: 639px)'

export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY)
}

export function isPhone(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches
}

export function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
}

/** Installed to the home screen (no browser chrome): popups are unreliable there, so auth uses redirects. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
}
