import type Database from 'better-sqlite3'
import { contextBlocks, inlineContext } from '../../domain/ai/context'
import { ProjectError } from '../../domain/projects/errors'
import { effectiveState, isEditableKind } from '../../shared/outline'
import {
  isWritingContext,
  type WritingContext,
  type WritingInput
} from '../../shared/writing-assistance'
import { manuscript } from './manuscript'
import { readKnowledgeSettings } from './conversation-knowledge'

export function writingContext(
  db: Database.Database,
  p: string,
  chat: string,
  input: WritingInput
): WritingContext {
  const docs = manuscript(db, p).documents,
    doc = docs.find((d) => d.id === input.documentId)
  if (
    !doc ||
    doc.revisionId !== input.revisionId ||
    !isEditableKind(doc.kind) ||
    effectiveState(doc, docs) !== 'active'
  )
    throw new ProjectError('STALE_REVISION')
  if (
    readKnowledgeSettings(db, p, chat).excluded.some(
      (t) => t.kind === 'document' && t.id === doc.id
    )
  )
    throw new ProjectError('DENIED')
  const blocks = contextBlocks(doc.payload),
    first = blocks.findIndex((b) => b.id === input.from.blockId),
    last = blocks.findIndex((b) => b.id === input.to.blockId)
  const length = (i: number): number =>
    blocks[i].inline.reduce((n, v) => n + (v.type === 'text' ? v.text.length : 1), 0)
  if (
    first < 0 ||
    last < first ||
    input.from.offset > length(first) ||
    input.to.offset > length(last) ||
    (first === last && input.to.offset < input.from.offset)
  )
    throw new ProjectError('VALIDATION')
  const before = [
    ...blocks.slice(Math.max(0, first - 4), first).map((b) => inlineContext(b.inline)),
    inlineContext(blocks[first].inline, 0, input.from.offset)
  ]
    .join('\n\n')
    .slice(-3000)
  const after = [
    inlineContext(blocks[last].inline, input.to.offset),
    ...blocks.slice(last + 1, last + 5).map((b) => inlineContext(b.inline))
  ]
    .join('\n\n')
    .slice(0, 3000)
  const selected = blocks
    .slice(first, last + 1)
    .map((b, i) =>
      inlineContext(
        b.inline,
        i === 0 ? input.from.offset : 0,
        first + i === last ? input.to.offset : Infinity
      )
    )
    .join('\n\n')
  const value = { input, title: doc.title, purpose: doc.synopsis, before, selected, after }
  if (!isWritingContext(value)) throw new ProjectError('LIMIT_EXCEEDED', 'writing-input-limit')
  return value
}
