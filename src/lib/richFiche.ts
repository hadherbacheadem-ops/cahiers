// Rich fiches: the prompt that asks Claude for a fiche written as HTML (using the
// app's component kit, see ficheKit.ts) and the parser of its answer. The HTML is
// shown in a sandboxed iframe (components/RichFiche.tsx); the text that exercises,
// coverage and the mind map work from is derived from it (htmlToText) when the fiche is saved.

import { LATEX_RULE, photoSourceRule, type FichePromptInput } from './prompt'
import { SAMPLE_FICHE } from './ficheSample'

/** What Claude may use. Keep in step with KIT_CSS in ficheKit.ts. */
export const RICH_KIT_GUIDE = `Composants fournis par l'application (classes CSS, déjà stylées aux couleurs de l'app, du cahier, en clair comme en sombre) :
- \`<h1>\` : le titre, une seule fois, en tête. \`<p class="lead">\` : chapô d'une ligne sous le titre.
- \`<div class="section">\` : une grande partie (filet coloré en haut). Elle commence par un \`<h2>\`. \`<h3>\` pour une sous-partie.
- \`<div class="grid">\` de \`<div class="card formula-card"><span class="card-title">Nom de la formule</span>$$…$$</div>\` : les formules et résultats clés, une carte chacun. \`card wide\` : carte pleine largeur. \`<div class="card">\` avec du texte : une définition courte.
- \`<div class="callout">\` : encadré de la couleur du cahier ; \`callout key\` : à retenir (ambre) ; \`callout warn\` : piège, erreur classique (rouge). Titre optionnel : \`<span class="callout-title">\`.
- Tableau : \`<div class="table-wrap"><table><thead>…</thead><tbody>…</tbody></table></div>\`. Pastilles dans une cellule : \`<span class="tag ok">\`, \`tag warn\`, \`tag bad\`, \`tag cahier\`.
- Démonstrations, exemples résolus, corrigés : \`<details class="demo"><summary>Titre</summary><div class="demo-body">…</div></details>\` (\`demo cahier\` : variante à la couleur du cahier).
- Schéma : \`<figure class="figure"><svg viewBox="0 0 640 300">…</svg><figcaption>…</figcaption></figure>\`. Dans le SVG : uniquement des \`var(--…)\` pour les couleurs, du \`<text>\` pour les légendes ; \`class="draw" pathLength="1"\` sur un tracé pour qu'il se dessine à l'apparition.
- Démo interactive : dans la figure, \`<div class="controls"><label for="x">…</label><input id="x" type="range" min max step value><span class="readout" id="out"></span></div>\`, \`<button class="kit-btn">\` pour un bouton.
Variables de couleur utilisables (jamais de couleur en dur, jamais de police) : --text-1, --text-2, --text-3, --surface-1, --surface-2, --line, --cahier, --cahier-text, --cahier-soft, --accent, --accent-text, --ok, --bad.`

export const RICH_RULES = `- Réponds avec UN SEUL bloc de code \`\`\`html contenant uniquement le contenu de la fiche (pas de <html>, <head> ni <body>). Rien d'autre que ce bloc dans la réponse.
- Aucune ressource externe : ni CDN, ni police, ni image par URL, ni feuille de style liée, ni script externe. Le CSS et le JavaScript sont ceux de l'application.
- Le JavaScript sert uniquement aux démos interactives : un seul \`<script>\` à la fin, sans bibliothèque, dans une fonction anonyme, ids uniques, pas de réseau ni de stockage. La fiche doit rester compréhensible sans lui (le texte dit la même chose que la démo).
- Formules en LaTeX dans le HTML : \`$…$\` en ligne, \`$$…$$\` en bloc, jamais d'entité ; écris \\lt et \\gt au lieu des signes < et > dans les formules. Le rendu est fait par l'application.
- Hors formules, échappe < > & comme en HTML normal.`

const RICH_EXAMPLE_INTRO = `Exemple de fiche (physique, mécanique céleste) montrant le niveau de finition et de vie attendu. Reprends le vocabulaire des composants, pas le contenu :`

