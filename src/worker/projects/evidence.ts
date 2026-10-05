import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { isId, readDocument } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import {
  type EvidenceChangeInput,
  type EvidenceLink,
  type EvidenceView,
  type ResearchDecision,
  type ResearchItem,
  type EvidenceRole
} from '../../shared/evidence'
import type { OpenInput } from '../../shared/projects'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'
import { manuscript } from './manuscript'
import { effectiveState } from '../../shared/outline'
import { commitSourceOperation, priorSourceOperation } from './sources'

type ItemRow = {
  id: string
  revision_id: string
  text: string
  state: ResearchItem['state']
  document_id: string | null
  note_id: string | null
  document_revision_id: string | null
  created_at: string
  updated_at: string
}
type LinkRow = {
  id: string
  revision_id: string
  identity_key: string
  source_id: string
  excerpt_id: string | null
  claim_id: string | null
  document_id: string | null
  target_revision_id: string
  role: EvidenceRole
  origin: 'human'
  review: EvidenceLink['review']
  state: EvidenceLink['state']
  created_at: string
  updated_at: string
}
type DecisionRow = {
  question_id: string
  source_id: string
  revision_id: string
  state: ResearchDecision['state']
  reason: string
  origin: 'human'
  created_at: string
  updated_at: string
}
const key = (
  sourceId: string,
  excerptId: string | null,
  claimId: string | null,
  documentId: string | null,
  role: EvidenceRole
): string => [sourceId, excerptId ?? '', claimId ?? '', documentId ?? '', role].join('|')
const current = (db: Database.Database, projectId: string): string =>
  (
    db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(projectId) as {
      head_commit_id: string
    }
  ).head_commit_id
const limit = (count: number, maximum: number): void => {
  if (count > maximum) throw new ProjectError('LIMIT_EXCEEDED')
}

function association(
  db: Database.Database,
  projectId: string,
  documentId: string | null,
  noteId: string | null
): string | null {
  let revision: string | null = null
  if (documentId) {
    revision = sectionTarget(db, projectId, documentId).revision_id
  }
  if (noteId) {
    const row = db
      .prepare('SELECT state FROM notes WHERE project_id=? AND id=?')
      .get(projectId, noteId) as { state: string } | undefined
    if (!row || row.state !== 'active') throw new ProjectError('VALIDATION')
  }
  return revision
}
function revision(
  db: Database.Database,
  projectId: string,
  entityType: 'question' | 'claim' | 'link' | 'decision',
  entityKey: string,
  revisionId: string,
  row: unknown,
  now: string
): void {
  const snapshot = { ...(row as Record<string, unknown>) }
  delete snapshot.project_id
  db.prepare('INSERT INTO research_revisions VALUES (?,?,?,?,?,?)').run(
    projectId,
    entityType,
    entityKey,
    revisionId,
    JSON.stringify(snapshot),
    now
  )
}
function item(
  db: Database.Database,
  projectId: string,
  table: 'research_questions' | 'research_claims',
  id: string
): ItemRow {
  const row = db
    .prepare(`SELECT * FROM ${table} WHERE project_id=? AND id=?`)
    .get(projectId, id) as ItemRow | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  return row
}
function source(db: Database.Database, projectId: string, id: string, active = true): void {
  const row = db
    .prepare('SELECT state FROM sources WHERE project_id=? AND id=?')
    .get(projectId, id) as { state: string } | undefined
  if (!row || (active && row.state !== 'active')) throw new ProjectError('VALIDATION')
}
function canonicalSource(db: Database.Database, projectId: string, id: string): string {
  let cursor = id
  const seen = new Set<string>()
  while (true) {
    if (seen.has(cursor) || seen.size > 1000) throw new ProjectError('CORRUPT_PROJECT')
    seen.add(cursor)
    const row = db
      .prepare('SELECT replacement_id FROM sources WHERE project_id=? AND id=?')
      .get(projectId, cursor) as { replacement_id: string | null } | undefined
    if (!row) throw new ProjectError('CORRUPT_PROJECT')
    if (!row.replacement_id) return cursor
    cursor = row.replacement_id
  }
}
function sectionTarget(
  db: Database.Database,
  projectId: string,
  id: string
): { revision_id: string } {
  const row = db
    .prepare("SELECT revision_id FROM documents WHERE project_id=? AND id=? AND kind='text'")
    .get(projectId, id) as { revision_id: string } | undefined
  const tree = manuscript(db, projectId).documents
  const target = tree.find((d) => d.id === id)
  if (!row || !target || effectiveState(target, tree) !== 'active')
    throw new ProjectError('STALE_REVISION')
  return row
}
function citationRows(
  db: Database.Database,
  projectId: string,
  sections: EvidenceView['sections']
): EvidenceView['citations'] {
  const result: EvidenceView['citations'] = []
  for (const section of sections) {
    if (section.state === 'merged') continue
    const row = db
      .prepare('SELECT payload FROM documents WHERE project_id=? AND id=?')
      .get(projectId, section.id) as { payload: string } | undefined
    if (!row) continue
    const payload = readDocument(JSON.parse(row.payload))
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) {
        for (const child of value) visit(child)
        return
      }
      const node = value as Record<string, unknown>
      if (node.type === 'citation' && node.attrs && typeof node.attrs === 'object') {
        const attrs = node.attrs as { citationId?: string; items?: { sourceId: string }[] }
        if (attrs.citationId && attrs.items)
          for (const citation of attrs.items) {
            result.push({
              sourceId: citation.sourceId,
              documentId: section.id,
              citationId: attrs.citationId
            })
            limit(result.length, 50000)
          }
      }
      for (const [name, child] of Object.entries(node)) if (name !== 'attrs') visit(child)
    }
    visit(payload.ast)
    visit(payload.footnotesById)
  }
  return result
}

