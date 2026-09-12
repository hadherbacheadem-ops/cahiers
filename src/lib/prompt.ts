import type { ExerciseType } from '../types'

/** A point of the fiche that already exists in the app, so Claude reuses its id. */
export interface PromptPoint {
  id: string
  title: string
  anchor: string
}

export interface PromptInput {
  cahierName: string
  title: string
  content: string
  /** Types Claude may use; the quantity is driven by the fiche, not by a number. */
  types: ExerciseType[]
  niveau?: string
  /**
   * Restrict the generation: existing points to cover (ids reused) and/or raw
   * passages of the fiche that have no point yet (points to create).
   */
  focus?: { points?: PromptPoint[]; passages?: string[] }
}

function niveauLine(niveau?: string) {
  return niveau?.trim() ? `\n- Niveau de l'élève : ${niveau.trim()}` : ''
}

/** LaTeX requirement shared by the fiche / supplement prompts (rendered by KaTeX + mhchem in the app). */
export const LATEX_RULE = (n: number) =>
  `${n}. Toute formule, toute grandeur avec son unité et toute équation-bilan **en LaTeX**, jamais en texte brut : $…$ en ligne, $$…$$ en bloc, unités avec \\mathrm ($v = \\dfrac{d}{t}$, $g = 9{,}8\\ \\mathrm{m\\cdot s^{-2}}$, $\\Delta t = 2{,}5\\ \\mathrm{s}$), chimie avec \\ce{…} ($\\ce{2H2 + O2 -> 2H2O}$, $\\ce{H3O+}$). Pas de « v = d/t » ni de « 9,8 m/s² » hors LaTeX.`

/** Reminder placed under the JSON example: backslashes must be doubled inside JSON strings. */
export const JSON_LATEX_NOTE = `Dans le JSON, chaque antislash LaTeX est doublé : écris "\\\\frac{1}{2}" et NON "\\frac{1}{2}" (un antislash simple devant f, n, t, b ou r est lu comme un caractère de contrôle et casse la formule) ; les retours à la ligne sont des \\n. Réponds dans un seul bloc \`\`\`json.`

const TYPE_LINES: Partial<Record<ExerciseType, string>> = {
  flashcard: `- "flashcard" : question précise → réponse la plus courte possible (une phrase, souvent un mot, une valeur, une formule). Défaut pour une définition, un fait, une valeur, une date. Pour une formule ou une valeur exacte, ajoute "typed": true (l'élève devra la saisir). Les cartes inverses (définition → terme) sont générées automatiquement par l'application : ne les écris pas.`,
  cloze: `- "cloze" (texte à trous) : phrase reprise de la fiche avec UN SEUL trou sur une notion (terme technique, nom, valeur, symbole). Idéal pour une formule ou un terme précis. Syntaxe {{réponse}} ou {{réponse|variante}}.`,
  mcq: `- "mcq" (QCM) : 4 choix, une seule bonne réponse, distracteurs COMPÉTITIFS issus du même champ (formule voisine, signe / unité / facteur faux, cas limite, confusion classique) — jamais absurdes. Idéal pour une nuance ou une confusion fréquente.`,
  truefalse: `- "truefalse" (vrai/faux) : moitié vrais, moitié faux ; toujours avec "correctedStatement", la version vraie de l'énoncé. Idéal pour un piège, une exception, une idée reçue.`,
  match: `- "match" (association) : 4 à 7 paires terme ↔ définition non interchangeables. Idéal quand la fiche liste plusieurs notions comparables.`,
  order: `- "order" (classement) : 4 à 7 étapes ou éléments à remettre dans l'ordre. Idéal pour une chronologie, un processus, un raisonnement.`,
  demonstration: `- "demonstration" : une démonstration, un calcul type ou une méthode découpée en 3 à 8 étapes-clés ("steps"), chacune avec "text" (l'étape, en LaTeX si besoin) et "why" (pourquoi cette étape, une phrase). "statement" = ce qu'on démontre / ce qu'on calcule. L'application fait travailler l'élève par estompage (exemple résolu → étapes masquées → reconstitution). Un exercice par démonstration ou méthode de la fiche.`,
  rappel_libre: `- "rappel_libre" : UN SEUL par fiche, "topic" = le sujet de la fiche, "checklist" = 5 à 15 notions essentielles que l'élève doit pouvoir restituer de mémoire (chaque item : "text" court, "pointId" du point correspondant). L'application demande à l'élève d'écrire tout ce dont il se souvient, puis de cocher la liste.`,
}

const NATURES = `"definition" | "formule" | "theoreme" | "demonstration" | "methode" | "ordre_de_grandeur" | "exemple" | "date" | "autre"`

