import { isEditableKind } from '../../shared/outline'
import { hasControlCharacters } from '../../shared/control-characters'
import type Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import { basename } from 'node:path'
import {
  isId,
  safeLink,
  readDocument,
  type Block,
  type DocumentPayload,
  type Inline,
  type Paragraph
} from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import type { OpenInput } from '../../shared/projects'
import type {
  CompilationRecipe,
  RecipesView,
  RecipeChangeInput,
  WorkerImportPreview,
  WorkerImportCommit,
  ImportPreview
} from '../../shared/interchange'
import { effectiveState } from '../../shared/outline'
import { inWriteTransaction } from '../storage/driver'
import { requestDigest } from '../storage/digest'
import { checkpoint, manuscript, reconcileAnchors, writeManuscript } from './manuscript'
import { isUtc } from './manifest'

const MAX_IMPORT = 8 * 1024 * 1024
function head(db: Database.Database, projectId: string): string {
  const row = db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(projectId) as
    { head_commit_id: string } | undefined
  if (!row) throw new ProjectError('NOT_FOUND')
  return row.head_commit_id
}
function advance(db: Database.Database, projectId: string, old: string): string {
  const next = randomUUID(),
    now = new Date().toISOString()
  db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(projectId, next, old, now)
  db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(
    next,
    now,
    projectId
  )
  return next
}
export function readRecipes(db: Database.Database, input: OpenInput): RecipesView {
  const snap = manuscript(db, input.projectId)
  const available = new Set(
    snap.documents
      .filter((d) => isEditableKind(d.kind) && effectiveState(d, snap.documents) === 'active')
      .map((d) => d.id)
  )
  const rows = db
    .prepare('SELECT * FROM compilation_recipes WHERE project_id=? ORDER BY updated_at DESC')
    .all(input.projectId) as {
    id: string
    revision_id: string
    name: string
    document_ids: string
    paper: 'Letter' | 'A4'
    formats: string
    created_at: string
    updated_at: string
  }[]
  const recipes: CompilationRecipe[] = rows.map((row) => {
    const documentIds = JSON.parse(row.document_ids) as string[],
      formats = JSON.parse(row.formats) as CompilationRecipe['formats']
    return {
      id: row.id,
      revisionId: row.revision_id,
      name: row.name,
      documentIds,
      paper: row.paper,
      formats,
      missingIds: documentIds.filter((id) => !available.has(id)),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  })
  return { headCommitId: head(db, input.projectId), recipes }
}
export function changeRecipe(db: Database.Database, input: RecipeChangeInput): RecipesView {
  inWriteTransaction(db, () => {
    const digest = requestDigest(input)
    const prior = db
      .prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?')
      .get(input.projectId, input.operationId) as { digest: string } | undefined
    if (prior) {
      if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
      return
    }
    const current = head(db, input.projectId)
    if (current !== input.expectedHead) throw new ProjectError('STALE_REVISION')
    const snap = manuscript(db, input.projectId)
    const available = new Set(
      snap.documents
        .filter((d) => isEditableKind(d.kind) && effectiveState(d, snap.documents) === 'active')
        .map((d) => d.id)
    )
    if (input.documentIds.some((id) => !available.has(id))) throw new ProjectError('VALIDATION')
    const existing = input.id
      ? (db
          .prepare(
            'SELECT revision_id,created_at FROM compilation_recipes WHERE project_id=? AND id=?'
          )
          .get(input.projectId, input.id) as
          { revision_id: string; created_at: string } | undefined)
      : undefined
    if (
      (input.id && (!existing || existing.revision_id !== input.expectedRevisionId)) ||
      (!input.id && input.expectedRevisionId)
    )
      throw new ProjectError('STALE_REVISION')
    if (
      (
        db
          .prepare('SELECT count(*) AS n FROM compilation_recipes WHERE project_id=?')
          .get(input.projectId) as { n: number }
      ).n >= 1000 &&
      !existing
    )
      throw new ProjectError('LIMIT_EXCEEDED')
    if (
      (
        db
          .prepare('SELECT count(*) AS n FROM compilation_recipe_revisions WHERE project_id=?')
          .get(input.projectId) as { n: number }
      ).n >= 100000
    )
      throw new ProjectError('LIMIT_EXCEEDED')
    if (
      db
        .prepare(
          'SELECT 1 FROM compilation_recipes WHERE project_id=? AND lower(name)=lower(?) AND id<>?'
        )
        .get(input.projectId, input.name.trim(), input.id ?? '')
    )
      throw new ProjectError('VALIDATION')
    const id = input.id ?? randomUUID(),
      revision = randomUUID(),
      now = new Date().toISOString()
    db.prepare(
      `INSERT INTO compilation_recipes VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,id) DO UPDATE SET revision_id=excluded.revision_id,name=excluded.name,document_ids=excluded.document_ids,paper=excluded.paper,formats=excluded.formats,updated_at=excluded.updated_at`
    ).run(
      input.projectId,
      id,
      revision,
      input.name.trim(),
      JSON.stringify(input.documentIds),
      input.paper,
      JSON.stringify(input.formats),
      existing?.created_at ?? now,
      now
    )
    const result = {
      id,
      revisionId: revision,
      name: input.name.trim(),
      documentIds: input.documentIds,
      paper: input.paper,
      formats: input.formats
    }
    db.prepare('INSERT INTO compilation_recipe_revisions VALUES (?,?,?,?,?)').run(
      input.projectId,
      id,
      revision,
      JSON.stringify(result),
      now
    )
    const next = advance(db, input.projectId, current)
    const selected = snap.documents.find(
      (d) => isEditableKind(d.kind) && effectiveState(d, snap.documents) === 'active'
    )!
    db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(
      input.projectId,
      input.operationId,
      digest,
      JSON.stringify({
        projectId: input.projectId,
        documentId: selected.id,
        revisionId: selected.revisionId,
        headCommitId: next
      })
    )
  })
  return readRecipes(db, input)
}

async function source(input: WorkerImportPreview | WorkerImportCommit): Promise<Buffer> {
  const stat = await lstat(input.sourcePath)
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    stat.size < 1 ||
    stat.size > MAX_IMPORT ||
    basename(input.sourcePath) !== input.originalName
  )
    throw new ProjectError('VALIDATION')
  const handle = await open(input.sourcePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  try {
    const before = await handle.stat()
    if (before.dev !== stat.dev || before.ino !== stat.ino || before.size !== stat.size)
      throw new ProjectError('EXTERNAL_CHANGE')
    const bytes = await handle.readFile(),
      after = await handle.stat()
    if (
      bytes.length !== stat.size ||
      after.size !== before.size ||
      after.mtimeMs !== before.mtimeMs
    )
      throw new ProjectError('EXTERNAL_CHANGE')
    return bytes
  } finally {
    await handle.close()
  }
}
type Parsed = { payload: DocumentPayload; preview: ImportPreview; bytes: Buffer }
async function parse(input: WorkerImportPreview | WorkerImportCommit): Promise<Parsed> {
  const bytes = await source(input),
    digest = createHash('sha256').update(bytes).digest('hex')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ProjectError('VALIDATION')
  }
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (
    hasControlCharacters(text, true) ||
    (input.format === 'markdown' && /<!--|<![A-Za-z]|<\/?[A-Za-z][^>]*>/u.test(text))
  )
    throw new ProjectError('VALIDATION')
  const title =
    input.originalName
      .replace(/\.(md|markdown|txt)$/i, '')
      .trim()
      .slice(0, 500) || 'Imported writing'
  const losses = new Set<string>(),
    blocks: Block[] = [],
    notes: DocumentPayload['footnotesById'] = {}
  if (input.format === 'markdown')
    losses.add(
      'Rendered citations and bibliography, if present, remain visible text rather than linked project sources.'
    )
  if (input.format === 'text' && /\[note \d+\]/.test(text))
    losses.add('Plain-text note markers remain visible text rather than editable footnotes.')
  const definitions = new Map<string, string>(),
    usedNotes = new Set<string>()
  const lines = text.split('\n'),
    contentLines: string[] = []
  let activeDefinition: string | null = null
  if (input.format === 'markdown')
    for (let i = 0; i < lines.length; i++) {
      const found = /^\[\^(\d+)\]:\s*(.*)$/.exec(lines[i])
      if (found) {
        if (definitions.has(found[1]))
          losses.add('Duplicate footnote definitions use the last definition.')
        definitions.set(found[1], found[2])
        activeDefinition = found[1]
        continue
      }
      if (activeDefinition && /^ {4,}/.test(lines[i])) {
        definitions.set(
          activeDefinition,
          definitions.get(activeDefinition)! + '\n' + lines[i].trim()
        )
        continue
      }
      activeDefinition = null
      contentLines.push(lines[i])
    }
  else contentLines.push(...lines)
  function literal(value: string): Inline[] {
    return value ? [{ type: 'text', text: value }] : []
  }
  function inline(value: string): Inline[] {
    if (input.format === 'text') return literal(value)
    const result: Inline[] = [],
      pattern = /(!?\[([^\]]*)\]\(([^)]+)\)|\[\^(\d+)\]|\*\*([^*]+)\*\*|\*([^*]+)\*)/g
    let offset = 0,
      match: RegExpExecArray | null
    while ((match = pattern.exec(value))) {
      if (match.index > offset)
        result.push(
          ...literal(value.slice(offset, match.index).replace(/\\([\\`*_{}[\]<>!|])/g, '$1'))
        )
      if (match[4]) {
        const definition = definitions.get(match[4])
        if (definition && !usedNotes.has(match[4])) {
          const id = randomUUID()
          usedNotes.add(match[4])
          if (definition.includes('\n'))
            losses.add('Multi-paragraph footnote bodies are flattened to one imported paragraph.')
          notes[id] = {
            type: 'doc',
            content: [
              {
                type: 'paragraph',
                attrs: { blockId: randomUUID() },
                content: literal(definition.replace(/\n+/g, ' '))
              }
            ]
          }
          result.push({ type: 'footnote', attrs: { footnoteId: id } })
        } else {
          losses.add('An unresolved or repeated footnote marker remains literal text.')
          result.push(...literal(match[0]))
        }
      } else if (match[1]) {
        if (match[1].startsWith('!')) {
          losses.add('Linked image pixels are not imported; the image marker remains as text.')
          result.push(...literal(`[Image: ${match[2]}]`))
        } else if (safeLink(match[3]))
          result.push({
            type: 'text',
            text: match[2] || match[3],
            marks: [{ type: 'link', attrs: { href: match[3] } }]
          })
        else {
          losses.add('A non-HTTP link remains visible text.')
          result.push(...literal(match[2] || match[3]))
        }
      } else if (match[5]) result.push({ type: 'text', text: match[5], marks: [{ type: 'bold' }] })
      else if (match[6]) result.push({ type: 'text', text: match[6], marks: [{ type: 'italic' }] })
      offset = pattern.lastIndex
    }
    if (offset < value.length)
      result.push(...literal(value.slice(offset).replace(/\\([\\`*_{}[\]<>!|])/g, '$1')))
    if (!result.length && value) result.push(...literal(value))
    return result
  }
  const para = (value: string): Paragraph => ({
    type: 'paragraph',
    attrs: { blockId: randomUUID() },
    content: inline(value)
  })
  let pending: string[] = [],
    list: { type: 'bulletList' | 'orderedList'; start: number; items: Paragraph[] } | null = null
  const flush = (): void => {
    if (pending.length) {
      if (input.format === 'text')
        blocks.push({
          type: 'paragraph',
          attrs: { blockId: randomUUID() },
          content: pending.flatMap((line, index): Inline[] =>
            index ? [{ type: 'hardBreak' }, ...literal(line)] : literal(line)
          )
        })
      else blocks.push(para(pending.join(' ')))
      pending = []
    }
    if (list) {
      blocks.push({
        type: list.type,
        attrs: {
          blockId: randomUUID(),
          ...(list.type === 'orderedList' ? { start: list.start } : {})
        },
        content: list.items.map((p) => ({
          type: 'listItem' as const,
          attrs: { blockId: randomUUID() },
          content: [p]
        }))
      })
      list = null
    }
  }
  for (const line of contentLines) {
    if (!line.trim()) {
      flush()
      continue
    }
    if (input.format === 'markdown') {
      let m: RegExpExecArray | null
      if ((m = /^(#{1,3})\s+(.+)$/.exec(line))) {
        flush()
        blocks.push({
          type: 'heading',
          attrs: { blockId: randomUUID(), level: m[1].length as 1 | 2 | 3 },
          content: inline(m[2])
        })
        continue
      }
      if (/^#{4,}\s/.test(line)) {
        losses.add('Heading levels deeper than three are flattened to paragraphs.')
      }
      if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
        flush()
        blocks.push({ type: 'horizontalRule', attrs: { blockId: randomUUID() } })
        continue
      }
      if ((m = /^>\s?(.*)$/.exec(line))) {
        flush()
        blocks.push({ type: 'blockquote', attrs: { blockId: randomUUID() }, content: [para(m[1])] })
        continue
      }
      if ((m = /^\s{0,3}(-|\*|\d+\.)\s+(.+)$/.exec(line))) {
        const ordered = /\d/.test(m[1]),
          type = ordered ? 'orderedList' : 'bulletList',
          start = ordered ? Number(m[1].slice(0, -1)) : 1
        if (!Number.isSafeInteger(start) || start < 1 || start > 999999)
          throw new ProjectError('VALIDATION')
        if (pending.length) flush()
        if (list && list.type !== type) flush()
        list ??= { type, start, items: [] }
        list.items.push(para(m[2]))
        continue
      }
      if (/^```|^~~~/.test(line)) {
        losses.add('Code fences are imported as visible text without code styling.')
      }
      if (/^\|/.test(line)) {
        losses.add('Markdown table syntax is imported as visible text without table layout.')
      }
    }
    if (list) flush()
    pending.push(line.trim())
  }
  flush()
  if (!blocks.length) blocks.push(para(''))
  if (input.format === 'markdown' && definitions.size !== usedNotes.size)
    losses.add('Unused footnote definitions remain only in the optional preserved original.')
  if (input.format === 'markdown' && /\[\^(?!\d+\])[^\]]+\]/.test(text))
    losses.add('Non-numeric footnote labels remain visible text rather than editable footnotes.')
  if (input.format === 'markdown' && /\[[^\]]+\]\[[^\]]+\]|\{[^}]+\}/.test(text))
    losses.add('Reference links or extension syntax may remain literal text.')
  if (blocks.length > 100000) throw new ProjectError('LIMIT_EXCEEDED')
  const payload = readDocument({
    schemaVersion: 1,
    ast: { type: 'doc', content: blocks },
    footnotesById: notes
  })
  const preview: ImportPreview = {
    digest,
    title,
    format: input.format,
    blocks: blocks.length,
    bytes: bytes.length,
    losses: [...losses],
    excerpt: text.slice(0, 500)
  }
  return { payload, preview, bytes }
}
export async function previewInterchange(input: WorkerImportPreview): Promise<ImportPreview> {
  return (await parse(input)).preview
}
export async function commitInterchange(
  db: Database.Database,
  input: WorkerImportCommit
): Promise<string> {
  const operation = requestDigest(input)
  const completed = db
    .prepare('SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?')
    .get(input.projectId, input.operationId) as { digest: string; result: string } | undefined
  if (completed) {
    if (completed.digest !== operation) throw new ProjectError('OPERATION_CONFLICT')
    return (JSON.parse(completed.result) as { documentId: string }).documentId
  }
  const parsed = await parse(input)
  if (parsed.preview.digest !== input.digest) throw new ProjectError('EXTERNAL_CHANGE')
  return inWriteTransaction(db, () => {
    const digest = operation
    const prior = db
      .prepare('SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?')
      .get(input.projectId, input.operationId) as { digest: string; result: string } | undefined
    if (prior) {
      if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT')
      return (JSON.parse(prior.result) as { documentId: string }).documentId
    }
    const current = head(db, input.projectId)
    if (current !== input.expectedHead) throw new ProjectError('STALE_REVISION')
    const before = manuscript(db, input.projectId)
    if (before.documents.length >= 10000) throw new ProjectError('LIMIT_EXCEEDED')
    checkpoint(db, input.projectId, current, before, 'structural', 'Before text import')
    const docId = randomUUID(),
      revision = randomUUID(),
      snapshot = structuredClone(before)
    snapshot.documents.push({
      id: docId,
      parentId: null,
      position: snapshot.documents.filter((d) => d.parentId === null).length,
      kind: 'text',
      title: parsed.preview.title,
      status: 'draft',
      synopsis: '',
      revisionId: revision,
      state: 'active',
      replacementId: null,
      payload: parsed.payload
    })
    reconcileAnchors(snapshot)
    writeManuscript(db, input.projectId, snapshot)
    db.prepare('INSERT INTO interchange_imports VALUES (?,?,?,?,?,?,?,?,?)').run(
      input.projectId,
      randomUUID(),
      docId,
      input.originalName,
      input.format,
      parsed.preview.digest,
      input.preserveOriginal ? parsed.bytes : null,
      JSON.stringify(parsed.preview.losses),
      new Date().toISOString()
    )
    const next = advance(db, input.projectId, current)
    db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(
      input.projectId,
      input.operationId,
      digest,
      JSON.stringify({
        projectId: input.projectId,
        documentId: docId,
        revisionId: revision,
        headCommitId: next
      })
    )
    return docId
  })
}
export function validatePortableInterchange(db: Database.Database, projectId: string): void {
  function fail(): never {
    throw new ProjectError('CORRUPT_PROJECT')
  }
  const ids = new Set(
    (
      db.prepare('SELECT id FROM documents WHERE project_id=?').all(projectId) as { id: string }[]
    ).map((row) => row.id)
  )
  const recipes = db.prepare('SELECT * FROM compilation_recipes').all() as Record<string, unknown>[]
  if (recipes.length > 1000) fail()
  for (const row of recipes) {
    if (
      row.project_id !== projectId ||
      !isId(row.id) ||
      !isId(row.revision_id) ||
      typeof row.name !== 'string' ||
      row.name.length > 120 ||
      !row.name.trim() ||
      hasControlCharacters(row.name) ||
      !['Letter', 'A4'].includes(String(row.paper)) ||
      !isUtc(row.created_at) ||
      !isUtc(row.updated_at)
    )
      fail()
    const docs = JSON.parse(String(row.document_ids)) as unknown,
      formats = JSON.parse(String(row.formats)) as unknown
    if (
      !Array.isArray(docs) ||
      !docs.length ||
      docs.length > 10000 ||
      docs.some((id) => typeof id !== 'string' || !ids.has(id)) ||
      new Set(docs).size !== docs.length ||
      !Array.isArray(formats) ||
      !formats.length ||
      formats.length > 4 ||
      formats.some((f) => !['docx', 'pdf', 'markdown', 'text'].includes(String(f))) ||
      new Set(formats).size !== formats.length
    )
      fail()
  }
  const revisions = db.prepare('SELECT * FROM compilation_recipe_revisions').all() as Record<
    string,
    unknown
  >[]
  if (revisions.length > 100000) fail()
  for (const row of revisions) {
    if (
      row.project_id !== projectId ||
      typeof row.snapshot !== 'string' ||
      row.snapshot.length > 1000000 ||
      !isId(row.recipe_id) ||
      !isId(row.revision_id) ||
      !isUtc(row.created_at) ||
      !db
        .prepare('SELECT 1 FROM compilation_recipes WHERE project_id=? AND id=?')
        .get(projectId, row.recipe_id)
    )
      fail()
    const value = JSON.parse(row.snapshot) as Record<string, unknown>
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      value.id !== row.recipe_id ||
      value.revisionId !== row.revision_id ||
      typeof value.name !== 'string' ||
      value.name.length > 120 ||
      !Array.isArray(value.documentIds) ||
      value.documentIds.length < 1 ||
      value.documentIds.length > 10000 ||
      value.documentIds.some((id) => !ids.has(String(id))) ||
      new Set(value.documentIds).size !== value.documentIds.length ||
      !['Letter', 'A4'].includes(String(value.paper)) ||
      !Array.isArray(value.formats) ||
      value.formats.length < 1 ||
      value.formats.length > 4 ||
      value.formats.some((f) => !['docx', 'pdf', 'markdown', 'text'].includes(String(f))) ||
      new Set(value.formats).size !== value.formats.length
    )
      fail()
  }
  const imports = db.prepare('SELECT * FROM interchange_imports').all() as Record<string, unknown>[]
  if (imports.length > 100000) fail()
  for (const row of imports) {
    if (
      row.project_id !== projectId ||
      !isId(row.id) ||
      !ids.has(String(row.document_id)) ||
      typeof row.original_name !== 'string' ||
      !row.original_name ||
      row.original_name.length > 255 ||
      hasControlCharacters(row.original_name) ||
      /[\\/:]/u.test(row.original_name) ||
      !['markdown', 'text'].includes(String(row.format)) ||
      typeof row.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(row.sha256) ||
      typeof row.losses !== 'string' ||
      row.losses.length > 1000000 ||
      !isUtc(row.created_at)
    )
      fail()
    if (row.original_bytes !== null) {
      if (
        !Buffer.isBuffer(row.original_bytes) ||
        row.original_bytes.length > MAX_IMPORT ||
        createHash('sha256').update(row.original_bytes).digest('hex') !== row.sha256
      )
        fail()
    }
    const losses = JSON.parse(row.losses) as unknown
    if (!Array.isArray(losses) || losses.some((s) => typeof s !== 'string' || s.length > 2000))
      fail()
  }
}
