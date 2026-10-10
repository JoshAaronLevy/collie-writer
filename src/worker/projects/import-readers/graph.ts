import { createHash } from 'node:crypto'
import { record } from '../../../shared/projects'
import type { ImportFile, ImportSettings } from '../../../shared/project-import'
import {
  GRAPH_LIMITS,
  type GraphRecord,
  type GraphRelation,
  type GraphLocator,
  type GraphFileCoverage,
  type GraphText
} from '../../../shared/import-graph'
import { requestDigest } from '../../storage/digest'
import { parseBibliographyRows } from '../sources'
import { InputError, parseInputJson, pointer, type ParsedInput } from './json'

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
const string = (v: unknown): string | null =>
  typeof v === 'string' && v.length > 0 && v.length <= 4000 ? v : null
const object = (v: unknown): Record<string, unknown> => (record(v) ? v : Object.create(null))
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const rawMessage = (v: unknown): boolean => record(v) && record(v.author) && record(v.content)
const curatedMessage = (v: unknown): boolean =>
  record(v) && typeof v.role === 'string' && typeof v.message === 'string'
const rawChat = (v: unknown): boolean =>
  record(v) && record(v.mapping) && ('current_node' in v || 'conversation_id' in v)
const curatedChat = (v: unknown): boolean =>
  record(v) &&
  Array.isArray(v.conversation) &&
  (Array.isArray(v.threads) || v.conversation.some(curatedMessage))
const csl = (v: unknown): boolean =>
  record(v) &&
  typeof v.type === 'string' &&
  v.type !== 'note' &&
  ('title' in v || 'author' in v || 'DOI' in v || 'URL' in v) &&
  !('content' in v) &&
  !('message' in v)