export function buildPrompt(input: PromptInput): string {
  const allowed = (Object.keys(TYPE_LINES) as ExerciseType[]).filter((t) => input.types.includes(t))
  const typeLines = allowed.map((t) => TYPE_LINES[t]).filter(Boolean).join('\n')
  const focusPoints = input.focus?.points ?? []
  const focusPassages = input.focus?.passages ?? []
  const focused = focusPoints.length > 0 || focusPassages.length > 0

  const scope = focused
    ? `## Périmètre : uniquement ce qui suit
${
  focusPoints.length
    ? `Points de cours EXISTANTS à couvrir — réutilise exactement leur "id" dans "pointId", ne les recrée pas dans "points" :
${focusPoints.map((p) => `- id "${p.id}" : ${p.title} — « ${p.anchor} »`).join('\n')}
`
    : ''
}${
  focusPassages.length
    ? `Passages de la fiche SANS point de cours — crée leurs points dans "points" puis leurs exercices :
${focusPassages.map((p, i) => `${i + 1}. <<< ${p.trim()} >>>`).join('\n')}
`
    : ''
}Ne génère rien pour le reste de la fiche (elle est fournie pour le contexte).`
    : `## Étape 1 — Points de cours
Liste d'abord TOUS les points de cours de la fiche, dans l'ordre : chaque définition, chaque formule, chaque hypothèse de théorème, chaque étape de méthode, chaque ordre de grandeur, chaque exemple, chaque date, aussi petit soit-il. Un point = une unité qu'on peut tester seule.
- "id" : "p1", "p2", …
- "title" : 3 à 8 mots (ex. "Théorème de Gauss (forme intégrale)").
- "nature" : ${NATURES}.
- "anchor" : citation EXACTE de la fiche, copiée telle quelle (≤ 200 caractères, sans reformulation) : l'application s'en sert pour retrouver le passage.`

  return `Tu es un tuteur qui prépare des exercices d'entraînement à partir d'une fiche de cours. Les exercices seront importés dans une application de révision qui valide le JSON avec un schéma : respecte le format à la lettre.

## Contexte
- Matière : ${input.cahierName}
- Fiche : ${input.title}${niveauLine(input.niveau)}

${scope}

## ${focused ? 'Exercices' : 'Étape 2 — Exercices'}
Pour chaque point, 1 à 3 exercices, chacun avec le "pointId" du point. Pas de nombre global imposé : autant d'exercices qu'il y a de points, aussi petits soient-ils. Ne t'arrête pas avant d'avoir couvert tous les points ; si tu dois t'interrompre, termine proprement les tableaux JSON et le bloc de code.

Types autorisés :
${typeLines}

Choisis le type le plus adapté au point : définition → flashcard ; formule → flashcard à saisir ("typed": true) ou cloze sur la formule ; méthode ou démonstration → "demonstration" (étapes) ; chronologie → classement ; notions confondables → QCM compétitif ou association ; et, si le type est autorisé, un seul "rappel_libre" pour toute la fiche.

## Règles d'écriture (chaque exercice est vérifié par un linter)
1. **Un fait par exercice**, réponse la plus courte possible. INTERDIT : « cite les N… », « quels sont les… », « énumère… » (ensembles) → fais N exercices, ou une séquence contextualisée (« après X vient ? »).
2. La question est **autonome** : pas de pronom sans antécédent, contexte inclus (« En électrostatique, … »). Pas deux questions reliées par « et ».
3. Cloze : **un seul trou**, jamais sur un mot-outil (le, de, est, …), jamais un mot devinable par la grammaire seule, la réponse ne doit pas apparaître ailleurs dans la phrase. Pour masquer une formule, le trou englobe la formule entière avec ses délimiteurs ({{$E = mc^2$}}) — jamais un trou à l'intérieur d'un $…$.
4. QCM : 4 choix de longueur comparable, "correct" = index (0–3) de la bonne réponse, position de la bonne réponse variable d'un QCM à l'autre, "distractorReasons" = 4 chaînes (vide pour la bonne réponse, sinon « pourquoi c'est faux » en une phrase), "explanation" en une phrase.
5. Vrai/Faux : "correctedStatement" obligatoire (identique à "statement" si vrai).
6. Association : termes de gauche et de droite non interchangeables. Classement : "items" DANS LE BON ORDRE (l'application mélange).
7. Formules, grandeurs et unités **en LaTeX** : $…$ en ligne, $$…$$ en bloc, unités explicites ($\\mathrm{m\\cdot s^{-1}}$). Chimie : \\ce{…}. ${JSON_LATEX_NOTE}
8. Utilise UNIQUEMENT le contenu de la fiche : aucune information, date ou valeur inventée. Rédige en français.
9. "difficulty" : 1 = rappel direct, 2 = moyen, 3 = raisonnement / cas particulier. "tags" : 1 à 3 mots-clés.

## Format de réponse
UNIQUEMENT un bloc \`\`\`json, sans texte autour, conforme à ce schéma (exemple de formule bien écrite : "answer": "$E_c = \\\\frac{1}{2} m v^2$") :
{
  "points": [ { "id": "p1", "title": "…", "nature": "definition", "anchor": "citation exacte de la fiche" } ],
  "exercises": [
    { "pointId": "p1", "type": "flashcard", "question": "…", "answer": "…", "hint": "…(optionnel)", "typed": false, "difficulty": 2, "tags": ["…"] },
    { "pointId": "p1", "type": "cloze", "text": "Phrase avec un {{terme}} masqué.", "difficulty": 2, "tags": ["…"] },
    { "pointId": "p2", "type": "mcq", "question": "…", "choices": ["…","…","…","…"], "correct": [2], "distractorReasons": ["…","…","","…"], "explanation": "…", "difficulty": 2, "tags": ["…"] },
    { "pointId": "p2", "type": "truefalse", "statement": "…", "answer": false, "correctedStatement": "…", "explanation": "…", "difficulty": 2, "tags": ["…"] },
    { "pointId": "p3", "type": "match", "instruction": "Associe chaque terme à sa définition.", "pairs": [ { "left": "…", "right": "…" } ], "difficulty": 2, "tags": ["…"] },
    { "pointId": "p4", "type": "order", "instruction": "Remets les étapes dans l'ordre.", "items": ["première étape", "deuxième étape"], "difficulty": 2, "tags": ["…"] },
    { "pointId": "p5", "type": "demonstration", "title": "…", "statement": "…", "steps": [ { "text": "…", "why": "…" } ], "difficulty": 3, "tags": ["…"] },
    { "pointId": null, "type": "rappel_libre", "topic": "…", "checklist": [ { "text": "…", "pointId": "p1" } ], "difficulty": 2, "tags": ["…"] }
  ]
}
${focused ? '"points" ne contient que les nouveaux points créés pour les passages listés (tableau vide sinon).\n' : ''}
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
${LATEX_RULE(6)}

## Format de réponse
Réponds UNIQUEMENT avec un bloc \`\`\`json contenant :
{"supplements":[{"title":"…","kind":"manque","reason":"…","content":"### Énergie cinétique\\n$E_c = \\\\dfrac{1}{2} m v^2$, avec $v$ en $\\\\mathrm{m\\\\cdot s^{-1}}$."}]}
"kind" vaut "manque", "precision" ou "correction". ${JSON_LATEX_NOTE}
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
{"mindmap":{"label":"Sujet","children":[{"label":"Branche","note":"…","children":[{"label":"Notion","note":"$E_c = \\\\frac{1}{2} m v^2$"}]}]}}
${JSON_LATEX_NOTE}

## Contenu
<<<
${input.content.trim()}
>>>`
}