export function readEvidence(db: Database.Database, input: OpenInput): EvidenceView {
  const projectId = input.projectId
  const rows = <T>(sql: string, max: number): T[] => {
    const found = db.prepare(sql).all(projectId) as T[]
    limit(found.length, max)
    return found
  }
  const mapItem = (r: ItemRow): ResearchItem => ({
    id: r.id,
    revisionId: r.revision_id,
    text: r.text,
    state: r.state,
    documentId: r.document_id,
    noteId: r.note_id,
    documentRevisionId: r.document_revision_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  })
  const questions = rows<ItemRow>(
    'SELECT * FROM research_questions WHERE project_id=? ORDER BY created_at DESC',
    10000
  ).map(mapItem)
  const claims = rows<ItemRow>(
    'SELECT * FROM research_claims WHERE project_id=? ORDER BY created_at DESC',
    10000
  ).map(mapItem)
  const links = rows<LinkRow>(
    'SELECT * FROM evidence_links WHERE project_id=? ORDER BY created_at DESC',
    50000
  ).map((r) => ({
    id: r.id,
    revisionId: r.revision_id,
    sourceId: r.source_id,
    excerptId: r.excerpt_id,
    claimId: r.claim_id,
    documentId: r.document_id,
    targetRevisionId: r.target_revision_id,
    role: r.role,
    origin: r.origin,
    review: r.review,
    state: r.state,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
  const decisions = rows<DecisionRow>(
    'SELECT * FROM research_decisions WHERE project_id=? ORDER BY updated_at DESC',
    50000
  ).map((r) => ({
    questionId: r.question_id,
    sourceId: r.source_id,
    revisionId: r.revision_id,
    state: r.state,
    reason: r.reason,
    origin: r.origin,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }))
  const sources = rows<{
    id: string
    metadata: string
    state: 'active' | 'trashed' | 'merged'
    replacement_id: string | null
    version_id: string | null
  }>(
    'SELECT s.id,s.metadata,s.state,s.replacement_id,v.version_id FROM sources s LEFT JOIN source_version_selections v ON v.project_id=s.project_id AND v.source_id=s.id WHERE s.project_id=? ORDER BY s.created_at',
    100000
  ).map((r) => ({
    id: r.id,
    title: (JSON.parse(r.metadata) as { title: string }).title,
    state: r.state,
    replacementId: r.replacement_id,
    activeVersionId: r.version_id
  }))
  const snapshot = manuscript(db, projectId)
  const sections = snapshot.documents
    .filter((d) => d.kind === 'text')
    .map((d) => ({
      id: d.id,
      title: d.title,
      revisionId: d.revisionId,
      state: effectiveState(d, snapshot.documents),
      replacementId: d.replacementId
    }))
  limit(sections.length, 10000)
  const notes = rows<{ id: string; title: string; state: 'active' | 'archived' | 'trashed' }>(
    'SELECT id,title,state FROM notes WHERE project_id=?',
    100000
  )
  const excerpts = rows<{
    id: string
    source_id: string
    version_id: string
    sha256: string
    page_index: number | null
    quote: string
    kind: 'extracted' | 'transcription' | 'correction'
  }>(
    'SELECT e.id,v.source_id,e.version_id,v.sha256,e.page_index,e.quote,e.kind FROM source_excerpts e JOIN source_versions v ON v.project_id=e.project_id AND v.id=e.version_id WHERE e.project_id=? ORDER BY e.created_at DESC',
    100000
  ).map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    versionId: r.version_id,
    sha256: r.sha256,
    pageIndex: r.page_index,
    quote: r.quote,
    kind: r.kind
  }))
  const sourceSections = rows<{ source_id: string; document_id: string }>(
    'SELECT source_id,document_id FROM source_links WHERE project_id=?',
    50000
  ).map((r) => ({ sourceId: r.source_id, documentId: r.document_id }))
  const revisions = rows<{
    entity_type: 'question' | 'claim' | 'link' | 'decision'
    entity_key: string
    revision_id: string
    snapshot: string
    created_at: string
  }>(
    'SELECT entity_type,entity_key,revision_id,snapshot,created_at FROM research_revisions WHERE project_id=? ORDER BY created_at DESC',
    100000
  ).map((r) => ({
    entityType: r.entity_type,
    entityKey: r.entity_key,
    revisionId: r.revision_id,
    snapshot: r.snapshot,
    createdAt: r.created_at
  }))
  return {
    questions,
    claims,
    links,
    decisions,
    sources,
    sections,
    notes,
    excerpts,
    sourceSections,
    citations: citationRows(db, projectId, sections),
    revisions,
    headCommitId: current(db, projectId)
  }
}

