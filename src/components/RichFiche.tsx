import { useEffect, useRef, useState } from 'react'
import { collectTokens } from '../lib/ficheTokens'

/**
 * A fiche written as HTML, in a sandboxed iframe: scripts run (demos, sliders) but the
 * document has an opaque origin, no network and no access to the app's data. The
 * app's theme is copied in and follows theme / cahier-colour changes.
 */
export function RichFiche({ html, accent, title }: { html: string; accent?: string; title: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [doc, setDoc] = useState<string>()
  const [height, setHeight] = useState(400)

  useEffect(() => {
    let cancelled = false
    const tokens = collectTokens(wrapRef.current!)
    // The kit (KaTeX + its fonts) is a separate chunk: only fiches that are HTML pay for it.
    void import('../lib/ficheKit').then((kit) => kit.buildFicheDoc(html, tokens)).then((d) => {
      if (!cancelled) setDoc(d)
    })
    return () => {
      cancelled = true
    }
    // The document is rebuilt only when the fiche changes; theme changes are posted to the live iframe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return
      const d = e.data as { type?: string; height?: number } | null
      if (d?.type === 'cahiers-fiche-height' && typeof d.height === 'number') setHeight(d.height)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // Tells the iframe which part of itself is on screen (drives the entrance animations).
  useEffect(() => {
    let raf = 0
    const send = () => {
      raf = 0
      const frame = frameRef.current
      if (!frame) return
      const top = -frame.getBoundingClientRect().top
      frame.contentWindow?.postMessage({ type: 'cahiers-fiche-view', top, bottom: top + window.innerHeight }, '*')
    }
    const queue = () => {
      if (!raf) raf = requestAnimationFrame(send)
    }
    window.addEventListener('scroll', queue, { capture: true, passive: true })
    window.addEventListener('resize', queue)
    const frame = frameRef.current
    frame?.addEventListener('load', queue)
    queue()
    return () => {
      window.removeEventListener('scroll', queue, true)
      window.removeEventListener('resize', queue)
      frame?.removeEventListener('load', queue)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [doc, height])

  useEffect(() => {
    const push = () => {
      if (!wrapRef.current) return
      frameRef.current?.contentWindow?.postMessage({ type: 'cahiers-fiche-theme', tokens: collectTokens(wrapRef.current) }, '*')
    }
    const observer = new MutationObserver(() => requestAnimationFrame(push))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    push()
    return () => observer.disconnect()
  }, [accent, doc])

  return (
    <div ref={wrapRef} style={
        accent
          ? ({
              '--cahier': accent,
              '--cahier-soft': `color-mix(in oklab, ${accent} 16%, transparent)`,
              '--cahier-text': `color-mix(in oklab, ${accent} 60%, var(--text-1))`,
            } as React.CSSProperties)
          : undefined
      }>
      {doc && <iframe ref={frameRef} title={title} sandbox="allow-scripts" srcDoc={doc} scrolling="no" className="block w-full border-0" style={{ height }} />}
    </div>
  )
}
