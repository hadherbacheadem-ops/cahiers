import type { ExerciseType } from '../types'

export interface PromptInput {
  cahierName: string
  title: string
  content: string
  /** Types Claude may use; the quantity is driven by the fiche, not by a number. */
  types: ExerciseType[]
  niveau?: string
}

function niveauLine(niveau?: string) {
  return niveau?.trim() ? `\n- Niveau de l'élève : ${niveau.trim()}` : ''
}

const TYPE_LINES: Record<ExerciseType, string> = {
  flashcard: `- "flashcard" : question précise → réponse courte (1 à 2 phrases max). Le type par défaut pour une définition, un fait, un chiffre, une date.`,
  cloze: `- "cloze" (texte à trous) : phrase reprise de la fiche avec 1 à 3 mots-clés masqués. Idéal pour une formule, un terme technique, un nom propre.`,
  mcq: `- "mcq" (QCM) : 4 choix, une seule bonne réponse, distracteurs plausibles. Idéal pour une nuance, une confusion fréquente.`,
  truefalse: `- "truefalse" (vrai/faux) : environ la moitié de vrais, la moitié de faux. Idéal pour un piège, une exception, une idée reçue.`,
  match: `- "match" (association) : 4 à 8 paires terme ↔ définition. Idéal quand la fiche liste plusieurs termes comparables.`,
  order: `- "order" (classement) : 4 à 7 étapes ou éléments à remettre dans l'ordre. Idéal pour une chronologie, un processus, un raisonnement.`,
}

export function buildPrompt(input: PromptInput): string {
  const allowed = (Object.keys(TYPE_LINES) as ExerciseType[]).filter((t) => input.types.includes(t))
  const typeLines = allowed.map((t) => TYPE_LINES[t]).join('\n')

  return `Tu es un tuteur qui prépare des exercices d'entraînement à partir d'une fiche de cours. Les exercices seront importés dans une application de révision : respecte le format de sortie à la lettre.

## Contexte
- Matière : ${input.cahierName}
- Fiche : ${input.title}${niveauLine(input.niveau)}

## Types d'exercices autorisés
${typeLines}

## Couverture : exhaustive, pas de nombre imposé
- Fais AUTANT d'exercices qu'il y a de points de cours dans la fiche, aussi petits soient-ils. Chaque définition, date, chiffre, nom, formule, étape, exemple, cause, conséquence, exception ou nuance mentionné doit être testé au moins une fois.
- Parcours la fiche dans l'ordre, paragraphe par paragraphe, et pour chaque point choisis le type le mieux adapté parmi les types autorisés. Les points importants peuvent être testés deux fois sous des angles différents (par exemple flashcard puis texte à trous), jamais avec la même question reformulée.
- Ne t'arrête pas avant d'avoir épuisé la fiche. Si la réponse devient longue, continue : l'application accepte plusieurs centaines d'exercices. Si tu dois vraiment t'interrompre, termine proprement le tableau JSON et le bloc de code.

## Règles
1. Utilise UNIQUEMENT le contenu de la fiche ci-dessous. N'invente aucune information, aucune date, aucun chiffre.
2. Une question = un point de cours. Ne mélange pas plusieurs notions dans une même question.
3. Rédige en français, avec des questions précises et sans ambiguïté. Une question doit avoir une seule réponse attendue.
4. Textes à trous : masque uniquement des mots importants (notions, noms, chiffres, verbes clés), jamais des articles ou des mots de liaison. Syntaxe : {{mot}} ; pour accepter des variantes d'orthographe ou des synonymes : {{mot|variante}}. La phrase doit rester compréhensible avec les trous.
5. QCM : exactement 4 choix, "correct" contient l'index (0 à 3) de la bonne réponse, "explanation" justifie en une phrase.
6. Vrai/Faux : "explanation" obligatoire, surtout pour les affirmations fausses (donne la version correcte).
7. Association : les termes de gauche et les définitions de droite ne doivent pas être interchangeables entre eux.
8. Classement : donne les "items" DANS LE BON ORDRE, l'application les mélangera.
9. "difficulty" : 1 = facile (rappel direct), 2 = moyen, 3 = difficile (raisonnement, cas particulier). "tags" : 1 à 3 mots-clés de la notion concernée.

## Format de réponse
Réponds UNIQUEMENT avec un bloc \`\`\`json contenant un objet {"exercises": [...]}, sans aucun texte avant ni après. Chaque exercice suit exactement l'un de ces schémas :

{"type":"flashcard","question":"…","answer":"…","hint":"…(optionnel)","difficulty":2,"tags":["…"]}
{"type":"cloze","text":"Phrase avec un {{mot}} masqué et un {{autre|synonyme}}.","difficulty":2,"tags":["…"]}
{"type":"mcq","question":"…","choices":["…","…","…","…"],"correct":[0],"explanation":"…","difficulty":2,"tags":["…"]}
{"type":"truefalse","statement":"…","answer":true,"explanation":"…","difficulty":2,"tags":["…"]}
{"type":"match","instruction":"Associe chaque terme à sa définition.","pairs":[{"left":"…","right":"…"}],"difficulty":2,"tags":["…"]}
{"type":"order","instruction":"Remets les étapes dans l'ordre.","items":["première étape","deuxième étape"],"difficulty":2,"tags":["…"]}

## Fiche de cours
<<<
${input.content.trim()}
>>>`
}

