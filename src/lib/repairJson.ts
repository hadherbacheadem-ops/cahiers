// ---------------------------------------------------------------------------
// Repairs the JSON Claude pastes back before JSON.parse: trailing commas and,
// above all, single backslashes in front of LaTeX commands ("\frac" instead of
// "\\frac"). Doing this naively is dangerous: \b \f \n \r \t ARE valid JSON
// escapes, so "\frac" silently becomes form-feed + "rac". The rules below are
// context-aware and every repair is counted and located. Pure, no DOM.
// ---------------------------------------------------------------------------

export interface JsonRepairs {
  /** Backslashes doubled because they were LaTeX, not JSON escapes. */
  doubledBackslashes: number
  trailingCommas: number
  /** What followed each repaired backslash (command name or symbol), in order. */
  commands: string[]
  /** Offset of each doubled backslash in the repaired text (for per-item attribution). */
  offsets: number[]
}

export interface RepairedJson {
  text: string
  repairs: JsonRepairs
}

/** `\n` + these letters, followed by a non-letter, is a LaTeX command rather than a newline. */
const NEWLINE_COMMANDS = new Set(['nabla', 'neq', 'ne', 'nu', 'not', 'notin', 'newline', 'nmid', 'nparallel', 'nrightarrow', 'nexists'])

const LETTER = /[A-Za-z]/

export function repairJson(raw: string): RepairedJson {
  const repairs: JsonRepairs = { doubledBackslashes: 0, trailingCommas: 0, commands: [], offsets: [] }
  let out = ''
  let i = 0
  let inString = false
  let inMath = false

  const double = (what: string) => {
    repairs.doubledBackslashes++
    repairs.commands.push(what)
    repairs.offsets.push(out.length)
    out += '\\\\'
  }

  while (i < raw.length) {
    const ch = raw[i]

    if (!inString) {
      if (ch === '"') {
        inString = true
        inMath = false
        out += ch
        i++
        continue
      }
      if (ch === ',') {
        let j = i + 1
        while (j < raw.length && /\s/.test(raw[j])) j++
        if (raw[j] === ']' || raw[j] === '}') {
          repairs.trailingCommas++
          i++
          continue
        }
      }
      out += ch
      i++
      continue
    }

    // ---- inside a JSON string ----------------------------------------------
    if (ch === '"') {
      inString = false
      out += ch
      i++
      continue
    }
    if (ch === '$') {
      if (raw[i + 1] === '$') {
        out += '$$'
        i += 2
      } else {
        out += '$'
        i++
      }
      inMath = !inMath
      continue
    }
    if (ch !== '\\') {
      out += ch
      i++
      continue
    }

    const next = raw[i + 1]
    if (next === undefined) {
      double('')
      i++
      continue
    }
    if (next === '\\') {
      // Already doubled: keep, and track \\( \\[ \\) \\] delimiters.
      out += '\\\\'
      i += 2
      const after = raw[i]
      if (after === '(' || after === '[') inMath = true
      else if (after === ')' || after === ']') inMath = false
      continue
    }
    if (next === '"' || next === '/') {
      out += '\\' + next
      i += 2
      continue
    }
    if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(raw.slice(i + 2, i + 6))) {
      out += raw.slice(i, i + 6)
      i += 6
      continue
    }
    if (LETTER.test(next)) {
      const word = raw.slice(i + 1).match(/^[A-Za-z]+/)?.[0] ?? next
      const afterWord = raw[i + 1 + word.length] ?? ''
      let isCommand: boolean
      if (inMath) isCommand = true
      else if ('bfrt'.includes(next)) isCommand = word.length > 1
      else if (next === 'n') isCommand = NEWLINE_COMMANDS.has(word) && !LETTER.test(afterWord)
      else isCommand = true // not a JSON escape at all
      if (isCommand) {
        double(word)
        i++ // the letters follow as ordinary characters
      } else {
        out += '\\' + next
        i += 2
      }
      continue
    }
    // Any other character: not a JSON escape, so a LaTeX delimiter or symbol (\( \[ \{ \$ \, \; \| …).
    if (next === '(' || next === '[') inMath = true
    else if (next === ')' || next === ']') inMath = false
    double(next)
    out += next
    i += 2
  }

  repairs.trailingCommas += 0
  return { text: out, repairs }
}

/**
 * Character spans of the elements of a JSON array in `text`: the array under
 * `key` at the root object, or the root array itself. Used to attribute
 * repairs to items. Returns [] when the array is not found.
 */
export function locateArrayElements(text: string, key: string): { start: number; end: number }[] {
  let i = 0
  const n = text.length
  const skipWs = () => {
    while (i < n && /\s/.test(text[i])) i++
  }
  const skipString = () => {
    // text[i] === '"'
    i++
    while (i < n) {
      if (text[i] === '\\') i += 2
      else if (text[i] === '"') {
        i++
        return
      } else i++
    }
  }

  skipWs()
  let arrayStart = -1
  if (text[i] === '[') arrayStart = i
  else if (text[i] === '{') {
    // Look for `"key"` at depth 1.
    let depth = 0
    while (i < n) {
      const ch = text[i]
      if (ch === '"') {
        const s = i
        skipString()
        if (depth === 1 && text.slice(s, i) === JSON.stringify(key)) {
          skipWs()
          if (text[i] === ':') {
            i++
            skipWs()
            if (text[i] === '[') {
              arrayStart = i
              break
            }
          }
        }
        continue
      }
      if (ch === '{' || ch === '[') depth++
      else if (ch === '}' || ch === ']') depth--
      i++
    }
  }
  if (arrayStart < 0) return []

  const spans: { start: number; end: number }[] = []
  i = arrayStart + 1
  while (i < n) {
    skipWs()
    if (text[i] === ']' || i >= n) break
    const start = i
    let depth = 0
    let end = -1
    while (i < n) {
      const ch = text[i]
      if (ch === '"') {
        skipString()
        continue
      }
      if (ch === '{' || ch === '[') depth++
      else if (ch === '}' || ch === ']') {
        if (depth === 0) {
          end = i
          break
        }
        depth--
      } else if (ch === ',' && depth === 0) {
        end = i
        break
      }
      i++
    }
    if (end < 0) end = n
    let trimmed = end
    while (trimmed > start && /\s/.test(text[trimmed - 1])) trimmed--
    spans.push({ start, end: trimmed })
    if (text[i] === ',') i++
    else break
  }
  return spans
}

/** Indexes of the array elements that contain at least one repair offset. */
export function repairedElements(spans: { start: number; end: number }[], offsets: number[]): Set<number> {
  const set = new Set<number>()
  for (const o of offsets) {
    const idx = spans.findIndex((s) => o >= s.start && o < s.end)
    if (idx >= 0) set.add(idx)
  }
  return set
}
