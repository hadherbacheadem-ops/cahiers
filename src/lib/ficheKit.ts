// Rich fiches: a self-contained HTML document written by Claude, shown in a
// sandboxed iframe (opaque origin, no network). The app supplies what makes it
// look like the app: the theme tokens, the component kit (cards, callouts,
// demos…), KaTeX with its fonts inlined, and a script that reports the height.

import katexCss from 'katex/dist/katex.min.css?raw'
import interFont from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline'
import mainR from 'katex/dist/fonts/KaTeX_Main-Regular.woff2?inline'
import mainB from 'katex/dist/fonts/KaTeX_Main-Bold.woff2?inline'
import mainI from 'katex/dist/fonts/KaTeX_Main-Italic.woff2?inline'
import mainBI from 'katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline'
import mathI from 'katex/dist/fonts/KaTeX_Math-Italic.woff2?inline'
import mathBI from 'katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline'
import ams from 'katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline'
import size1 from 'katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline'
import size2 from 'katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline'
import sansR from 'katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline'
import calR from 'katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline'
import { renderTexWith } from './katexWorkerCore'

export { FICHE_TOKENS, collectTokens } from './ficheTokens'

const tokensCss = (t: Record<string, string>) => `:root{${Object.entries(t).map(([k, v]) => `${k}:${v}`).join(';')}}`

const fontFace = (family: string, src: string, style = 'normal', weight = '400') =>
  `@font-face{font-family:${family};font-style:${style};font-weight:${weight};src:url(${src}) format("woff2")}`

/** KaTeX's stylesheet with its font files replaced by the inlined ones (an opaque-origin document cannot fetch them). */
function katexCssInline(): string {
  const rules = katexCss.replace(/@font-face\{[^}]*\}/g, '')
  return (
    fontFace('KaTeX_Main', mainR) + fontFace('KaTeX_Main', mainB, 'normal', '700') + fontFace('KaTeX_Main', mainI, 'italic') +
    fontFace('KaTeX_Main', mainBI, 'italic', '700') + fontFace('KaTeX_Math', mathI, 'italic') + fontFace('KaTeX_Math', mathBI, 'italic', '700') +
    fontFace('KaTeX_AMS', ams) + fontFace('KaTeX_Size1', size1) + fontFace('KaTeX_Size2', size2) + fontFace('KaTeX_SansSerif', sansR) +
    fontFace('KaTeX_Caligraphic', calR) + rules
  )
}

const KIT_CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;overflow:hidden}
body{font-family:"Inter Variable",system-ui,-apple-system,"Segoe UI",sans-serif;font-size:16px;line-height:1.6;color:var(--text-1);background:transparent;-webkit-text-size-adjust:100%}
.fiche{padding:4px 0 8px}
.fiche h1{font-size:2rem;line-height:1.15;letter-spacing:-.02em;font-weight:750;margin:0 0 .35rem}
.fiche h2{font-size:1.45rem;line-height:1.2;letter-spacing:-.015em;font-weight:700;margin:2.2rem 0 .6rem}
.fiche h3{font-size:1.05rem;font-weight:650;margin:1.4rem 0 .4rem;color:var(--cahier-text)}
.fiche p{margin:.6rem 0}
.fiche .lead{color:var(--text-2);font-size:1.05rem;margin:.2rem 0 1.4rem}
.fiche strong{font-weight:650}
.fiche a{color:var(--accent-text)}
.fiche code{font-family:ui-monospace,"JetBrains Mono",Consolas,monospace;font-size:.9em;background:var(--surface-2);padding:.1em .35em;border-radius:6px}
.fiche ul,.fiche ol{padding-left:1.3rem;margin:.6rem 0}
.fiche li{margin:.25rem 0}
.fiche hr{border:0;border-top:1px solid var(--line);margin:1.6rem 0}

/* Section band: a full-width rule in the cahier colour, then the section. */
.section{margin:2.4rem 0 0;padding-top:1.6rem;border-top:4px solid var(--cahier)}
.section>h2:first-child{margin-top:0}

