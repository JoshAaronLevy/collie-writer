import type Database from 'better-sqlite3'
import type { DocumentPayload } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import { record, type OpenInput } from '../../shared/projects'
import { noteBody } from '../../shared/notes'
import { SOURCE_TYPES, type SourceMetadata } from '../../shared/sources'
import { IMPORT_LIMITS, type ImportFile, type ImportRevision } from '../../shared/project-import'
import type { GraphRecord, GraphRelation, ImportGraph } from '../../shared/import-graph'
import type {
  ContentCandidate,
  ImportContentRequest,
  ImportContentValue
} from '../../shared/import-content'
import { hasControlCharacters } from '../../shared/control-characters'
import { requestDigest } from '../storage/digest'
import { candidateRows, fromCsl, normalizeMetadata, parseBibliographyRows } from './sources'
import { readGraph, readImportBlob, parseGraphPage } from './import-graphs'
import { parseInputJson, valueAt } from './import-readers/json'
import { graphId, textBoundary } from './import-readers/graph'
import { OriginalTranscriptText } from './conversation-transcript'
import { readContentOrigins } from './imported-provenance'

export type ContentContext = OpenInput & { db: Database.Database; root: string; workspace: string }
export type PreparedContent = {
  manifest: ImportGraph
  head: string
  records: GraphRecord[]
  relations: GraphRelation[]
  rows: ContentCandidate[]
  notes: Map<string, DocumentPayload>
  counts: Extract<ImportContentValue, { type: 'content-preview' }>['counts']
}
const corrupt = (): never => {
  throw new ProjectError('CORRUPT_PROJECT')
}
/** Bounded single-original cache; original fields never come from model output or renderer paths. */
class OriginalFields {
  private cached: { file: ImportFile; value: unknown } | null = null
  constructor(
    private ctx: ContentContext,
    private batchId: string
  ) {}
  async read(r: GraphRecord): Promise<{ value: unknown; file: ImportFile }> {
    if (this.cached?.file.id !== r.locator.fileId) {
      const row = this.ctx.db
        .prepare('SELECT body FROM import_files WHERE project_id=? AND batch_id=? AND id=?')
        .get(this.ctx.projectId, this.batchId, r.locator.fileId) as { body: string } | undefined
      if (!row) return corrupt()
      const file = JSON.parse(row.body) as ImportFile
      let text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        await readImportBlob(this.ctx, file, IMPORT_LIMITS.fileBytes)
      )
      if (text.startsWith('\uFEFF')) text = text.slice(1)
      this.cached = {
        file,
        value: file.mediaType === 'application/json' ? parseInputJson(text).value : text
      }
    }
    if (this.cached.file.sha256 !== r.locator.sha256) return corrupt()
    return { file: this.cached.file, value: valueAt(this.cached.value, r.locator.pointer) }
  }
}
/** Literal conversion: no Markdown/HTML interpretation, generated prose, remote links or citations. */
export function importedNoteBody(r: GraphRecord, text: string): DocumentPayload | null {
  if (text.length > 1000000) return null
  const body: DocumentPayload = {
    schemaVersion: 1,
    ast: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { blockId: graphId(['import-note-body-v1', r.id]) },
          content: text ? [{ type: 'text', text }] : []
        }
      ]
    },
    footnotesById: {}
  }
  return noteBody(body) ? body : null
}
function canonical(
  db: Database.Database,
  p: string,
  id: string
): { id: string; state: 'active' | 'trashed' } | null {
  const seen = new Set<string>()
  let next: string | null = id
  while (next && seen.size < 32 && !seen.has(next)) {
    seen.add(next)
    const row = db
      .prepare('SELECT id,state,replacement_id FROM sources WHERE project_id=? AND id=?')
      .get(p, next) as
      | { id: string; state: 'active' | 'trashed' | 'merged'; replacement_id: string | null }
      | undefined
    if (!row) return null
    if (row.state !== 'merged') return { id: row.id, state: row.state }
    next = row.replacement_id
  }
  return null
}
function matches(
  ctx: ContentContext,
  m: SourceMetadata,
  externalId: string
): ContentCandidate['candidates'] {
  const found = new Map<string, ContentCandidate['candidates'][number]>()
  const add = (id: string, reason: string): void => {
    const target = canonical(ctx.db, ctx.projectId, id)
    if (target && !found.has(target.id) && found.size < 12)
      found.set(target.id, { ...target, reason })
  }
  for (const c of candidateRows(ctx.db, ctx.projectId, m, externalId)) add(c.id, c.reason)
  // Removed/merged matches remain visible, but cannot be silently restored or updated.
  for (const row of ctx.db
    .prepare("SELECT id,metadata FROM sources WHERE project_id=? AND state<>'active'")
    .iterate(ctx.projectId) as Iterable<{ id: string; metadata: string }>) {
    const old = JSON.parse(row.metadata) as SourceMetadata
    if (
      (m.DOI && old.DOI === m.DOI) ||
      (m.ISBN && old.ISBN === m.ISBN) ||
      (m.URL && old.URL === m.URL)
    )
      add(row.id, 'Exact identifier in retained source history')
  }
  return [...found.values()]
}
function metadata(value: unknown, losses: string[]): SourceMetadata | null {
  if (!record(value)) return null
  // CSL has structured creators and dates. Curated references may have literal authors and URLs.
  const c: Record<string, unknown> = { ...value }
  if (!SOURCE_TYPES.includes(c.type as SourceMetadata['type'])) {
    if (c.type !== undefined)
      losses.push('Original work type needs review; webpage is only a proposed mapping.')
    else losses.push('Work type was not supplied; webpage is only a proposed mapping.')
    c.type = 'webpage'
  }
  c.URL = c.URL ?? c.url
  if (typeof c.author === 'string') c.author = [{ literal: c.author }]
  if (typeof c.issued === 'string') c.issued = { literal: c.issued }
  if (c.issued === undefined && typeof c.pub_date === 'string') c.issued = { literal: c.pub_date }
  if (c.attribution && !c.author)
    losses.push('Attribution is retained as metadata, not inferred to be an author.')
  try {
    const converted = fromCsl(c)
    losses.push(...converted.losses)
    return converted.metadata
  } catch {
    losses.push(
      'Incomplete or unsupported bibliography fields need review before a source can be proposed.'
    )
    return null
  }
}
/** Worker-only preparation. Read-only and reproducible; no acceptance or provider dispatch. */
export async function prepareImportContent(
  ctx: ContentContext,
  batchId: string,
  id: string
): Promise<PreparedContent> {
  const { manifest, pages } = readGraph(ctx.db, ctx.projectId, id)
  if (manifest.batchId !== batchId) throw new ProjectError('DENIED')
  const revision = ctx.db
    .prepare('SELECT body FROM import_batch_revisions WHERE project_id=? AND batch_id=? AND id=?')
    .get(ctx.projectId, batchId, manifest.revisionId) as { body: string } | undefined
  if (!revision) return corrupt()
  const settings = (JSON.parse(revision.body) as ImportRevision).settings
  const head = (
    ctx.db.prepare('SELECT head_commit_id AS id FROM projects WHERE id=?').get(ctx.projectId) as {
      id: string
    }
  ).id
  const records: GraphRecord[] = [],
    relations: GraphRelation[] = []
  for (const page of pages) {
    const parsed = parseGraphPage(
      await readImportBlob(ctx, page, IMPORT_LIMITS.artifactBytes),
      page
    )
    records.push(...parsed.records)
    relations.push(...parsed.relations)
  }
  const references = new Map(
    relations.filter((r) => r.kind === 'reference' && r.to).map((r) => [r.to!, r])
  )
  const original = new OriginalFields(ctx, batchId),
    texts = new OriginalTranscriptText(ctx, batchId),
    notes = new Map<string, DocumentPayload>(),
    rows: ContentCandidate[] = []
  const groups = new Map<string, ContentCandidate[]>(),
    counts = { chats: 0, sources: 0, notes: 0, occurrences: 0, retained: 0, needsReview: 0 }
  counts.chats = settings.categories.includes('chats')
    ? new Set(
        records
          .filter((r) => r.kind === 'conversation' && r.eligible && r.disposition === 'candidate')
          .map((r) => r.identityId)
      ).size
    : 0
  for (const r of records) {
    if (r.kind !== 'source' && r.kind !== 'note') continue
    const ref = references.get(r.id),
      losses = [...r.issues]
    const row: ContentCandidate = {
      recordId: r.id,
      kind: r.kind,
      title: r.label,
      eligible: false,
      group: null,
      metadata: null,
      candidates: [],
      decision: ref?.decision ?? null,
      grade: ref?.grade ?? null,
      originatingRecordId: ref?.from ?? null,
      authorship: 'unspecified',
      labels: [],
      losses,
      preview: '',
      textUnits: 0,
      locator: r.locator
    }
    if (r.kind === 'source') {
      counts.occurrences++
      // Internal/unsupported records are not interpreted as usable sources.
      if (r.disposition !== 'internal' && r.disposition !== 'unsupported') {
        const { value, file } = await original.read(r)
        if (file.mediaType === 'application/json') row.metadata = metadata(value, losses)
        else {
          const raw = await texts.read(r)
          const format = file.mediaType === 'application/x-bibtex' ? 'bibtex' : 'ris'
          const parsed = parseBibliographyRows(raw, format)
          row.metadata = parsed.length === 1 ? parsed[0].metadata : null
          losses.push(...(parsed[0]?.losses ?? []))
        }
        if (row.metadata) {
          row.metadata = normalizeMetadata(row.metadata)
          losses.push(
            'Bibliography fields are normalized for Research; unchanged original fields remain at the retained input location.'
          )
          if (JSON.stringify(row.metadata).length > 50000) {
            row.metadata = null
            losses.push(
              'Bibliography metadata exceeds the bounded destination preview; retained for review.'
            )
          }
        }
        if (row.metadata) {
          row.title = row.metadata.title.slice(0, 500)
          row.candidates = matches(ctx, row.metadata, r.externalId ?? '')
          if (!row.metadata.author.length) losses.push('No author supplied; none inferred.')
          if (!row.metadata.issued) losses.push('No publication date supplied; none inferred.')
        }
      }
      row.eligible =
        r.eligible &&
        r.disposition === 'candidate' &&
        !!row.metadata &&
        settings.categories.includes('sources')
      if (row.eligible && row.metadata) row.group = requestDigest(row.metadata)
    } else {
      if (r.disposition === 'candidate' && r.texts.reduce((n, t) => n + t.units, 0) <= 1000000) {
        const text = await texts.read(r),
          body = importedNoteBody(r, text),
          { value } = await original.read(r)
        row.textUnits = text.length
        row.preview = text.slice(0, textBoundary(text, Math.min(text.length, 1500)))
        losses.push(
          'Imported text is preserved literally. Markdown, HTML, tables, images and embedded citations are not converted to rich structures or fetched.'
        )
        if (record(value)) {
          if (typeof value.title === 'string') {
            if (value.title.length <= 500 && !hasControlCharacters(value.title, true))
              row.title = value.title
            else
              losses.push(
                'Original title exceeds supported note title limits; a shortened title is proposed, with the full title retained in the original.'
              )
          }
          if (value.authorship === 'human') row.authorship = 'declared-human'
          if (value.authorship === 'ai') row.authorship = 'declared-ai'
          for (const [key, kind] of [
            ['tags', 'tag'],
            ['categories', 'category']
          ] as const) {
            const items = value[key]
            if (items !== undefined && (!Array.isArray(items) || items.length > 100))
              losses.push(`${key}: unsupported label list remains in the original.`)
            if (Array.isArray(items))
              for (const item of items.slice(0, 100)) {
                if (
                  typeof item === 'string' &&
                  item.trim() &&
                  item.length <= 100 &&
                  !hasControlCharacters(item)
                ) {
                  const label = { kind, name: item.trim() }
                  if (
                    row.labels.length < 100 &&
                    !row.labels.some(
                      (l) =>
                        l.kind === kind &&
                        l.name.normalize('NFKC').toLowerCase() ===
                          label.name.normalize('NFKC').toLowerCase()
                    )
                  )
                    row.labels.push(label)
                } else losses.push('An unsupported label remains only in the original.')
              }
          }
          if (value.links !== undefined || value.documentIds !== undefined)
            losses.push(
              'Original links are retained; no Collie manuscript or source relationship is inferred.'
            )
          if (value.author !== undefined)
            losses.push('Original author metadata is retained; authorship is not authenticated.')
        }
        if (
          body &&
          !hasControlCharacters(row.title, true) &&
          r.eligible &&
          settings.categories.includes('notes')
        ) {
          row.eligible = true
          notes.set(r.id, body)
          counts.notes++
        }
        if (!body)
          losses.push(
            'Text exceeds supported note structure or contains unsupported controls; retained without a note destination.'
          )
      } else
        losses.push(
          'Unsupported or oversized note remains in the original without a note destination.'
        )
    }
    if (!row.eligible) counts.retained++
    if (!row.eligible && r.eligible) counts.needsReview++
    rows.push(row)
  }
  // Join shared strong identifiers across representations (a DOI-bearing row may also share
  // a URL with a URL-only row). These remain review groups, never automatic merges.
  const parents = new Map<string, string>(),
    owners = new Map<string, string>()
  const root = (id: string): string => {
    let next = id
    while (parents.get(next) !== next) next = parents.get(next)!
    let cursor = id
    while (cursor !== next) {
      const parent = parents.get(cursor)!
      parents.set(cursor, next)
      cursor = parent
    }
    return next
  }
  for (const row of rows.filter((r) => r.group && r.metadata)) {
    parents.set(row.recordId, row.recordId)
    const m = row.metadata!
    const keys = [
      m.DOI ? `doi:${m.DOI}` : '',
      m.ISBN ? `isbn:${m.ISBN}` : '',
      m.URL ? `url:${m.URL}` : ''
    ].filter(Boolean)
    if (!keys.length) keys.push(`metadata:${requestDigest(m)}`)
    for (const key of keys) {
      const prior = owners.get(key)
      if (prior) parents.set(root(row.recordId), root(prior))
      else owners.set(key, row.recordId)
    }
  }
  groups.clear()
  for (const row of rows.filter((r) => r.group)) {
    const id = root(row.recordId),
      group = groups.get(id) ?? []
    group.push(row)
    groups.set(id, group)
  }
  for (const group of groups.values()) {
    const id = requestDigest({
      contract: 'import-source-group-v1',
      records: group.map((r) => r.recordId).sort()
    })
    for (const row of group) row.group = id
    if (new Set(group.map((r) => requestDigest(r.metadata))).size > 1) {
      counts.needsReview++
      for (const r of group)
        r.losses.push(
          'Same identifier has different metadata in this batch. Choose the destination metadata explicitly during review; no merge is performed.'
        )
    }
  }
  counts.sources = groups.size
  for (const r of rows) {
    const all = [...new Set(r.losses)],
      selected: string[] = []
    let size = 0
    for (const loss of all) {
      const bounded = loss.slice(0, 4000)
      if (size + bounded.length > 16000 || selected.length >= 63) break
      selected.push(bounded)
      size += bounded.length
    }
    if (selected.length < all.length)
      selected.push(
        'Additional mapping details remain in the local inventory and retained original.'
      )
    r.losses = selected
  }
  if (
    (
      ctx.db.prepare('SELECT head_commit_id AS id FROM projects WHERE id=?').get(ctx.projectId) as {
        id: string
      }
    ).id !== head
  )
    throw new ProjectError('STALE_REVISION')
  return { manifest, head, records, relations, rows, notes, counts }
}
export async function importContentCommand(
  ctx: ContentContext,
  input: ImportContentRequest
): Promise<ImportContentValue> {
  if (input.action === 'content-origins') return readContentOrigins(ctx.db, ctx.projectId, input)
  const prepared = await prepareImportContent(ctx, input.batchId, input.graphId),
    rows: ContentCandidate[] = []
  let i = input.offset,
    size = 0
  while (i < prepared.rows.length && rows.length < 10) {
    const row = prepared.rows[i],
      length = JSON.stringify(row).length
    if (size + length > 90000 && rows.length) break
    rows.push(row)
    size += length
    i++
  }
  return {
    type: 'content-preview',
    graphId: input.graphId,
    projectHead: prepared.head,
    rows,
    counts: prepared.counts,
    nextOffset: i < prepared.rows.length ? i : null
  }
}
