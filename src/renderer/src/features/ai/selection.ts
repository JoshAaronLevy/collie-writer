import type { Editor } from '@tiptap/core'
import type { CaptureSource } from '../../../../shared/conversations'
import { CONVERSATION_LIMITS } from '../../../../shared/conversations'
import { editorIsComposing } from '../../editor/adapter'
/** Capture positions in the exact retained editor. The worker resolves text from its protected revision. */
export function selectedRanges(
  editor: Editor
): Extract<CaptureSource, { kind: 'passage' }>['ranges'] | null {
  if (editor.isDestroyed || editorIsComposing(editor) || editor.state.selection.empty) return null
  const { from, to } = editor.state.selection,
    ranges: Extract<CaptureSource, { kind: 'passage' }>['ranges'] = []
  let unsupported = false
  editor.state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name === 'image') unsupported = true
    if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return
    const start = Math.max(0, from - pos - 1),
      end = Math.min(node.content.size, to - pos - 1)
    if (end > start) {
      if (typeof node.attrs.blockId !== 'string') unsupported = true
      else ranges.push({ blockId: node.attrs.blockId, from: start, to: end })
    }
  })
  return unsupported || !ranges.length || ranges.length > CONVERSATION_LIMITS.ranges ? null : ranges
}
