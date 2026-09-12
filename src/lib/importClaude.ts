import { z } from 'zod'
import type { NewExercise, NewSupplement } from '../db'
import type { MindmapNode, PointNature } from '../types'
import { POINT_NATURES } from '../types'
import { countBlanks } from './cloze'
import { locateArrayElements, repairJson, repairedElements, type JsonRepairs } from './repairJson'

// ---- Schema of what Claude is asked to produce (see prompt.ts) -------------

const difficulty = z
  .union([z.number(), z.string()])
  .optional()
  .transform((v) => {
    const n = typeof v === 'string' ? parseInt(v, 10) : v
    return n === 1 || n === 3 ? n : 2
  })

const tags = z
  .array(z.string())
  .optional()
  .transform((v) => (v ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 5))

/** Claude's local point id ("p1") or, in focused mode, a real point id. */
const pointId = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => (v === undefined || v === null ? undefined : String(v).trim() || undefined))

const base = { difficulty, tags, pointId, anchor: z.string().optional() }
const str = z.string().trim().min(1)
const optStr = z
  .string()
  .optional()
  .transform((s) => (s?.trim() ? s.trim() : undefined))

const flashcard = z.object({
  type: z.literal('flashcard'),
  question: str,
  answer: str,
  hint: optStr,
  typed: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === true || v === 'true' ? true : undefined)),
  ...base,
})
const cloze = z.object({ type: z.literal('cloze'), text: str, ...base }).refine((c) => countBlanks(c.text) > 0, {
  message: 'Texte à trous sans {{trou}}',
})
const mcq = z
  .object({
    type: z.literal('mcq'),
    question: str,
    choices: z.array(str).min(2).max(6),
    correct: z.union([z.array(z.number().int()), z.number().int()]).transform((c) => (Array.isArray(c) ? c : [c])),
    explanation: optStr,
    distractorReasons: z
      .array(z.string())
      .optional()
      .transform((v) => (v && v.some((s) => s.trim()) ? v.map((s) => s.trim()) : undefined)),
    ...base,
  })
  .refine((m) => m.correct.length > 0 && m.correct.every((i) => i >= 0 && i < m.choices.length), {
    message: 'Index de réponse hors limites',
  })
const truefalse = z.preprocess(
  (raw) => {
    // Accept the French field name the prompt spec uses.
    if (raw && typeof raw === 'object' && 'enonceCorrige' in raw && !('correctedStatement' in raw)) {
      const o = raw as Record<string, unknown>
      return { ...o, correctedStatement: o.enonceCorrige }
    }
    return raw
  },
  z.object({
    type: z.literal('truefalse'),
    statement: str,
    answer: z.union([z.boolean(), z.string()]).transform((v) => (typeof v === 'boolean' ? v : /^(true|vrai|oui)$/i.test(v.trim()))),
    explanation: optStr,
    correctedStatement: optStr,
    ...base,
  }),
)
const match = z.object({
  type: z.literal('match'),
  instruction: optStr,
  pairs: z.array(z.object({ left: str, right: str })).min(2),
  ...base,
})
const order = z.object({ type: z.literal('order'), instruction: str, items: z.array(str).min(2), ...base })
const demonstration = z.object({
  type: z.literal('demonstration'),
  title: str,
  statement: str,
  steps: z
    .array(z.union([str.transform((text) => ({ text, why: undefined as string | undefined })), z.object({ text: str, why: optStr })]))
    .min(2)
    .max(12),
  ...base,
})
const rappelLibre = z.object({
  type: z.literal('rappel_libre'),
  topic: str,
  checklist: z
    .array(
      z.union([
        str.transform((text) => ({ text, pointId: undefined as string | undefined })),
        z.object({ text: str, pointId: z.union([z.string(), z.number()]).nullable().optional().transform((v) => (v == null ? undefined : String(v))) }),
      ]),
    )
    .min(3)
    .max(20),
  ...base,
})

const exerciseSchema = z.union([flashcard, cloze, mcq, truefalse, match, order, demonstration, rappelLibre])

