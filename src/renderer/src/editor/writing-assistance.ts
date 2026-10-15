import type { Editor } from '@tiptap/core'
import { Fragment, Slice } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import { aiText } from '../../../shared/ai'
import type { WritingPoint } from '../../../shared/writing-assistance'
import { captureSelection, type CapturedSelection } from './selection'
import { documentFromEditorJson, editorIsComposing } from './adapter'

export type WritingSelection = CapturedSelection & {
  from: WritingPoint
  to: WritingPoint
  replacing: boolean
}
export function captureWritingSelection(editor: Editor | null): WritingSelection {
  const captured = captureSelection(editor)
  if (!captured || !editor || !editor.isEditable)
    throw new Error(
      'Open an editable chapter and finish composing before choosing a writing position.'
    )
  const selection = editor.state.selection
  if (!(selection instanceof TextSelection))
    throw new Error('Place the cursor in a paragraph or select prose first.')
  const { $from, $to } = selection
  if (![$from, $to].every((p) => ['paragraph', 'heading'].includes(p.parent.type.name)))
    throw new Error('Choose a paragraph or heading for writing help.')
  // Cross-block replacements are limited to ordinary top-level prose, so lists/tables are not flattened.
  if (!$from.sameParent($to) && ($from.depth !== 1 || $to.depth !== 1))
    throw new Error('Select prose within one list item or table cell, or use ordinary paragraphs.')
  let unsupported = false
  editor.state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (
      (node.isAtom && !['text', 'hardBreak'].includes(node.type.name)) ||
      (!$from.sameParent($to) &&
        !['paragraph', 'heading', 'text', 'hardBreak'].includes(node.type.name))
    )
      unsupported = true
  })
  if (unsupported && !selection.empty)
    throw new Error(
      'Keep citations, footnotes and other objects outside the replacement selection. Their existing references will stay intact.'
    )
  const point = (p: typeof $from): WritingPoint => ({
    blockId: p.parent.attrs.blockId,
    offset: p.parentOffset
  })
  return { ...captured, from: point($from), to: point($to), replacing: !selection.empty }
}
export function insertWritingSelection(
  target: WritingSelection,
  editor: Editor,
  text: string
): void {
  if (
    target.editor !== editor ||
    editor.isDestroyed ||
    !editor.isEditable ||
    editorIsComposing(editor) ||
    !target.document.eq(editor.state.doc)
  )
    throw new Error(
      'The writing changed. Your preview is kept. Choose a new cursor position or selection explicitly.'
    )
  if (!text.trim() || !aiText(text, 32000))
    throw new Error('Use a nonempty preview of at most 32,000 characters.')
  const selection = target.bookmark.resolve(editor.state.doc),
    paragraphs = text
      .replace(/\r\n?/g, '\n')
      .split(/\n\s*\n/)
      .map((paragraph) =>
        editor.schema.nodes.paragraph.create(
          { blockId: crypto.randomUUID() },
          Fragment.fromArray(
            paragraph
              .split('\n')
              .flatMap((line, i) => [
                ...(i ? [editor.schema.nodes.hardBreak.create()] : []),
                ...(line ? [editor.schema.text(line)] : [])
              ])
          )
        )
      )
  const tr = editor.state.tr
    .setSelection(selection)
    .replaceSelection(new Slice(Fragment.fromArray(paragraphs), 1, 1))
  // Validate the final document before dispatch, including IDs for any split block.
  const seen = new Set<string>()
  tr.doc.descendants((node, pos) => {
    if (!Object.hasOwn(node.attrs, 'blockId')) return
    let id = node.attrs.blockId as string
    if (!id || seen.has(id)) {
      id = crypto.randomUUID()
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: id })
    }
    seen.add(id)
  })
  documentFromEditorJson(tr.doc.toJSON())
  editor.view.dispatch(closeHistory(tr).scrollIntoView())
  if (!editor.state.doc.eq(tr.doc))
    throw new Error('The editor refused the insertion. Your preview is kept.')
  // Keep later typing outside this insertion's Undo group.
  editor.view.dispatch(closeHistory(editor.state.tr))
  editor.commands.focus()
}
