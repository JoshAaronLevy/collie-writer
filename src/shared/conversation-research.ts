import { exact, record } from './projects'
import { hasControlCharacters } from './control-characters'

export const RESEARCH_LIMITS = { citations: 64, sources: 32, units: 64000 } as const
export type WebReference = { url: string; title: string }
/** Offsets are UTF-16 boundaries in the exact retained assistant text. */
export type WebCitation = WebReference & { start: number; end: number }
export type WebResearch = {
  version: 1
  searched: boolean
  citations: WebCitation[]
  sources: WebReference[]
  warning: boolean
}
export function researchUrl(v: unknown): v is string {
  if (
    typeof v !== 'string' ||
    v.length > 2048 ||
    /\s/u.test(v) ||
    hasControlCharacters(v, false, 0x7f)
  )
    return false
  try {
    const url = new URL(v)
    return (
      ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
    )
  } catch {
    return false
  }
}
export function isWebReference(v: unknown): v is WebReference {
  return (
    record(v) &&
    researchUrl(v.url) &&
    typeof v.title === 'string' &&
    v.title.length <= 300 &&
    !hasControlCharacters(v.title, false, 0x7f)
  )
}
export function textBoundary(text: string, at: number): boolean {
  return (
    Number.isSafeInteger(at) &&
    at >= 0 &&
    at <= text.length &&
    !(
      at > 0 &&
      at < text.length &&
      /[\uD800-\uDBFF]/.test(text[at - 1]) &&
      /[\uDC00-\uDFFF]/.test(text[at])
    )
  )
}
export function isWebResearch(v: unknown, text: string): v is WebResearch {
  return (
    record(v) &&
    exact(v, ['version', 'searched', 'citations', 'sources', 'warning']) &&
    v.version === 1 &&
    typeof v.searched === 'boolean' &&
    typeof v.warning === 'boolean' &&
    Array.isArray(v.citations) &&
    v.citations.length <= RESEARCH_LIMITS.citations &&
    v.citations.every(
      (c) =>
        record(c) &&
        exact(c, ['url', 'title', 'start', 'end']) &&
        typeof c.start === 'number' &&
        typeof c.end === 'number' &&
        textBoundary(text, c.start) &&
        textBoundary(text, c.end) &&
        c.end >= c.start &&
        isWebReference(c)
    ) &&
    Array.isArray(v.sources) &&
    v.sources.length <= RESEARCH_LIMITS.sources &&
    v.sources.every((s) => isWebReference(s) && exact(s, ['url', 'title'])) &&
    (v.searched || (!v.citations.length && !v.sources.length)) &&
    JSON.stringify(v).length <= RESEARCH_LIMITS.units
  )
}
