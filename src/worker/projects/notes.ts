import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { isId, readDocument, type DocumentPayload } from '../../domain/editor/schema'
import { ProjectError } from '../../domain/projects/errors'
import { noteBody, type Annotation, type Note, type NoteChangeInput, type NoteLabel, type NotesView } from '../../shared/notes'
import { requestDigest } from '../storage/digest'
import { inWriteTransaction } from '../storage/driver'

type NoteRow = { id: string; revision_id: string; title: string; body: string; state: Note['state']; origin: 'human'; created_at: string; updated_at: string }
type AnnotationRow = { id: string; revision_id: string; document_id: string; block_id: string; start_offset: number; end_offset: number; quote: string; interpretation: string; state: Annotation['state']; anchor_state: Annotation['anchorState']; created_at: string; updated_at: string }
const normalized = (name: string): string => name.trim().normalize('NFKC').toLocaleLowerCase('en-US')
function blockText(payload: DocumentPayload, id: string): string | null {
  let found: string | null = null
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    const node = value as { type?: string; attrs?: { blockId?: string }; content?: unknown[]; text?: string }
    if (node.attrs?.blockId === id && (node.type === 'paragraph' || node.type === 'heading')) {
      found = (node.content ?? []).map(child => { const item = child as { type?: string; text?: string }; return item.type === 'text' ? item.text ?? '' : item.type === 'hardBreak' ? '\n' : '\ufffc' }).join('')
      return
    }
    node.content?.forEach(visit)
  }
  payload.ast.content.forEach(visit)
  return found
}
export function readNotes(db: Database.Database, projectId: string): NotesView {
  const notes = (db.prepare('SELECT * FROM notes WHERE project_id=? ORDER BY updated_at DESC').all(projectId) as NoteRow[]).map(n => ({ id: n.id, revisionId: n.revision_id, title: n.title, body: readDocument(JSON.parse(n.body)), state: n.state, origin: n.origin, createdAt: n.created_at, updatedAt: n.updated_at,
    documentIds: (db.prepare('SELECT document_id FROM note_links WHERE project_id=? AND note_id=?').all(projectId,n.id) as { document_id: string }[]).map(x => x.document_id),
    labelIds: (db.prepare('SELECT label_id FROM note_label_links WHERE project_id=? AND note_id=?').all(projectId,n.id) as { label_id: string }[]).map(x => x.label_id) }))
  const labels = (db.prepare('SELECT id,kind,name,state FROM note_labels WHERE project_id=? ORDER BY name').all(projectId) as { id: string; kind: NoteLabel['kind']; name: string; state: NoteLabel['state'] }[])
  const annotations = (db.prepare('SELECT * FROM annotations WHERE project_id=? ORDER BY created_at DESC').all(projectId) as AnnotationRow[]).map(a => ({ id: a.id, revisionId: a.revision_id, documentId: a.document_id, blockId: a.block_id, startOffset: a.start_offset, endOffset: a.end_offset, quote: a.quote, interpretation: a.interpretation, state: a.state, anchorState: a.anchor_state, createdAt: a.created_at, updatedAt: a.updated_at }))
  return { notes, labels, annotations }
}