export type BuiltGraph = {
  records: GraphRecord[]
  relations: GraphRelation[]
  files: GraphFileCoverage[]
  textUnits: number
}
export class GraphBuilder {
  readonly records: GraphRecord[] = []
  readonly relations: GraphRelation[] = []
  readonly files: GraphFileCoverage[] = []
  private file!: ImportFile
  private numbers = new Map<string, string>()
  private parsedValues = 0
  private units = 0
  private conversationRecords = new Map<string, GraphRecord>()
  constructor(private readonly settings: ImportSettings) {}
  private loc(path: string): GraphLocator {
    return { fileId: this.file.id, sha256: this.file.sha256, pointer: path }
  }
  private issue(r: GraphRecord, issue: string): void {
    if (!r.issues.includes(issue) && r.issues.length < 32) r.issues.push(issue)
  }
  private add(kind: GraphRecord['kind'], path: string, label: string): GraphRecord {
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
  private fact(r: GraphRecord, name: string, value: unknown, path: string): void {
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
  private facts(
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
  private date(r: GraphRecord, value: unknown, path: string): void {
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
  private text(r: GraphRecord, text: string, path: string, start = 0, end = text.length): void {
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
  private relation(
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
  private conversation(
    value: Record<string, unknown>,
    path: string,
    id: string | null,
    namespace: GraphRecord['originNamespace'] = 'curated'
  ): GraphRecord {
    const r = this.add(
      'conversation',
      path,
      string(value.title) ?? 'Untitled external conversation'
    )
    r.originNamespace = namespace
    r.externalId = id
    r.externalConversationId = id
    r.identityId = id ? graphId(['conversation-identity-v1', namespace, id]) : r.identityId
    r.eligible = !!id && this.settings.categories.includes('chats')
    if (!id) {
      r.disposition = 'unresolved'
      this.issue(r, 'Conversation identity is missing or contradictory.')
    } else if (!this.conversationRecords.has(`${namespace}:${id}`))
      this.conversationRecords.set(`${namespace}:${id}`, r)
    this.facts(r, value, path, [
      'id',
      'conversation_id',
      'title',
      'create_time',
      'update_time',
      'date',
      'is_archived',
      'is_do_not_remember',
      'is_read_only',
      'is_starred',
      'categories',
      'tags',
      'message_counts'
    ])
    return r
  }
  private attach(r: GraphRecord, conversation: GraphRecord, evidence = r.locator): void {
    if (
      r.externalConversationId &&
      r.externalConversationId !== conversation.externalConversationId
    ) {
      r.eligible = false
      if (r.disposition === 'candidate') r.disposition = 'unresolved'
      this.issue(
        r,
        'Message conversation identity conflicts with its containing envelope; original claim retained in metadata.'
      )
    }
    r.originNamespace = conversation.originNamespace
    r.externalConversationId = conversation.externalConversationId
    r.conversationIdentityId = conversation.identityId
    if (r.externalId && r.externalConversationId)
      r.identityId = graphId([
        'message-identity-v1',
        r.originNamespace,
        r.externalConversationId,
        r.externalId
      ])
    this.relation('member', r, conversation, evidence)
  }
  private message(value: Record<string, unknown>, path: string, curated: boolean): GraphRecord {
    const author = object(value.author),
      content = object(value.content),
      metadata = object(value.metadata)
    const role = curated
      ? value.role === 'You'
        ? 'user'
        : value.role === 'LLM'
          ? 'assistant'
          : string(value.role)
      : string(author.role)
    const contentType = curated ? 'curated-text' : string(content.content_type)
    const internal =
      ['thoughts', 'reasoning_recap', 'reasoning', 'analysis'].includes(contentType ?? '') ||
      value.channel === 'analysis' ||
      metadata.channel === 'analysis' ||
      metadata.is_visually_hidden_from_conversation === true
    const r = this.add(
      'message',
      path,
      `${role ?? 'Unknown role'} · ${internal ? 'excluded internal record' : (contentType ?? 'unknown content')}`
    )
    r.role = role
    r.contentType = contentType
    r.externalId = string(value.id)
    r.externalConversationId = string(value.conversation_id)
    r.path = 'array-order'
    r.disposition = internal
      ? 'internal'
      : !['user', 'assistant'].includes(role ?? '')
        ? 'unsupported'
        : 'candidate'
    r.eligible = r.disposition === 'candidate' && this.settings.categories.includes('chats')
    this.facts(r, value, path, [
      'id',
      'role',
      'date',
      'create_time',
      'update_time',
      'conversation_id',
      'conversation_title',
      'turn_index',
      'conversation_turn_index',
      'category',
      'tags',
      'channel'
    ])
    if (!curated) {
      this.fact(r, 'participant', author, pointer(path, 'author'))
      this.fact(
        r,
        'contentType',
        content.content_type,
        pointer(pointer(path, 'content'), 'content_type')
      )
    }
    this.date(
      r,
      curated ? value.date : value.create_time,
      pointer(path, curated ? 'date' : 'create_time')
    )
    if (!internal) {
      if (curated && typeof value.message === 'string')
        this.text(r, value.message, pointer(path, 'message'))
      else if (contentType === 'text' || contentType === 'multimodal_text') {
        list(content.parts).forEach((part, i) => {
          if (typeof part === 'string')
            this.text(r, part, pointer(pointer(pointer(path, 'content'), 'parts'), i))
          else this.issue(r, 'Non-text message part is retained but unavailable to this reader.')
        })
      } else {
        r.disposition = 'unsupported'
        r.eligible = false
        this.issue(r, 'Unsupported message content remains in the original.')
      }
      this.sources(r, value, path, curated)
    }
    if (!r.texts.length) r.eligible = false
    return r
  }
  private source(
    message: GraphRecord | null,
    value: Record<string, unknown>,
    path: string,
    decision: GraphRelation['decision']
  ): GraphRecord {
    const r = this.add(
      'source',
      path,
      string(value.title) ?? string(value.url) ?? string(value.URL) ?? 'External reference'
    )
    r.disposition =
      decision === 'rejected' ? 'rejected' : decision === 'search' ? 'search' : 'candidate'
    r.eligible =
      r.disposition === 'candidate' &&
      this.settings.categories.includes('sources') &&
      message?.disposition !== 'internal'
    this.facts(r, value, path, [
      'id',
      'title',
      'url',
      'URL',
      'DOI',
      'ISBN',
      'author',
      'attribution',
      'letter_grade',
      'snippet',
      'pub_date',
      'type',
      'issued',
      'container-title',
      'publisher'
    ])
    if (decision) this.fact(r, 'occurrence.decision', decision, path)
    if (message)
      this.relation('reference', message, r, r.locator, decision, string(value.letter_grade))
    return r
  }
  private sources(
    message: GraphRecord,
    value: Record<string, unknown>,
    path: string,
    curated: boolean
  ): void {
    if (curated) {
      const sources = object(value.sources)
      for (const decision of ['kept', 'rejected'] as const)
        list(sources[decision]).forEach((item, i) => {
          if (record(item))
            this.source(
              message,
              item,
              pointer(pointer(pointer(path, 'sources'), decision), i),
              decision
            )
          else {
            const loc = pointer(pointer(pointer(path, 'sources'), decision), i)
            const retained = this.add('retained', loc, 'Unsupported reference occurrence')
            retained.disposition = 'unsupported'
            this.issue(
              retained,
              'Reference occurrence is not a supported metadata object; original retained.'
            )
            this.relation('reference', message, retained, retained.locator, decision)
          }
        })
      return
    }
    const metadata = object(value.metadata),
      base = pointer(path, 'metadata')
    const walk = (value: unknown, path: string, decision: 'cited' | 'search', depth = 0): void => {
      if (depth > GRAPH_LIMITS.depth)
        throw new InputError('limited', 'Reference nesting exceeds the reader limit.')
      if (Array.isArray(value)) {
        value.forEach((v, i) => walk(v, pointer(path, i), decision, depth + 1))
        return
      }
      if (!record(value)) return
      const referenceType = string(value.type)
      if (
        referenceType &&
        ![
          'grouped_webpages',
          'webpage',
          'webpages',
          'web',
          'webpage_extended',
          'url_citation',
          'citation'
        ].includes(referenceType)
      ) {
        const retained = this.add('retained', path, 'Unsupported reference metadata')
        retained.disposition = 'unsupported'
        this.facts(retained, value, path, ['type'])
        this.issue(
          retained,
          'Image, widget or unfamiliar reference metadata is retained without treating it as a cited source.'
        )
        this.relation('reference', message, retained, retained.locator, null)
        return
      }
      if (typeof value.url === 'string' || typeof value.URL === 'string')
        this.source(message, value, path, decision)
      for (const key of [
        'items',
        'sources',
        'results',
        'entries',
        'search_results',
        'supporting_websites'
      ])
        if (value[key] !== undefined)
          walk(
            value[key],
            pointer(path, key),
            key === 'supporting_websites' ? 'search' : decision,
            depth + 1
          )
    }
    walk(metadata.content_references, pointer(base, 'content_references'), 'cited')
    walk(metadata.search_result_groups, pointer(base, 'search_result_groups'), 'search')
    walk(metadata.source_footnotes, pointer(base, 'source_footnotes'), 'cited')
  }
  private raw(value: Record<string, unknown>, path: string): void {
    const id = string(value.conversation_id) ?? string(value.id),
      conflict =
        typeof value.id === 'string' &&
        typeof value.conversation_id === 'string' &&
        value.id !== value.conversation_id
    const conversation = this.conversation(value, path, conflict ? null : id, 'chatgpt'),
      mapping = object(value.mapping),
      nodes = new Map<string, GraphRecord>(),
      selected = new Set<string>()
    let current = string(value.current_node),
      valid = !!current
    while (current !== null) {
      if (selected.has(current) || !Object.hasOwn(mapping, current) || !record(mapping[current])) {
        valid = false
        break
      }
      selected.add(current)
      const node = object(mapping[current])
      if (node.id !== undefined && node.id !== current) {
        valid = false
        break
      }
      if (node.parent !== null && typeof node.parent !== 'string') {
        valid = false
        break
      }
      current = node.parent as string | null
    }
    if (!valid)
      this.issue(
        conversation,
        'Selected parent chain is missing, cyclic or contradictory; affected path is unresolved.'
      )
    // Diagnose every parent chain in linear time, including branches outside current_node.
    const visited = new Set<string>(),
      broken = new Set<string>()
    for (const start of Object.keys(mapping)) {
      const chain: string[] = [],
        walking = new Set<string>()
      let cursor: string | null = start,
        malformed = false
      while (cursor !== null && !visited.has(cursor)) {
        if (walking.has(cursor) || !Object.hasOwn(mapping, cursor) || !record(mapping[cursor])) {
          malformed = true
          break
        }
        walking.add(cursor)
        chain.push(cursor)
        const node = object(mapping[cursor])
        if (
          (node.id !== undefined && node.id !== cursor) ||
          (node.parent !== null && typeof node.parent !== 'string')
        ) {
          malformed = true
          break
        }
        cursor = node.parent as string | null
      }
      malformed ||= cursor !== null && broken.has(cursor)
      for (const id of chain) {
        visited.add(id)
        if (malformed) broken.add(id)
      }
    }
    const ordered = valid ? [...selected].reverse() : []
    const rank = new Map(ordered.map((id, i) => [id, i]))
    const entries = Object.entries(mapping).sort(
      ([a], [b]) =>
        (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER) ||
        (a < b ? -1 : a > b ? 1 : 0)
    )
    for (const [nodeId, nodeValue] of entries) {
      if (!nodeId.length || nodeId.length > 4000)
        throw new InputError(
          'limited',
          'A mapping node identity exceeds the supported descriptor length.'
        )
      const node = object(nodeValue),
        nodePath = pointer(pointer(path, 'mapping'), nodeId)
      const r = record(node.message)
        ? this.message(node.message, pointer(nodePath, 'message'), false)
        : this.add('retained', nodePath, 'Structural mapping node')
      r.nodeId = nodeId.length <= 4000 ? nodeId : null
      r.path =
        valid && conversation.externalConversationId
          ? selected.has(nodeId)
            ? 'selected'
            : 'alternate'
          : 'unresolved'
      if (r.path !== 'selected' || !conversation.externalConversationId) r.eligible = false
      if (broken.has(nodeId)) {
        r.path = 'unresolved'
        r.eligible = false
        this.issue(r, 'Parent chain has a cycle, missing node or contradictory identity.')
      }
      if (node.id !== undefined && node.id !== nodeId) {
        r.path = 'unresolved'
        r.eligible = false
        this.issue(r, 'Mapping key and node identity disagree.')
      }
      this.attach(r, conversation, this.loc(nodePath))
      nodes.set(nodeId, r)
    }
    for (const [id, node] of Object.entries(mapping)) {
      const parent = object(node).parent
      if (parent !== null && parent !== undefined) {
        const target = typeof parent === 'string' ? (nodes.get(parent) ?? null) : null
        this.relation(
          'parent',
          nodes.get(id)!,
          target,
          this.loc(pointer(pointer(pointer(path, 'mapping'), id), 'parent')),
          null,
          null,
          target ? null : 'Missing or invalid parent node.'
        )
      }
    }
  }
  private curated(value: Record<string, unknown>, path: string): void {
    const threads = list(value.threads),
      messages = list(value.conversation),
      byId = new Map<string, GraphRecord>()
    for (let i = 0; i < threads.length; i++) {
      const thread = object(threads[i]),
        id = string(thread.id) ?? string(thread.conversation_id)
      const r = this.conversation(thread, pointer(pointer(path, 'threads'), i), id)
      if (id) byId.set(id, r)
    }
    const envelope = string(value.conversation_id)
    if (!threads.length) {
      const c = this.conversation(value, path, envelope)
      if (envelope) byId.set(envelope, c)
    }
    const missing = messages.filter((m) => !string(object(m).conversation_id)),
      root = envelope ? byId.get(envelope) : undefined
    const firstExplicit = messages.findIndex((m) => !!string(object(m).conversation_id))
    const count = object(
      object(threads.find((t) => object(t).id === envelope)).message_counts
    ).total
    const inferred =
      !!root &&
      (byId.size === 1 ||
        (count === missing.length &&
          firstExplicit === missing.length &&
          messages
            .slice(firstExplicit)
            .every((m) => string(object(m).conversation_id) !== envelope)))
    messages.forEach((m, i) => {
      if (!record(m) || !curatedMessage(m)) {
        const r = this.add(
          'unclassified',
          pointer(pointer(path, 'conversation'), i),
          'Unsupported curated record'
        )
        r.disposition = 'unsupported'
        return
      }
      const r = this.message(m, pointer(pointer(path, 'conversation'), i), true),
        explicit = string(m.conversation_id),
        c = explicit ? byId.get(explicit) : undefined
      if (c) this.attach(r, c)
      else if (explicit) {
        r.externalConversationId = explicit
        r.conversationIdentityId = null
        this.issue(
          r,
          'Explicit thread has no descriptor in this file; selected-file identity matching is needed.'
        )
      } else if (inferred && root) {
        this.attach(r, root)
        this.issue(
          r,
          'Membership inferred from the explicit envelope and thread inventory; review this interpretation.'
        )
      } else
        this.issue(
          r,
          'Thread membership is unresolved until selected-file identities can be matched.'
        )
    })
    const metadata = this.add('retained', path, 'Curated collection metadata (not a conversation)')
    // A missing optional project field has no locator; the aggregate root always exists.
    if (!Object.hasOwn(value, 'project')) metadata.locator = this.loc(path)
    this.facts(metadata, value, path, [
      'conversation_id',
      'title',
      'date',
      'categories',
      'tags',
      'message_counts'
    ])
  }
  private bibliography(value: Record<string, unknown>, path: string): void {
    const r = this.source(null, value, path, null)
    const normalized = parseBibliographyRows(JSON.stringify([value]), 'csl-json')[0]
    if (!normalized || normalized.error) {
      r.eligible = false
      r.disposition = 'unsupported'
      this.issue(r, normalized?.error ?? 'Unsupported bibliography record.')
    } else for (const loss of normalized.losses) this.issue(r, loss)
  }
  async fileInput(file: ImportFile, read: () => Promise<Buffer>): Promise<void> {
    this.file = file
    this.numbers = new Map()
    const before = this.records.length,
      relations = this.relations.length,
      units = this.units,
      conversations = new Map(this.conversationRecords)
    const coverage: GraphFileCoverage = {
      fileId: file.id,
      sha256: file.sha256,
      reader: 'none',
      status: 'read',
      bom: false,
      records: 0,
      issues: []
    }
    this.files.push(coverage)
    try {
      const bytes = await read()
      let text: string
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
      } catch {
        throw new InputError('corrupt', 'Invalid UTF-8 input.')
      }
      coverage.bom = text.startsWith('\uFEFF')
      if (coverage.bom) text = text.slice(1)
      if (text.length > GRAPH_LIMITS.units)
        throw new InputError('limited', 'Decoded file exceeds the local text budget.')
      if (file.mediaType === 'application/json') {
        const parsed: ParsedInput = parseInputJson(text, GRAPH_LIMITS.values - this.parsedValues)
        this.parsedValues += parsed.values
        this.numbers = parsed.numbers
        const readers = new Set<GraphFileCoverage['reader']>()
        const readItem = (v: unknown, path: string): void => {
          if (rawChat(v)) {
            readers.add('raw-chat-v1')
            this.raw(object(v), path)
          } else if (curatedChat(v)) {
            readers.add('curated-chat-v1')
            this.curated(object(v), path)
          } else if (rawMessage(v) || curatedMessage(v)) {
            readers.add('message-array-v1')
            const r = this.message(object(v), path, curatedMessage(v))
            r.eligible = false
            this.issue(r, 'Message array has no proven conversation envelope or branch order.')
          } else if (csl(v)) {
            readers.add('bibliography-v1')
            this.bibliography(object(v), path)
          } else if (
            record(v) &&
            v.type === 'note' &&
            (typeof v.text === 'string' || typeof v.body === 'string')
          ) {
            readers.add('generic-json-v1')
            const r = this.add('note', path, string(v.title) ?? 'Imported note')
            r.eligible = this.settings.categories.includes('notes')
            const key = typeof v.text === 'string' ? 'text' : 'body'
            this.text(r, v[key] as string, pointer(path, key))
            this.facts(r, v, path, ['title', 'author', 'date', 'tags', 'type'])
          } else {
            readers.add('generic-json-v1')
            const r = this.add('unclassified', path, 'Unfamiliar JSON structure')
            r.disposition = 'unsupported'
            this.issue(
              r,
              'Original retained. This structure has no supported local record mapping; another reader or explicit interpretation is required.'
            )
          }
        }
        if (Array.isArray(parsed.value)) parsed.value.forEach((v, i) => readItem(v, pointer('', i)))
        else {
          const root = object(parsed.value),
            key = ['conversations', 'chats', 'messages', 'notes'].find((k) =>
              Array.isArray(root[k])
            )
          if (key && !rawChat(root) && !curatedChat(root))
            list(root[key]).forEach((v, i) => readItem(v, pointer(pointer('', key), i)))
          else readItem(parsed.value, '')
        }
        coverage.reader = readers.size === 1 ? [...readers][0] : 'mixed-json-v1'
        if (
          !this.records
            .slice(before)
            .some((r) => r.disposition === 'candidate' || r.disposition === 'internal')
        ) {
          coverage.status = 'unsupported'
          coverage.issues.push('No supported candidate content was recognized in this file.')
        }
      } else if (
        ['application/x-bibtex', 'application/x-research-info-systems'].includes(file.mediaType)
      ) {
        coverage.reader = 'bibliography-v1'
        const format = file.mediaType === 'application/x-bibtex' ? 'bibtex' : 'ris'
        // Split only at explicit entry starts, preserving original decoded spans and line endings.
        const starts = [
          ...text.matchAll(format === 'bibtex' ? /^\s*@[a-zA-Z]+\s*[({]/gm : /^TY {2}- /gm)
        ].map((m) => m.index!)
        if (!starts.length || starts.length > 2000)
          throw new InputError(
            'unsupported',
            'Bibliography needs explicit entry starts and at most 2,000 entries per file.'
          )
        if (text.slice(0, starts[0]).trim())
          coverage.issues.push('Preamble retained outside bibliography entries.')
        starts.forEach((start, i) => {
          const end = starts[i + 1] ?? text.length,
            raw = text.slice(start, end)
          if (raw.length > 300000)
            throw new InputError(
              'limited',
              'A bibliography record exceeds the existing reader limit.'
            )
          const rows = parseBibliographyRows(raw, format),
            row = rows[0],
            r = this.add('source', '', `Bibliography entry ${i + 1}`)
          // Text records share their field locator; identity includes the exact span.
          r.id = graphId(['bibliography-record-v1', file.id, file.sha256, start, end])
          r.identityId = r.id
          r.eligible = this.settings.categories.includes('sources')
          this.text(r, text, '', start, end)
          if (rows.length !== 1 || !row || row.error || !row.metadata) {
            r.eligible = false
            r.disposition = 'unsupported'
            this.issue(r, row?.error ?? 'Bibliography record could not be normalized.')
            coverage.issues = [
              'Some bibliography entries could not be parsed or normalized; inspect their retained record details.'
            ]
          } else {
            r.label = row.metadata.title.slice(0, 256) || r.label
            for (const [key, v] of Object.entries(row.metadata))
              this.fact(r, `normalized.${key}`, v, '')
            for (const loss of row.losses) this.issue(r, loss)
          }
        })
      } else if (['text/plain', 'text/markdown'].includes(file.mediaType)) {
        coverage.reader = 'text-v1'
        const kind = this.settings.categories.includes('notes') ? 'note' : 'unclassified',
          r = this.add(kind, '', file.originalName)
        r.eligible = kind === 'note'
        if (kind !== 'note')
          this.issue(r, 'Text is preserved without inventing chat boundaries or research records.')
        // Text files can exceed a JSON-string bound; preserve them in contiguous parts.
        for (let start = 0; start < text.length;) {
          const end = textBoundary(text, Math.min(text.length, start + GRAPH_LIMITS.text))
          this.text(r, text, '', start, end)
          start = end
        }
        if (file.mediaType === 'text/markdown')
          this.issue(
            r,
            'Markdown is shown as exact text; later note conversion must disclose unsupported structure.'
          )
      } else
        throw new InputError('unsupported', 'No local reader exists for this retained media type.')
      if (this.units > GRAPH_LIMITS.units)
        throw new InputError('limited', 'The batch extracted text/metadata budget was exceeded.')
      if (this.records.slice(before).some((r) => JSON.stringify(r).length > 48000))
        throw new InputError(
          'limited',
          'A record descriptor exceeds the bounded preview limit; original retained.'
        )
      coverage.records = this.records.length - before
    } catch (error) {
      if (!(error instanceof InputError)) throw error
      this.parsedValues = Math.min(GRAPH_LIMITS.values, this.parsedValues + error.consumedValues)
      this.records.splice(before)
      this.relations.splice(relations)
      this.units = units
      this.conversationRecords = conversations
      coverage.status = error.kind
      coverage.issues = [error.message]
      coverage.records = 0
    }
  }
  finish(): BuiltGraph {
    const rawById = new Map<string, GraphRecord[]>()
    for (const r of this.records)
      if (
        r.kind === 'message' &&
        r.externalId &&
        r.externalConversationId &&
        r.nodeId &&
        r.disposition !== 'unresolved' &&
        r.path !== 'unresolved'
      ) {
        const entries = rawById.get(r.externalId) ?? []
        entries.push(r)
        rawById.set(r.externalId, entries)
      }
    const signature = (r: GraphRecord): string =>
      requestDigest({ role: r.role, parts: r.texts.map((t) => t.sha256) })
    const matching = new Map(
      [...rawById].map(([id, records]) => [
        id,
        {
          raw: records[0],
          identities: new Set(records.map((r) => r.externalConversationId)),
          byText: new Map(records.map((r) => [signature(r), r]))
        }
      ])
    )
    const members = new Map(
      this.relations.filter((r) => r.kind === 'member').map((r) => [r.from, r])
    )
    const byId = new Map(this.records.map((r) => [r.id, r]))
    for (const r of this.records) {
      if (r.kind !== 'message' || !r.externalId || r.nodeId) continue
      const match = matching.get(r.externalId),
        identities = match?.identities ?? new Set<string>()
      if (match && identities.size === 1) {
        const raw = match.raw,
          sameContent = match.byText.get(signature(r))
        if (r.externalConversationId && r.externalConversationId !== raw.externalConversationId) {
          r.eligible = false
          r.disposition = 'unresolved'
          this.issue(
            r,
            'Explicit conversation identity conflicts with selected raw message evidence.'
          )
          continue
        }
        // Curated records identify a body variant by the same message ID; bare arrays require exact text evidence.
        if (
          (r.contentType === 'curated-text' && r.role === raw.role) ||
          sameContent ||
          r.disposition === 'internal'
        ) {
          const c = this.conversationRecords.get(`chatgpt:${raw.externalConversationId!}`)!
          const member = members.get(r.id)
          const curatedConversation = member?.to ? byId.get(member.to) : null
          if (
            curatedConversation?.kind === 'conversation' &&
            curatedConversation.originNamespace === 'curated' &&
            curatedConversation.externalConversationId === c.externalConversationId
          ) {
            curatedConversation.originNamespace = 'chatgpt'
            curatedConversation.identityId = c.identityId
          }
          if (!member) this.attach(r, c, raw.locator)
          r.originNamespace = 'chatgpt'
          r.conversationIdentityId = c.identityId
          r.identityId = raw.identityId
          r.path = (sameContent ?? raw).path
          r.issues = r.issues.filter(
            (s) =>
              !s.includes('no proven conversation') &&
              !s.includes('Membership inferred') &&
              !s.includes('membership is unresolved')
          )
          r.eligible =
            r.disposition === 'candidate' &&
            r.path === 'selected' &&
            r.texts.length > 0 &&
            this.settings.categories.includes('chats') &&
            r.texts.every((t) => t.units <= GRAPH_LIMITS.text)
        }
      }
      if (identities.size > 1) {
        r.eligible = false
        r.disposition = 'unresolved'
        this.issue(r, 'Message identity conflicts across selected raw conversation envelopes.')
      }
      if (!r.conversationIdentityId) {
        r.eligible = false
        if (r.disposition === 'candidate') r.disposition = 'unresolved'
      }
    }
    for (const link of this.relations) {
      const from = byId.get(link.from),
        to = link.to ? byId.get(link.to) : undefined
      if (!from || !to) continue
      if (link.kind === 'member') {
        from.originNamespace = to.originNamespace
        from.conversationIdentityId = to.identityId
        if (from.externalId && to.externalConversationId)
          from.identityId = graphId([
            'message-identity-v1',
            to.originNamespace,
            to.externalConversationId,
            from.externalId
          ])
      }
      if (link.kind === 'reference')
        to.eligible =
          to.disposition === 'candidate' &&
          from.disposition === 'candidate' &&
          !['alternate', 'unresolved'].includes(from.path) &&
          !!from.conversationIdentityId &&
          this.settings.categories.includes('sources')
    }
    const groups = new Map<string, GraphRecord>(),
      urls = new Map<string, GraphRecord>()
    for (const r of this.records) {
      if (
        r.texts.reduce((n, t) => n + t.units, 0) > GRAPH_LIMITS.text &&
        ['message', 'note'].includes(r.kind)
      ) {
        r.eligible = false
        this.issue(
          r,
          'The complete record exceeds the 1,000,000-unit acceptance limit; all text remains available in fragments.'
        )
      }
      if (r.kind === 'message' && !r.externalConversationId) {
        r.eligible = false
        if (r.disposition === 'candidate') r.disposition = 'unresolved'
      }
      const prior = groups.get(r.identityId)
      if (prior) {
        const equivalent =
          r.kind === 'message' &&
          r.texts.length > 0 &&
          r.role === prior.role &&
          requestDigest(r.texts.map((t) => t.sha256)) ===
            requestDigest(prior.texts.map((t) => t.sha256))
        this.relation(
          equivalent ? 'equivalent' : 'same-identity',
          r,
          prior,
          r.locator,
          null,
          null,
          equivalent
            ? 'Exact visible text and role; separate metadata and occurrence evidence remain retained.'
            : 'Same identity group; preserve and review the separate body/metadata variants.'
        )
      } else groups.set(r.identityId, r)
      if (r.kind === 'source') {
        const url = r.facts.find((f) => ['url', 'URL', 'normalized.URL'].includes(f.name))?.value
        if (url) {
          const other = urls.get(url)
          if (other)
            this.relation(
              'possible-match',
              r,
              other,
              r.locator,
              null,
              null,
              'Same literal URL; occurrence decisions stay independent.'
            )
          else urls.set(url, r)
        }
      }
    }
    return {
      records: this.records,
      relations: this.relations,
      files: this.files,
      textUnits: this.units
    }
  }
}