// ---- Pré-test (questions avant le cours) ------------------------------------

export interface PretestPromptInput {
  cahierName: string
  topic: string
  programme?: string
  niveau?: string
}

/**
 * Pre-testing helps the items tested (g ≈ 0.54) and little else (g ≈ 0.04):
 * conceptual short-answer questions on what the coming chapter will cover.
 */
export function buildPretestPrompt(input: PretestPromptInput): string {
  const hasProgramme = !!input.programme?.trim()
  return `Tu es un professeur qui prépare un PRÉ-TEST : 3 à 5 questions posées à l'élève AVANT qu'il étudie le chapitre « ${input.topic} », pour l'amener à mobiliser ce qu'il croit savoir et repérer les idées clés. Les questions seront importées dans une application : respecte le format de sortie à la lettre.

## Contexte
- Matière : ${input.cahierName}
- Chapitre à venir : ${input.topic}${niveauLine(input.niveau)}

## Règles
1. Questions CONCEPTUELLES à réponse courte (pourquoi, comment, que se passe-t-il si…), pas de dates ni de définitions à réciter : le pré-test fonctionne mieux sur les idées que sur les faits.
2. Chaque question porte sur une notion centrale du chapitre${hasProgramme ? ' (appuie-toi sur le programme fourni)' : ''} ; l'élève ne l'a pas encore vue, il peut se tromper : c'est le but.
3. "answer" = la réponse attendue en 1 à 3 phrases, claire, au niveau de l'élève, que l'élève lira après avoir répondu.
4. Rédige en français ; formules en LaTeX ($…$).

## Format de réponse
UNIQUEMENT un bloc \`\`\`json :
{"questions":[{"question":"…","answer":"… $\\\\frac{1}{2}$ …"}]}
${JSON_LATEX_NOTE}
${
  hasProgramme
    ? `
## Programme officiel / plan du cours
<<<
${input.programme!.trim()}
>>>`
    : ''
}`
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
5. Termine chaque fiche par une section "## L'essentiel" : 5 à 10 points à retenir absolument.
${LATEX_RULE(6)}${
    hasProgramme
      ? `
7. Utilise le programme officiel fourni pour ordonner la fiche et vérifier qu'aucune notion attendue n'est oubliée. Si un point du programme lié à ce cours est absent des sources, liste-le en fin de fiche sous "## À compléter" (sans le rédiger).`
      : ''
  }

## Format de réponse
Réponds UNIQUEMENT avec un bloc \`\`\`json contenant :
{"fiches":[{"title":"Titre court de la fiche","content":"## Partie\\n- **Vitesse** : $v = \\\\dfrac{d}{t}$, en $\\\\mathrm{m\\\\cdot s^{-1}}$\\n$$\\\\vec{F} = m\\\\vec{a}$$\\n…"}]}
"content" est le markdown complet de la fiche, avec des \\n pour les retours à la ligne. ${JSON_LATEX_NOTE}
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