export function changeEvidence(db: Database.Database, input: EvidenceChangeInput): EvidenceView {
  const { projectId, change: c } = input,
    digest = requestDigest(input)
  inWriteTransaction(db, () => {
    if (priorSourceOperation(db, projectId, input.operationId, digest)) return
    const now = new Date().toISOString()
    if (c.type === 'createQuestion' || c.type === 'createClaim') {
      const table = c.type === 'createQuestion' ? 'research_questions' : 'research_claims'
      const count = db
        .prepare(`SELECT count(*) count FROM ${table} WHERE project_id=?`)
        .get(projectId) as { count: number }
      limit(count.count + 1, 10000)
      if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id=? AND id=?`).get(projectId, c.id))
        throw new ProjectError('OPERATION_CONFLICT')
      const documentRevision = association(db, projectId, c.documentId, c.noteId)
      db.prepare(`INSERT INTO ${table} VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
        projectId,
        c.id,
        randomUUID(),
        c.text.trim(),
        'active',
        c.documentId,
        c.noteId,
        documentRevision,
        now,
        now
      )
    } else if (c.type === 'updateQuestion' || c.type === 'updateClaim') {
      const table = c.type === 'updateQuestion' ? 'research_questions' : 'research_claims'
      const before = item(db, projectId, table, c.id)
      if (before.revision_id !== c.expectedRevisionId) throw new ProjectError('STALE_REVISION')
      const documentRevision = association(db, projectId, c.documentId, c.noteId)
      revision(
        db,
        projectId,
        c.type === 'updateQuestion' ? 'question' : 'claim',
        c.id,
        before.revision_id,
        before,
        now
      )
      db.prepare(
        `UPDATE ${table} SET revision_id=?,text=?,state=?,document_id=?,note_id=?,document_revision_id=?,updated_at=? WHERE project_id=? AND id=?`
      ).run(
        randomUUID(),
        c.text.trim(),
        c.state,
        c.documentId,
        c.noteId,
        documentRevision,
        now,
        projectId,
        c.id
      )
    } else if (c.type === 'createLink') {
      const count = db
        .prepare('SELECT count(*) count FROM evidence_links WHERE project_id=?')
        .get(projectId) as { count: number }
      limit(count.count + 1, 50000)
      source(db, projectId, c.sourceId)
      if (c.excerptId) {
        const excerpt = db
          .prepare(
            'SELECT v.source_id FROM source_excerpts e JOIN source_versions v ON v.project_id=e.project_id AND v.id=e.version_id WHERE e.project_id=? AND e.id=?'
          )
          .get(projectId, c.excerptId) as { source_id: string } | undefined
        if (!excerpt || excerpt.source_id !== c.sourceId) throw new ProjectError('VALIDATION')
      }
      const targetRevision = c.claimId
        ? item(db, projectId, 'research_claims', c.claimId)
        : sectionTarget(db, projectId, c.documentId!)
      if (
        !targetRevision ||
        targetRevision.revision_id !== c.expectedTargetRevisionId ||
        ('state' in targetRevision && targetRevision.state !== 'active')
      )
        throw new ProjectError('STALE_REVISION')
      const identity = key(c.sourceId, c.excerptId, c.claimId, c.documentId, c.role)
      if (
        db
          .prepare('SELECT 1 FROM evidence_links WHERE project_id=? AND identity_key=?')
          .get(projectId, identity)
      )
        throw new ProjectError('OPERATION_CONFLICT')
      db.prepare('INSERT INTO evidence_links VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        projectId,
        c.id,
        randomUUID(),
        identity,
        c.sourceId,
        c.excerptId,
        c.claimId,
        c.documentId,
        targetRevision.revision_id,
        c.role,
        'human',
        'reviewed',
        'active',
        now,
        now
      )
    } else if (c.type === 'changeLink') {
      const before = db
        .prepare('SELECT * FROM evidence_links WHERE project_id=? AND id=?')
        .get(projectId, c.id) as LinkRow | undefined
      if (!before) throw new ProjectError('NOT_FOUND')
      if (before.revision_id !== c.expectedRevisionId) throw new ProjectError('STALE_REVISION')
      const identity = key(
        before.source_id,
        before.excerpt_id,
        before.claim_id,
        before.document_id,
        c.role
      )
      const duplicate = db
        .prepare('SELECT id FROM evidence_links WHERE project_id=? AND identity_key=?')
        .get(projectId, identity) as { id: string } | undefined
      if (duplicate && duplicate.id !== before.id) throw new ProjectError('OPERATION_CONFLICT')
      let targetRevision = before.target_revision_id
      if (c.review === 'reviewed' && c.state === 'active') {
        const currentTarget = before.claim_id
          ? item(db, projectId, 'research_claims', before.claim_id)
          : sectionTarget(db, projectId, before.document_id!)
        if (!currentTarget || ('state' in currentTarget && currentTarget.state !== 'active'))
          throw new ProjectError('STALE_REVISION')
        targetRevision = currentTarget.revision_id
      }
      revision(db, projectId, 'link', before.id, before.revision_id, before, now)
      db.prepare(
        'UPDATE evidence_links SET revision_id=?,identity_key=?,target_revision_id=?,role=?,review=?,state=?,updated_at=? WHERE project_id=? AND id=?'
      ).run(randomUUID(), identity, targetRevision, c.role, c.review, c.state, now, projectId, c.id)
    } else if (c.type === 'decide') {
      if (item(db, projectId, 'research_questions', c.questionId).state !== 'active')
        throw new ProjectError('STALE_REVISION')
      source(db, projectId, c.sourceId, false)
      const before = db
        .prepare(
          'SELECT * FROM research_decisions WHERE project_id=? AND question_id=? AND source_id=?'
        )
        .get(projectId, c.questionId, c.sourceId) as DecisionRow | undefined
      if (before?.revision_id !== c.expectedRevisionId) throw new ProjectError('STALE_REVISION')
      if (before)
        revision(
          db,
          projectId,
          'decision',
          `${c.questionId}|${c.sourceId}`,
          before.revision_id,
          before,
          now
        )
      db.prepare(
        'INSERT INTO research_decisions VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,question_id,source_id) DO UPDATE SET revision_id=excluded.revision_id,state=excluded.state,reason=excluded.reason,updated_at=excluded.updated_at'
      ).run(
        projectId,
        c.questionId,
        c.sourceId,
        randomUUID(),
        c.state,
        c.reason.trim(),
        'human',
        before?.created_at ?? now,
        now
      )
    }
    commitSourceOperation(db, projectId, input.operationId, digest, now)
  })
  return readEvidence(db, input)
}

