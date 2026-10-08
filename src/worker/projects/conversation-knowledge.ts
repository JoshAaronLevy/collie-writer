import { isId } from '../../domain/editor/schema'
import { record, exact } from '../../shared/projects'
import { isEditableKind } from '../../shared/outline'
import { normalizeSourceDoi, normalizeSourceUrl } from './sources'
import type Database from 'better-sqlite3'
import { readDocument } from '../../domain/editor/schema'
import { captureWriting } from '../../domain/ai/context'
import { ProjectError } from '../../domain/projects/errors'
import {
  isKnowledgeSettings,
  isKnowledgeChange,
  knowledgeKey,
  type KnowledgeItem,
  type KnowledgeTarget,
  type KnowledgeSettings,
  type KnowledgeChange,
  type ProjectKnowledge,
  type SourceMatch
} from '../../shared/conversation-knowledge'
import type { SourceMetadata } from '../../shared/sources'
import { requestDigest } from '../storage/digest'
import { conversationOverview } from './conversation-overview'

const empty = (): KnowledgeSettings => ({ version: 1, revision: null, pins: [], excluded: [] })
const fail = (
  code: 'LIMIT_EXCEEDED' | 'NOT_FOUND' | 'STALE_REVISION' | 'CORRUPT_PROJECT' | 'OPERATION_CONFLICT'
): never => {
  throw new ProjectError(code)
}
const words = (query: string): string[] =>
  [...new Set(query.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])]
    .filter(
      (w) =>
        ![
          'the',
          'and',
          'this',
          'that',
          'with',
          'what',
          'from',
          'about',
          'have',
          'does',
          'please',
          'would',
          'could',
          'should',
          'project'
        ].includes(w)
    )
    .slice(0, 20)
const rank = (text: string, terms: string[]): number =>
  terms.reduce((n, w) => n + (text.toLocaleLowerCase().includes(w) ? 1 : 0), 0)