/** Rich version of the fiche prompt: same sources and content rules, HTML output in the app's kit. */
export function buildRichFichePrompt(input: FichePromptInput): string {
  const hasProgramme = !!input.programme?.trim()
  const photos = input.photos ?? 0
  const textSources = input.sources.map((s, i) => `### Source ${i + 1} — ${s.label.trim() || 'Sans titre'}\n<<<\n${s.content.trim()}\n>>>`).join('\n\n')
  const sources = photos ? [`### Photos jointes (${photos})\nVoir les images de ce message : à transcrire d'abord (règle 0).`, textSources].filter(Boolean).join('\n\n') : textSources
  const niveau = input.niveau?.trim() ? `\n- Niveau de l'élève : ${input.niveau.trim()}` : ''
  const consignes = input.instructions?.trim() ? `\n- Consignes de l'élève : ${input.instructions.trim()}` : ''

  return `Tu es un professeur qui rédige des fiches de révision à partir du cours et des notes d'un élève. La fiche sera affichée dans une application de révision comme une page web soignée, claire et vivante : respecte le format de sortie à la lettre.

## Contexte
- Matière : ${input.cahierName}${niveau}${consignes}

## Ce que tu dois faire
${photos ? `0. ${photoSourceRule(photos)}\n` : ''}1. Lis toutes les sources et fusionne-les. Le cours fait foi pour le contenu ; les notes apportent les précisions dites en classe. En cas de contradiction, garde la version du cours et signale-le entre parenthèses.
2. Rédige UNE fiche complète mais COURTE : chaque point de cours une seule fois, sous sa forme la plus brève, rien d'oublié (définitions, dates, chiffres, formules, exceptions), rien de délayé, rien d'ajouté qui ne soit pas dans les sources. Style télégraphique, pas d'introduction ni de transition.
3. Compose la page avec les composants ci-dessous : les formules et résultats clés en cartes, les comparaisons en tableau, les erreurs classiques en encadré « warn », les démonstrations et exemples résolus repliés dans des « demo », un schéma SVG quand une figure fait comprendre plus vite qu'une phrase. Une démo interactive (curseur, bouton) seulement quand faire varier une grandeur éclaire le cours : 0 à 3 par fiche, jamais pour décorer.
4. Termine par une section « L'essentiel » : un encadré \`callout key\` de 5 à 10 points à retenir absolument.
${LATEX_RULE(5)}${
    hasProgramme
      ? `
6. Utilise le programme fourni pour ordonner la fiche et vérifier qu'aucune notion attendue n'est oubliée. Si un point du programme lié à ce cours est absent des sources, liste-le à la fin dans un encadré « À compléter » (sans le rédiger).`
      : ''
  }

## Composants
${RICH_KIT_GUIDE}

## Format de réponse
${RICH_RULES}

${RICH_EXAMPLE_INTRO}
\`\`\`html${SAMPLE_FICHE}\`\`\`
${
  hasProgramme
    ? `
## Programme officiel / plan du cours
<<<
${input.programme!.trim()}
>>>
`
    : ''
}
## Sources
${sources}`
}

// ---- Parsing the answer --------------------------------------------------------

export interface RichFicheParseResult {
  fiches: { title: string; html: string }[]
  rejected: { index: number; reason: string; raw: string }[]
}

/** Very large fiches make the sync and the iframe heavy; a real one is 10–60 KB. */
export const MAX_RICH_HTML = 400_000

function textOf(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The fenced code blocks that hold HTML, or the whole answer when Claude forgot the fence. */
function htmlBlocks(text: string): string[] {
  const blocks = [...text.matchAll(/```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)```/g)].map((m) => m[1]).filter((b) => /<[a-z][\s\S]*>/i.test(b))
  if (blocks.length) return blocks
  const start = text.search(/<(h1|h2|div|section|article|p)\b/i)
  return start >= 0 ? [text.slice(start)] : []
}

/**
 * Keeps what belongs in the fiche: the body without the html/head/body wrappers, the
 * head's <style> blocks, and none of the ways to reach the network (links, imports,
 * external scripts, frames). The iframe's CSP blocks them anyway; this keeps the stored fiche clean.
 */
export function cleanFicheHtml(raw: string): { title: string; html: string } {
  const titleTag = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1]
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(raw)?.[1] ?? ''
  const headStyles = [...head.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)].map((m) => m[0].replace(/@import[^;]*;/gi, ''))
  let body = raw
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<head\b[\s\S]*?<\/head>/gi, '')
    .replace(/<\/?(html|body)\b[^>]*>/gi, '')
    .replace(/<(link|meta|base)\b[^>]*>/gi, '')
    .replace(/<script\b[^>]*\bsrc\s*=[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<(iframe|object|embed|form)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/@import[^;]*;/gi, '')
  body = (headStyles.join('\n') + '\n' + body).trim()
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(body)?.[1]
  const title = textOf(titleTag ?? h1 ?? '').slice(0, 120) || 'Fiche'
  return { title, html: body }
}

export function parseRichFicheResponse(text: string): RichFicheParseResult {
  const blocks = htmlBlocks(text)
  if (!blocks.length) throw new Error('Aucun bloc HTML dans cette réponse : demande à Claude de répondre avec un seul bloc ```html.')
  const fiches: RichFicheParseResult['fiches'] = []
  const rejected: RichFicheParseResult['rejected'] = []
  blocks.forEach((raw, index) => {
    const { title, html } = cleanFicheHtml(raw)
    if (textOf(html).length < 40) rejected.push({ index, reason: 'contenu trop court', raw: raw.slice(0, 200) })
    else if (html.length > MAX_RICH_HTML) rejected.push({ index, reason: 'fiche trop volumineuse', raw: raw.slice(0, 200) })
    else fiches.push({ title, html })
  })
  return { fiches, rejected }
}
