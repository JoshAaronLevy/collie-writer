import { hasControlCharacters } from './control-characters'
import { isId, readDocument, type DocumentPayload } from '../domain/editor/schema'
import { exact, record, type OpenInput } from './projects'

export type NoteState = 'active' | 'archived' | 'trashed'
export type Note = {
  id: string
  revisionId: string
  title: string
  body: DocumentPayload
  state: NoteState
  origin: 'human'
  createdAt: string
  updatedAt: string
  documentIds: string[]
  labelIds: string[]
}
export type NoteLabel = {
  id: string
  kind: 'tag' | 'category'
  name: string
  state: 'active' | 'archived'
}
export type Annotation = {
  id: string
  revisionId: string
  documentId: string
  blockId: string
  startOffset: number
  endOffset: number
  quote: string
  interpretation: string
  state: 'active' | 'archived'
  anchorState: 'active' | 'orphaned'
  createdAt: string
  updatedAt: string
}
export type NotesView = { notes: Note[]; labels: NoteLabel[]; annotations: Annotation[] }
export type NoteChange =
  | { type: 'createNote'; id: string; title: string; body: DocumentPayload }
  | {
      type: 'updateNote'
      id: string
      expectedRevisionId: string
      title: string
      body: DocumentPayload
      documentIds: string[]
      labelIds: string[]
    }
  | { type: 'stateNote'; id: string; expectedRevisionId: string; state: NoteState }
  | { type: 'createLabel'; id: string; kind: 'tag' | 'category'; name: string }
  | { type: 'renameLabel'; id: string; name: string }
  | { type: 'mergeLabel'; id: string; targetId: string }
  | { type: 'archiveLabel'; id: string }
  | {
      type: 'createAnnotation'
      id: string
      documentId: string
      expectedRevisionId: string
      blockId: string
      startOffset: number
      endOffset: number
      quote: string
      interpretation: string
    }
  | {
      type: 'updateAnnotation'
      id: string
      expectedRevisionId: string
      interpretation: string
      state: 'active' | 'archived'
    }
export type NoteChangeInput = OpenInput & { operationId: string; change: NoteChange }

const line = (v: unknown, limit: number): v is string =>
  typeof v === 'string' && v.length <= limit && !hasControlCharacters(v, true)