const pointSchema = z.object({
  id: z.union([z.string(), z.number()]).transform((v) => String(v).trim()),
  title: str,
  nature: z
    .string()
    .optional()
    .transform((n): PointNature => {
      const v = (n ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      return (POINT_NATURES as string[]).includes(v) ? (v as PointNature) : 'autre'
    }),
  anchor: z
    .string()
    .optional()
    .transform((a) => (a ?? '').trim().slice(0, 200)),
})

const outputSchema = z.object({ exercises: z.array(z.unknown()), points: z.array(z.unknown()).optional() })

export interface ParsedPoint {
  /** Claude's local id ("p1") or an existing point id (focused generation). */
  localId: string
  title: string
  nature: PointNature
  anchor: string
}

export interface ParsedExercise extends NewExercise {
  /** Refers to ParsedPoint.localId (or an existing point id). */
  localPointId?: string
  anchor?: string
}

export interface RejectedItem {
  index: number
  reason: string
  /** The item as Claude wrote it (JSON), to show and to send back for correction. */
  raw: string
}

export interface ParseResult {
  points: ParsedPoint[]
  exercises: ParsedExercise[]
  /** Items Claude produced that did not validate; shown to the user, never imported. */
  rejected: RejectedItem[]
  /** What had to be repaired in the JSON before it parsed. */
  repairs: JsonRepairs
}

/** Finds the JSON payload inside a chat answer (fenced block, or the outermost object / array). */
export function extractJson(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence?.[1]?.trim()) return fence[1].trim()
  const objStart = text.indexOf('{')
  const arrStart = text.indexOf('[')
  const starts = [objStart, arrStart].filter((i) => i >= 0)
  if (!starts.length) return null
  const start = Math.min(...starts)
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  if (end <= start) return null
  return text.slice(start, end + 1)
}

const NO_REPAIRS: JsonRepairs = { doubledBackslashes: 0, trailingCommas: 0, commands: [], offsets: [] }

/** Repairs of the last payload parsed in this module (read through `runWithRepairs`). */
let lastRepairs: JsonRepairs = NO_REPAIRS

/**
 * Runs a parser and returns what it repaired in the JSON on the way. Lets the
 * import screens show « N antislashs réparés » whatever the result shape.
 */
export function runWithRepairs<T>(fn: () => T): { result: T; repairs: JsonRepairs } {
  lastRepairs = NO_REPAIRS
  const result = fn()
  return { result, repairs: lastRepairs }
}

interface Payload {
  value: unknown
  /** The JSON text actually parsed (repaired when needed). */
  text: string
  repairs: JsonRepairs
}

/** Extracts and parses the JSON payload, with the error messages shared by every importer. */
function parseJsonPayload(text: string): Payload {
  const raw = extractJson(text)
  if (!raw) throw new Error('Aucun JSON trouvé dans la réponse. Colle la réponse complète de Claude, bloc ```json inclus.')
  // Always repaired first, even when the text would parse as is: "\frac" or
  // "\theta" ARE valid JSON (form-feed + "rac", tab + "heta") and would be
  // corrupted silently. A correct JSON comes back byte-identical, zero repairs.
  // Repairs are counted and reported to the user (see repairJson.ts).
  const repaired = repairJson(raw)
  lastRepairs = repaired.repairs
  try {
    const value = JSON.parse(repaired.text)
    return { value, text: repaired.text, repairs: repaired.repairs }
  } catch {
    throw new Error('Le JSON est invalide (réponse tronquée ?). Demande à Claude de renvoyer le bloc complet.')
  }
}

function rawOf(item: unknown): string {
  try {
    return JSON.stringify(item)
  } catch {
    return String(item)
  }
}

export function parseClaudeResponse(text: string): ParseResult {
  const payload = parseJsonPayload(text)
  const parsed = payload.value
  const out = Array.isArray(parsed) ? { exercises: parsed, points: [] } : outputSchema.safeParse(parsed).data
  if (!out) throw new Error('Le JSON ne contient pas de tableau "exercises".')
  // Which exercises received a repaired backslash: they go first in the validation queue.
  const repairedIdx = payload.repairs.doubledBackslashes ? repairedElements(locateArrayElements(payload.text, 'exercises'), payload.repairs.offsets) : new Set<number>()

  const points: ParsedPoint[] = []
  const seen = new Set<string>()
  for (const raw of out.points ?? []) {
    const res = pointSchema.safeParse(raw)
    if (!res.success || seen.has(res.data.id)) continue
    seen.add(res.data.id)
    points.push({ localId: res.data.id, title: res.data.title, nature: res.data.nature, anchor: res.data.anchor })
  }

  const exercises: ParsedExercise[] = []
  const rejected: ParseResult['rejected'] = []
  out.exercises.forEach((item, index) => {
    const res = exerciseSchema.safeParse(item)
    if (!res.success) {
      rejected.push({ index, reason: res.error.issues[0]?.message ?? 'format inattendu', raw: rawOf(item) })
      return
    }
    const { difficulty, tags, pointId: localPointId, anchor, ...data } = res.data
    // An exercise can point at a point through its anchor when the id is missing.
    const byAnchor = !localPointId && anchor ? points.find((p) => p.anchor && p.anchor === anchor.trim())?.localId : undefined
    exercises.push({ data, difficulty, tags, localPointId: localPointId ?? byAnchor, anchor: anchor?.trim() || undefined, repaired: repairedIdx.has(index) || undefined })
  })
  return { points, exercises, rejected, repairs: payload.repairs }
}

// ---- Supplements -------------------------------------------------------------