/** Only exact unchanged text regions retain an annotation; overlap is an explicit orphan. */
export function mapDocumentAnnotations(db: Database.Database, projectId: string, documentId: string, oldPayload: DocumentPayload, nextPayload: DocumentPayload): void {
  const rows = db.prepare("SELECT * FROM annotations WHERE project_id=? AND document_id=? AND anchor_state='active'").all(projectId,documentId) as AnnotationRow[]
  for (const row of rows) {
    const before = blockText(oldPayload,row.block_id), after = blockText(nextPayload,row.block_id)
    let start = row.start_offset, end = row.end_offset, state: Annotation['anchorState'] = 'active'
    if (before === null || after === null || before.slice(start,end) !== row.quote) state = 'orphaned'
    else if (before !== after) {
      let prefix = 0, suffix = 0
      while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++
      while (suffix < before.length-prefix && suffix < after.length-prefix && before[before.length-1-suffix] === after[after.length-1-suffix]) suffix++
      if (end <= prefix) { /* unchanged prefix */ }
      else if (start >= before.length-suffix) { const delta = after.length-before.length; start += delta; end += delta }
      else state = 'orphaned'
      if (state === 'active' && after.slice(start,end) !== row.quote) state = 'orphaned'
    }
    if (state !== row.anchor_state || start !== row.start_offset || end !== row.end_offset) db.prepare('UPDATE annotations SET start_offset=?,end_offset=?,anchor_state=? WHERE project_id=? AND id=?').run(start,end,state,projectId,row.id)
  }
}
export function reconcileAnnotationAnchors(db: Database.Database, projectId: string): void {
  for (const a of db.prepare('SELECT id,block_id,start_offset,end_offset,quote,anchor_state FROM annotations WHERE project_id=?').all(projectId) as { id: string; block_id: string; start_offset: number; end_offset: number; quote: string; anchor_state: string }[]) {
    const target = db.prepare('SELECT document_id,state FROM anchor_targets WHERE project_id=? AND id=?').get(projectId,a.block_id) as { document_id: string; state: string } | undefined
    const document = target && target.state !== 'deleted' ? db.prepare('SELECT payload FROM documents WHERE project_id=? AND id=?').get(projectId,target.document_id) as { payload: string } | undefined : undefined
    const exactQuote = document && blockText(readDocument(JSON.parse(document.payload)),a.block_id)?.slice(a.start_offset,a.end_offset) === a.quote
    const state = a.anchor_state === 'active' && exactQuote ? 'active' : 'orphaned'
    if (state === 'active') db.prepare('UPDATE annotations SET document_id=?,anchor_state=? WHERE project_id=? AND id=?').run(target!.document_id,state,projectId,a.id)
    else if (a.anchor_state !== state) db.prepare('UPDATE annotations SET anchor_state=? WHERE project_id=? AND id=?').run(state,projectId,a.id)
  }
}
export function changeNote(db: Database.Database, input: NoteChangeInput): NotesView {
  return inWriteTransaction(db, () => {
    const projectId = input.projectId, c = input.change, digest = requestDigest(input)
    const prior = db.prepare('SELECT digest FROM domain_operations WHERE project_id=? AND operation_id=?').get(projectId,input.operationId) as { digest: string } | undefined
    if (prior) { if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT'); return readNotes(db,projectId) }
    const project = db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(projectId) as { head_commit_id: string } | undefined
    if (!project) throw new ProjectError('NOT_FOUND')
    const now = new Date().toISOString(), revision = randomUUID()
    const getNote = (id: string): NoteRow => { const n = db.prepare('SELECT * FROM notes WHERE project_id=? AND id=?').get(projectId,id) as NoteRow | undefined; if (!n) throw new ProjectError('NOT_FOUND'); return n }
    const checkpointNote = (n: NoteRow): void => {
      const links = (db.prepare('SELECT document_id FROM note_links WHERE project_id=? AND note_id=?').all(projectId,n.id) as { document_id: string }[]).map(x => x.document_id)
      const labels = (db.prepare('SELECT label_id FROM note_label_links WHERE project_id=? AND note_id=?').all(projectId,n.id) as { label_id: string }[]).map(x => x.label_id)
      db.prepare('INSERT OR IGNORE INTO note_revisions VALUES (?,?,?,?,?)').run(projectId,n.id,n.revision_id,JSON.stringify({ title:n.title,body:JSON.parse(n.body),state:n.state,documentIds:links,labelIds:labels }),now)
    }
    if (c.type === 'createNote') {
      if (db.prepare('SELECT 1 FROM notes WHERE project_id=? AND id=?').get(projectId,c.id)) throw new ProjectError('OPERATION_CONFLICT')
      db.prepare('INSERT INTO notes VALUES (?,?,?,?,?,?,?,?,?)').run(projectId,c.id,revision,c.title.trim(),JSON.stringify(c.body),'active','human',now,now)
    } else if (c.type === 'updateNote' || c.type === 'stateNote') {
      const n = getNote(c.id)
      if (n.revision_id !== c.expectedRevisionId) throw new ProjectError('STALE_REVISION')
      checkpointNote(n)
      if (c.type === 'stateNote') db.prepare('UPDATE notes SET state=?,revision_id=?,updated_at=? WHERE project_id=? AND id=?').run(c.state,revision,now,projectId,c.id)
      else {
        for (const id of c.documentIds) if (!db.prepare('SELECT 1 FROM documents WHERE project_id=? AND id=?').get(projectId,id)) throw new ProjectError('VALIDATION')
        for (const id of c.labelIds) if (!db.prepare('SELECT 1 FROM note_labels WHERE project_id=? AND id=?').get(projectId,id)) throw new ProjectError('VALIDATION')
        db.prepare('UPDATE notes SET title=?,body=?,revision_id=?,updated_at=? WHERE project_id=? AND id=?').run(c.title.trim(),JSON.stringify(c.body),revision,now,projectId,c.id)
        db.prepare('DELETE FROM note_links WHERE project_id=? AND note_id=?').run(projectId,c.id)
        for (const id of c.documentIds) db.prepare('INSERT INTO note_links VALUES (?,?,?)').run(projectId,c.id,id)
        db.prepare('DELETE FROM note_label_links WHERE project_id=? AND note_id=?').run(projectId,c.id)
        for (const id of c.labelIds) db.prepare('INSERT INTO note_label_links VALUES (?,?,?)').run(projectId,c.id,id)
      }
    } else if (c.type === 'createLabel' || c.type === 'renameLabel') {
      const kind = c.type === 'createLabel' ? c.kind : (db.prepare('SELECT kind FROM note_labels WHERE project_id=? AND id=?').get(projectId,c.id) as { kind: string } | undefined)?.kind
      if (!kind) throw new ProjectError('NOT_FOUND')
      const name = c.name.trim(), key = normalized(name)
      if (db.prepare("SELECT 1 FROM note_labels WHERE project_id=? AND kind=? AND normalized=? AND state='active' AND id<>?").get(projectId,kind,key,c.id)) throw new ProjectError('OPERATION_CONFLICT')
      if (c.type === 'createLabel') db.prepare('INSERT INTO note_labels VALUES (?,?,?,?,?,?,?)').run(projectId,c.id,kind,name,key,'active',revision)
      else db.prepare('UPDATE note_labels SET name=?,normalized=?,revision_id=? WHERE project_id=? AND id=?').run(name,key,revision,projectId,c.id)
    } else if (c.type === 'archiveLabel') {
      if (!db.prepare('SELECT 1 FROM note_labels WHERE project_id=? AND id=?').get(projectId,c.id)) throw new ProjectError('NOT_FOUND')
      db.prepare("UPDATE note_labels SET state='archived',revision_id=? WHERE project_id=? AND id=?").run(revision,projectId,c.id)
    } else if (c.type === 'mergeLabel') {
      const source = db.prepare('SELECT kind FROM note_labels WHERE project_id=? AND id=?').get(projectId,c.id) as { kind: string } | undefined
      const target = db.prepare("SELECT kind FROM note_labels WHERE project_id=? AND id=? AND state='active'").get(projectId,c.targetId) as { kind: string } | undefined
      if (!source || !target || source.kind !== target.kind) throw new ProjectError('VALIDATION')
      for (const row of db.prepare('SELECT note_id FROM note_label_links WHERE project_id=? AND label_id=?').all(projectId,c.id) as { note_id: string }[]) {
        const note = getNote(row.note_id)
        checkpointNote(note)
        db.prepare('UPDATE notes SET revision_id=?,updated_at=? WHERE project_id=? AND id=?').run(randomUUID(),now,projectId,row.note_id)
      }
      db.prepare('INSERT OR IGNORE INTO note_label_links SELECT project_id,note_id,? FROM note_label_links WHERE project_id=? AND label_id=?').run(c.targetId,projectId,c.id)
      db.prepare('DELETE FROM note_label_links WHERE project_id=? AND label_id=?').run(projectId,c.id)
      db.prepare("UPDATE note_labels SET state='archived',revision_id=? WHERE project_id=? AND id=?").run(revision,projectId,c.id)
    } else if (c.type === 'createAnnotation') {
      const doc = db.prepare('SELECT revision_id,payload FROM documents WHERE project_id=? AND id=?').get(projectId,c.documentId) as { revision_id: string; payload: string } | undefined
      if (!doc) throw new ProjectError('NOT_FOUND')
      if (doc.revision_id !== c.expectedRevisionId) throw new ProjectError('STALE_REVISION')
      const target = db.prepare("SELECT 1 FROM anchor_targets WHERE project_id=? AND id=? AND document_id=? AND state='active' AND kind='blockId'").get(projectId,c.blockId,c.documentId)
      if (!target || blockText(readDocument(JSON.parse(doc.payload)),c.blockId)?.slice(c.startOffset,c.endOffset) !== c.quote) throw new ProjectError('STALE_REVISION')
      db.prepare('INSERT INTO annotations VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(projectId,c.id,revision,c.documentId,c.blockId,c.startOffset,c.endOffset,c.quote,c.interpretation,'active','active',now,now)
    } else if (c.type === 'updateAnnotation') {
      const a = db.prepare('SELECT * FROM annotations WHERE project_id=? AND id=?').get(projectId,c.id) as AnnotationRow | undefined
      if (!a) throw new ProjectError('NOT_FOUND')
      if (a.revision_id !== c.expectedRevisionId) throw new ProjectError('STALE_REVISION')
      db.prepare('INSERT OR IGNORE INTO annotation_revisions VALUES (?,?,?,?,?)').run(projectId,c.id,a.revision_id,JSON.stringify({ interpretation:a.interpretation,state:a.state,anchorState:a.anchor_state,quote:a.quote }),now)
      db.prepare('UPDATE annotations SET interpretation=?,state=?,revision_id=?,updated_at=? WHERE project_id=? AND id=?').run(c.interpretation,c.state,revision,now,projectId,c.id)
    }
    const head = randomUUID()
    db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(projectId,head,project.head_commit_id,now)
    db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(head,now,projectId)
    const doc = db.prepare('SELECT id,revision_id FROM documents WHERE project_id=? ORDER BY rowid LIMIT 1').get(projectId) as { id: string; revision_id: string }
    db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(projectId,input.operationId,digest,JSON.stringify({ projectId,documentId:doc.id,revisionId:doc.revision_id,headCommitId:head }))
    return readNotes(db,projectId)
  })
}

export function validatePortableNotes(db: Database.Database, projectId: string): void {
  for (const table of ['notes','note_revisions','note_links','note_labels','note_label_links','annotations','annotation_revisions']) if (db.prepare(`SELECT 1 FROM ${table} WHERE project_id<>? LIMIT 1`).get(projectId)) throw new ProjectError('CORRUPT_PROJECT')
  const view = readNotes(db,projectId)
  if (view.notes.length + view.labels.length + view.annotations.length > 100000) throw new ProjectError('CORRUPT_PROJECT')
  for (const n of view.notes) if (!isId(n.id) || !isId(n.revisionId) || !noteBody(n.body) || !['active','archived','trashed'].includes(n.state) || n.origin !== 'human' || n.title.length > 500 || !Number.isFinite(Date.parse(n.createdAt)) || !Number.isFinite(Date.parse(n.updatedAt))) throw new ProjectError('CORRUPT_PROJECT')
  const activeLabels = new Set<string>()
  for (const l of db.prepare('SELECT * FROM note_labels WHERE project_id=?').all(projectId) as { id: string; kind: string; name: string; normalized: string; state: string; revision_id: string }[]) {
    if (!isId(l.id) || !isId(l.revision_id) || !['tag','category'].includes(l.kind) || !['active','archived'].includes(l.state) || !l.name.trim() || l.name.length > 100 || normalized(l.name) !== l.normalized) throw new ProjectError('CORRUPT_PROJECT')
    const key = `${l.kind}:${l.normalized}`
    if (l.state === 'active' && activeLabels.has(key)) throw new ProjectError('CORRUPT_PROJECT')
    if (l.state === 'active') activeLabels.add(key)
  }
  for (const a of view.annotations) {
    if (!isId(a.id) || !isId(a.revisionId) || !isId(a.blockId) || !Number.isSafeInteger(a.startOffset) || !Number.isSafeInteger(a.endOffset) || a.startOffset < 0 || a.quote.length !== a.endOffset-a.startOffset || a.quote.length > 10000 || a.interpretation.length > 100000 || !['active','archived'].includes(a.state) || !['active','orphaned'].includes(a.anchorState)) throw new ProjectError('CORRUPT_PROJECT')
    const target = db.prepare('SELECT document_id,state FROM anchor_targets WHERE project_id=? AND id=?').get(projectId,a.blockId) as { document_id: string; state: string } | undefined
    if (a.anchorState === 'active' && (!target || target.state === 'deleted' || target.document_id !== a.documentId)) throw new ProjectError('CORRUPT_PROJECT')
  }
  for (const row of db.prepare('SELECT * FROM note_revisions WHERE project_id=?').iterate(projectId)) {
    const r = row as { note_id: string; revision_id: string; snapshot: string; created_at: string }
    if (!isId(r.note_id) || !isId(r.revision_id) || r.snapshot.length > 3_000_000 || !Number.isFinite(Date.parse(r.created_at))) throw new ProjectError('CORRUPT_PROJECT')
    const value = JSON.parse(r.snapshot) as { title?: unknown; body?: unknown; state?: unknown; documentIds?: unknown; labelIds?: unknown }
    if (typeof value.title !== 'string' || value.title.length > 500 || !noteBody(value.body) || !['active','archived','trashed'].includes(String(value.state)) || !Array.isArray(value.documentIds) || !value.documentIds.every(isId) || !Array.isArray(value.labelIds) || !value.labelIds.every(isId)) throw new ProjectError('CORRUPT_PROJECT')
  }
  for (const row of db.prepare('SELECT * FROM annotation_revisions WHERE project_id=?').iterate(projectId)) {
    const r = row as { annotation_id: string; revision_id: string; snapshot: string; created_at: string }
    if (!isId(r.annotation_id) || !isId(r.revision_id) || r.snapshot.length > 120000 || !Number.isFinite(Date.parse(r.created_at))) throw new ProjectError('CORRUPT_PROJECT')
    const value = JSON.parse(r.snapshot) as { interpretation?: unknown; state?: unknown; anchorState?: unknown; quote?: unknown }
    if (typeof value.interpretation !== 'string' || value.interpretation.length > 100000 || typeof value.quote !== 'string' || value.quote.length > 10000 || !['active','archived'].includes(String(value.state)) || !['active','orphaned'].includes(String(value.anchorState))) throw new ProjectError('CORRUPT_PROJECT')
  }
}
