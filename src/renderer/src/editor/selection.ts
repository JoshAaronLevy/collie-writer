import type { Editor } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import type { SelectionBookmark } from '@tiptap/pm/state'
import { editorIsComposing } from './adapter'

export type CapturedSelection = { editor: Editor; document: Node; bookmark: SelectionBookmark }

export function captureSelection(editor: Editor | null): CapturedSelection | null {
  if (!editor || editor.isDestroyed || editorIsComposing(editor)) return null
  return { editor, document: editor.state.doc, bookmark: editor.state.selection.getBookmark() }
}

/** A dialog may restore selection, but cannot guess a new target after writing changes. */
export function restoreSelection(captured: CapturedSelection | null, editor: Editor | null): boolean {
  if (!captured || !editor || captured.editor !== editor || editor.isDestroyed || editorIsComposing(editor)
    || !captured.document.eq(editor.state.doc)) return false
  try {
    editor.view.dispatch(editor.state.tr.setSelection(captured.bookmark.resolve(editor.state.doc)))
    return true
  } catch { return false }
}
