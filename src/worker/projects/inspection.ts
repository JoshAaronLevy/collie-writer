import type Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { lstat } from 'node:fs/promises'
import { isId } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import {
  PDF_EXTRACTOR,
  PDF_INSPECTION_LIMIT,
  PDF_PAGE_LIMIT,
  TEXT_EXTRACTOR,
  type InspectionAssetInput,
  type InspectionChangeInput,
  type InspectionPageInput,
  type InspectionPageText,
  type InspectionScope,
  type InspectionStatus,
  type InspectionView,
  type WorkerInspectionAsset
} from '../../shared/inspection'
import { isSourceMetadata, type SourceMetadata } from '../../shared/sources'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'
import { contained } from '../storage/files'
import { fileHash } from './streams'
import { commitSourceOperation, priorSourceOperation, type SourceContext } from './sources'

type VersionRow = {
  id: string
  source_id: string
  attachment_id: string
  sha256: string
  media_type: 'application/pdf' | 'text/plain'
  metadata_snapshot: string
  extractor_version: string | null
  status: InspectionStatus
  document_title: string
  document_author: string
  total_pages: number | null
  revision_id: string
  created_at: string
}
type PageRow = {
  version_id: string
  page_index: number
  label: string | null
  state: 'text' | 'no_text' | 'failed'
  text: string
  text_hash: string
  error: string | null
}
type ExcerptRow = {
  id: string
  version_id: string
  page_index: number | null
  representation_hash: string | null
  start_offset: number | null
  end_offset: number | null
  quote: string
  context_before: string
  context_after: string
  kind: 'extracted' | 'transcription' | 'correction'
  label: string
  supersedes_id: string | null
  created_at: string
}
const digestText = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex')
function version(
  db: Database.Database,
  projectId: string,
  sourceId: string,
  id: string
): VersionRow {
  const row = db
    .prepare('SELECT * FROM source_versions WHERE project_id=? AND source_id=? AND id=?')
    .get(projectId, sourceId, id) as VersionRow | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  return row
}
function sourceExists(db: Database.Database, projectId: string, sourceId: string): void {
  if (!db.prepare('SELECT 1 FROM sources WHERE project_id=? AND id=?').get(projectId, sourceId))
    throw new ProjectError('NOT_FOUND')
}

