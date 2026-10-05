import type { DocumentPayload } from '../../../domain/editor/schema'
import type { Editor } from '@tiptap/core'

/** A citation inside a footnote belongs to its retained footnote editor, not main-document coordinates. */
export function manuscriptAnchor(
  editor: Editor,
  id: string
): { position: number; footnote: boolean; reference: boolean } | null {
  let found: { position: number; footnote: boolean; reference: boolean } | null = null
  function contains(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false
    const node = value as { attrs?: { citationId?: string }; content?: unknown[] }
    return node.attrs?.citationId === id || !!node.content?.some(contains)
  }
  editor.state.doc.descendants((node, position) => {
    if (node.attrs.blockId === id || node.attrs.citationId === id || node.attrs.footnoteId === id)
      found = {
        position,
        footnote: node.type.name === 'footnote',
        reference: node.type.name === 'citation' || node.type.name === 'footnote'
      }
    else if (node.type.name === 'footnote' && contains(node.attrs.body))
      found = { position, footnote: true, reference: true }
    return !found
  })
  return found
}

/** Resolve a saved target before replacing the live section editor. */
export function payloadHasAnchor(payload: DocumentPayload, id: string): boolean {
  function contains(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false
    const node = value as {
      attrs?: { blockId?: string; citationId?: string; footnoteId?: string }
      content?: unknown[]
    }
    return (
      node.attrs?.blockId === id ||
      node.attrs?.citationId === id ||
      node.attrs?.footnoteId === id ||
      !!node.content?.some(contains)
    )
  }
  return contains(payload.ast) || Object.values(payload.footnotesById).some(contains)
}
