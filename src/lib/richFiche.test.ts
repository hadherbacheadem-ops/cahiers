import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { buildRichFichePrompt, cleanFicheHtml, parseRichFicheResponse } from './richFiche'
import { SAMPLE_FICHE } from './ficheSample'
import { renderMathInHtml } from './ficheKit'
import { renderTexWith } from './katexWorkerCore'

const BODY = `<h1>Les ondes</h1><p class="lead">Chapô</p><div class="section"><h2>Définitions</h2><p>Une onde transporte de l'énergie sans transport de matière, sur une distance donnée.</p></div>`

describe('parseRichFicheResponse', () => {
  it('reads the fenced html block and takes the title from the h1', () => {
    const r = parseRichFicheResponse('Voici la fiche :\n```html\n' + BODY + '\n```\nBon courage !')
    expect(r.fiches).toHaveLength(1)
    expect(r.fiches[0].title).toBe('Les ondes')
    expect(r.fiches[0].html).toContain('class="section"')
    expect(r.rejected).toEqual([])
  })

  it('accepts an answer without fence', () => {
    expect(parseRichFicheResponse(BODY).fiches[0].title).toBe('Les ondes')
  })

  it('rejects an answer with no html, and a block that is nearly empty', () => {
    expect(() => parseRichFicheResponse('Désolé, je ne peux pas.')).toThrow(/bloc HTML/)
    const r = parseRichFicheResponse('```html\n<h1>x</h1>\n```')
    expect(r.fiches).toEqual([])
    expect(r.rejected[0].reason).toMatch(/court/)
  })

  it('reads one fiche per block', () => {
    const r = parseRichFicheResponse('```html\n' + BODY + '\n```\n```html\n' + BODY.replace('ondes', 'sons') + '\n```')
    expect(r.fiches.map((f) => f.title)).toEqual(['Les ondes', 'Les sons'])
  })

  it('parses the sample fiche the prompt shows', () => {
    const r = parseRichFicheResponse('```html' + SAMPLE_FICHE + '```')
    expect(r.fiches[0].title).toBe('Mécanique céleste')
    expect(r.fiches[0].html).toContain('<script>')
  })
})

describe('cleanFicheHtml', () => {
  it('unwraps a full document, keeps head styles, drops every way out', () => {
    const raw = `<!doctype html><html><head><title>Titre du head</title><meta charset="utf-8"><link rel="stylesheet" href="https://x/y.css">
      <style>@import url(https://x/z.css); .a{color:red}</style></head><body><h1>Autre</h1><script src="https://cdn/x.js"></script><iframe src="https://x"></iframe><p>Texte</p><script>var a=1</script></body></html>`
    const { title, html } = cleanFicheHtml(raw)
    expect(title).toBe('Titre du head')
    expect(html).toContain('.a{color:red}')
    expect(html).not.toMatch(/@import|<link|<meta|<iframe|<html|<body|src=/)
    expect(html).toContain('<script>var a=1</script>')
  })
})

describe('buildRichFichePrompt', () => {
  const prompt = buildRichFichePrompt({ cahierName: 'Physique', sources: [{ label: 'Cours', content: 'Le cours du prof.' }], split: 'one', programme: 'Programme X', niveau: 'PCSI', instructions: 'Insiste sur les démos' })
  it('carries the kit vocabulary, the rules, the example and the sources', () => {
    for (const cls of ['formula-card', 'callout key', 'details class="demo"', 'table-wrap', 'figure class="figure"', 'kit-btn']) expect(prompt).toContain(cls)
    expect(prompt).toContain('```html')
    expect(prompt).toContain('\\lt')
    expect(prompt).toContain('Le cours du prof.')
    expect(prompt).toContain('Programme X')
    expect(prompt).toContain('PCSI')
    expect(prompt).toContain('Insiste sur les démos')
    expect(prompt).toContain('Mécanique céleste')
  })
})

describe('renderMathInHtml', () => {
  const render = (tex: string, display: boolean) => renderTexWith(katex, tex, display)
  it('renders inline and display formulas, leaves scripts and prices alone', () => {
    const out = renderMathInHtml('<p>Soit $x^2$ et $$y = \\dfrac{a}{b}$$ pour 5 $ ou 6 $.</p><script>var s = "$a$";</script>', render)
    expect(out.match(/class="katex"/g)).toHaveLength(2)
    expect(out).toContain('class="math-display"')
    expect(out).toContain('var s = "$a$";')
    expect(out).toContain('pour 5 $ ou 6 $.')
  })
  it('renders \\lt and \\gt', () => {
    expect(renderMathInHtml('<p>$a \\lt b$</p>', render)).toContain('katex-html')
  })
  it('renders every formula of the sample without error', () => {
    const out = renderMathInHtml(SAMPLE_FICHE, render)
    expect(out).not.toContain('katex-error')
    expect(out).not.toMatch(/\$\$/)
  })
})
