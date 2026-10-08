import { AI_LIMITS, aiText } from '../../shared/ai'
import { record } from '../../shared/projects'
import {
  isWebReference,
  isWebResearch,
  RESEARCH_LIMITS,
  textBoundary,
  type WebResearch,
  type WebReference
} from '../../shared/conversation-research'
import { DirectError, directIssue } from './direct-errors'
const invalid = (): never => {
  throw new DirectError({
    ...directIssue('inference-stream', 'provider-failed', 'invalid-response'),
    code: 'collie_invalid_research_response'
  })
}
const index = (v: unknown): v is number =>
  Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) < 256
/** Only answer text and public source metadata survive this request-local parser. */
export class ResearchResponse {
  private items = new Map<number, Record<string, unknown>>()
  private identities = new Map<number, string>()
  private parts = new Map<string, { text: string; annotations: unknown[] }>()
  private warning = false
  private lastSlot = -1
  receive(v: Record<string, unknown>): void {
    if (['response.output_item.added', 'response.output_item.done'].includes(String(v.type))) {
      if (
        !index(v.output_index) ||
        !record(v.item) ||
        !['message', 'web_search_call', 'reasoning'].includes(String(v.item.type))
      )
        invalid()
      const item = v.item as Record<string, unknown>
      if (typeof item.id !== 'string' || item.id.length > 512 || !item.id) invalid()
      const id = item.id as string
      if (
        this.identities.has(v.output_index as number) &&
        this.identities.get(v.output_index as number) !== id
      )
        invalid()
      this.identities.set(v.output_index as number, id)
      // The transport's 8 MiB wire/1 MiB event ceilings bound this request-local
      // data. Ancillary metadata is trimmed at completion, not a text failure.
      if (v.type === 'response.output_item.done' && item.type !== 'reasoning') {
        this.items.set(v.output_index as number, item)
      }
    }
    if (
      ![
        'response.output_text.delta',
        'response.refusal.delta',
        'response.output_text.annotation.added'
      ].includes(String(v.type))
    )
      return
    if (
      !index(v.output_index) ||
      !index(v.content_index) ||
      typeof v.item_id !== 'string' ||
      !v.item_id ||
      v.item_id.length > 512
    ) {
      if (v.type === 'response.output_text.annotation.added') {
        this.warning = true
        return
      }
      invalid()
    }
    const output = v.output_index as number,
      content = v.content_index as number,
      id = v.item_id as string
    if (this.identities.has(output) && this.identities.get(output) !== id) {
      if (v.type === 'response.output_text.annotation.added') {
        this.warning = true
        return
      }
      invalid()
    }
    if (v.type === 'response.output_text.annotation.added' && !this.identities.has(output)) {
      this.warning = true
      return
    }
    if ([...this.identities].some(([slot, known]) => slot !== output && known === id)) invalid()
    this.identities.set(output, id)
    const key = `${output}:${content}`,
      part = this.parts.get(key) ?? { text: '', annotations: [] }
    if (v.type === 'response.output_text.annotation.added') {
      if (part.annotations.length < RESEARCH_LIMITS.citations) part.annotations.push(v.annotation)
      else this.warning = true
    } else {
      const slot = output * 256 + content
      if (
        slot < this.lastSlot ||
        !aiText(v.delta, AI_LIMITS.output) ||
        part.text.length + String(v.delta).length > AI_LIMITS.output
      )
        invalid()
      this.lastSlot = slot
      part.text += v.delta as string
    }
    this.parts.set(key, part)
  }
  complete(value: unknown, streamed: string): { text: string; research: WebResearch } {
    if (
      !record(value) ||
      value.status !== 'completed' ||
      value.error != null ||
      value.incomplete_details != null ||
      !Array.isArray(value.output) ||
      value.output.length > 256
    )
      invalid()
    const terminal = value as Record<string, unknown> & { output: unknown[] }
    for (let i = 0; i < terminal.output.length; i++) {
      const item = terminal.output[i]
      if (!record(item)) invalid()
      const entry = item as Record<string, unknown>
      if (entry.type === 'reasoning') continue
      if (
        !['message', 'web_search_call'].includes(String(entry.type)) ||
        typeof entry.id !== 'string' ||
        !entry.id ||
        entry.id.length > 512
      )
        invalid()
      if ([...this.identities].some(([slot, known]) => slot !== i && known === entry.id)) invalid()
      if (this.identities.has(i) && this.identities.get(i) !== entry.id) invalid()
      this.identities.set(i, entry.id as string)
      this.items.set(i, entry)
    }
    const result: WebResearch = {
      version: 1,
      searched: false,
      citations: [],
      sources: [],
      warning: this.warning
    }
    const reference = (v: unknown): WebReference | null => {
      if (!record(v)) return null
      const r = { url: v.url, title: v.title ?? '' }
      return isWebReference(r) ? r : null
    }
    const source = (raw: unknown): void => {
      const ref = reference(raw)
      if (!ref) {
        result.warning = true
        return
      }
      if (result.sources.some((s) => s.url === ref.url)) return
      if (
        result.sources.length >= RESEARCH_LIMITS.sources ||
        JSON.stringify(result).length + JSON.stringify(ref).length > RESEARCH_LIMITS.units - 100
      ) {
        result.warning = true
        return
      }
      result.sources.push(ref)
    }
    let text = ''
    const append = (raw: unknown, output: number, content: number): void => {
      if (!record(raw)) invalid()
      const part = raw as Record<string, unknown>,
        retained = this.parts.get(`${output}:${content}`)
      const answer =
        part.type === 'output_text' ? part.text : part.type === 'refusal' ? part.refusal : null
      if (
        !aiText(answer, AI_LIMITS.output) ||
        text.length + String(answer).length > AI_LIMITS.output ||
        (retained?.text && retained.text !== answer)
      )
        invalid()
      const body = answer as string,
        offset = text.length
      text += body
      const annotations = part.annotations ?? retained?.annotations ?? []
      if (!Array.isArray(annotations)) {
        result.warning = true
        return
      }
      if (annotations.length > RESEARCH_LIMITS.citations) result.warning = true
      for (const annotation of annotations.slice(0, RESEARCH_LIMITS.citations)) {
        const ref = reference(annotation)
        if (
          !record(annotation) ||
          annotation.type !== 'url_citation' ||
          !ref ||
          typeof annotation.start_index !== 'number' ||
          typeof annotation.end_index !== 'number' ||
          !textBoundary(body, annotation.start_index) ||
          !textBoundary(body, annotation.end_index) ||
          annotation.end_index < annotation.start_index
        ) {
          result.warning = true
          continue
        }
        const citation = {
          ...ref,
          start: offset + annotation.start_index,
          end: offset + annotation.end_index
        }
        if (result.citations.some((c) => JSON.stringify(c) === JSON.stringify(citation))) continue
        if (
          result.citations.length >= RESEARCH_LIMITS.citations ||
          JSON.stringify(result).length + JSON.stringify(citation).length >
            RESEARCH_LIMITS.units - 100
        ) {
          result.warning = true
          continue
        }
        result.citations.push(citation)
      }
    }
    const messageSlots = new Set<number>()
    for (const [output, item] of [...this.items].sort((a, b) => a[0] - b[0])) {
      if (item.type === 'web_search_call') {
        if (item.status !== 'completed')
          throw new DirectError(directIssue('inference-stream', 'provider-failed', 'incomplete'))
        result.searched = true
        if (
          !record(item.action) ||
          !['search', 'open_page', 'find_in_page'].includes(String(item.action.type))
        ) {
          result.warning = true
          continue
        }
        if (item.action.type === 'search') {
          if (!Array.isArray(item.action.sources)) {
            result.warning = true
            continue
          }
          if (item.action.sources.length > RESEARCH_LIMITS.sources) result.warning = true
          for (const s of item.action.sources.slice(0, RESEARCH_LIMITS.sources)) source(s)
        } else if (item.action.url != null) source({ url: item.action.url })
      } else {
        if (
          item.role !== 'assistant' ||
          item.status !== 'completed' ||
          !Array.isArray(item.content) ||
          item.content.length > 256
        )
          invalid()
        messageSlots.add(output)
      }
    }
    // Completion may omit duplicate messages; deltas and annotation events are
    // still tied to the same output/content slot. Never infer success at EOF.
    const outputs = new Set([
      ...messageSlots,
      ...[...this.parts.keys()].map((k) => Number(k.split(':')[0]))
    ])
    for (const output of [...outputs].sort((a, b) => a - b)) {
      const item = this.items.get(output)
      if (item?.type === 'message' && Array.isArray(item.content) && item.content.length)
        item.content.forEach((part, i) => append(part, output, i))
      else {
        for (const [key, part] of [...this.parts]
          .filter(([k]) => Number(k.split(':')[0]) === output)
          .sort((a, b) => Number(a[0].split(':')[1]) - Number(b[0].split(':')[1])))
          append(
            { type: 'output_text', text: part.text, annotations: part.annotations },
            output,
            Number(key.split(':')[1])
          )
        result.warning = true
      }
    }
    if (!text.trim() || (streamed && text !== streamed)) invalid()
    if (!result.searched && (result.citations.length || result.sources.length)) {
      result.citations = []
      result.sources = []
      result.warning = true
    }
    if (result.searched && !result.citations.length) result.warning = true
    if (!isWebResearch(result, text)) invalid()
    return { text, research: result }
  }
}