// ---- Compléments (fiche vs programme officiel) ------------------------------

export interface SupplementPromptInput {
  cahierName: string
  title: string
  content: string
  programme?: string
  niveau?: string
}

export function buildSupplementPrompt(input: SupplementPromptInput): string {
  const hasProgramme = !!input.programme?.trim()
  const source = hasProgramme
    ? `le programme officiel et/ou le plan de cours fournis ci-dessous`
    : `le programme scolaire ou universitaire français standard pour ce niveau (aucun programme n'a été fourni : reste prudent et indique dans "reason" sur quel point du programme tu t'appuies)`

  return `Tu es un professeur qui relit la fiche de cours d'un élève et la compare à ${source}. Ton objectif : proposer des COMPLÉMENTS prêts à être intégrés dans la fiche. Les compléments seront importés dans une application : respecte le format de sortie à la lettre.

## Contexte
- Matière : ${input.cahierName}
- Fiche : ${input.title}${niveauLine(input.niveau)}

## Ce que tu dois faire
1. Repère les notions du programme qui concernent le sujet de CETTE fiche et qui sont absentes ("manque") ou trop peu développées ("precision").
2. Si la fiche contient une erreur manifeste, propose une "correction" — uniquement si tu es certain, en expliquant l'erreur dans "reason".
3. Ne traite que ce qui se rapporte au sujet de la fiche : n'ajoute pas les autres chapitres du programme.
4. Rédige chaque complément comme un extrait de fiche de cours : clair, au niveau de l'élève, en français, 5 à 15 lignes, en markdown léger (sous-titres ###, listes -, **gras** pour les termes clés). Pas de questions, pas de conseils de méthode.
5. Entre 2 et 10 compléments, classés du plus important au moins important. "title" est court (3 à 8 mots). "reason" explique en une phrase pourquoi c'est utile, en citant le point du programme.

## Format de réponse
Réponds UNIQUEMENT avec un bloc \`\`\`json contenant :
{"supplements":[{"title":"…","kind":"manque","reason":"…","content":"…"}]}
"kind" vaut "manque", "precision" ou "correction".
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
## Fiche de cours de l'élève
<<<
${input.content.trim()}
>>>`
}

// ---- Carte mentale ---------------------------------------------------------

export interface MindmapPromptInput {
  cahierName: string
  /** Fiche title, or the cahier name for a synthesis map. */
  title: string
  /** Fiche content, or every fiche of the cahier concatenated with "# Titre" headings. */
  content: string
  scope: 'chapitre' | 'cahier'
  niveau?: string
}

export function buildMindmapPrompt(input: MindmapPromptInput): string {
  const scopeRule =
    input.scope === 'cahier'
      ? `Le contenu est un cahier entier : chaque fiche (titre en "# …") devient une branche principale, ses grandes parties des sous-branches.`
      : `Les branches principales sont les grandes parties de la fiche, les sous-branches les notions clés de chaque partie.`

  return `Tu es un tuteur qui transforme des notes de cours en carte mentale. La carte sera dessinée par une application : respecte le format de sortie à la lettre.

## Contexte
- Matière : ${input.cahierName}
- Sujet : ${input.title}${niveauLine(input.niveau)}

## Règles
1. La racine est le sujet. ${scopeRule}
2. 3 à 7 branches principales, profondeur maximale 4 niveaux (racine comprise), 2 à 6 enfants par nœud.
3. "label" : 1 à 6 mots, sans phrase complète. "note" (optionnelle) : 1 phrase de 25 mots max pour une définition, une date, une formule ou un exemple essentiel. Mets les détails dans "note", pas dans "label".
4. Couvre l'ensemble du contenu, sans rien inventer. Chaque notion importante doit apparaître une seule fois.
5. Rédige en français.

## Format de réponse
Réponds UNIQUEMENT avec un bloc \`\`\`json contenant :
{"mindmap":{"label":"Sujet","children":[{"label":"Branche","note":"…","children":[{"label":"Notion","note":"…"}]}]}}

## Contenu
<<<
${input.content.trim()}
>>>`
}

