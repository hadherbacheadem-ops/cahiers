import type { Exercise } from '../types'
import { EXERCISE_LABELS_SINGULAR } from '../types'
import { JSON_LATEX_NOTE } from './prompt'

export interface LeechPromptInput {
  cahierName: string
  ficheTitle: string
  ficheContent: string
  /** The leech: failed too many times, hence probably badly written. */
  exercise: Exercise
  niveau?: string
}

/**
 * Asks Claude to diagnose one leech exercise and to replace it by 1 to 3 atomic
 * exercises. Same writing rules and JSON schemas as `buildPrompt`, without the
 * points step: the replacements keep the leech's pointId.
 */
export function buildLeechPrompt(input: LeechPromptInput): string {
  const { exercise } = input
  const niveau = input.niveau?.trim() ? `\n- Niveau de l'élève : ${input.niveau.trim()}` : ''
  const pointId = exercise.pointId ? `"${exercise.pointId}"` : 'null'
  const lapses = exercise.fsrs.lapses

  return `Tu es un tuteur qui corrige un exercice de révision mal conçu. L'élève a échoué ${lapses} fois sur cet exercice malgré des répétitions espacées : d'après le principe d'information minimale (Wozniak), le problème vient presque toujours de la formulation, pas de l'élève. Tu vas le diagnostiquer puis le REMPLACER par 1 à 3 exercices atomiques. Les exercices seront importés dans une application qui valide le JSON avec un schéma : respecte le format à la lettre.

## Contexte
- Matière : ${input.cahierName}
- Fiche : ${input.ficheTitle}${niveau}
- Type actuel : ${EXERCISE_LABELS_SINGULAR[exercise.type]}

## Exercice à réécrire (JSON actuel)
\`\`\`json
${JSON.stringify(exercise.data, null, 2)}
\`\`\`

## Étape 1 — Diagnostic
En 1 à 3 phrases ("diagnosis"), dis pourquoi cet exercice échoue. Causes fréquentes :
- trop large : la question couvre plusieurs faits, ou demande une liste (« cite les… », « quels sont… ») ;
- ambiguë : plusieurs réponses acceptables, ou la question ne dit pas ce qu'on attend (mot ? valeur ? formule ?) ;
- réponse trop longue : impossible à restituer mot pour mot ;
- devinable ou trompeuse : le trou se déduit par la grammaire, un distracteur est aussi juste que la bonne réponse, la bonne réponse est visible dans l'énoncé ;
- contexte manquant : pronom sans antécédent, chapitre non précisé, notation non définie ;
- interférence : elle ressemble à une autre notion de la fiche et l'élève les confond.

## Étape 2 — Exercices de remplacement
Propose 1 à 3 exercices qui, ensemble, testent le même savoir mais un fait à la fois. Si l'exercice demandait N choses, fais N exercices (ou une séquence contextualisée : « après X vient ? »). Si la confusion venait d'une notion voisine, ajoute un QCM ou un vrai/faux qui oppose explicitement les deux. Garde uniquement le contenu de la fiche.

Types autorisés :
- "flashcard" : question précise → réponse la plus courte possible (une phrase, souvent un mot, une valeur, une formule).
- "cloze" (texte à trous) : phrase reprise de la fiche avec UN SEUL trou sur une notion (terme technique, nom, valeur, symbole). Syntaxe {{réponse}} ou {{réponse|variante}}.
- "mcq" (QCM) : 4 choix, une seule bonne réponse, distracteurs COMPÉTITIFS issus du même champ (formule voisine, signe / unité / facteur faux, cas limite, confusion classique), jamais absurdes.
- "truefalse" (vrai/faux) : toujours avec "correctedStatement", la version vraie de l'énoncé.
- "match" (association) : 4 à 7 paires terme ↔ définition non interchangeables.
- "order" (classement) : 4 à 7 étapes ou éléments à remettre dans l'ordre, "items" DANS LE BON ORDRE.

## Règles d'écriture (chaque exercice est vérifié par un linter)
1. **Un fait par exercice**, réponse la plus courte possible. INTERDIT : « cite les N… », « quels sont les… », « énumère… » (ensembles).
2. La question est **autonome** : pas de pronom sans antécédent, contexte inclus (« En électrostatique, … »). Pas deux questions reliées par « et ».
3. Cloze : **un seul trou**, jamais sur un mot-outil (le, de, est, …), jamais un mot devinable par la grammaire seule, la réponse ne doit pas apparaître ailleurs dans la phrase. Pour masquer une formule, le trou englobe la formule entière avec ses délimiteurs ({{$E = mc^2$}}), jamais un trou à l'intérieur d'un $…$.
4. QCM : 4 choix de longueur comparable, "correct" = index (0–3) de la bonne réponse, "distractorReasons" = 4 chaînes (vide pour la bonne réponse, sinon « pourquoi c'est faux » en une phrase), "explanation" en une phrase.
5. Vrai/Faux : "correctedStatement" obligatoire (identique à "statement" si vrai).
6. Association : termes de gauche et de droite non interchangeables. Classement : "items" DANS LE BON ORDRE (l'application mélange).
7. Formules, grandeurs et unités **en LaTeX** : $…$ en ligne, $$…$$ en bloc, unités explicites ($\\mathrm{m\\cdot s^{-1}}$). Chimie : \\ce{…}. ${JSON_LATEX_NOTE}
8. Utilise UNIQUEMENT le contenu de la fiche : aucune information, date ou valeur inventée. Rédige en français.
9. "difficulty" : 1 = rappel direct, 2 = moyen, 3 = raisonnement / cas particulier. "tags" : 1 à 3 mots-clés.
10. "pointId" : ${pointId} pour chaque exercice (c'est le point de cours de l'exercice d'origine ; ne le change pas).

## Format de réponse
UNIQUEMENT un bloc \`\`\`json, sans texte autour, conforme à ce schéma :
{
  "diagnosis": "Pourquoi l'exercice échoue, en 1 à 3 phrases.",
  "exercises": [
    { "pointId": ${pointId}, "type": "flashcard", "question": "…", "answer": "…", "hint": "…(optionnel)", "difficulty": 2, "tags": ["…"] },
    { "pointId": ${pointId}, "type": "cloze", "text": "Phrase avec un {{terme}} masqué.", "difficulty": 2, "tags": ["…"] },
    { "pointId": ${pointId}, "type": "mcq", "question": "…", "choices": ["…","…","…","…"], "correct": [2], "distractorReasons": ["…","…","","…"], "explanation": "…", "difficulty": 2, "tags": ["…"] },
    { "pointId": ${pointId}, "type": "truefalse", "statement": "…", "answer": false, "correctedStatement": "…", "explanation": "…", "difficulty": 2, "tags": ["…"] },
    { "pointId": ${pointId}, "type": "match", "instruction": "Associe chaque terme à sa définition.", "pairs": [ { "left": "…", "right": "…" } ], "difficulty": 2, "tags": ["…"] },
    { "pointId": ${pointId}, "type": "order", "instruction": "Remets les étapes dans l'ordre.", "items": ["première étape", "deuxième étape"], "difficulty": 2, "tags": ["…"] }
  ]
}
Le tableau "exercises" contient 1 à 3 exercices (exemples ci-dessus donnés pour chaque type, n'en garde que ceux qui conviennent).

## Fiche de cours (contexte)
<<<
${input.ficheContent.trim()}
>>>`
}

/** Pulls the optional "diagnosis" string out of Claude's answer, for display only. */
export function extractDiagnosis(text: string): string | undefined {
  const m = text.match(/"diagnosis"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (!m) return undefined
  try {
    return JSON.parse(`"${m[1]}"`) as string
  } catch {
    return m[1]
  }
}
