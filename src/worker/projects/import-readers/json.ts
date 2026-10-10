import { GRAPH_LIMITS } from '../../../shared/import-graph'
export class InputError extends Error {
  consumedValues = 0
  constructor(
    readonly kind: 'corrupt' | 'limited' | 'unsupported',
    message: string
  ) {
    super(message)
  }
}
export type ParsedInput = { value: unknown; numbers: Map<string, string>; values: number }
export const pointer = (base: string, key: string | number): string => {
  const result = `${base}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`
  if (result.length > 8192)
    throw new InputError('limited', 'An input locator exceeds the supported length.')
  return result
}
/** Strict bounded parser: admission precedes object/string allocation; duplicate keys are refused. */
export function parseInputJson(text: string, remaining: number = GRAPH_LIMITS.values): ParsedInput {
  let at = 0,
    values = 0
  const numbers = new Map<string, string>()
  const fail = (): never => {
    throw new InputError('corrupt', `Invalid JSON syntax near decoded offset ${at}.`)
  }
  const space = (): void => {
    while (at < text.length && /[ \t\r\n]/u.test(text[at])) at++
  }
  function string(): string {
    const start = at++
    let units = 0
    for (;;) {
      if (at >= text.length) return fail()
      const c = text[at++]
      if (c === '"') break
      if (c.charCodeAt(0) < 32) return fail()
      if (c === '\\') {
        const escaped = text[at++]
        if (escaped === 'u') {
          if (!/^[a-fA-F0-9]{4}$/u.test(text.slice(at, at + 4))) return fail()
          at += 4
        } else if (!escaped || !'"\\/bfnrt'.includes(escaped)) return fail()
      }
      if (++units > GRAPH_LIMITS.string)
        throw new InputError('limited', 'A decoded JSON string exceeds 2,000,000 UTF-16 units.')
    }
    return JSON.parse(text.slice(start, at)) as string
  }
  function value(depth: number, path: string): unknown {
    if (depth > GRAPH_LIMITS.depth || ++values > remaining)
      throw new InputError('limited', 'The JSON depth/value budget was exceeded.')
    space()
    const c = text[at]
    if (c === '"') return string()
    if (c === '{') {
      at++
      space()
      const result: Record<string, unknown> = Object.create(null)
      if (text[at] === '}') {
        at++
        return result
      }
      for (;;) {
        space()
        if (text[at] !== '"') return fail()
        const key = string()
        if (++values > remaining)
          throw new InputError('limited', 'The JSON member budget was exceeded.')
        if (Object.hasOwn(result, key))
          throw new InputError(
            'corrupt',
            'Duplicate JSON object keys prevent an unambiguous source locator.'
          )
        space()
        if (text[at++] !== ':') return fail()
        result[key] = value(depth + 1, pointer(path, key))
        space()
        const end = text[at++]
        if (end === '}') return result
        if (end !== ',') return fail()
      }
    }
    if (c === '[') {
      at++
      space()
      const result: unknown[] = []
      if (text[at] === ']') {
        at++
        return result
      }
      for (;;) {
        result.push(value(depth + 1, pointer(path, result.length)))
        space()
        const end = text[at++]
        if (end === ']') return result
        if (end !== ',') return fail()
      }
    }
    for (const [word, result] of [
      ['true', true],
      ['false', false],
      ['null', null]
    ] as const)
      if (text.startsWith(word, at)) {
        at += word.length
        return result
      }
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/u.exec(text.slice(at, at + 1024))
    if (!match) return fail()
    at += match[0].length
    const number = Number(match[0])
    if (!Number.isFinite(number))
      throw new InputError('corrupt', 'Non-finite JSON numbers are unsupported.')
    numbers.set(path, match[0])
    return number
  }
  try {
    const result = value(0, '')
    space()
    if (at !== text.length) fail()
    return { value: result, numbers, values }
  } catch (error) {
    if (error instanceof InputError) error.consumedValues = values
    throw error
  }
}
export function valueAt(value: unknown, path: string): unknown {
  if (!path) return value
  let current = value
  for (const raw of path.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~')
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key))
      throw new InputError('corrupt', 'The retained locator does not exist.')
    current = (current as Record<string, unknown>)[key]
  }
  return current
}