/** Concatenates every fiche of a cahier for a synthesis map. */
export function joinFiches(fiches: { title: string; content: string }[]): string {
  return fiches.map((f) => `# ${f.title}\n\n${f.content.trim()}`).join('\n\n')
}

/** claude.ai accepts a prefilled prompt through ?q=, but only for short prompts. */
export const CLAUDE_NEW_URL = 'https://claude.ai/new'
export const MAX_URL_PROMPT_LENGTH = 6000

export function claudeUrlFor(prompt: string): string {
  if (prompt.length <= MAX_URL_PROMPT_LENGTH) return `${CLAUDE_NEW_URL}?q=${encodeURIComponent(prompt)}`
  return CLAUDE_NEW_URL
}

// ---- Rédaction de fiches (cours + notes → fiche de révision) ----------------

export interface FicheSource {
  label: string
  content: string
}

export interface FichePromptInput {
  cahierName: string
  sources: FicheSource[]
  /** 'auto' lets Claude split into one fiche per chapter when the sources cover several. */
  split: 'auto' | 'one'
  programme?: string
  niveau?: string
  instructions?: string
}

export function buildFichePrompt(input: FichePromptInput): string {
  const hasProgramme = !!input.programme?.trim()
  const sources = input.sources
    .map((s, i) => `### Source ${i + 1} — ${s.label.trim() || 'Sans titre'}\n<<<\n${s.content.trim()}\n>>>`)
    .join('\n\n')
  const splitRule =
    input.split === 'auto'
      ? `Si les sources couvrent plusieurs chapitres clairement distincts, fais une fiche par chapitre ; sinon une seule fiche.`
      : `Fais UNE SEULE fiche, même si les sources sont longues.`

  return `Tu es un professeur qui rédige des fiches de révision à partir du cours et des notes d'un élève. Les fiches seront importées dans une application de révision : respecte le format de sortie à la lettre.

## Contexte
- Matière : ${input.cahierName}${niveauLine(input.niveau)}${input.instructions?.trim() ? `\n- Consignes de l'élève : ${input.instructions.trim()}` : ''}

## Ce que tu dois faire
1. Lis toutes les sources (cours du professeur, notes prises en classe, manuel, etc.) et fusionne-les. Le cours fait foi pour le contenu ; les notes apportent les précisions, exemples et remarques dites en classe. En cas de contradiction, garde la version du cours et signale-le entre parenthèses.
2. Rédige une fiche complète et fidèle : ne perds AUCUN point de cours, même mineur (définitions, dates, chiffres, formules, exemples, exceptions, schémas décrits en mots). N'ajoute rien qui ne soit pas dans les sources, sauf pour reformuler plus clairement.
3. Structure en markdown : ## pour les grandes parties, ### pour les sous-parties, listes à puces, **gras** sur les termes clés, définitions sous la forme « **Terme** : définition ». Phrases courtes. Un tableau markdown quand il s'agit de comparer plusieurs éléments.
4. Découpage : ${splitRule}
5. Termine chaque fiche par une section "## L'essentiel" : 5 à 10 points à retenir absolument.${
    hasProgramme
      ? `
6. Utilise le programme officiel fourni pour ordonner la fiche et vérifier qu'aucune notion attendue n'est oubliée. Si un point du programme lié à ce cours est absent des sources, liste-le en fin de fiche sous "## À compléter" (sans le rédiger).`
      : ''
  }

## Format de réponse
Réponds UNIQUEMENT avec un bloc \`\`\`json contenant :
{"fiches":[{"title":"Titre court de la fiche","content":"Le contenu complet en markdown, avec des \\n pour les retours à la ligne"}]}
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
