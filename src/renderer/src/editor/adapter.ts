import { Editor, Extension, Mark, Node as TiptapNode, type Extensions } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { history, undo, redo } from '@tiptap/pm/history'
import { keymap } from '@tiptap/pm/keymap'
import { baseKeymap } from '@tiptap/pm/commands'
import { Fragment, Slice, type DOMOutputSpec } from '@tiptap/pm/model'
import { readDocument, safeLink, type DocumentPayload } from '../../../domain/editor/schema'

const blockId = { default: null, rendered: false }
/** Community-only schema. Managed image URLs and formatted citation labels come from the host. */
export function manuscriptExtensions(
  imageUrl: (assetId: string) => string | undefined,
  citationLabel: (citationId: string) => string
): Extensions {
  const blocks = [
    TiptapNode.create({ name: 'doc', topNode: true, content: 'block+' }),
    TiptapNode.create({ name: 'text', group: 'inline' }),
    TiptapNode.create({ name: 'paragraph', group: 'block', content: 'inline*', addAttributes: () => ({ blockId }), parseHTML: () => [{ tag: 'p' }], renderHTML: () => ['p', 0] }),
    TiptapNode.create({ name: 'heading', group: 'block', content: 'inline*', defining: true, addAttributes: () => ({ blockId, level: { default: 1 } }), parseHTML: () => [1, 2, 3].map(level => ({ tag: `h${level}`, attrs: { level } })), renderHTML: ({ node }) => [`h${node.attrs.level}`, 0] }),
    TiptapNode.create({ name: 'blockquote', group: 'block', content: 'paragraph+', defining: true, addAttributes: () => ({ blockId }), parseHTML: () => [{ tag: 'blockquote' }], renderHTML: () => ['blockquote', 0] }),
    ...(['bulletList', 'orderedList'] as const).map(name => TiptapNode.create({
      name, group: 'block', content: 'listItem+', addAttributes: () => name === 'orderedList' ? { blockId, start: { default: 1 } } : { blockId },
      parseHTML: () => [{ tag: name === 'orderedList' ? 'ol' : 'ul' }],
      renderHTML: ({ node }) => name === 'orderedList' ? ['ol', { start: node.attrs.start }, 0] : ['ul', 0]
    })),
    TiptapNode.create({ name: 'listItem', content: 'paragraph+', defining: true, addAttributes: () => ({ blockId }), parseHTML: () => [{ tag: 'li' }], renderHTML: () => ['li', 0] }),
    TiptapNode.create({ name: 'hardBreak', inline: true, group: 'inline', selectable: false, parseHTML: () => [{ tag: 'br' }], renderHTML: () => ['br'] }),
    ...(['horizontalRule', 'pageBreak'] as const).map(name => TiptapNode.create({ name, group: 'block', atom: true, addAttributes: () => ({ blockId }), renderHTML: () => ['hr', { 'data-kind': name }] })),
    TiptapNode.create({
      name: 'image', group: 'block', atom: true,
      addAttributes: () => ({ blockId, assetId: { default: null }, alt: { default: '' }, caption: { default: '' }, width: { default: 480 }, height: { default: 320 } }),
      renderHTML: ({ node }) => {
        const url = imageUrl(node.attrs.assetId)
        const image: DOMOutputSpec = url
          ? ['img', { src: url, alt: node.attrs.alt, width: node.attrs.width, height: node.attrs.height }]
          : ['span', {}, 'Image unavailable']
        return ['figure', {}, image, ['figcaption', {}, node.attrs.caption]]
      }
    }),
    TiptapNode.create({ name: 'table', group: 'block', content: 'tableRow+', isolating: true, addAttributes: () => ({ blockId }), renderHTML: () => ['table', ['tbody', 0]] }),
    TiptapNode.create({ name: 'tableRow', content: '(tableCell | tableHeader)+', addAttributes: () => ({ blockId }), renderHTML: () => ['tr', 0] }),
    ...(['tableCell', 'tableHeader'] as const).map(name => TiptapNode.create({ name, content: 'paragraph+', isolating: true, addAttributes: () => ({ blockId }), renderHTML: () => [name === 'tableCell' ? 'td' : 'th', 0] })),
    TiptapNode.create({ name: 'citation', group: 'inline', inline: true, atom: true, addAttributes: () => ({ citationId: { default: null }, items: { default: [] } }), renderHTML: ({ node }) => ['span', { 'data-citation': node.attrs.citationId, contenteditable: 'false' }, citationLabel(node.attrs.citationId)] }),
    TiptapNode.create({ name: 'footnote', group: 'inline', inline: true, atom: true, addAttributes: () => ({ footnoteId: { default: null } }), renderHTML: () => ['sup', { contenteditable: 'false', 'aria-label': 'Author footnote' }, '†'] })
  ]
  return [
    ...blocks,
    ...(['bold', 'italic', 'underline', 'strike'] as const).map((name, i) => Mark.create({ name, parseHTML: () => [{ tag: ['strong', 'em', 'u', 's'][i] }], renderHTML: () => [['strong', 'em', 'u', 's'][i], 0] })),
    Mark.create({ name: 'link', inclusive: false, addAttributes: () => ({ href: { default: null } }), renderHTML: ({ mark }) => ['a', { ...(safeLink(mark.attrs.href) ? { href: mark.attrs.href } : {}), rel: 'noopener noreferrer' }, 0] }),
    Extension.create({
      name: 'localEditing',
      addProseMirrorPlugins() {
        return [history(), keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo }), keymap(baseKeymap), new Plugin({
          appendTransaction(transactions, _old, state) {
            if (!transactions.some(t => t.docChanged)) return null
            const seen = new Set<string>()
            const tr = state.tr
            state.doc.descendants((node, pos) => {
              if (!Object.hasOwn(node.attrs, 'blockId')) return
              let id = node.attrs.blockId as string | null
              if (!id || seen.has(id)) {
                id = crypto.randomUUID()
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, blockId: id })
              }
              seen.add(id)
            })
            return tr.docChanged ? tr : null
          }
        })]
      }
    })
  ]
}

