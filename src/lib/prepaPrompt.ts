// Kholle / DS preparation: real exercises found in the concours annales (by Claude, who can
// search the web on claude.ai), each with three hints and a correction written by Claude.
// The section can ride along with the exercise generation or be asked for on its own.

import { JSON_LATEX_NOTE, LATEX_RULE } from './prompt'

export interface PrepaPromptInput {
  cahierName: string
  title: string
  content: string
  niveau?: string
}

/** The instructions and the JSON shape of the "preparation" key. */
export function prepaSection(niveau?: string): string {
  const filiere = niveau?.trim() ? ` (filière de l'élève : ${niveau.trim()} : choisis les concours de cette filière)` : ''
  return `## Préparation aux kholles et aux DS (en plus, clé "preparation" du même objet JSON)
Cherche sur le web des VRAIS exercices d'annales de concours portant sur cette fiche${filiere}. Deux catégories :
- "kholle" : exercices d'oral (énoncé court, une ou deux questions qui s'enchaînent, 15 à 25 minutes).
- "ds" : extraits de problèmes d'écrit (une partie de problème à plusieurs questions, une à deux heures).
Pour CHAQUE catégorie, 2 à 3 exercices PAR CONCOURS, avec une difficulté croissante d'un concours à l'autre : "niveau" 1 pour le plus accessible (par exemple CCP, E3A, Banque PT), puis 2 (Mines-Ponts, Centrale-Supélec), puis 3 (X-ENS, ENS), etc. Ne garde que les concours pour lesquels tu trouves de vrais énoncés en rapport avec la fiche.
Honnêteté, règle absolue : ne JAMAIS inventer un énoncé ni une source. Chaque exercice a sa référence (concours, année, épreuve, numéro d'exercice ou de partie) et, si tu as trouvé la page, "sourceUrl". "exact": true seulement si l'énoncé est recopié tel quel ; si tu l'as adapté ou raccourci, "exact": false. Si tu ne retrouves pas assez d'exercices, envoie-en moins et explique-le dans "note". Sans accès au web, renvoie deux tableaux vides et dis-le dans "note".
Pour chaque exercice :
- "statement" : l'énoncé complet, en français, formules en LaTeX.
- "hints" : EXACTEMENT 3 indices progressifs que l'élève déverrouille un par un : le 1er oriente sans formule (quelle notion, quel schéma), le 2e donne la méthode ou l'outil, le 3e donne presque tout sauf le calcul final. Aucun indice ne donne le résultat.
- "correction" : ta correction rédigée, complète, étape par étape, avec le résultat final clairement indiqué (markdown et LaTeX).
- "duree" (kholle seulement) : durée conseillée en minutes.
Format (à la racine de l'objet JSON) :
"preparation": { "note": "…(optionnel)", "kholle": [ { "concours": "CCP", "annee": 2021, "epreuve": "Physique, oral", "source": "CCP PSI 2021, oral de physique, exercice 2", "sourceUrl": "https://…", "exact": true, "niveau": 1, "duree": 20, "statement": "…", "hints": ["…", "…", "…"], "correction": "…" } ], "ds": [ { "concours": "Centrale-Supélec", "annee": 2019, "epreuve": "Physique-chimie 1", "source": "Centrale-Supélec PC 2019, Physique-chimie 1, partie II", "exact": false, "niveau": 2, "statement": "…", "hints": ["…", "…", "…"], "correction": "…" } ] }`
}

/** The preparation on its own, for a fiche that already has its exercises. */
export function buildPrepaPrompt(input: PrepaPromptInput): string {
  return `Tu es un professeur de classes préparatoires qui prépare un élève aux kholles et aux devoirs surveillés. Le résultat sera importé dans une application de révision qui valide le JSON avec un schéma : respecte le format à la lettre.

## Contexte
- Matière : ${input.cahierName}
- Fiche : ${input.title}${input.niveau?.trim() ? `\n- Niveau de l'élève : ${input.niveau.trim()}` : ''}

${prepaSection(input.niveau)}

## Règles
${LATEX_RULE(1)}
2. Rédige en français. Les indices et la correction se fondent sur la fiche ci-dessous (notations, résultats du cours) ; si l'énoncé demande un résultat hors fiche, cite-le clairement comme résultat admis.
3. ${JSON_LATEX_NOTE}

## Format de réponse
UNIQUEMENT un bloc \`\`\`json contenant un objet avec la seule clé "preparation" décrite ci-dessus.

## Fiche de cours
<<<
${input.content.trim()}
>>>`
}