/* Cards */
.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));margin:1rem 0}
.card{background:color-mix(in oklab,var(--cahier) 16%,var(--surface-1));border:1px solid color-mix(in oklab,var(--cahier) 22%,var(--line));border-radius:var(--radius-lg);padding:14px 16px;box-shadow:var(--elev-1);min-width:0}
.card-title{display:block;font-size:.8rem;font-weight:650;letter-spacing:.01em;color:var(--cahier-text);margin-bottom:.35rem}
.card.wide{grid-column:1/-1}
.card>:last-child{margin-bottom:0}
.formula-card .math-display{margin:.2rem 0}
.math-display{display:block;text-align:center;margin:.9rem 0;overflow-x:auto;overflow-y:hidden;padding:.15rem 0;scrollbar-width:none}
.math-display::-webkit-scrollbar{display:none}
.math-display .katex{font-size:1.25em}
.katex-display{margin:0}

/* Callouts */
.callout{border-left:4px solid var(--cahier);background:var(--cahier-soft);border-radius:0 var(--radius-md) var(--radius-md) 0;padding:10px 14px;margin:1rem 0}
.callout>:first-child{margin-top:0}.callout>:last-child{margin-bottom:0}
.callout.key{border-color:var(--accent);background:var(--accent-soft)}
.callout.warn{border-color:var(--bad);background:var(--bad-soft)}
.callout .callout-title{display:block;font-weight:650;font-size:.85rem;margin-bottom:.2rem}

/* Tables */
.table-wrap{overflow-x:auto;margin:1rem 0;-webkit-overflow-scrolling:touch}
.fiche table{border-collapse:collapse;width:100%;font-size:.95rem}
.fiche th{text-align:left;font-weight:650;color:var(--text-2);font-size:.85rem;padding:8px 12px;border-bottom:1px solid var(--line-strong);white-space:nowrap}
.fiche td{padding:9px 12px;border-bottom:1px solid var(--line)}
.fiche tr:last-child td{border-bottom:0}
.tag{display:inline-block;font-weight:650;padding:0 .5em;border-radius:999px;font-size:.9em}
.tag.ok{color:var(--ok);background:var(--ok-soft)}
.tag.warn{color:var(--accent-text);background:var(--accent-soft)}
.tag.bad{color:var(--bad);background:var(--bad-soft)}
.tag.cahier{color:var(--cahier-text);background:var(--cahier-soft)}

/* Demos: collapsible proofs and worked examples */
details.demo{background:color-mix(in oklab,var(--ok) 10%,var(--surface-1));border:1px solid color-mix(in oklab,var(--ok) 26%,var(--line));border-radius:var(--radius-lg);margin:10px 0;overflow:hidden}
details.demo>summary{cursor:pointer;list-style:none;display:block;padding:12px 16px;font-weight:650;color:var(--ok);-webkit-tap-highlight-color:transparent;min-height:44px}
details.demo>summary::-webkit-details-marker{display:none}
details.demo>summary::before{content:"+";display:inline-block;text-align:center;width:1.2em;margin-right:.6em;font-size:1.3em;line-height:1;vertical-align:-.1em;transition:transform .2s ease}
details.demo[open]>summary::before{transform:rotate(45deg)}
details.demo>.demo-body{padding:2px 16px 14px;animation:demo-in .25s ease-out}
details.demo>.demo-body>:first-child{margin-top:.2rem}
@keyframes demo-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
details.demo.cahier{background:var(--cahier-soft);border-color:color-mix(in oklab,var(--cahier) 30%,var(--line))}
details.demo.cahier>summary{color:var(--cahier-text)}