export function passage(
  text: string,
  query: string,
  limit: number
): { text: string; start: number; total: number } {
  if (text.length <= limit) return { text, start: 0, total: text.length }
  const terms = words(query),
    lower = text.toLocaleLowerCase()
  let at = 0,
    score = -1
  for (const term of terms) {
    const found = lower.indexOf(term)
    if (found < 0) continue
    const start = Math.max(0, found - 300),
      s = rank(text.slice(start, start + limit), terms)
    if (s > score) {
      score = s
      at = start
    }
  }
  return { text: text.slice(at, at + limit), start: at, total: text.length }
}
type Doc = { id: string; revision: string; title: string; payload: string; path: string }
function documents(db: Database.Database, p: string): Doc[] {
  return db
    .prepare(
      `WITH RECURSIVE outline(id,path,depth) AS (
    SELECT d.id,printf('%08d',d.position),0 FROM documents d JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id WHERE d.project_id=? AND d.parent_id IS NULL AND s.state='active'
    UNION ALL SELECT d.id,o.path||'/'||printf('%08d',d.position),o.depth+1 FROM documents d JOIN outline o ON d.parent_id=o.id JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id WHERE d.project_id=? AND s.state='active' AND o.depth<7
  ) SELECT d.id,d.revision_id AS revision,d.title,CASE WHEN length(d.payload)<=1000000 AND sum(length(d.payload)) OVER (ORDER BY o.path,d.id)<=4000000 THEN d.payload ELSE '' END AS payload,o.path FROM documents d JOIN outline o ON o.id=d.id WHERE d.project_id=? AND d.kind IN ('chapter','text') ORDER BY o.path,d.id LIMIT 201`
    )
    .all(p, p, p) as Doc[]
}
function documentText(d: Doc): string {
  return d.payload
    ? captureWriting(readDocument(JSON.parse(d.payload)), {
        kind: 'section',
        documentId: d.id,
        revisionId: d.revision
      })
    : ''
}
function item(
  target: KnowledgeTarget,
  revision: string,
  title: string,
  text: string,
  query: string,
  limit = 4000,
  sourceId: string | null = null,
  versionId: string | null = null
): KnowledgeItem {
  return {
    ...target,
    revision,
    title: title.slice(0, 200),
    ...passage(text, query, limit),
    sourceId,
    versionId,
    pinned: false
  }
}
export function readKnowledgeSettings(
  db: Database.Database,
  p: string,
  chat: string
): KnowledgeSettings {
  const rows = db
    .prepare(
      'SELECT body FROM conversation_context WHERE project_id=? AND conversation_id=? AND current=1 LIMIT 2'
    )
    .all(p, chat) as { body: string }[]
  if (rows.length > 1) fail('CORRUPT_PROJECT')
  if (!rows.length) return empty()
  const value: unknown = JSON.parse(rows[0].body)
  return isKnowledgeSettings(value) ? value : fail('CORRUPT_PROJECT')
}
export function knowledgeCandidates(
  db: Database.Database,
  p: string,
  kind: KnowledgeTarget['kind'],
  query: string,
  offset: number
): { items: KnowledgeTarget[]; titles: string[]; more: boolean } {
  const table = {
    document: 'documents',
    source: 'sources',
    note: 'notes',
    excerpt: 'source_excerpts',
    chat: 'conversations'
  }[kind]
  const title =
    kind === 'source' ? "json_extract(metadata,'$.title')" : kind === 'excerpt' ? 'label' : 'title'
  const eligible =
    kind === 'document'
      ? " AND kind IN ('chapter','text')"
      : kind === 'source' || kind === 'note'
        ? " AND state='active'"
        : ''
  const label =
    kind === 'chat' ? "title||CASE WHEN state='archived' THEN ' (archived)' ELSE '' END" : title
  const rows = db
    .prepare(
      `SELECT id,substr(${label},1,200) AS title FROM ${table} WHERE project_id=?${eligible} AND instr(lower(${title}),lower(?))>0 ORDER BY ${title},id LIMIT 21 OFFSET ?`
    )
    .all(p, query, offset) as { id: string; title: string }[]
  return {
    items: rows.slice(0, 20).map((r) => ({ kind, id: r.id })),
    titles: rows.slice(0, 20).map((r) => r.title),
    more: rows.length > 20
  }
}
export function resolveKnowledge(
  db: Database.Database,
  p: string,
  target: KnowledgeTarget,
  query = '',
  explicit = false
): KnowledgeItem {
  if (target.kind === 'document') {
    const read = db.prepare(
      'SELECT d.id,d.revision_id AS revision,d.title,d.kind,d.parent_id,s.state,CASE WHEN length(d.payload)<=1000000 THEN d.payload ELSE NULL END AS payload FROM documents d JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id WHERE d.project_id=? AND d.id=?'
    )
    const d = read.get(p, target.id) as
      (Doc & { kind: string; state: string; parent_id: string | null }) | undefined
    if (!d || !d.payload || !isEditableKind(d.kind) || d.state !== 'active') fail('NOT_FOUND')
    let parent = d!.parent_id,
      depth = 0
    while (parent) {
      const ancestor = db
        .prepare(
          'SELECT d.parent_id,s.state FROM documents d JOIN outline_state s ON s.project_id=d.project_id AND s.document_id=d.id WHERE d.project_id=? AND d.id=?'
        )
        .get(p, parent) as { parent_id: string | null; state: string } | undefined
      if (!ancestor || ancestor.state !== 'active' || ++depth >= 8) fail('NOT_FOUND')
      parent = ancestor!.parent_id
    }

    return item(target, d!.revision, d!.title, documentText(d!), query)
  }
  if (target.kind === 'source') {
    const r = db
      .prepare(
        "SELECT revision_id AS revision,metadata FROM sources WHERE project_id=? AND id=? AND state='active'"
      )
      .get(p, target.id) as { revision: string; metadata: string } | undefined
    if (!r) fail('NOT_FOUND')
    const m = JSON.parse(r!.metadata) as SourceMetadata
    const pages = db
      .prepare(
        `SELECT v.id AS versionId,p.page_index AS pageIndex,p.text_hash AS hash,substr(p.text,1,4000) AS text,length(p.text) AS total FROM source_version_selections selected JOIN source_versions v ON v.project_id=selected.project_id AND v.id=selected.version_id JOIN source_attachments a ON a.project_id=v.project_id AND a.id=v.attachment_id JOIN source_pages p ON p.project_id=v.project_id AND p.version_id=v.id WHERE selected.project_id=? AND selected.source_id=? AND a.state='active' AND p.state='text' ORDER BY p.page_index LIMIT 32`
      )
      .all(p, target.id) as {
      versionId: string
      pageIndex: number
      hash: string
      text: string
      total: number
    }[]
    const terms = words(query),
      page = pages
        .map((row) => ({ ...row, score: rank(row.text, terms) }))
        .sort((a, b) => b.score - a.score || a.pageIndex - b.pageIndex)[0]
    if (page) {
      const quote = passage(page.text, query, 1800)
      const metadata = {
        sourceId: target.id,
        title: m.title.slice(0, 300),
        author: m.author
          .slice(0, 2)
          .map((a) => (a.literal || `${a.given} ${a.family}`).slice(0, 200)),
        issued: m.issued,
        DOI: m.DOI.length <= 500 ? m.DOI : '',
        URL: m.URL.length <= 1000 ? m.URL : '',
        ISBN: m.ISBN
      }
      const material = JSON.stringify({
        metadata,
        coverage:
          'Bibliographic metadata plus one passage from already inspected local text. Not the full original or independent verification. Up to 32 pages and their first 4000 characters considered.',
        passage: {
          versionId: page.versionId,
          pageIndex: page.pageIndex,
          textHash: page.hash,
          start: quote.start,
          total: page.total,
          text: quote.text
        }
      })
      return item(target, r!.revision, m.title, material, '', 20000, target.id, page.versionId)
    }
    return item(
      target,
      r!.revision,
      m.title,
      `Saved source ${target.id}. Bibliographic metadata only; this does not mean its contents were read.\n${r!.metadata}`,
      query,
      4000,
      target.id
    )
  }
  if (target.kind === 'note') {
    const r = db
      .prepare(
        "SELECT revision_id AS revision,title,substr(body,1,100001) AS body FROM notes WHERE project_id=? AND id=? AND state='active'"
      )
      .get(p, target.id) as { revision: string; title: string; body: string } | undefined
    if (!r || r.body.length > 100000) fail('NOT_FOUND')
    return item(target, r!.revision, r!.title, r!.body, query)
  }
  if (target.kind === 'excerpt') {
    const r = db
      .prepare(
        `SELECT e.quote,e.kind,e.label,e.version_id AS versionId,v.source_id AS sourceId FROM source_excerpts e JOIN source_versions v ON v.project_id=e.project_id AND v.id=e.version_id JOIN sources s ON s.project_id=v.project_id AND s.id=v.source_id JOIN source_attachments a ON a.project_id=v.project_id AND a.id=v.attachment_id WHERE e.project_id=? AND e.id=? AND s.state='active' AND a.state='active' AND EXISTS(SELECT 1 FROM source_version_selections vs WHERE vs.project_id=v.project_id AND vs.source_id=v.source_id AND vs.version_id=v.id) AND NOT EXISTS(SELECT 1 FROM source_excerpts newer WHERE newer.project_id=e.project_id AND newer.supersedes_id=e.id)`
      )
      .get(p, target.id) as
      | { quote: string; kind: string; label: string; versionId: string; sourceId: string }
      | undefined
    if (!r) fail('NOT_FOUND')
    return item(
      target,
      target.id,
      `${r!.kind}: ${r!.label}`,
      r!.quote,
      query,
      4000,
      r!.sourceId,
      r!.versionId
    )
  }
  const c = db
    .prepare(
      'SELECT revision_id AS revision,title,state FROM conversations WHERE project_id=? AND id=?'
    )
    .get(p, target.id) as { revision: string; title: string; state: string } | undefined
  if (!c || (!explicit && c.state !== 'active')) fail('NOT_FOUND')
  const rows = db
    .prepare(
      `SELECT u.text AS question,a.text AS answer FROM conversation_attempts t JOIN ai_captures cap ON cap.project_id=t.project_id AND cap.id=t.capture_id JOIN conversation_messages u ON u.project_id=t.project_id AND u.id=json_extract(t.body,'$.userMessageId') JOIN conversation_messages a ON a.project_id=t.project_id AND a.id=json_extract(t.body,'$.assistantMessageId') WHERE t.project_id=? AND t.conversation_id=? AND json_extract(t.body,'$.state')='completed' AND json_extract(t.body,'$.provider') IS NOT NULL AND coalesce(json_extract(cap.body,'$.purpose'),'chat')='chat' ORDER BY u.ordinal DESC LIMIT 40`
    )
    .all(p, target.id) as { question: string; answer: string }[]
  const terms = words(query)
  const sorted = rows
    .map((r, index) => ({ ...r, index, score: rank(r.question + ' ' + r.answer, terms) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const picked = sorted[0]
  if (!picked) fail('NOT_FOUND')
  return item(
    target,
    c!.revision,
    `${c!.title}${c!.state === 'archived' ? ' (archived, explicitly included)' : ''}`,
    `Prior discussion, not verified evidence. One of up to 40 recent completed exchanges considered.\nYou: ${picked.question}\nAssistant: ${picked.answer}`,
    query
  )
}
export function changeKnowledge(
  db: Database.Database,
  p: string,
  chat: string,
  id: string,
  expected: string | null,
  change: KnowledgeChange
): boolean {
  const request = JSON.stringify({ expected, change }),
    prior = db
      .prepare(
        'SELECT request FROM conversation_context WHERE project_id=? AND id=? AND conversation_id=?'
      )
      .get(p, id, chat) as { request: string } | undefined
  if (prior) {
    if (prior.request !== request) fail('OPERATION_CONFLICT')
    return false
  }
  const current = readKnowledgeSettings(db, p, chat)
  if (current.revision !== expected) fail('STALE_REVISION')
  if (
    (
      db.prepare('SELECT count(*) AS n FROM conversation_context WHERE project_id=?').get(p) as {
        n: number
      }
    ).n >= 1000
  )
    fail('LIMIT_EXCEEDED')
  if (change.target.kind === 'chat' && change.target.id === chat) fail('STALE_REVISION')
  validateKnowledgeTarget(db, p, change.target)
  const key = knowledgeKey(change.target),
    next = { ...current, revision: id, pins: [...current.pins], excluded: [...current.excluded] }
  if (change.mode === 'pin' || change.mode === 'refresh') {
    const snapshot = resolveKnowledge(db, p, change.target, '', true)
    snapshot.pinned = true
    next.pins = [...next.pins.filter((i) => knowledgeKey(i) !== key), snapshot]
    next.excluded = next.excluded.filter((i) => knowledgeKey(i) !== key)
  } else if (change.mode === 'unpin') next.pins = next.pins.filter((i) => knowledgeKey(i) !== key)
  else if (change.mode === 'exclude') {
    next.pins = next.pins.filter((i) => knowledgeKey(i) !== key)
    next.excluded = [...next.excluded.filter((i) => knowledgeKey(i) !== key), change.target]
  } else next.excluded = next.excluded.filter((i) => knowledgeKey(i) !== key)
  if (!isKnowledgeSettings(next)) fail('LIMIT_EXCEEDED')
  db.prepare(
    'UPDATE conversation_context SET current=0 WHERE project_id=? AND conversation_id=?'
  ).run(p, chat)
  db.prepare('INSERT INTO conversation_context VALUES (?,?,?,?,?,?)').run(
    p,
    id,
    chat,
    1,
    request,
    JSON.stringify(next)
  )
  return true
}
export function knowledgeOverview(db: Database.Database, p: string, chat?: string): string {
  const settings = chat ? readKnowledgeSettings(db, p, chat) : empty(),
    excluded = new Set(
      [...settings.excluded, ...settings.pins].filter((t) => t.kind === 'document').map((t) => t.id)
    )
  const overview = JSON.parse(conversationOverview(db, p)) as {
    outline: { id: string; revision: string }[]
    coverage: string
    includedOutlineItems: number
  }
  overview.outline = overview.outline.filter((d) => !excluded.has(d.id))
  overview.includedOutlineItems = overview.outline.length
  const docs = documents(db, p),
    byId = new Map(docs.map((d) => [d.id, d]))
  const sampled: { id: string; revision: string; text: string; partial: boolean }[] = []
  let budget = 10000,
    readBytes = 0
  for (const ref of overview.outline) {
    const d = byId.get(ref.id)
    if (!d || !d.payload) continue
    readBytes += d.payload.length
    if (readBytes > 4_000_000) break
    const text = documentText(d),
      limit = Math.min(800, budget)
    if (limit <= 0) break
    sampled.push({ ...ref, text: text.slice(0, limit), partial: text.length > limit })
    budget -= Math.min(text.length, limit)
  }
  const small =
    docs.length <= 200 &&
    docs.every((d) => !!d.payload) &&
    docs.reduce((n, d) => n + documentText(d).length, 0) <= 7000
  if (small) return JSON.stringify(overview)
  return JSON.stringify({
    ...overview,
    coverage:
      'Bounded structure, synopses and opening manuscript passages only; omitted text is not read. Summary is not quotation evidence.',
    sampled
  })
}
export function buildKnowledge(
  db: Database.Database,
  p: string,
  chat: string,
  query: string,
  currentId: string | null,
  settings: KnowledgeSettings,
  budget = 16000
): ProjectKnowledge {
  const result: ProjectKnowledge = {
      version: 1,
      settingsRevision: settings.revision,
      coverage: '',
      items: []
    },
    terms = words(query),
    excluded = new Set(settings.excluded.map(knowledgeKey)),
    seen = new Set<string>()
  let skipped = 0,
    categoryLimit = budget
  const add = (v: KnowledgeItem): boolean => {
    const key = knowledgeKey(v)
    if (excluded.has(key) || seen.has(key) || (v.sourceId && excluded.has(`source:${v.sourceId}`)))
      return false
    if (
      result.items.length >= 24 ||
      JSON.stringify([...result.items, v]).length > Math.min(budget, categoryLimit)
    ) {
      skipped++
      return false
    }
    result.items.push(v)
    seen.add(key)
    return true
  }
  for (const pin of settings.pins) {
    try {
      const live = resolveKnowledge(db, p, pin, '', true)
      if (pin.versionId && live.versionId !== pin.versionId) {
        skipped++
        continue
      }
      if (!add(pin)) fail('LIMIT_EXCEEDED')
    } catch (error) {
      if (error instanceof ProjectError && error.code === 'NOT_FOUND') {
        skipped++
        continue
      }
      throw error
    }
  }
  for (const id of [
    ...new Set(query.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [])
  ].slice(0, 12)) {
    for (const kind of ['source', 'document', 'note', 'excerpt', 'chat'] as const) {
      if (kind === 'chat' && id === chat) continue
      try {
        add(resolveKnowledge(db, p, { kind, id }, query))
        break
      } catch (error) {
        if (!(error instanceof ProjectError && error.code === 'NOT_FOUND')) throw error
      }
    }
  }
  categoryLimit = Math.min(budget, JSON.stringify(result.items).length + 7000)
  const docs = documents(db, p),
    active = docs.slice(0, 200),
    candidates: { value: KnowledgeItem; score: number }[] = []
  let readBytes = 0,
    full = true
  for (const d of active) {
    if (d.id === currentId || excluded.has(`document:${d.id}`) || seen.has(`document:${d.id}`))
      continue
    readBytes += d.payload.length
    if (!d.payload || readBytes > 4_000_000) {
      skipped++
      full = false
      continue
    }
    const text = documentText(d)
    const score = rank(d.title + ' ' + text, terms) + (query.includes(d.id) ? 100 : 0)
    const v = item({ kind: 'document', id: d.id }, d.revision, d.title, text, query, 20000)
    candidates.push({ value: v, score })
    if (text.length > 20000) full = false
  }
  const allSize = JSON.stringify([...result.items, ...candidates.map((c) => c.value)]).length
  if (
    full &&
    allSize <= Math.min(categoryLimit, 18000) &&
    result.items.length + candidates.length <= 24
  )
    for (const c of candidates) add(c.value)
  else {
    full = false
    for (const c of candidates.sort(
      (a, b) => b.score - a.score || a.value.id.localeCompare(b.value.id)
    )) {
      if (c.score <= 0) {
        skipped++
        continue
      }
      add({
        ...c.value,
        ...passage(c.value.text, query, 2400),
        start: c.value.start + passage(c.value.text, query, 2400).start,
        total: c.value.total
      })
    }
  }
  const scan = (kind: KnowledgeTarget['kind'], sql: string): void => {
    const rows = db.prepare(sql).all(p) as { id: string; text: string }[]
    if (rows.length > 200) skipped++
    const ranked = rows
      .slice(0, 200)
      .map((r) => ({ ...r, score: rank(r.text, terms) + (query.includes(r.id) ? 100 : 0) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, 12)
    for (const row of ranked) {
      if (kind === 'chat' && row.id === chat) continue
      try {
        add(resolveKnowledge(db, p, { kind, id: row.id }, query))
      } catch (error) {
        if (!(error instanceof ProjectError && error.code === 'NOT_FOUND')) throw error
      }
    }
  }
  categoryLimit = Math.min(budget, JSON.stringify(result.items).length + 6000)
  scan(
    'source',
    `SELECT s.id,substr(s.metadata,1,12000)||' '||coalesce((SELECT group_concat(substr(p.text,1,1000),' ') FROM source_version_selections selected JOIN source_pages p ON p.project_id=selected.project_id AND p.version_id=selected.version_id WHERE selected.project_id=s.project_id AND selected.source_id=s.id AND p.state='text' AND p.page_index<20),'') AS text FROM sources s WHERE s.project_id=? AND s.state='active' ORDER BY s.updated_at DESC,s.id LIMIT 201`
  )
  scan(
    'note',
    "SELECT id,title||' '||substr(body,1,12000) AS text FROM notes WHERE project_id=? AND state='active' ORDER BY updated_at DESC,id LIMIT 201"
  )
  scan(
    'excerpt',
    "SELECT e.id,v.source_id||' '||json_extract(s.metadata,'$.title')||' '||e.label||' '||substr(e.quote,1,12000) AS text FROM source_excerpts e JOIN source_versions v ON v.project_id=e.project_id AND v.id=e.version_id JOIN sources s ON s.project_id=v.project_id AND s.id=v.source_id WHERE e.project_id=? ORDER BY e.created_at DESC,e.id LIMIT 201"
  )
  categoryLimit = budget
  scan(
    'chat',
    `SELECT c.id,c.title||' '||coalesce((SELECT group_concat(substr(m.text,1,2000),' ') FROM conversation_messages m JOIN conversation_attempts a ON a.project_id=m.project_id AND a.id=m.attempt_id JOIN ai_captures cap ON cap.project_id=a.project_id AND cap.id=a.capture_id WHERE m.project_id=c.project_id AND m.conversation_id=c.id AND json_extract(a.body,'$.state')='completed' AND json_extract(a.body,'$.provider') IS NOT NULL AND coalesce(json_extract(cap.body,'$.purpose'),'chat')='chat' AND m.ordinal>=(SELECT coalesce(max(ordinal),0)-20 FROM conversation_messages WHERE project_id=c.project_id AND conversation_id=c.id)),'') AS text FROM conversations c WHERE c.project_id=? AND c.state='active' ORDER BY c.updated_at DESC,c.id LIMIT 201`
  )
  result.coverage = `${full && docs.length <= 200 ? 'All eligible other manuscript bodies fit the allocated selection.' : 'Selected manuscript passages; not the whole manuscript.'} Current writing is supplied separately. Research and chat recall use bounded authoritative reads (up to 200 candidates per category, 40 recent exchanges per selected chat), not exhaustive search. ${skipped ? 'Some material was omitted by size, state, exclusions or read bounds. ' : ''}Pins retain their selected revision; removed or superseded material is excluded. Archived chats appear only when explicitly pinned. Metadata, notes and prior discussion are not verified quotations.`
  return result
}
export function validateKnowledgeSettings(db: Database.Database, p: string): void {
  const rows = db
    .prepare(
      'SELECT project_id,id,conversation_id,current,request,body FROM conversation_context LIMIT 1001'
    )
    .all() as {
    project_id: string
    id: string
    conversation_id: string
    current: number
    request: string
    body: string
  }[]
  if (rows.length > 1000) fail('CORRUPT_PROJECT')
  const parents = new Map<string, string | null>(),
    groups = new Map<string, typeof rows>()
  for (const row of rows) {
    if (row.project_id !== p || row.body.length > 24000 || row.request.length > 2000)
      fail('CORRUPT_PROJECT')
    const value: unknown = JSON.parse(row.body),
      request: unknown = JSON.parse(row.request)
    if (
      !isKnowledgeSettings(value) ||
      value.revision !== row.id ||
      !record(request) ||
      !exact(request, ['expected', 'change']) ||
      (request.expected !== null && !isId(request.expected)) ||
      !isKnowledgeChange(request.change)
    )
      fail('CORRUPT_PROJECT')
    parents.set(row.id, (request as { expected: string | null }).expected)
    groups.set(row.conversation_id, [...(groups.get(row.conversation_id) ?? []), row])
    for (const pin of (value as KnowledgeSettings).pins) validateKnowledgeItem(db, p, pin)
    for (const target of (value as KnowledgeSettings).excluded)
      validateKnowledgeTarget(db, p, target)
  }
  for (const members of groups.values()) {
    const heads = members.filter((r) => r.current === 1),
      ids = new Set(members.map((r) => r.id)),
      seen = new Set<string>()
    if (heads.length !== 1) fail('CORRUPT_PROJECT')
    let id: string | null = heads[0].id
    while (id) {
      if (seen.has(id) || !ids.has(id)) fail('CORRUPT_PROJECT')
      seen.add(id)
      id = parents.get(id) ?? null
    }
    if (seen.size !== members.length) fail('CORRUPT_PROJECT')
  }
}
function validateKnowledgeTarget(db: Database.Database, p: string, target: KnowledgeTarget): void {
  const table = {
    document: 'documents',
    source: 'sources',
    note: 'notes',
    excerpt: 'source_excerpts',
    chat: 'conversations'
  }[target.kind]
  if (!db.prepare(`SELECT 1 FROM ${table} WHERE project_id=? AND id=?`).get(p, target.id))
    fail('CORRUPT_PROJECT')
}
function canonicalSource(db: Database.Database, p: string, id: string): string {
  const seen = new Set<string>()
  for (let depth = 0; depth < 32; depth++) {
    if (seen.has(id)) fail('CORRUPT_PROJECT')
    seen.add(id)
    const row = db
      .prepare('SELECT state,replacement_id FROM sources WHERE project_id=? AND id=?')
      .get(p, id) as { state: string; replacement_id: string | null } | undefined
    if (!row) fail('CORRUPT_PROJECT')
    if (row!.state !== 'merged') return id
    // Normal merges flatten aliases even when historical replacement links form
    // a longer chain. Keep old captures valid after repeated legitimate merges.
    const alias = db
      .prepare(
        "SELECT s.id FROM source_aliases a JOIN sources s ON s.project_id=a.project_id AND s.id=a.source_id WHERE a.project_id=? AND a.alias=? AND s.state<>'merged'"
      )
      .get(p, id) as { id: string } | undefined
    if (alias) return alias.id
    if (!row!.replacement_id) fail('CORRUPT_PROJECT')
    id = row!.replacement_id!
  }
  return fail('CORRUPT_PROJECT')
}
function validateKnowledgeItem(db: Database.Database, p: string, v: KnowledgeItem): void {
  validateKnowledgeTarget(db, p, v)
  if (
    v.sourceId &&
    !db.prepare('SELECT 1 FROM sources WHERE project_id=? AND id=?').get(p, v.sourceId)
  )
    fail('CORRUPT_PROJECT')
  if (v.versionId) {
    const version = db
      .prepare('SELECT source_id FROM source_versions WHERE project_id=? AND id=?')
      .get(p, v.versionId) as { source_id: string } | undefined
    if (
      !version ||
      !v.sourceId ||
      canonicalSource(db, p, version.source_id) !== canonicalSource(db, p, v.sourceId)
    )
      fail('CORRUPT_PROJECT')
  }
  if (v.kind === 'source' && v.sourceId !== v.id) fail('CORRUPT_PROJECT')
  if (v.kind === 'excerpt') {
    const e = db
      .prepare('SELECT quote,version_id FROM source_excerpts WHERE project_id=? AND id=?')
      .get(p, v.id) as { quote: string; version_id: string }
    if (
      v.revision !== v.id ||
      v.versionId !== e.version_id ||
      v.total !== e.quote.length ||
      e.quote.slice(v.start, v.start + v.text.length) !== v.text
    )
      fail('CORRUPT_PROJECT')
  }
}
export function matchResearch(
  db: Database.Database,
  p: string,
  text: string,
  referenceUrl?: string
): SourceMatch[] {
  const ids = new Set(
    (text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? [])
      .slice(0, 100)
      .map((id) => id.toLowerCase())
  )
  const trim = (v: string): string => v.replace(/[.,;:!?]+$/u, '').replace(/\)+$/u, '')
  const dois = new Set(
    (text.match(/10\.\d{4,9}\/[^\s<>[\]"']+/gi) ?? [])
      .slice(0, 100)
      .map((v) => normalizeSourceDoi(trim(v)))
  )
  const urls = new Set(
    (text.match(/https?:\/\/[^\s<>[\]"']+/gi) ?? [])
      .slice(0, 100)
      .map((v) => normalizeSourceUrl(trim(v)))
  )
  if (referenceUrl) {
    urls.add(normalizeSourceUrl(referenceUrl))
    try {
      const url = new URL(referenceUrl)
      if (['doi.org', 'dx.doi.org'].includes(url.hostname.toLowerCase()))
        dois.add(normalizeSourceDoi(decodeURIComponent(url.pathname.slice(1))))
    } catch {
      /* Retain other identifier matches. */
    }
  }
  const isbns = new Set(
    (text.match(/\b(?:97[89][ -]?)?\d[\d -]{7,20}[\dXx]\b/g) ?? [])
      .slice(0, 100)
      .map((v) => v.replace(/[ -]/g, '').toUpperCase())
      .filter((v) => v.length === 10 || v.length === 13)
  )
  const lower = text.toLocaleLowerCase(),
    searchText = [lower, ...urls, ...dois, ...isbns].join('\n').toLocaleLowerCase(),
    out = new Map<string, SourceMatch>()
  // Match against the whole canonical inventory, not only what was sent. SQLite
  // filters candidates before bounded metadata reads; identifiers use existing normalized values.
  const rows = db
    .prepare(
      `SELECT id,metadata,state,replacement_id FROM sources WHERE project_id=? AND (instr(?,lower(id))>0 OR (json_extract(metadata,'$.DOI')<>'' AND instr(?,lower(json_extract(metadata,'$.DOI')))>0) OR (json_extract(metadata,'$.URL')<>'' AND instr(?,lower(json_extract(metadata,'$.URL')))>0) OR (json_extract(metadata,'$.ISBN')<>'' AND instr(replace(replace(?,'-',''),' ',''),lower(json_extract(metadata,'$.ISBN')))>0) OR (length(json_extract(metadata,'$.title'))>=12 AND instr(?,lower(json_extract(metadata,'$.title')))>0)) ORDER BY id LIMIT 101`
    )
    .all(p, searchText, searchText, searchText, searchText, lower) as {
    id: string
    metadata: string
    state: string
    replacement_id: string | null
  }[]
  for (const r of rows.slice(0, 100)) {
    const m = JSON.parse(r.metadata) as SourceMetadata
    const exact =
      ids.has(r.id) ||
      (!!m.DOI && dois.has(m.DOI)) ||
      (!!m.URL && urls.has(m.URL)) ||
      (!!m.ISBN && isbns.has(m.ISBN))
    if (!exact && !(m.title.length >= 12 && lower.includes(m.title.toLocaleLowerCase()))) continue
    let canonical = r,
      depth = 0
    const seen = new Set<string>()
    while (canonical.state === 'merged' && canonical.replacement_id) {
      if (seen.has(canonical.id) || ++depth > 32) break
      seen.add(canonical.id)
      const next = db
        .prepare('SELECT id,metadata,state,replacement_id FROM sources WHERE project_id=? AND id=?')
        .get(p, canonical.replacement_id) as typeof r | undefined
      if (!next) break
      canonical = next
    }
    if (canonical.state === 'merged') continue
    const title = (JSON.parse(canonical.metadata) as SourceMetadata).title
    const match: SourceMatch = {
      id: canonical.id,
      title: title.slice(0, 200),
      status: canonical.state === 'trashed' ? 'trashed' : exact ? 'exact' : 'possible',
      reason:
        canonical.state === 'trashed'
          ? 'Removed from Research; not restored.'
          : exact
            ? 'Matching saved identifier'
            : 'Title match; review the source before relying on it.'
    }
    if (!out.has(match.id) || match.status === 'exact') out.set(match.id, match)
    if (out.size === 20) break
  }
  return [...out.values()]
}

/** Historical snapshots retain their bytes even when the current revision changes. */
export function validateKnowledgeCapture(
  db: Database.Database,
  p: string,
  capture:
    | import('../../shared/conversations').AiCaptureV4
    | import('../../shared/conversations').AiCaptureV5
): void {
  const knowledge = capture.knowledge
  if (!knowledge) return
  if (
    knowledge.settingsRevision &&
    !db
      .prepare(
        'SELECT 1 FROM conversation_context WHERE project_id=? AND conversation_id=? AND id=?'
      )
      .get(p, capture.conversationId, knowledge.settingsRevision)
  )
    fail('CORRUPT_PROJECT')
  for (const v of knowledge.items) {
    validateKnowledgeItem(db, p, v)
    if (v.kind === 'chat' && v.id === capture.conversationId) fail('CORRUPT_PROJECT')
    if (v.pinned) {
      const row = db
        .prepare('SELECT body FROM conversation_context WHERE project_id=? AND id=?')
        .get(p, knowledge.settingsRevision) as { body: string } | undefined
      if (!row) fail('CORRUPT_PROJECT')
      const settings = JSON.parse(row!.body) as KnowledgeSettings
      if (!settings.pins.some((pin) => requestDigest(pin) === requestDigest(v)))
        fail('CORRUPT_PROJECT')
    }
  }
}

export function knowledgeSettingsValue(
  db: Database.Database,
  p: string,
  chat: string
): Extract<import('../../shared/conversations').ConversationValue, { type: 'context-settings' }> {
  const settings = readKnowledgeSettings(db, p, chat)
  const excludedTitles = settings.excluded.map((target) => {
    const table = {
        document: 'documents',
        source: 'sources',
        note: 'notes',
        excerpt: 'source_excerpts',
        chat: 'conversations'
      }[target.kind],
      title =
        target.kind === 'source'
          ? "json_extract(metadata,'$.title')"
          : target.kind === 'excerpt'
            ? 'label'
            : 'title'
    const row = db
      .prepare(`SELECT substr(${title},1,200) AS title FROM ${table} WHERE project_id=? AND id=?`)
      .get(p, target.id) as { title: string } | undefined
    return row?.title || target.id
  })
  return { type: 'context-settings', settings, excludedTitles }
}
