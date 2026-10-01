import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { setBlockType } from '@tiptap/pm/commands'
import { wrapInList } from '@tiptap/pm/schema-list'
import { undo, redo } from '@tiptap/pm/history'
import { safeLink, type DocumentPayload } from '../../../domain/editor/schema'
import { createManuscriptEditor } from './adapter'

type TableCellJson = { type: 'tableCell' | 'tableHeader'; attrs: { blockId: string }; content: { type: 'paragraph'; attrs: { blockId: string } }[] }
type TableRowJson = { type: 'tableRow'; attrs: { blockId: string }; content: TableCellJson[] }
const newCell = (type: TableCellJson['type']): TableCellJson => ({ type, attrs: { blockId: crypto.randomUUID() }, content: [{ type: 'paragraph', attrs: { blockId: crypto.randomUUID() } }] })

type Props = {
  noteMode?: boolean
  payload: DocumentPayload
  disabled: boolean
  onReady: (editor: Editor | null) => void
  onChange: () => void
  onIssue: (message: string) => void
  onBlur: () => void
  imageUrl: (assetId: string) => string | undefined
  importImage: () => void
}

export default function RichDraft({ payload, disabled, onReady, onChange, onIssue, onBlur, imageUrl, importImage, noteMode = false }: Props): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const findField = useRef<HTMLInputElement>(null)
  const editor = useRef<Editor | null>(null)
  const countTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled
  const [, setRevision] = useState(0)
  const [words, setWords] = useState(0)
  const [query, setQuery] = useState(''), [replacement, setReplacement] = useState('')
  const [match, setMatch] = useState('')
  useEffect(() => {
    if (!host.current) return
    try {
      const next = createManuscriptEditor({ element: host.current, payload, imageUrl, citationLabel: () => '[citation]', onChange: () => {
        setRevision(value => value + 1); onChange()
        if (countTimer.current) clearTimeout(countTimer.current)
        countTimer.current = setTimeout(() => { if (editor.current) setWords((editor.current.state.doc.textContent.match(/\S+/gu) ?? []).length) }, 450)
      }, onIssue })
      editor.current = next; onReady(next); setWords((next.state.doc.textContent.match(/\S+/gu) ?? []).length); setRevision(value => value + 1)
      return () => { if (countTimer.current) clearTimeout(countTimer.current); onReady(null); editor.current = null; next.destroy() }
    } catch { onIssue('The stored document cannot be opened for editing without loss. Keep its original file and local recovery for repair.') }
  }, [])
  useEffect(() => { editor.current?.setEditable(!disabled, false) }, [disabled])
  useEffect(() => window.collie.onEditorAction(action => {
    if (noteMode) return
    const instance = editor.current
    if (!instance) return
    if (action === 'find') { findField.current?.focus(); return }
    if (disabledRef.current) return
    if (action === 'undo') undo(instance.state, tr => instance.view.dispatch(tr))
    else if (action === 'redo') redo(instance.state, tr => instance.view.dispatch(tr))
    else void pastePlain()
  }), [])
  const current = editor.current
  function command(run: (editor: Editor) => void): void { if (editor.current && !disabled) { run(editor.current); editor.current.commands.focus(); setRevision(value => value + 1) } }
  function inCell(instance: Editor): boolean {
    for (const edge of [instance.state.selection.$from, instance.state.selection.$to]) for (let depth = edge.depth; depth > 0; depth--) if (['tableCell','tableHeader'].includes(edge.node(depth).type.name)) return true
    return false
  }
  function mark(name: 'bold' | 'italic' | 'underline' | 'strike'): void {
    if (editor.current && inCell(editor.current)) { onIssue('Table cells accept plain text only.'); return }
    command(e => { e.chain().focus().toggleMark(name).run() })
  }
  function find(from = current?.state.selection.to ?? 0): { from: number; to: number } | null {
    const instance = editor.current
    if (!instance || !query) return null
    const needle = query
    const doc = instance.state.doc
    const candidates: { from: number; to: number }[] = []
    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      const haystack = node.text
      for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + Math.max(needle.length, 1))) candidates.push({ from: pos + index, to: pos + index + query.length })
    })
    return candidates.find(candidate => candidate.from >= from) ?? candidates[0] ?? null
  }
  function selectFound(): void {
    const instance = editor.current, found = find()
    if (!instance || !found) { setMatch('No match in this section.'); return }
    instance.chain().focus().setTextSelection(found).run(); setMatch('Match selected in this section.')
  }
  function replace(all: boolean): void {
    const instance = editor.current
    if (!instance || disabled || !query) return
    const doc = instance.state.doc, hits: { from: number; to: number }[] = []
    doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return
      const haystack = node.text, needle = query
      for (let index = haystack.indexOf(needle); index >= 0; index = haystack.indexOf(needle, index + Math.max(needle.length, 1))) hits.push({ from: pos + index, to: pos + index + query.length })
    })
    const selected = all ? hits : [hits.find(hit => hit.from === instance.state.selection.from && hit.to === instance.state.selection.to) ?? find()].filter((value): value is { from: number; to: number } => !!value)
    if (!selected.length) { setMatch('No match in this section.'); return }
    let transaction = instance.state.tr
    for (const hit of selected.reverse()) transaction = transaction.insertText(replacement, hit.from, hit.to)
    instance.view.dispatch(transaction)
    setMatch(`${selected.length} replacement${selected.length === 1 ? '' : 's'} in this section.`)
  }
  function link(): void {
    const instance = editor.current
    if (!instance || disabled || instance.state.selection.empty) { onIssue('Select text before adding a link.'); return }
    if (inCell(instance)) { onIssue('Table cells accept plain text only.'); return }
    const href = window.prompt('Web address (https:// or http://)')
    if (href === null) return
    if (!safeLink(href)) { onIssue('Use a safe http or https address without credentials.'); return }
    command(e => { e.chain().focus().setMark('link', { href }).run() })
  }
  function table(): void {
    command(e => {
      const row = (heading: boolean): TableRowJson => ({ type: 'tableRow', attrs: { blockId: crypto.randomUUID() }, content: [newCell(heading ? 'tableHeader' : 'tableCell'), newCell(heading ? 'tableHeader' : 'tableCell')] })
      e.commands.insertContent({ type: 'table', attrs: { blockId: crypto.randomUUID() }, content: [row(true), row(false)] })
    })
  }
  function growTable(direction: 'row' | 'column'): void {
    command(e => {
      const selection = e.state.selection.$from
      let depth = selection.depth
      while (depth > 0 && selection.node(depth).type.name !== 'table') depth--
      if (!depth) { onIssue('Place the cursor in a table first.'); return }
      const tableNode = selection.node(depth), position = selection.before(depth)
      const json = tableNode.toJSON()
      const rows = json.content as TableRowJson[]
      if (direction === 'row') {
        if (rows.length >= 10000) { onIssue('This table has reached its row limit.'); return }
        rows.push({ type: 'tableRow', attrs: { blockId: crypto.randomUUID() }, content: rows[0].content.map(() => newCell('tableCell')) })
      } else {
        if (rows[0].content.length >= 20) { onIssue('This table has reached its column limit.'); return }
        rows.forEach((row, index) => row.content.push(newCell(index === 0 && row.content[0].type === 'tableHeader' ? 'tableHeader' : 'tableCell')))
      }
      e.commands.insertContentAt({ from: position, to: position + tableNode.nodeSize }, json)
    })
  }
  function imageDetails(): void {
    const instance = editor.current
    const selected = instance?.state.selection as { node?: { type: { name: string }; attrs: Record<string, unknown> } } | undefined
    if (!instance || selected?.node?.type.name !== 'image') { onIssue('Select an image first.'); return }
    const alt = window.prompt('Image description for assistive technology', String(selected.node.attrs.alt ?? ''))
    if (alt === null) return
    const caption = window.prompt('Caption', String(selected.node.attrs.caption ?? ''))
    if (caption === null) return
    if (alt.length > 2000 || caption.length > 10000) { onIssue('Image description or caption is too long.'); return }
    command(e => { e.commands.updateAttributes('image', { alt, caption }) })
  }
  async function pastePlain(): Promise<void> {
    if (disabledRef.current) return
    const result = await window.collie.readPlainClipboard()
    if (!result.ok) { onIssue(result.error.message); return }
    const instance = editor.current
    if (!instance || !result.value) return
    instance.view.dispatch(instance.state.tr.insertText(result.value.replace(/\r\n?/g, '\n')))
    instance.commands.focus()
  }
  function insertBlock(type: 'horizontalRule' | 'pageBreak'): void { command(e => { e.commands.insertContent({ type, attrs: { blockId: crypto.randomUUID() } }) }) }
  return <div className="rich-draft">
    <div className="editor-toolbar" role="toolbar" aria-label="Writing tools">
      {(['bold','italic','underline','strike'] as const).map(name => <button key={name} type="button" disabled={disabled} aria-label={name} aria-pressed={!!current?.isActive(name)} onMouseDown={event => event.preventDefault()} onClick={() => mark(name)}>{name[0].toUpperCase() + name.slice(1)}</button>)}
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(e => { setBlockType(e.state.schema.nodes.paragraph)(e.state, tr => e.view.dispatch(tr)) })}>Paragraph</button>
      {([1,2,3] as const).map(level => <button key={level} type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(e => { setBlockType(e.state.schema.nodes.heading, { level })(e.state, tr => e.view.dispatch(tr)) })}>Heading {level}</button>)}
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(e => { e.chain().focus().toggleWrap('blockquote').run() })}>Quote</button>
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(e => { wrapInList(e.state.schema.nodes.bulletList)(e.state, tr => e.view.dispatch(tr)) })}>Bullets</button>
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(e => { wrapInList(e.state.schema.nodes.orderedList, { start: 1 })(e.state, tr => e.view.dispatch(tr)) })}>Numbers</button>
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={link}>Link</button>
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => command(e => { e.chain().focus().unsetMark('link').run() })}>Remove link</button>
      <button type="button" disabled={disabled} onClick={() => insertBlock('horizontalRule')}>Rule</button>
      {!noteMode ? <><button type="button" disabled={disabled} onClick={() => insertBlock('pageBreak')}>Page break</button>
      <button type="button" disabled={disabled} onClick={table}>Table 2×2</button>
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => growTable('row')}>Add row</button>
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => growTable('column')}>Add column</button>
      <button type="button" disabled={disabled} onClick={importImage}>Image…</button>
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={imageDetails}>Image details</button></> : null}
      <button type="button" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => { void pastePlain() }}>Paste plain text</button>
      <button type="button" disabled={disabled} onClick={() => command(e => { undo(e.state, tr => e.view.dispatch(tr)) })}>Undo</button>
      <button type="button" disabled={disabled} onClick={() => command(e => { redo(e.state, tr => e.view.dispatch(tr)) })}>Redo</button>
    </div>
    <div ref={host} className="editor-host" onCompositionEnd={() => { setTimeout(onBlur, 0) }} onKeyDown={event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); findField.current?.focus() }
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        void pastePlain()
      }
    }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) onBlur() }} />
    <p className="word-count" aria-live="off">{words.toLocaleString()} words in this section</p>
    <div className="editor-find" role="search" aria-label="Case-sensitive find and replace in this section">
      <label>Find <input ref={findField} value={query} onChange={event => { setQuery(event.target.value); setMatch('') }} /></label>
      <label>Replace with <input value={replacement} onChange={event => setReplacement(event.target.value)} /></label>
      <button type="button" onClick={selectFound}>Find next</button>
      <button type="button" disabled={disabled} onClick={() => replace(false)}>Replace</button>
      <button type="button" disabled={disabled} onClick={() => replace(true)}>Replace all</button>
      {match ? <span role="status">{match}</span> : null}
    </div>
  </div>
}
