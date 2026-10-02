import { Editor, Extension, Mark, Node as TiptapNode, type Extensions } from '@tiptap/core'
import { Plugin, type Transaction } from '@tiptap/pm/state'
import { closeHistory, history, undo, redo } from '@tiptap/pm/history'
import { keymap } from '@tiptap/pm/keymap'
import { baseKeymap, toggleMark } from '@tiptap/pm/commands'
import { Fragment, Slice, type Node as PMNode, type DOMOutputSpec } from '@tiptap/pm/model'
import { readDocument, safeLink, type DocumentPayload } from '../../../domain/editor/schema'

let lastCut: { editor: Editor; projectId: string; encoded: string } | null = null
const footnoteEditors = new WeakMap<Editor, Editor>()
const mutationLocks = new WeakSet<Editor>()
const approvedTransactions = new WeakSet<Transaction>()
/** A pending worker correction must also block keyboard/programmatic document edits. */
export function lockEditorMutation(editor:Editor,locked:boolean):void { if(locked)mutationLocks.add(editor);else mutationLocks.delete(editor) }
export function dispatchProtectedCorrection(editor:Editor,transaction:Transaction):void {
  approvedTransactions.add(transaction)
  try{editor.view.dispatch(transaction)}finally{approvedTransactions.delete(transaction)}
}
export function bindFootnoteEditor(owner: Editor, child: Editor | null): void { if (child) footnoteEditors.set(owner,child); else footnoteEditors.delete(owner) }
export function focusedManuscriptEditor(owner: Editor): Editor { const child=footnoteEditors.get(owner); return child?.view.hasFocus() ? child : owner }
export function editorIsComposing(editor: Editor): boolean { return editor.view.composing || !!footnoteEditors.get(editor)?.view.composing }
const blockId = { default: null, rendered: false }
const inTableCell = (selection: { $from: { depth: number; node: (depth: number) => { type: { name: string } } }; $to: { depth: number; node: (depth: number) => { type: { name: string } } } }): boolean => {
  for (const edge of [selection.$from, selection.$to]) for (let depth = edge.depth; depth > 0; depth--) if (['tableCell','tableHeader'].includes(edge.node(depth).type.name)) return true
  return false
}
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
        return ['figure', { contenteditable: 'false' }, image, ['figcaption', {}, node.attrs.caption]]
      }
    }),
    TiptapNode.create({ name: 'table', group: 'block', content: 'tableRow+', isolating: true, addAttributes: () => ({ blockId }), renderHTML: () => ['table', ['tbody', 0]] }),
    TiptapNode.create({ name: 'tableRow', content: '(tableCell | tableHeader)+', addAttributes: () => ({ blockId }), renderHTML: () => ['tr', 0] }),
    ...(['tableCell', 'tableHeader'] as const).map(name => TiptapNode.create({ name, content: 'paragraph+', isolating: true, addAttributes: () => ({ blockId }), renderHTML: () => [name === 'tableCell' ? 'td' : 'th', 0] })),
    TiptapNode.create({ name: 'citation', group: 'inline', inline: true, atom: true, addAttributes: () => ({ citationId: { default: null }, items: { default: [] } }), renderHTML: ({ node }) => ['span', { 'data-citation': node.attrs.citationId, contenteditable: 'false' }, citationLabel(node.attrs.citationId)] }),
    TiptapNode.create({ name: 'footnote', group: 'inline', inline: true, atom: true, addAttributes: () => ({ footnoteId: { default: null }, body: { default: null, rendered: false } }), renderHTML: ({ node }) => ['sup', { 'data-footnote': node.attrs.footnoteId, contenteditable: 'false', 'aria-label': 'Author footnote' }, citationLabel(node.attrs.footnoteId)] })
  ]
  return [
    ...blocks,
    ...(['bold', 'italic', 'underline', 'strike'] as const).map((name, i) => Mark.create({ name, parseHTML: () => [{ tag: ['strong', 'em', 'u', 's'][i] }], renderHTML: () => [['strong', 'em', 'u', 's'][i], 0] })),
    Mark.create({ name: 'link', inclusive: false, addAttributes: () => ({ href: { default: null } }), renderHTML: ({ mark }) => ['a', { ...(safeLink(mark.attrs.href) ? { href: mark.attrs.href } : {}), rel: 'noopener noreferrer' }, 0] }),
    Extension.create({
      name: 'localEditing',
      addProseMirrorPlugins() {
        const mark = (name: 'bold' | 'italic' | 'underline' | 'strike') => (state: Parameters<ReturnType<typeof toggleMark>>[0], dispatch: Parameters<ReturnType<typeof toggleMark>>[1]) => inTableCell(state.selection) || toggleMark(state.schema.marks[name])(state, dispatch)
        return [history(), keymap({ 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo, 'Mod-b': mark('bold'), 'Mod-i': mark('italic'), 'Mod-u': mark('underline'), 'Mod-Shift-x': mark('strike') }), keymap(baseKeymap), new Plugin({
          filterTransaction: transaction => !transaction.docChanged || !mutationLocks.has(this.editor) || approvedTransactions.has(transaction),
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
  projectId?: string
  footnoteMode?: boolean
  ariaLabel?: string
  payload: DocumentPayload
  imageUrl: (assetId: string) => string | undefined
  citationLabel: (citationId: string) => string
  onChange: () => void
  onIssue: (message: string) => void
}): Editor {
  const payload = readDocument(options.payload)
  const clipboardScope = options.projectId ?? crypto.randomUUID()
  const writeClipboard = (view: Editor['view'], event: ClipboardEvent, cut: boolean): boolean => {
    const clipboard = event.clipboardData
    if (!clipboard || view.state.selection.empty) return false
    if (cut && (!editor.isEditable || view.composing || footnoteEditors.get(editor)?.view.composing)) { event.preventDefault(); options.onIssue('Finish composing text before cutting a reference.'); return true }
    const { from,to } = view.state.selection
    const slice = view.state.selection.content(), encoded = JSON.stringify({projectId:clipboardScope,slice:slice.toJSON()})
    clipboard.setData('application/x-collie-editor-slice+json',encoded)
    const leaf = (node: PMNode): string => node.type.name === 'citation' ? options.citationLabel(node.attrs.citationId) : node.type.name === 'footnote' ? `[${options.citationLabel(node.attrs.footnoteId)}]` : ''
    const notes: string[] = []
    slice.content.descendants(node => {
      if (node.type.name !== 'footnote') return
      const body = view.state.schema.nodeFromJSON(node.attrs.body)
      notes.push(`[${options.citationLabel(node.attrs.footnoteId)}] ${body.textBetween(0,body.content.size,'\n',leaf)}`)
    })
    clipboard.setData('text/plain',[view.state.doc.textBetween(from,to,'\n',leaf),...notes].join('\n'))
    event.preventDefault()
    if (cut) { lastCut={editor,projectId:clipboardScope,encoded}; view.dispatch(closeHistory(view.state.tr.deleteSelection())) }
    return true
  }
  const editor = new Editor({
    element: options.element,
    extensions: [...manuscriptExtensions(options.imageUrl, options.citationLabel), Extension.create({
      name: 'footnoteBoundary',
      addProseMirrorPlugins: () => [new Plugin({ filterTransaction: transaction => {
        if (!options.footnoteMode || !transaction.docChanged) return true
        let allowed = true
        transaction.doc.descendants(node => { if (!['paragraph','text','hardBreak','citation'].includes(node.type.name)) allowed = false })
        if (!allowed) options.onIssue('Footnotes contain paragraphs and citations only; nested footnotes are not supported.')
        return allowed
      } })]
    })],
    content: hydrateDocument(payload),
    enableContentCheck: true,
    injectCSS: false,
    editorProps: {
      attributes: { role: 'textbox', 'aria-multiline': 'true', 'aria-label': options.ariaLabel ?? 'Manuscript', spellcheck: 'true' },
      handleDOMEvents: {
        copy: (view,event) => writeClipboard(view,event as ClipboardEvent,false),
        cut: (view,event) => writeClipboard(view,event as ClipboardEvent,true)
      },
      handleClick: (_view, _pos, event) => {
        if (!(event.target as HTMLElement).closest('a')) return false
        event.preventDefault()
        return true
      },
      handlePaste(view, event) {
        const own = event.clipboardData?.getData('application/x-collie-editor-slice+json')
        if (own) {
          try {
            const envelope = JSON.parse(own) as { projectId?: string; slice?: unknown }
            const source: unknown = envelope.slice
            if (!source || typeof source !== 'object' || JSON.stringify(source).length > 4_000_000) throw new Error('Invalid clipboard')
            const moving = lastCut?.projectId === clipboardScope && lastCut.encoded === own
            const retained = new Set<string>()
            const collect = (value: unknown): void => {
              if (!value || typeof value !== 'object') return
              for (const [key,child] of Object.entries(value)) {
                if (['blockId','citationId','footnoteId'].includes(key) && typeof child === 'string') retained.add(child)
                else collect(child)
              }
            }
            if (moving) {
              collect(view.state.doc.toJSON())
              if (lastCut && !lastCut.editor.isDestroyed && lastCut.editor !== editor) collect(lastCut.editor.getJSON())
            }
            const visit = (value: unknown): void => {
              if (!value || typeof value !== 'object') return
              for (const [key, child] of Object.entries(value)) {
                if (['blockId','citationId','footnoteId'].includes(key) && typeof child === 'string') { if (!moving || retained.has(child)) (value as Record<string, unknown>)[key] = crypto.randomUUID() }
                else visit(child)
              }
            }
            visit(source)
            const slice = Slice.fromJSON(view.state.schema, source)
            let managed = false, nested = false
            slice.content.descendants(node => { if (['citation','footnote','image'].includes(node.type.name)) managed = true; if (node.type.name === 'footnote') nested = true })
            if (managed && envelope.projectId !== clipboardScope) throw new Error('Cross-project managed references')
            if (options.footnoteMode && nested) throw new Error('Nested note')
            if (inTableCell(view.state.selection)) {
              let marked = false
              slice.content.descendants(node => { if (node.marks.length > 0 || ['citation','footnote','image'].includes(node.type.name)) marked = true })
              if (marked) { options.onIssue('Table cells accept plain text only. Use Paste as Plain Text here.'); return true }
            }
            const transaction = view.state.tr.replaceSelection(slice)
            documentFromEditorJson(transaction.doc.toJSON())
            view.dispatch(closeHistory(transaction))
            if (moving) lastCut = null
          } catch { options.onIssue('This Collie Writer clipboard content could not be pasted safely. The original content is still on the clipboard.') }
          return true
        }
        if (event.clipboardData?.types.includes('text/html')) {
          options.onIssue('Active HTML was refused. Use Paste as Plain Text to insert the text without embedded code or external resources.')
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
  const normalized = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalized)
    if (!value || typeof value !== 'object') return value
    return Object.fromEntries(Object.entries(value).filter(([key, child]) => key !== 'content' || !Array.isArray(child) || child.length > 0).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalized(child)]))
  }
  if (JSON.stringify(normalized(serializeEditor(editor))) !== JSON.stringify(normalized(payload))) {
    editor.destroy()
    throw new Error('EDITOR_CONTENT_CHANGED_ON_LOAD')
  }
  return editor
}

/** Body attributes live only inside the editor so history/copy includes the entire note atom. */
export function hydrateDocument(payload: DocumentPayload): Record<string, unknown> {
  const ast = structuredClone(payload.ast) as unknown as Record<string, unknown>
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    const node = value as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }
    if (node.type === 'footnote' && node.attrs) node.attrs.body = structuredClone(payload.footnotesById[String(node.attrs.footnoteId)])
    node.content?.forEach(visit)
  }
  visit(ast)
  return ast
}
export function documentFromEditorJson(value: unknown): DocumentPayload {
  const ast = structuredClone(value), footnotesById: DocumentPayload['footnotesById'] = {}
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    const node = value as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] }
    if (node.type === 'footnote' && node.attrs) {
      const id = String(node.attrs.footnoteId)
      if (Object.hasOwn(footnotesById,id)) throw new Error('Duplicate footnote')
      footnotesById[id] = node.attrs.body as DocumentPayload['footnotesById'][string]
      delete node.attrs.body
    }
    node.content?.forEach(visit)
  }
  visit(ast)
  return readDocument({schemaVersion:1,ast,footnotesById})
}
export function serializeEditor(editor: Editor, _legacyBodies?: DocumentPayload['footnotesById']): DocumentPayload {
  if (editorIsComposing(editor)) throw new Error('EDITOR_COMPOSING')
  return documentFromEditorJson(editor.getJSON())
}
export function refreshCitationLabels(editor: Editor, labels: ReadonlyMap<string,string>): void {
  for (const element of editor.view.dom.querySelectorAll<HTMLElement>('[data-citation], [data-footnote]')) {
    const id = element.dataset.citation ?? element.dataset.footnote!
    const label = labels.get(id) ?? (element.dataset.footnote ? '†' : '[citation]')
    element.textContent = label
    const numbered = /^\d+$/.test(label)
    element.toggleAttribute('data-numbered-note',numbered)
    element.setAttribute('aria-label',element.dataset.footnote ? `Author footnote ${label}` : numbered ? `Citation note ${label}` : `Citation ${label}`)
  }
}