export function validatePortableEvidence(db: Database.Database, projectId: string): void {
  for (const table of [
    'research_questions',
    'research_claims',
    'evidence_links',
    'research_decisions',
    'research_revisions'
  ])
    if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(projectId))
      throw new ProjectError('CORRUPT_PROJECT')
  for (const table of ['research_questions', 'research_claims'] as const)
    for (const row of db
      .prepare(`SELECT * FROM ${table} WHERE project_id=?`)
      .iterate(projectId) as Iterable<ItemRow>) {
      if (
        !isId(row.id) ||
        !isId(row.revision_id) ||
        !row.text.trim() ||
        row.text.length > 10000 ||
        !['active', 'archived'].includes(row.state) ||
        (row.document_id !== null && !isId(row.document_revision_id)) ||
        (row.document_id === null && row.document_revision_id !== null)
      )
        throw new ProjectError('CORRUPT_PROJECT')
    }
  for (const row of db
    .prepare('SELECT * FROM evidence_links WHERE project_id=?')
    .iterate(projectId) as Iterable<LinkRow>) {
    if (
      !isId(row.id) ||
      !isId(row.revision_id) ||
      !isId(row.target_revision_id) ||
      row.identity_key !==
        key(row.source_id, row.excerpt_id, row.claim_id, row.document_id, row.role) ||
      row.origin !== 'human' ||
      !['reviewed', 'needs_review'].includes(row.review)
    )
      throw new ProjectError('CORRUPT_PROJECT')
    if (row.excerpt_id) {
      const owner = db
        .prepare(
          'SELECT v.source_id FROM source_excerpts e JOIN source_versions v ON v.project_id=e.project_id AND v.id=e.version_id WHERE e.project_id=? AND e.id=?'
        )
        .get(projectId, row.excerpt_id) as { source_id: string } | undefined
      if (!owner || owner.source_id !== canonicalSource(db, projectId, row.source_id))
        throw new ProjectError('CORRUPT_PROJECT')
    }
  }
  for (const row of db
    .prepare('SELECT * FROM research_decisions WHERE project_id=?')
    .iterate(projectId) as Iterable<DecisionRow>)
    if (
      !isId(row.revision_id) ||
      !['candidate', 'kept', 'rejected'].includes(row.state) ||
      (row.state === 'rejected' && !row.reason.trim()) ||
      row.reason.length > 2000 ||
      row.origin !== 'human'
    )
      throw new ProjectError('CORRUPT_PROJECT')
  for (const row of db
    .prepare('SELECT * FROM research_revisions WHERE project_id=?')
    .iterate(projectId) as Iterable<{
    entity_type: string
    entity_key: string
    revision_id: string
    snapshot: string
    created_at: string
  }>) {
    if (
      !['question', 'claim', 'link', 'decision'].includes(row.entity_type) ||
      !isId(row.revision_id) ||
      row.snapshot.length > 100000 ||
      !Number.isFinite(Date.parse(row.created_at)) ||
      !row.entity_key
    )
      throw new ProjectError('CORRUPT_PROJECT')
    const snapshot: unknown = JSON.parse(row.snapshot)
    if (
      !snapshot ||
      typeof snapshot !== 'object' ||
      Array.isArray(snapshot) ||
      Object.hasOwn(snapshot, 'project_id')
    )
      throw new ProjectError('CORRUPT_PROJECT')
    const table =
      row.entity_type === 'question'
        ? 'research_questions'
        : row.entity_type === 'claim'
          ? 'research_claims'
          : row.entity_type === 'link'
            ? 'evidence_links'
            : 'research_decisions'
    const exists =
      row.entity_type === 'decision'
        ? (() => {
            const [questionId, sourceId] = row.entity_key.split('|')
            return (
              isId(questionId) &&
              isId(sourceId) &&
              !!db
                .prepare(
                  `SELECT 1 FROM ${table} WHERE project_id=? AND question_id=? AND source_id=?`
                )
                .get(projectId, questionId, sourceId)
            )
          })()
        : isId(row.entity_key) &&
          !!db
            .prepare(`SELECT 1 FROM ${table} WHERE project_id=? AND id=?`)
            .get(projectId, row.entity_key)
    if (!exists) throw new ProjectError('CORRUPT_PROJECT')
  }
}