export function readInspection(db: Database.Database, input: InspectionScope): InspectionView {
  const { projectId, sourceId } = input
  sourceExists(db, projectId, sourceId)
  const active = db
    .prepare('SELECT version_id FROM source_version_selections WHERE project_id=? AND source_id=?')
    .get(projectId, sourceId) as { version_id: string } | undefined
  const rows = db
    .prepare(
      'SELECT * FROM source_versions WHERE project_id=? AND source_id=? ORDER BY created_at DESC LIMIT 1000'
    )
    .all(projectId, sourceId) as VersionRow[]
  const counts = db.prepare(
    "SELECT count(*) processed,sum(CASE WHEN state='text' THEN 1 ELSE 0 END) with_text FROM source_pages WHERE project_id=? AND version_id=?"
  )
  const versions = rows.map((r) => {
    const c = counts.get(projectId, r.id) as { processed: number; with_text: number | null }
    return {
      id: r.id,
      sourceId: r.source_id,
      attachmentId: r.attachment_id,
      sha256: r.sha256,
      mediaType: r.media_type,
      metadata: JSON.parse(r.metadata_snapshot) as SourceMetadata,
      extractorVersion: r.extractor_version,
      status: r.status,
      documentTitle: r.document_title,
      documentAuthor: r.document_author,
      totalPages: r.total_pages,
      pagesProcessed: c.processed,
      pagesWithText: c.with_text ?? 0,
      revisionId: r.revision_id,
      createdAt: r.created_at
    }
  })
  const pages = (
    db
      .prepare(
        'SELECT version_id,page_index,label,state,length(text) characters,text_hash,error FROM source_pages WHERE project_id=? AND version_id IN (SELECT id FROM source_versions WHERE project_id=? AND source_id=?) ORDER BY version_id,page_index'
      )
      .all(projectId, projectId, sourceId) as (Omit<PageRow, 'text'> & { characters: number })[]
  ).map((p) => ({
    versionId: p.version_id,
    index: p.page_index,
    label: p.label,
    state: p.state,
    characters: p.characters,
    textHash: p.text_hash,
    error: p.error
  }))
  const excerpts = (
    db
      .prepare(
        'SELECT e.*,p.label page_label FROM source_excerpts e LEFT JOIN source_pages p ON p.project_id=e.project_id AND p.version_id=e.version_id AND p.page_index=e.page_index WHERE e.project_id=? AND e.version_id IN (SELECT id FROM source_versions WHERE project_id=? AND source_id=?) ORDER BY e.created_at DESC LIMIT 20000'
      )
      .all(projectId, projectId, sourceId) as (ExcerptRow & { page_label: string | null })[]
  ).map((e) => ({
    id: e.id,
    versionId: e.version_id,
    pageIndex: e.page_index,
    pageLabel: e.page_label,
    representationHash: e.representation_hash,
    startOffset: e.start_offset,
    endOffset: e.end_offset,
    quote: e.quote,
    contextBefore: e.context_before,
    contextAfter: e.context_after,
    kind: e.kind,
    label: e.label,
    supersedesId: e.supersedes_id,
    createdAt: e.created_at
  }))
  const headCommitId = (
    db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(projectId) as {
      head_commit_id: string
    }
  ).head_commit_id
  return {
    sourceId,
    activeVersionId: active?.version_id ?? null,
    versions,
    pages,
    excerpts,
    headCommitId
  }
}

export function readInspectionPage(
  db: Database.Database,
  input: InspectionPageInput
): InspectionPageText {
  version(db, input.projectId, input.sourceId, input.versionId)
  const row = db
    .prepare(
      "SELECT text,text_hash FROM source_pages WHERE project_id=? AND version_id=? AND page_index=? AND state='text'"
    )
    .get(input.projectId, input.versionId, input.pageIndex) as
    { text: string; text_hash: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  return {
    versionId: input.versionId,
    pageIndex: input.pageIndex,
    text: row.text,
    textHash: row.text_hash
  }
}

export async function inspectionAsset(
  context: SourceContext,
  input: InspectionAssetInput
): Promise<WorkerInspectionAsset> {
  const v = version(context.db, input.projectId, input.sourceId, input.versionId)
  const asset = context.db
    .prepare(
      'SELECT a.state,m.sha256,m.byte_size,m.media_type FROM source_attachments a JOIN managed_assets m ON m.project_id=a.project_id AND m.id=a.asset_id WHERE a.project_id=? AND a.id=?'
    )
    .get(input.projectId, v.attachment_id) as
    { state: string; sha256: string; byte_size: number; media_type: string } | undefined
  if (
    !asset ||
    asset.sha256 !== v.sha256 ||
    asset.media_type !== v.media_type ||
    asset.byte_size < 1 ||
    asset.byte_size > PDF_INSPECTION_LIMIT
  )
    throw new ProjectError('LIMIT_EXCEEDED')
  const path = join(context.workspace, 'blobs', asset.sha256)
  await contained(context.root, path, false)
  const info = await lstat(path)
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size !== asset.byte_size)
    throw new ProjectError('CORRUPT_PROJECT')
  const actual = await fileHash(path, PDF_INSPECTION_LIMIT)
  if (actual.sha256 !== asset.sha256 || actual.bytes !== asset.byte_size)
    throw new ProjectError('CORRUPT_PROJECT')
  return { path, bytes: asset.byte_size, mediaType: v.media_type, sha256: v.sha256 }
}