/** Unmounted production adapter; Stage 8 owns the toolbar, persistence and selection-aware clipboard. */
export function createManuscriptEditor(options: {
  element: HTMLElement
  payload: DocumentPayload
  imageUrl: (assetId: string) => string | undefined
  citationLabel: (citationId: string) => string
  onChange: () => void
  onIssue: (message: string) => void
}): Editor {
  const payload = readDocument(options.payload)
  return new Editor({
    element: options.element,
    extensions: manuscriptExtensions(options.imageUrl, options.citationLabel),
    content: payload.ast,
    enableContentCheck: true,
    injectCSS: false,
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'Manuscript', spellcheck: 'true' },
      handleClick: (_view, _pos, event) => {
        if (!(event.target as HTMLElement).closest('a')) return false
        event.preventDefault()
        return true
      },
      handlePaste(view, event) {
        if (event.clipboardData?.types.includes('text/html')) {
          options.onIssue('Formatted paste is not connected yet. Paste plain text, or keep the original until managed copy is available.')
          return true
        }
        const text = event.clipboardData?.getData('text/plain')
        if (text === undefined) return false
        if (text.length > 1_000_000) { options.onIssue('Paste is too large. Insert smaller sections.'); return true }
        const content = text.replace(/\r\n?/g, '\n').split('\n').flatMap((line, index) => [
          ...(index ? [view.state.schema.nodes.hardBreak.create()] : []),
          ...(line ? [view.state.schema.text(line)] : [])
        ])
        view.dispatch(view.state.tr.replaceSelection(new Slice(Fragment.fromArray(content), 0, 0)))
        return true
      },
      handleDrop(_view, _event, _slice, moved) {
        if (moved) return false
        options.onIssue('Copied or external drops need the managed import workflow.')
        return true
      }
    },
    onUpdate: () => options.onChange(),
    onContentError: () => options.onIssue('This content cannot be loaded without loss. Keep the original for repair.')
  })
}

export function serializeEditor(editor: Editor, footnotesById: DocumentPayload['footnotesById']): DocumentPayload {
  // Never flush intermediate IME composition as a durable document revision.
  if (editor.view.composing) throw new Error('EDITOR_COMPOSING')
  return readDocument({ schemaVersion: 1, ast: editor.getJSON(), footnotesById })
}