/* Figures and live controls */
figure.figure{margin:1.2rem 0;padding:12px;background:var(--surface-1);border:1px solid var(--line);border-radius:var(--radius-lg)}
figure.figure svg{display:block;width:100%;height:auto}
figure.figure figcaption{color:var(--text-2);font-size:.88rem;margin-top:.4rem}
svg text{fill:var(--text-2);font-family:inherit;font-size:12px}
.controls{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;margin:.6rem 0 0}
.controls label{font-weight:600;font-size:.9rem}
.readout{font-weight:650;color:var(--cahier-text);font-variant-numeric:tabular-nums}
input[type=range]{flex:1 1 180px;min-width:140px;accent-color:var(--cahier);height:32px;-webkit-appearance:none;appearance:none;background:transparent}
input[type=range]::-webkit-slider-runnable-track{height:6px;border-radius:999px;background:var(--line-strong)}
input[type=range]::-moz-range-track{height:6px;border-radius:999px;background:var(--line-strong)}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;margin-top:-8px;border-radius:50%;background:var(--cahier);border:3px solid var(--surface-1);box-shadow:var(--elev-1)}
input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:var(--cahier);border:3px solid var(--surface-1)}
button.kit-btn{font:inherit;font-weight:600;color:var(--cahier-text);background:var(--cahier-soft);border:1px solid color-mix(in oklab,var(--cahier) 30%,var(--line));border-radius:var(--radius-md);padding:8px 14px;min-height:44px;cursor:pointer}
@media (max-width:520px){svg text{font-size:22px}.fiche h1{font-size:1.6rem}.fiche h2{font-size:1.25rem}.grid{gap:10px}}

/* ---- Layout: fluid on every width (container queries follow the iframe, not the screen) ---- */
.fiche{container-type:inline-size;max-width:66rem;margin-inline:auto}
.fiche h1{font-size:clamp(1.6rem,1.1rem + 2.6cqi,2.4rem)}
.fiche h2{font-size:clamp(1.25rem,1rem + 1.4cqi,1.6rem)}
.math-display .katex{font-size:clamp(1.05em,.9em + .9cqi,1.3em)}
@container (max-width:560px){
  .card{padding:12px 13px}
  .section{margin-top:1.8rem;padding-top:1.2rem}
  .fiche td,.fiche th{padding:8px 8px}
  .callout{padding:9px 12px}
  figure.figure{padding:8px}
}
@container (min-width:900px){.grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:16px}.card{padding:16px 20px}}