export function changeInspection(
  context: SourceContext,
  input: InspectionChangeInput
): InspectionView {
  const { db, projectId } = context,
    { sourceId, change: c } = input,
    digest = requestDigest(input)
  inWriteTransaction(db, () => {
    if (priorSourceOperation(db, projectId, input.operationId, digest)) return
    const now = new Date().toISOString()
    const source = db
      .prepare('SELECT metadata,state FROM sources WHERE project_id=? AND id=?')
      .get(projectId, sourceId) as { metadata: string; state: string } | undefined
    if (!source) throw new ProjectError('NOT_FOUND')
    if (c.type === 'ensure') {
      if (source.state !== 'active') throw new ProjectError('VALIDATION')
      const asset = db
        .prepare(
          'SELECT a.id,m.sha256,m.media_type FROM source_attachments a JOIN managed_assets m ON m.project_id=a.project_id AND m.id=a.asset_id WHERE a.project_id=? AND a.source_id=? AND a.id=?'
        )
        .get(projectId, sourceId, c.attachmentId) as
        { id: string; sha256: string; media_type: string } | undefined
      if (!asset || !['application/pdf', 'text/plain'].includes(asset.media_type))
        throw new ProjectError('VALIDATION')
      const old = db
        .prepare('SELECT id FROM source_versions WHERE project_id=? AND attachment_id=?')
        .get(projectId, c.attachmentId) as { id: string } | undefined
      if (!old) {
        const id = randomUUID()
        db.prepare('INSERT INTO source_versions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
          projectId,
          id,
          sourceId,
          c.attachmentId,
          asset.sha256,
          asset.media_type,
          source.metadata,
          null,
          'pending',
          '',
          '',
          null,
          randomUUID(),
          now,
          now
        )
        db.prepare('INSERT OR IGNORE INTO source_version_selections VALUES (?,?,?)').run(
          projectId,
          sourceId,
          id
        )
      }
    } else if (c.type === 'choose') {
      const v = version(db, projectId, sourceId, c.versionId)
      if (v.revision_id !== c.expectedRevisionId || source.state !== 'active')
        throw new ProjectError('STALE_REVISION')
      db.prepare(
        'INSERT INTO source_version_selections VALUES (?,?,?) ON CONFLICT(project_id,source_id) DO UPDATE SET version_id=excluded.version_id'
      ).run(projectId, sourceId, v.id)
      db.prepare(
        'UPDATE source_versions SET revision_id=?,updated_at=? WHERE project_id=? AND id=?'
      ).run(randomUUID(), now, projectId, v.id)
    } else if (c.type === 'start') {
      const v = version(db, projectId, sourceId, c.versionId)
      const savedPages = (
        db
          .prepare('SELECT count(*) count FROM source_pages WHERE project_id=? AND version_id=?')
          .get(projectId, v.id) as { count: number }
      ).count
      if (
        v.status === 'indexed' ||
        v.status === 'no_text' ||
        (v.media_type === 'application/pdf' && c.extractorVersion !== PDF_EXTRACTOR) ||
        (v.media_type === 'text/plain' && c.extractorVersion !== TEXT_EXTRACTOR) ||
        (v.media_type === 'text/plain' && c.totalPages !== 0) ||
        (v.total_pages !== null &&
          v.total_pages !== c.totalPages &&
          (savedPages > 0 || v.total_pages !== 0))
      )
        throw new ProjectError('VALIDATION')
      db.prepare(
        'UPDATE source_versions SET extractor_version=?,status=?,document_title=?,document_author=?,total_pages=?,revision_id=?,updated_at=? WHERE project_id=? AND id=?'
      ).run(
        c.extractorVersion,
        'extracting',
        c.documentTitle,
        c.documentAuthor,
        c.totalPages,
        randomUUID(),
        now,
        projectId,
        v.id
      )
    } else if (c.type === 'page') {
      const v = version(db, projectId, sourceId, c.versionId)
      if (
        v.status !== 'extracting' ||
        (v.media_type === 'application/pdf' &&
          (c.pageIndex < 1 || c.pageIndex > Math.min(v.total_pages ?? 0, PDF_PAGE_LIMIT))) ||
        (v.media_type === 'text/plain' && c.pageIndex !== 0) ||
        (c.state === 'text' && !c.text) ||
        (c.state !== 'text' && c.text) ||
        (c.state === 'failed' && !c.error)
      )
        throw new ProjectError('VALIDATION')
      const hash = digestText(c.text)
      const old = db
        .prepare(
          'SELECT text_hash,state,label FROM source_pages WHERE project_id=? AND version_id=? AND page_index=?'
        )
        .get(projectId, v.id, c.pageIndex) as
        { text_hash: string; state: string; label: string | null } | undefined
      if (old) {
        if (old.text_hash !== hash || old.state !== c.state || old.label !== c.label)
          throw new ProjectError('OPERATION_CONFLICT')
      } else
        db.prepare('INSERT INTO source_pages VALUES (?,?,?,?,?,?,?,?)').run(
          projectId,
          v.id,
          c.pageIndex,
          c.label,
          c.state,
          c.text,
          hash,
          c.error
        )
    } else if (c.type === 'finish') {
      const v = version(db, projectId, sourceId, c.versionId)
      if (v.status !== 'extracting') throw new ProjectError('VALIDATION')
      const counts = db
        .prepare(
          "SELECT count(*) processed,sum(CASE WHEN state='text' THEN 1 ELSE 0 END) with_text,sum(CASE WHEN state='failed' OR error IS NOT NULL THEN 1 ELSE 0 END) failed FROM source_pages WHERE project_id=? AND version_id=?"
        )
        .get(projectId, v.id) as {
        processed: number
        with_text: number | null
        failed: number | null
      }
      const expected =
        v.media_type === 'text/plain' ? 1 : Math.min(v.total_pages ?? 0, PDF_PAGE_LIMIT)
      const complete =
        counts.processed === expected &&
        !(counts.failed ?? 0) &&
        (v.media_type === 'text/plain' || v.total_pages === expected)
      const status: InspectionStatus =
        c.outcome === 'done'
          ? complete
            ? counts.with_text
              ? 'indexed'
              : 'no_text'
            : 'partial'
          : c.outcome === 'cancelled'
            ? 'partial'
            : c.outcome
      db.prepare(
        'UPDATE source_versions SET status=?,revision_id=?,updated_at=? WHERE project_id=? AND id=?'
      ).run(status, randomUUID(), now, projectId, v.id)
    } else {
      const v = version(db, projectId, sourceId, c.versionId)
      if (
        c.pageIndex === null ||
        (v.media_type === 'text/plain' && c.pageIndex !== 0) ||
        (v.media_type === 'application/pdf' &&
          (c.pageIndex < 1 || c.pageIndex > (v.total_pages ?? 0))) ||
        c.quote.length > 10000 ||
        !c.quote.trim() ||
        !c.label.trim()
      )
        throw new ProjectError('VALIDATION')
      let representationHash: string | null = null,
        contextBefore = '',
        contextAfter = ''
      if (c.kind === 'extracted') {
        if (
          c.pageIndex === null ||
          c.startOffset === null ||
          c.endOffset === null ||
          c.endOffset <= c.startOffset ||
          c.supersedesId !== null
        )
          throw new ProjectError('VALIDATION')
        const row = db
          .prepare(
            "SELECT text,text_hash FROM source_pages WHERE project_id=? AND version_id=? AND page_index=? AND state='text'"
          )
          .get(projectId, v.id, c.pageIndex) as { text: string; text_hash: string } | undefined
        if (!row || row.text.slice(c.startOffset, c.endOffset) !== c.quote)
          throw new ProjectError('STALE_REVISION')
        representationHash = row.text_hash
        contextBefore = row.text.slice(Math.max(0, c.startOffset - 120), c.startOffset)
        contextAfter = row.text.slice(c.endOffset, c.endOffset + 120)
      } else {
        if (
          c.startOffset !== null ||
          c.endOffset !== null ||
          !c.label.trim() ||
          (c.kind === 'correction') !== !!c.supersedesId
        )
          throw new ProjectError('VALIDATION')
        if (c.supersedesId) {
          const prior = db
            .prepare(
              'SELECT version_id,page_index FROM source_excerpts WHERE project_id=? AND id=?'
            )
            .get(projectId, c.supersedesId) as
            { version_id: string; page_index: number | null } | undefined
          if (prior?.version_id !== v.id || prior.page_index !== c.pageIndex)
            throw new ProjectError('VALIDATION')
        }
      }
      if (
        db.prepare('SELECT 1 FROM source_excerpts WHERE project_id=? AND id=?').get(projectId, c.id)
      )
        throw new ProjectError('OPERATION_CONFLICT')
      if (
        (
          db
            .prepare(
              'SELECT count(*) count FROM source_excerpts WHERE project_id=? AND version_id IN (SELECT id FROM source_versions WHERE project_id=? AND source_id=?)'
            )
            .get(projectId, projectId, sourceId) as { count: number }
        ).count >= 20000
      )
        throw new ProjectError('LIMIT_EXCEEDED')
      db.prepare('INSERT INTO source_excerpts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        projectId,
        c.id,
        v.id,
        c.pageIndex,
        representationHash,
        c.startOffset,
        c.endOffset,
        c.quote,
        contextBefore,
        contextAfter,
        c.kind,
        c.label,
        c.supersedesId,
        now
      )
    }
    commitSourceOperation(db, projectId, input.operationId, digest, now)
  })
  return readInspection(db, input)
}