const supplementSchema = z.object({
  title: str,
  kind: z
    .string()
    .optional()
    .transform((k) => {
      const v = (k ?? '').toLowerCase()
      return v.startsWith('corr') ? 'correction' : v.startsWith('prec') || v.startsWith('préc') ? 'precision' : 'manque'
    }),
  reason: z.string().optional().transform((r) => r?.trim() ?? ''),
  content: str,
})

export interface SupplementParseResult {
  supplements: NewSupplement[]
  rejected: RejectedItem[]
  repairs: JsonRepairs
}

export function parseSupplementResponse(text: string): SupplementParseResult {
  const payload = parseJsonPayload(text)
  const parsed = payload.value
  const list = Array.isArray(parsed) ? parsed : z.object({ supplements: z.array(z.unknown()) }).safeParse(parsed).data?.supplements
  if (!list) throw new Error('Le JSON ne contient pas de tableau "supplements".')
  const supplements: NewSupplement[] = []
  const rejected: SupplementParseResult['rejected'] = []
  list.forEach((item, index) => {
    const res = supplementSchema.safeParse(item)
    if (res.success) supplements.push(res.data)
    else rejected.push({ index, reason: res.error.issues[0]?.message ?? 'format inattendu', raw: rawOf(item) })
  })
  return { supplements, rejected, repairs: payload.repairs }
}

// ---- Fiches rédigées par Claude ------------------------------------------------

const ficheSchema = z.object({
  title: str,
  content: z.string().trim().min(20, 'contenu trop court'),
})

export interface FicheParseResult {
  fiches: { title: string; content: string }[]
  rejected: RejectedItem[]
  repairs: JsonRepairs
}

export function parseFicheResponse(text: string): FicheParseResult {
  const payload = parseJsonPayload(text)
  const parsed = payload.value
  const o = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  const list: unknown[] | undefined = Array.isArray(parsed)
    ? parsed
    : Array.isArray(o?.fiches)
      ? (o!.fiches as unknown[])
      : o?.fiche
        ? [o.fiche]
        : o && 'content' in o
          ? [o]
          : undefined
  if (!list) throw new Error('Le JSON ne contient pas de tableau "fiches".')
  const fiches: FicheParseResult['fiches'] = []
  const rejected: FicheParseResult['rejected'] = []
  list.forEach((item, index) => {
    const res = ficheSchema.safeParse(item)
    if (res.success) fiches.push(res.data)
    else rejected.push({ index, reason: res.error.issues[0]?.message ?? 'format inattendu', raw: rawOf(item) })
  })
  return { fiches, rejected, repairs: payload.repairs }
}

// ---- Pré-test ------------------------------------------------------------------

export function parsePretestResponse(text: string): { question: string; answer: string }[] {
  const parsed = parseJsonPayload(text).value
  const o = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  const list = Array.isArray(parsed) ? parsed : Array.isArray(o?.questions) ? (o!.questions as unknown[]) : null
  if (!list) throw new Error('Le JSON ne contient pas de tableau "questions".')
  const schema = z.object({ question: str, answer: str })
  const out = list.map((q) => schema.safeParse(q)).filter((r) => r.success).map((r) => r.data!)
  if (!out.length) throw new Error('Aucune question valide.')
  return out.slice(0, 8)
}

// ---- Mind map ----------------------------------------------------------------

const MAX_DEPTH = 6

/** Accepts the few key spellings the model tends to use (title/name/text, branches/nodes). */
function normalizeNode(raw: unknown, depth: number): MindmapNode | null {
  if (typeof raw === 'string') return raw.trim() ? { label: raw.trim() } : null
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const label = [o.label, o.title, o.name, o.text].find((v) => typeof v === 'string' && v.trim())
  if (typeof label !== 'string') return null
  const noteRaw = [o.note, o.detail, o.description].find((v) => typeof v === 'string' && v.trim())
  const kidsRaw = [o.children, o.branches, o.nodes, o.items].find(Array.isArray) as unknown[] | undefined
  const node: MindmapNode = { label: label.trim() }
  if (typeof noteRaw === 'string') node.note = noteRaw.trim()
  if (kidsRaw && depth < MAX_DEPTH) {
    const kids = kidsRaw.map((k) => normalizeNode(k, depth + 1)).filter((k): k is MindmapNode => !!k)
    if (kids.length) node.children = kids
  }
  return node
}

export function countNodes(node: MindmapNode): number {
  return 1 + (node.children?.reduce((n, c) => n + countNodes(c), 0) ?? 0)
}

export function parseMindmapResponse(text: string): MindmapNode {
  const parsed = parseJsonPayload(text).value
  const o = (parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}) as Record<string, unknown>
  const rootRaw = o.mindmap ?? o.root ?? o.map ?? parsed
  const root = normalizeNode(rootRaw, 0)
  if (!root) throw new Error('Le JSON ne contient pas de carte mentale ("mindmap" avec un "label").')
  if (!root.children?.length) throw new Error('La carte mentale n’a aucune branche.')
  return root
}