/* ---- Motion: entrance on scroll, hover, press. Opacity/transform only, so the layout never moves. ---- */
html.js .rv{opacity:0;translate:0 14px;scale:.985;transition:opacity .55s cubic-bezier(.2,.8,.2,1) var(--d,0ms),translate .55s cubic-bezier(.2,.8,.2,1) var(--d,0ms),scale .55s cubic-bezier(.2,.8,.2,1) var(--d,0ms),transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s ease,border-color .25s ease,background-color .25s ease}
html.js .rv.in{opacity:1;translate:0 0;scale:1}
html.js figure.figure .draw{stroke-dasharray:1;stroke-dashoffset:1}
html.js figure.figure.in .draw{animation:draw 1.4s cubic-bezier(.4,0,.2,1) .15s forwards}
@keyframes draw{to{stroke-dashoffset:0}}
.card,.callout,details.demo,figure.figure,.tag,button.kit-btn{transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s ease,border-color .25s ease,background-color .25s ease}
.card .math-display .katex{transition:transform .3s cubic-bezier(.34,1.4,.64,1)}
.fiche tbody tr{transition:background-color .2s ease}
details.demo>summary{transition:background-color .2s ease}
input[type=range]::-webkit-slider-thumb{transition:transform .15s ease,box-shadow .2s ease}
@media (hover:hover){
  .card:hover{transform:translateY(-3px);border-color:color-mix(in oklab,var(--cahier) 55%,var(--line));box-shadow:var(--elev-2),0 0 0 3px color-mix(in oklab,var(--cahier) 14%,transparent)}
  .card:hover .math-display .katex{transform:scale(1.04)}
  .callout:hover{transform:translateX(3px)}
  figure.figure:hover{border-color:color-mix(in oklab,var(--cahier) 40%,var(--line));box-shadow:var(--elev-2)}
  .fiche tbody tr:hover{background:var(--cahier-soft)}
  details.demo>summary:hover{background:color-mix(in oklab,currentColor 8%,transparent)}
  details.demo:hover{border-color:color-mix(in oklab,var(--ok) 45%,var(--line))}
  details.demo.cahier:hover{border-color:color-mix(in oklab,var(--cahier) 55%,var(--line))}
  .tag:hover{transform:scale(1.08)}
  button.kit-btn:hover{background:color-mix(in oklab,var(--cahier) 26%,transparent);transform:translateY(-1px)}
  input[type=range]:hover::-webkit-slider-thumb{transform:scale(1.15)}
}
.card:active,button.kit-btn:active,details.demo>summary:active{transform:scale(.98)}
input[type=range]:active::-webkit-slider-thumb{transform:scale(1.25);box-shadow:0 0 0 6px color-mix(in oklab,var(--cahier) 22%,transparent)}
.fiche :focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.readout{display:inline-block;transition:transform .2s cubic-bezier(.34,1.4,.64,1)}
.readout.bump{transform:scale(1.08)}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}html.js .rv{opacity:1!important;translate:none!important;scale:none!important}html.js figure.figure .draw{stroke-dashoffset:0!important}}
`

// Reports the height to the app (no inner scroll) and applies theme updates.
const KIT_JS = `
(function(){
  var last=-1;
  function send(){var h=Math.ceil(document.body.getBoundingClientRect().height);if(h!==last){last=h;parent.postMessage({type:'cahiers-fiche-height',height:h},'*')}}
  new ResizeObserver(send).observe(document.body);
  window.addEventListener('load',send);
  window.addEventListener('message',function(e){
    var d=e.data;if(!d||d.type!=='cahiers-fiche-theme')return;
    var s=document.documentElement.style;
    for(var k in d.tokens){if(k==='color-scheme')s.colorScheme=d.tokens[k];else s.setProperty(k,d.tokens[k])}
    send();
  });
  send();

  // Entrance on scroll. The iframe is as tall as the fiche, so the app tells us which part of it is on screen.
  var root=document.documentElement;root.classList.add('js');
  var els=[].slice.call(document.querySelectorAll('.fiche h1,.fiche .lead,.section>h2,.section>p,.fiche>p,.card,.callout,figure.figure,.table-wrap,details.demo'));
  els.forEach(function(el){el.classList.add('rv');var n=[].indexOf.call(el.parentNode.children,el);el.style.setProperty('--d',(n%5)*70+'ms')});
  var view={top:0,bottom:innerHeight||800},told=false;
  function reveal(){els.forEach(function(el){if(el.classList.contains('in'))return;var r=el.getBoundingClientRect();if(r.top<view.bottom-24)el.classList.add('in')})}
  window.addEventListener('message',function(e){var d=e.data;if(!d||d.type!=='cahiers-fiche-view')return;told=true;view={top:d.top,bottom:d.bottom};reveal()});
  requestAnimationFrame(reveal);
  setTimeout(function(){if(!told){view={top:-1e9,bottom:1e9};reveal()}},2500);
  new MutationObserver(function(){requestAnimationFrame(reveal)}).observe(document.body,{childList:true,subtree:true});
})();
`

const CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data:; img-src data:"

function decode(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** Replaces `$$…$$` and `$…$` in the fiche's HTML by rendered KaTeX (scripts and styles are left alone). */
export function renderMathInHtml(html: string, render: (tex: string, display: boolean) => string): string {
  const keep: string[] = []
  const masked = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, (m) => {
    keep.push(m)
    return `@@KEEP${keep.length - 1}@@`
  })
  let out = masked.replace(/\$\$([\s\S]+?)\$\$/g, (_, t: string) => `<span class="math-display">${render(decode(t), true)}</span>`)
  out = out.replace(/(?<![\\$])\$(?![\s$])([^$\n]+?)(?<!\s)\$/g, (_, t: string) => render(decode(t), false))
  return out.replace(/@@KEEP(\d+)@@/g, (_, i: string) => keep[Number(i)])
}

/** The full document for `srcdoc`: tokens, KaTeX, kit, the fiche's body, the height reporter. */
export async function buildFicheDoc(body: string, tokens: Record<string, string>): Promise<string> {
  const [{ default: katex }] = await Promise.all([import('katex'), import('katex/contrib/mhchem')])
  const rendered = renderMathInHtml(body, (tex, display) => renderTexWith(katex, tex, display))
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<style>${fontFace('"Inter Variable"', interFont, 'normal', '100 900')}${tokensCss(tokens)}${katexCssInline()}${KIT_CSS}</style></head>
<body><div class="fiche">${rendered}</div><script>${KIT_JS}</script></body></html>`
}