export function validatePortableInspection(
  db: Database.Database,
  projectId: string,
  assetIds: Set<string>
): void {
  for (const table of [
    'source_versions',
    'source_version_selections',
    'source_pages',
    'source_excerpts'
  ])
    if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(projectId))
      throw new ProjectError('CORRUPT_PROJECT')
  for (const row of db
    .prepare('SELECT * FROM source_versions WHERE project_id=?')
    .iterate(projectId) as Iterable<VersionRow>) {
    const attachment = db
      .prepare(
        'SELECT a.asset_id,a.source_id,m.sha256,m.media_type FROM source_attachments a JOIN managed_assets m ON m.project_id=a.project_id AND m.id=a.asset_id WHERE a.project_id=? AND a.id=?'
      )
      .get(projectId, row.attachment_id) as
      { asset_id: string; source_id: string; sha256: string; media_type: string } | undefined
    if (
      !isId(row.id) ||
      !isId(row.source_id) ||
      !isId(row.revision_id) ||
      !attachment ||
      attachment.source_id !== row.source_id ||
      !assetIds.has(attachment.asset_id) ||
      attachment.sha256 !== row.sha256 ||
      attachment.media_type !== row.media_type ||
      !isSourceMetadata(JSON.parse(row.metadata_snapshot)) ||
      ![
        'pending',
        'extracting',
        'indexed',
        'partial',
        'no_text',
        'failed',
        'password_required',
        'unsupported'
      ].includes(row.status) ||
      (row.total_pages !== null &&
        (!Number.isSafeInteger(row.total_pages) ||
          row.total_pages < 0 ||
          row.total_pages > 10000)) ||
      (row.media_type === 'text/plain' && row.total_pages !== null && row.total_pages !== 0) ||
      (row.extractor_version !== null &&
        ![PDF_EXTRACTOR, TEXT_EXTRACTOR].includes(row.extractor_version)) ||
      (row.extractor_version !== null &&
        row.extractor_version !==
          (row.media_type === 'application/pdf' ? PDF_EXTRACTOR : TEXT_EXTRACTOR))
    )
      throw new ProjectError('CORRUPT_PROJECT')
  }
  for (const row of db
    .prepare('SELECT * FROM source_pages WHERE project_id=?')
    .iterate(projectId) as Iterable<PageRow>) {
    const owner = db
      .prepare('SELECT media_type,total_pages FROM source_versions WHERE project_id=? AND id=?')
      .get(projectId, row.version_id) as
      { media_type: string; total_pages: number | null } | undefined
    if (
      !owner ||
      row.text.length > 100000 ||
      row.page_index < 0 ||
      row.page_index > PDF_PAGE_LIMIT ||
      (owner.media_type === 'text/plain' && row.page_index !== 0) ||
      (owner.media_type === 'application/pdf' &&
        (row.page_index < 1 || row.page_index > (owner.total_pages ?? 0))) ||
      digestText(row.text) !== row.text_hash ||
      (row.state === 'text' && !row.text) ||
      (row.state !== 'text' && !!row.text) ||
      (row.state === 'failed' && !row.error)
    )
      throw new ProjectError('CORRUPT_PROJECT')
  }
  for (const row of db
    .prepare('SELECT * FROM source_excerpts WHERE project_id=?')
    .iterate(projectId) as Iterable<ExcerptRow>) {
    const owner = db
      .prepare('SELECT media_type,total_pages FROM source_versions WHERE project_id=? AND id=?')
      .get(projectId, row.version_id) as
      { media_type: string; total_pages: number | null } | undefined
    if (
      !owner ||
      !isId(row.id) ||
      !isId(row.version_id) ||
      !row.quote ||
      row.quote.length > 10000 ||
      !row.label.trim() ||
      row.context_before.length > 120 ||
      row.context_after.length > 120 ||
      row.page_index === null ||
      (owner.media_type === 'text/plain' && row.page_index !== 0) ||
      (owner.media_type === 'application/pdf' &&
        (row.page_index < 1 || row.page_index > (owner.total_pages ?? 0))) ||
      !['extracted', 'transcription', 'correction'].includes(row.kind)
    )
      throw new ProjectError('CORRUPT_PROJECT')
    if (row.kind === 'extracted') {
      if (
        row.start_offset === null ||
        row.end_offset === null ||
        row.end_offset <= row.start_offset ||
        !row.representation_hash ||
        row.supersedes_id !== null
      )
        throw new ProjectError('CORRUPT_PROJECT')
      const page = db
        .prepare(
          'SELECT text,text_hash FROM source_pages WHERE project_id=? AND version_id=? AND page_index=?'
        )
        .get(projectId, row.version_id, row.page_index) as
        { text: string; text_hash: string } | undefined
      if (
        !page ||
        page.text_hash !== row.representation_hash ||
        page.text.slice(row.start_offset, row.end_offset) !== row.quote
      )
        throw new ProjectError('CORRUPT_PROJECT')
    } else {
      if (
        row.representation_hash !== null ||
        row.start_offset !== null ||
        row.end_offset !== null ||
        row.context_before ||
        row.context_after ||
        (row.kind === 'correction') !== !!row.supersedes_id
      )
        throw new ProjectError('CORRUPT_PROJECT')
      if (row.supersedes_id) {
        const prior = db
          .prepare('SELECT version_id,page_index FROM source_excerpts WHERE project_id=? AND id=?')
          .get(projectId, row.supersedes_id) as
          { version_id: string; page_index: number } | undefined
        if (!prior || prior.version_id !== row.version_id || prior.page_index !== row.page_index)
          throw new ProjectError('CORRUPT_PROJECT')
      }
    }
  }
  for (const selection of db
    .prepare('SELECT source_id,version_id FROM source_version_selections WHERE project_id=?')
    .iterate(projectId) as Iterable<{ source_id: string; version_id: string }>) {
    if (
      !db
        .prepare('SELECT 1 FROM source_versions WHERE project_id=? AND id=? AND source_id=?')
        .get(projectId, selection.version_id, selection.source_id)
    )
      throw new ProjectError('CORRUPT_PROJECT')
  }
}
