import { createHash } from 'node:crypto'
import type { ImportFile, ImportSettings } from '../../../shared/project-import'
import {
  GRAPH_LIMITS,
  type GraphRecord,
  type GraphRelation,
  type GraphLocator,
  type GraphText
} from '../../../shared/import-graph'
import { requestDigest } from '../../storage/digest'
import { InputError, pointer } from './json'
export function graphId(value: unknown): string {
  const hex = createHash('sha256').update(JSON.stringify(value)).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
export const textDigest = (text: string): string =>
  requestDigest({ contract: 'import-text-v1', text })
export function textBoundary(text: string, end: number): number {
  return end > 0 &&
    end < text.length &&
    /[\uD800-\uDBFF]/u.test(text[end - 1]) &&
    /[\uDC00-\uDFFF]/u.test(text[end])
    ? end - 1
    : end
}
/** Shared original-reference emission for known readers and the finite mapping interpreter. */
export class OriginalRecords {
  readonly records: GraphRecord[] = []
  readonly relations: GraphRelation[] = []
  protected file!: ImportFile
  protected numbers = new Map<string, string>()
  protected units = 0
  constructor(protected readonly settings: ImportSettings) {}
  protected loc(path: string): GraphLocator {
    return { fileId: this.file.id, sha256: this.file.sha256, pointer: path }
  }
  protected issue(r: GraphRecord, issue: string): void {
    if (!r.issues.includes(issue) && r.issues.length < 32) r.issues.push(issue)
  }
  protected add(kind: GraphRecord['kind'], path: string, label: string): GraphRecord {
    if (this.records.length >= GRAPH_LIMITS.records)
      throw new InputError('limited', 'The batch record limit was reached.')
    const id = graphId(['record-v1', this.file.id, this.file.sha256, path, kind])
    const r: GraphRecord = {
      version: 1,
      id,
      kind,
      locator: this.loc(path),
      originNamespace: 'unknown',
      identityId: graphId(['local-identity-v1', this.file.sha256, path, kind]),
      conversationIdentityId: null,
      externalId: null,
      externalConversationId: null,
      nodeId: null,
      label: label.length <= 256 ? label : `${label.slice(0, 253)}…`,
      role: null,
      contentType: null,
      order: this.records.length,
      path: 'none',
      disposition: 'candidate',
      eligible: false,
      texts: [],
      facts: [],
      unknownFields: [],
      issues: []
    }
    this.records.push(r)
    return r
  }
  protected fact(r: GraphRecord, name: string, value: unknown, path: string): void {
    if (value === undefined) return
    const encoded =
      typeof value === 'string'
        ? value
        : typeof value === 'number'
          ? (this.numbers.get(path) ?? JSON.stringify(value))
          : JSON.stringify(value)
    if (
      encoded.length > 4000 ||
      r.facts.length >= 32 ||
      r.facts.reduce((n, f) => n + f.value.length, 0) + encoded.length > 16000
    ) {
      this.issue(r, 'Additional or overlong metadata remains at the original locator.')
      return
    }
    if (this.units + encoded.length > GRAPH_LIMITS.units)
      throw new InputError('limited', 'The batch extracted text/metadata budget was exceeded.')
    this.units += encoded.length
    r.facts.push({ name, value: encoded, locator: this.loc(path) })
  }
  protected facts(
    r: GraphRecord,
    value: Record<string, unknown>,
    path: string,
    keys: string[]
  ): void {
    for (const key of keys) this.fact(r, key, value[key], pointer(path, key))
    const unknown = Object.keys(value).filter(
      (k) =>
        !keys.includes(k) &&
        ![
          'mapping',
          'conversation',
          'threads',
          'message',
          'content',
          'sources',
          'metadata',
          'author'
        ].includes(k)
    )
    r.unknownFields = unknown.filter((k) => k.length <= 128).slice(0, 128)
    if (r.unknownFields.length !== unknown.length)
      this.issue(r, 'Further unknown field names are retained in the original.')
  }
  protected date(r: GraphRecord, value: unknown, path: string): void {
    if (value === undefined || value === null) return
    this.fact(r, 'historicalTime.raw', value, path)
    const zoned =
      typeof value === 'number' ||
      (typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/u.test(value))
    const millis =
      typeof value === 'number'
        ? value * 1000
        : typeof value === 'string' && zoned
          ? Date.parse(value)
          : NaN
    this.fact(
      r,
      'historicalTime.normalizedUtc',
      Number.isFinite(millis) && Math.abs(millis) <= 8.64e15
        ? new Date(millis).toISOString()
        : 'unknown',
      path
    )
    this.fact(r, 'historicalTime.zoneKnown', zoned, path)
    this.fact(
      r,
      'historicalTime.precision',
      typeof value === 'number'
        ? 'exported numeric seconds; exact lexical value retained'
        : 'exported text; no missing precision inferred',
      path
    )
  }
  protected text(r: GraphRecord, text: string, path: string, start = 0, end = text.length): void {
    if (r.texts.length >= 128 || end - start > GRAPH_LIMITS.string)
      throw new InputError('limited', 'A record exceeds the text-part/string limit.')
    if (this.units + end - start > GRAPH_LIMITS.units)
      throw new InputError('limited', 'The batch extracted text/metadata budget was exceeded.')
    const value = text.slice(start, end),
      id = graphId(['text-v1', this.file.id, this.file.sha256, path, start, end])
    const ref: GraphText = {
      id,
      locator: this.loc(path),
      units: value.length,
      start,
      end,
      sha256: textDigest(value),
      fragments: []
    }
    for (let pos = 0; pos < value.length;) {
      const next = textBoundary(value, Math.min(value.length, pos + GRAPH_LIMITS.fragment))
      ref.fragments.push({ id: graphId(['fragment-v1', id, pos, next]), start: pos, end: next })
      pos = next
    }
    r.texts.push(ref)
    this.units += value.length
    if (value.length > GRAPH_LIMITS.text) {
      r.eligible = false
      this.issue(
        r,
        'Text exceeds the current accepted-record limit; original and fragments are retained.'
      )
    }
  }
  protected relation(
    kind: GraphRelation['kind'],
    from: GraphRecord,
    to: GraphRecord | null,
    evidence: GraphLocator,
    decision: GraphRelation['decision'] = null,
    grade: string | null = null,
    issue: string | null = null
  ): void {
    if (this.relations.length >= GRAPH_LIMITS.relations)
      throw new InputError('limited', 'The batch relationship limit was reached.')
    this.relations.push({
      version: 1,
      id: graphId(['relation-v1', kind, from.id, to?.id ?? null, evidence, decision]),
      kind,
      from: from.id,
      to: to?.id ?? null,
      evidence,
      decision,
      grade,
      issue
    })
  }
}
