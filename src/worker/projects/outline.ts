import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { ProjectError } from '../../domain/projects/errors'
import { emptyDocument } from '../../domain/projects/templates'
import { readDocument, type Block, type DocumentPayload } from '../../domain/editor/schema'
import { canParent, effectiveState, type CheckpointSummary, type HistoryInput, type HistoryView, type ManuscriptSnapshot, type OutlineInput, type RetainedDocument } from '../../shared/outline'
import { inWriteTransaction } from '../storage/driver'
import { requestDigest } from '../storage/digest'
import { checkpoint, readCheckpoint, historyStorage, conservedContent, freshRevisions, manuscript, reconcileAnchors, validateManuscript, writeManuscript } from './manuscript'
import { reconcileAnnotationAnchors } from './notes'

export function readHistory(db: Database.Database, input: HistoryInput): HistoryView {
  const project = db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(input.projectId) as { head_commit_id: string }
  const checkpoints = db.prepare('SELECT id,parent_id AS parentId,head_commit_id AS headCommitId,created_at AS createdAt,reason,title,byte_size AS bytes FROM history_checkpoints WHERE project_id=? ORDER BY rowid DESC').all(input.projectId) as CheckpointSummary[]
  const cutoff = Date.now() - 30 * 86400000
  const candidates = checkpoints.filter((c,i) => i > 0 && c.reason === 'automatic' && Date.parse(c.createdAt) < cutoff && c.headCommitId !== project.head_commit_id)
  let snapshot: ManuscriptSnapshot | null = null
  if (input.checkpointId) {
    const row = db.prepare('SELECT snapshot FROM history_checkpoints WHERE project_id=? AND id=?').get(input.projectId,input.checkpointId) as { snapshot: string } | undefined
    if (!row) throw new ProjectError('NOT_FOUND')
    snapshot = readCheckpoint(db,input.projectId,row.snapshot)
  }
  const sizes = historyStorage(db,input.projectId,new Set(candidates.map(c => c.id)))
  const currentSnapshot = manuscript(db,input.projectId)
  return { checkpointId: input.checkpointId, headCommitId: project.head_commit_id, checkpoints, anchors: currentSnapshot.anchors, snapshot, currentSnapshot, totalBytes: sizes.totalBytes, prunableBytes: sizes.prunableBytes, prunableIds: candidates.map(c => c.id) }
}
function partition(payload: DocumentPayload, blocks: Block[]): DocumentPayload {
  const notes = new Set<string>()
  function visit(v: unknown): void { if (!v || typeof v !== 'object') return; for (const [key,value] of Object.entries(v)) { if (key === 'footnoteId') notes.add(String(value)); else visit(value) } }
  visit(blocks)
  return readDocument({ schemaVersion: 1, ast: { type: 'doc', content: blocks }, footnotesById: Object.fromEntries(Object.entries(payload.footnotesById).filter(([id]) => notes.has(id))) })
}
function reorder(docs: RetainedDocument[], doc: RetainedDocument, parentId: string | null, position: number): void {
  const parent = parentId ? docs.find(d => d.id === parentId) : undefined
  if (parentId && !parent || !canParent(doc.kind,parent) || parent && effectiveState(parent, docs) !== 'active' || parentId === doc.id) throw new ProjectError('VALIDATION')
  const oldParent = doc.parentId
  const siblings = docs.filter(d => d.id !== doc.id && d.parentId === parentId).sort((a,b) => a.position-b.position)
  if (position > siblings.length) throw new ProjectError('VALIDATION')
  siblings.splice(position,0,doc); doc.parentId = parentId
  siblings.forEach((d,i) => { d.position = i })
  if (oldParent !== parentId) docs.filter(d => d.parentId === oldParent).sort((a,b) => a.position-b.position).forEach((d,i) => { d.position = i })
}
/** Caller holds the repository mutation/capture boundary. Every domain effect shares this transaction. */
export function changeOutline(db: Database.Database, input: OutlineInput): string {
  return inWriteTransaction(db, () => {
    const digest = requestDigest(input)
    const prior = db.prepare('SELECT digest,result FROM domain_operations WHERE project_id=? AND operation_id=?').get(input.projectId,input.operationId) as { digest: string; result: string } | undefined
    if (prior) { if (prior.digest !== digest) throw new ProjectError('OPERATION_CONFLICT'); return (JSON.parse(prior.result) as { documentId: string }).documentId }
    const project = db.prepare('SELECT head_commit_id FROM projects WHERE id=?').get(input.projectId) as { head_commit_id: string }
    const before = manuscript(db,input.projectId), after = structuredClone(before), docs = after.documents, c = input.change
    if (project.head_commit_id !== input.expectedHead || Object.keys(input.expectedRevisions).length !== docs.length || docs.some(d => input.expectedRevisions[d.id] !== d.revisionId)) throw new ProjectError('STALE_REVISION')
    let selectedId = input.selectedId
    const get = (id: string): RetainedDocument => { const doc = docs.find(d => d.id === id); if (!doc) throw new ProjectError('NOT_FOUND'); return doc }
    const activeText = (id: string): RetainedDocument => { const d = get(id); if (d.kind !== 'text' || effectiveState(d,docs) !== 'active') throw new ProjectError('VALIDATION'); return d }
    if (!docs.some(d => d.id === selectedId)) throw new ProjectError('NOT_FOUND')
    if (!['checkpoint','prune'].includes(c.type)) checkpoint(db,input.projectId,project.head_commit_id,before,c.type === 'restore' ? 'restore' : 'structural',`Before ${c.type}`)
    switch (c.type) {
      case 'create': {
        if (docs.length >= 10000) throw new ProjectError('LIMIT_EXCEEDED')
        const d: RetainedDocument = { id: randomUUID(),parentId: null,position: docs.filter(d => d.parentId === null).length,kind: c.kind,title: c.title,status: 'draft',synopsis: '',revisionId: randomUUID(),state: 'active',replacementId: null,payload: emptyDocument(randomUUID) }
        docs.push(d); reorder(docs,d,c.parentId,docs.filter(other => other.id !== d.id && other.parentId === c.parentId).length)
        if (d.kind === 'text') selectedId = d.id
        break
      }
      case 'move': {
        const d = get(c.documentId)
        if (d.state === 'merged') throw new ProjectError('VALIDATION')
        reorder(docs,d,c.parentId,c.position); break
      }
      case 'split': {
        if (docs.length >= 10000) throw new ProjectError('LIMIT_EXCEEDED')
        const source = activeText(c.documentId), index = source.payload.ast.content.findIndex(b => b.attrs.blockId === c.afterBlockId)
        if (index < 0 || index >= source.payload.ast.content.length-1) throw new ProjectError('VALIDATION')
        const next: RetainedDocument = { ...source,id: randomUUID(),title: c.title,synopsis: '',status: 'draft',revisionId: randomUUID(),payload: partition(source.payload,source.payload.ast.content.slice(index+1)) }
        source.payload = partition(source.payload,source.payload.ast.content.slice(0,index+1))
        docs.filter(d => d.parentId === source.parentId && d.position > source.position).forEach(d => { d.position++ })
        next.position = source.position+1; docs.push(next); selectedId = next.id; break
      }
      case 'merge': {
        const source = activeText(c.documentId), target = activeText(c.targetId)
        if (source.id === target.id) throw new ProjectError('VALIDATION')
        target.payload = readDocument({ schemaVersion: 1, ast: { type: 'doc',content: [...target.payload.ast.content,...source.payload.ast.content] },footnotesById: { ...target.payload.footnotesById,...source.payload.footnotesById } })
        source.state = 'merged'; source.replacementId = target.id; selectedId = target.id; break
      }
      case 'state': { const d = get(c.documentId); if (d.state === 'merged') throw new ProjectError('VALIDATION'); d.state = c.state; break }
      case 'details': { const d = get(c.documentId); if (d.state === 'merged') throw new ProjectError('VALIDATION'); d.title=c.title; d.status=c.status; d.synopsis=c.synopsis; break }
      case 'repair': {
        const source = after.anchors.find(a => a.id === c.anchorId), target = after.anchors.find(a => a.id === c.targetId)
        if (!source || source.state !== 'deleted' || !target || target.state !== 'active' || source.kind !== target.kind || source.id === target.id || target.replacementId) throw new ProjectError('VALIDATION')
        source.replacementId = target.id; break
      }
      case 'checkpoint': checkpoint(db,input.projectId,project.head_commit_id,before,'manual',c.title); break
      case 'restore': {
        const restored = readHistory(db,{ projectId: input.projectId,workspaceId: input.workspaceId,checkpointId: c.checkpointId }).snapshot!
        // Later content lives in the protected pre-restore checkpoint. Keep document identities as tombstones.
        const retainedIds = new Set(restored.documents.map(d => d.id))
        after.documents = structuredClone(restored.documents)
        for (const d of before.documents) if (!retainedIds.has(d.id)) after.documents.push({ ...d,parentId: null,position: after.documents.filter(x => x.parentId === null).length,state: 'trashed',replacementId: null,payload: emptyDocument(randomUUID),revisionId: randomUUID() })
        const anchors = new Map(before.anchors.map(a => [a.id,a])); for (const a of restored.anchors) anchors.set(a.id,a)
        after.anchors = [...anchors.values()]
        for (const d of after.documents) d.revisionId = randomUUID()
        break
      }
      case 'prune': {
        const eligible = new Set(readHistory(db,{ projectId: input.projectId,workspaceId: input.workspaceId,checkpointId: null }).prunableIds)
        if (c.checkpointIds.some(id => !eligible.has(id))) throw new ProjectError('STALE_REVISION')
        const unused = historyStorage(db,input.projectId,new Set(c.checkpointIds)).unreferenced
        for (const id of c.checkpointIds) db.prepare('DELETE FROM history_checkpoints WHERE project_id=? AND id=?').run(input.projectId,id)
        for (const id of unused) db.prepare('DELETE FROM history_content WHERE project_id=? AND id=?').run(input.projectId,id)
        break
      }
    }
    reconcileAnchors(after)
    if (['move','split','merge','state','details','repair'].includes(c.type) && conservedContent(before) !== conservedContent(after)) throw new ProjectError('VALIDATION')
    freshRevisions(before,after)
    validateManuscript(after)
    if (!['checkpoint','prune'].includes(c.type)) { writeManuscript(db,input.projectId,after); reconcileAnnotationAnchors(db,input.projectId) }
    let selected = after.documents.find(d => d.id === selectedId && d.kind === 'text' && effectiveState(d,after.documents) === 'active')
    selected ??= after.documents.find(d => d.kind === 'text' && effectiveState(d,after.documents) === 'active')!
    const head = randomUUID(), time = new Date().toISOString()
    db.prepare('INSERT INTO commits VALUES (?,?,?,?)').run(input.projectId,head,project.head_commit_id,time)
    db.prepare('UPDATE projects SET head_commit_id=?,updated_at=? WHERE id=?').run(head,time,input.projectId)
    db.prepare('INSERT INTO domain_operations VALUES (?,?,?,?)').run(input.projectId,input.operationId,digest,JSON.stringify({ projectId: input.projectId,documentId: selected.id,revisionId: selected.revisionId,headCommitId: head }))
    return selected.id
  })
}