export function noteBody(value: unknown): value is DocumentPayload {
  try {
    const body = readDocument(value)
    if (JSON.stringify(body).length > 2_000_000 || Object.keys(body.footnotesById).length)
      return false
    let okay = true
    const visit = (v: unknown): void => {
      if (!record(v)) return
      if (['citation', 'footnote', 'image', 'table', 'pageBreak'].includes(String(v.type)))
        okay = false
      if (Array.isArray(v.content)) v.content.forEach(visit)
    }
    body.ast.content.forEach(visit)
    return okay
  } catch {
    return false
  }
}
export function isNoteChangeInput(v: unknown): v is NoteChangeInput {
  if (
    !record(v) ||
    !exact(v, ['projectId', 'workspaceId', 'operationId', 'change']) ||
    !isId(v.projectId) ||
    !isId(v.workspaceId) ||
    !isId(v.operationId) ||
    !record(v.change)
  )
    return false
  const c = v.change
  if (!isId(c.id)) return false
  if (c.type === 'createNote')
    return exact(c, ['type', 'id', 'title', 'body']) && line(c.title, 500) && noteBody(c.body)
  if (c.type === 'updateNote')
    return (
      exact(c, ['type', 'id', 'expectedRevisionId', 'title', 'body', 'documentIds', 'labelIds']) &&
      isId(c.expectedRevisionId) &&
      line(c.title, 500) &&
      noteBody(c.body) &&
      Array.isArray(c.documentIds) &&
      c.documentIds.length <= 10000 &&
      c.documentIds.every(isId) &&
      new Set(c.documentIds).size === c.documentIds.length &&
      Array.isArray(c.labelIds) &&
      c.labelIds.length <= 1000 &&
      c.labelIds.every(isId) &&
      new Set(c.labelIds).size === c.labelIds.length
    )
  if (c.type === 'stateNote')
    return (
      exact(c, ['type', 'id', 'expectedRevisionId', 'state']) &&
      isId(c.expectedRevisionId) &&
      ['active', 'archived', 'trashed'].includes(String(c.state))
    )
  if (c.type === 'createLabel')
    return (
      exact(c, ['type', 'id', 'kind', 'name']) &&
      ['tag', 'category'].includes(String(c.kind)) &&
      line(c.name, 100) &&
      !!c.name.trim()
    )
  if (c.type === 'renameLabel')
    return exact(c, ['type', 'id', 'name']) && line(c.name, 100) && !!c.name.trim()
  if (c.type === 'mergeLabel')
    return exact(c, ['type', 'id', 'targetId']) && isId(c.targetId) && c.targetId !== c.id
  if (c.type === 'archiveLabel') return exact(c, ['type', 'id'])
  if (c.type === 'createAnnotation')
    return (
      exact(c, [
        'type',
        'id',
        'documentId',
        'expectedRevisionId',
        'blockId',
        'startOffset',
        'endOffset',
        'quote',
        'interpretation'
      ]) &&
      isId(c.documentId) &&
      isId(c.expectedRevisionId) &&
      isId(c.blockId) &&
      Number.isSafeInteger(c.startOffset) &&
      Number.isSafeInteger(c.endOffset) &&
      Number(c.startOffset) >= 0 &&
      Number(c.endOffset) > Number(c.startOffset) &&
      line(c.quote, 10000) &&
      c.quote.length === Number(c.endOffset) - Number(c.startOffset) &&
      line(c.interpretation, 100000)
    )
  if (c.type === 'updateAnnotation')
    return (
      exact(c, ['type', 'id', 'expectedRevisionId', 'interpretation', 'state']) &&
      isId(c.expectedRevisionId) &&
      line(c.interpretation, 100000) &&
      ['active', 'archived'].includes(String(c.state))
    )
  return false
}
export function isNotesView(v: unknown): v is NotesView {
  return (
    record(v) &&
    exact(v, ['notes', 'labels', 'annotations']) &&
    Array.isArray(v.notes) &&
    v.notes.length <= 100000 &&
    v.notes.every(
      (n: unknown) =>
        record(n) &&
        isId(n.id) &&
        isId(n.revisionId) &&
        line(n.title, 500) &&
        noteBody(n.body) &&
        ['active', 'archived', 'trashed'].includes(String(n.state)) &&
        n.origin === 'human' &&
        typeof n.createdAt === 'string' &&
        typeof n.updatedAt === 'string' &&
        Array.isArray(n.documentIds) &&
        n.documentIds.every(isId) &&
        Array.isArray(n.labelIds) &&
        n.labelIds.every(isId)
    ) &&
    Array.isArray(v.labels) &&
    v.labels.length <= 100000 &&
    v.labels.every(
      (l: unknown) =>
        record(l) &&
        isId(l.id) &&
        ['tag', 'category'].includes(String(l.kind)) &&
        line(l.name, 100) &&
        ['active', 'archived'].includes(String(l.state))
    ) &&
    Array.isArray(v.annotations) &&
    v.annotations.length <= 100000 &&
    v.annotations.every(
      (a: unknown) =>
        record(a) &&
        isId(a.id) &&
        isId(a.revisionId) &&
        isId(a.documentId) &&
        isId(a.blockId) &&
        Number.isSafeInteger(a.startOffset) &&
        Number.isSafeInteger(a.endOffset) &&
        line(a.quote, 10000) &&
        line(a.interpretation, 100000) &&
        ['active', 'archived'].includes(String(a.state)) &&
        ['active', 'orphaned'].includes(String(a.anchorState))
    )
  )
}
