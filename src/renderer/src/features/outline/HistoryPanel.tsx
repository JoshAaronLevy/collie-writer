import { useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import { effectiveState, type HistoryView, type OutlineChange, type RetainedDocument, type AnchorTarget } from '../../../../shared/outline'

function readable(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  if ('type' in value && value.type === 'text' && 'text' in value) return String(value.text)
  if ('type' in value && value.type === 'hardBreak') return '\n'
  if ('type' in value && 'attrs' in value && value.attrs && typeof value.attrs === 'object') {
    if (value.type === 'citation' && 'citationId' in value.attrs) return `[Citation ${String(value.attrs.citationId).slice(0,8)}]`
    if (value.type === 'footnote' && 'footnoteId' in value.attrs) return `[Note ${String(value.attrs.footnoteId).slice(0,8)}]`
    if (value.type === 'image' && 'alt' in value.attrs && 'caption' in value.attrs) return `[Image: ${value.attrs.alt}] ${value.attrs.caption}\n`
    if (value.type === 'pageBreak') return '\n[Page break]\n'
    if (value.type === 'horizontalRule') return '\n[Rule]\n'
  }
  if ('content' in value && Array.isArray(value.content)) return value.content.map(readable).join('') + ('type' in value && ['paragraph','heading','tableRow'].includes(String(value.type)) ? '\n' : '')
  return ''
}
function text(doc: RetainedDocument): string {
  return readable(doc.payload.ast) + Object.entries(doc.payload.footnotesById).map(([id,body]) => `\nNote ${id.slice(0,8)}\n${readable(body)}`).join('')
}
function formatting(doc: RetainedDocument): string {
  const marks = new Set<string>(); let citations = 0, blocks = 0
  function visit(v: unknown): void {
    if (!v || typeof v !== 'object') return
    if ('attrs' in v && v.attrs && typeof v.attrs === 'object' && 'blockId' in v.attrs) blocks++
    if ('type' in v && v.type === 'citation') citations++
    if ('marks' in v && Array.isArray(v.marks)) for (const m of v.marks) if (m && typeof m === 'object' && 'type' in m) marks.add(String(m.type))
    for (const [key,child] of Object.entries(v)) if (key !== 'marks') visit(child)
  }
  visit(doc.payload)
  return `${blocks} addressable blocks · ${citations} citations · formatting: ${[...marks].join(', ') || 'plain'}`
}
function bytes(n: number): string { return n < 1024 ? `${n} bytes` : n < 1024 ** 2 ? `${(n/1024).toFixed(1)} KiB` : `${(n/1024 ** 2).toFixed(1)} MiB` }
function placement(doc: RetainedDocument, docs: RetainedDocument[]): string {
  const path = [doc.title]; let cursor = doc, count = 0
  while (cursor.parentId && ++count < 4) { const parent = docs.find(d => d.id === cursor.parentId); if (!parent) break; path.unshift(parent.title); cursor = parent }
  return `${path.join(' / ')} · position ${doc.position+1} · ${doc.kind === 'text' ? 'section' : doc.kind} · ${effectiveState(doc,docs)} · ${doc.status}`
}
export default function HistoryPanel({ project, history, disabled, change, read, navigate }: { project: OpenProject; history: HistoryView | null; disabled: boolean; change: (c: OutlineChange) => void; read: (id: string | null) => void; navigate: (doc: string, anchor?: string) => void }): React.JSX.Element {
  const [title,setTitle] = useState(''), [selected,setSelected] = useState(''), [confirm,setConfirm] = useState<'restore' | 'prune' | null>(null)
  const [repair,setRepair] = useState<AnchorTarget | null>(null), [target,setTarget] = useState(''), [page,setPage] = useState(0), [issuePage,setIssuePage] = useState(0)
  const fresh = history?.headCommitId === project.headCommitId
  const issues = history?.anchors.filter(a => a.state !== 'active') ?? []
  const oldDocs = history?.snapshot?.documents ?? [], currentDocs = history?.currentSnapshot.documents ?? []
  const changedIds = [...new Set([...oldDocs,...currentDocs].map(d => d.id))].filter(id => {
    const old = oldDocs.find(d => d.id === id), current = currentDocs.find(d => d.id === id)
    const comparable = (doc: RetainedDocument | undefined): string => { if (!doc) return ''; const { revisionId: _revision, ...rest } = doc; return JSON.stringify(rest) }
    return comparable(old) !== comparable(current)
  })
  return <section className="history-panel" aria-label="Revision history">
    <h3>History and anchor targets</h3>
    <p>Local commits protect current writing. Retained checkpoints preserve earlier manuscript content and outline structure. Undo/Redo belongs to the current editor session.</p>
    <form onSubmit={e => { e.preventDefault(); change({ type:'checkpoint',title }); setTitle('') }}><label>Checkpoint name <input required maxLength={500} value={title} onChange={e => setTitle(e.target.value)} /></label> <button disabled={disabled}>Keep checkpoint</button></form>
    <button disabled={disabled} onClick={() => { setSelected(''); setConfirm(null); setPage(0); read(null) }}>Refresh history and targets</button>
    {history ? <>
      {!fresh ? <p role="status">Writing changed after this history view. Refresh before restoring, repairing or cleaning up.</p> : null}
      <p>{history.checkpoints.length} retained checkpoints · {bytes(history.totalBytes)} of snapshot indexes and shared section content. Unchanged sections are stored once. Actual disk use also includes SQLite, retained migration copies and managed assets.</p>
      <label>Compare checkpoint with current manuscript <select value={selected} disabled={disabled} onChange={e => { setSelected(e.target.value); setConfirm(null); setPage(0); read(e.target.value || null) }}><option value="">Choose a checkpoint</option>{history.checkpoints.map(c => <option key={c.id} value={c.id}>{c.title} · {c.reason} · {new Date(c.createdAt).toLocaleString()} · {bytes(c.bytes)} index</option>)}</select></label>
      {history.snapshot && selected && history.checkpointId === selected ? <div className="history-comparison">
        <p>{changedIds.length} changed outline items. Text is shown side by side; formatting, references, block order and metadata also count as changes.</p>
        {changedIds.slice(page*10,page*10+10).map(id => {
          const before = oldDocs.find(d => d.id === id), after = currentDocs.find(d => d.id === id)
          return <details key={id}><summary>{after?.title ?? before?.title} · {before && after ? 'changed' : before ? 'absent now' : 'added later'}</summary><div className="history-columns">{[{ doc:before,docs:oldDocs,label:'Checkpoint' },{ doc:after,docs:currentDocs,label:'Current' }].map(({doc,docs,label}) => <section key={label}><h4>{label}</h4>{doc ? <><p>{placement(doc,docs)}</p><p>Synopsis: {doc.synopsis || 'None'}</p><p>{formatting(doc)}</p><p>Block order: {doc.payload.ast.content.map(b => b.type).join(' → ')}</p><p>{doc.payload.ast.content.length} top-level blocks · {Object.keys(doc.payload.footnotesById).length} footnotes</p><pre>{text(doc)}</pre></> : <p>This item is absent.</p>}</section>)}</div></details>
        })}
        <button disabled={page === 0} onClick={() => setPage(page-1)}>Previous changes</button> <button disabled={(page+1)*10 >= changedIds.length} onClick={() => setPage(page+1)}>Next changes</button>
        <button disabled={disabled || !fresh} onClick={() => setConfirm('restore')}>Restore this checkpoint…</button>
      </div> : null}
      <h4>History retention</h4>
      <p>Automatic checkpoints older than 30 days are eligible for manual cleanup. Manual checkpoints, checkpoints before changes and the newest checkpoint stay. No automatic deletion or blob cleanup occurs.</p>
      <p>{history.prunableIds.length} eligible checkpoints · {bytes(history.prunableBytes)} snapshot content removable. SQLite may reuse this space without shrinking its file.</p>
      <button disabled={disabled || !fresh || !history.prunableIds.length} onClick={() => setConfirm('prune')}>Review cleanup…</button>
      {confirm ? <div className="outline-confirm" role="group" aria-label={confirm === 'restore' ? 'Confirm checkpoint restore' : 'Confirm history cleanup'}><p>{confirm === 'restore' ? 'Restore the entire manuscript and outline? Current writing will first be kept in a protected checkpoint. Later history remains available. This creates new revisions and makes the chosen file need Save.' : `Remove these ${history.prunableIds.length} old automatic checkpoints? This cannot be undone in this workspace. Current writing, explicit checkpoints, structural checkpoints, blobs, recovery and saved files stay. Use Backup first if you want to retain these old automatic versions elsewhere.`}</p><button disabled={disabled || !fresh} onClick={() => { change(confirm === 'restore' ? { type:'restore',checkpointId:selected } : { type:'prune',checkpointIds:history.prunableIds }); setConfirm(null) }}>{confirm === 'restore' ? 'Restore and keep current checkpoint' : 'Remove reviewed automatic checkpoints'}</button> <button onClick={() => setConfirm(null)}>Cancel</button></div> : null}
      <h4>Unavailable anchor targets ({issues.length})</h4>
      <p>Removed blocks keep their identity and last text context. Archive/trash targets become available when their outline item is restored. A manual repair explicitly links a deleted identity to a chosen existing block; it never changes manuscript text.</p>
      <ul>{issues.slice(issuePage*25,issuePage*25+25).map(a => {
        const repaired = a.replacementId ? history.anchors.find(x => x.id === a.replacementId) : undefined
        return <li key={a.id}>{a.label || a.kind} · {a.state} · {a.id.slice(0,8)}{repaired ? ` · manually linked to ${repaired.label || repaired.id.slice(0,8)} (${repaired.state})` : ''} <button disabled={disabled} onClick={() => navigate(repaired?.documentId ?? a.documentId,repaired?.id ?? (a.state !== 'deleted' ? a.id : undefined))}>Open {repaired ? 'chosen target' : 'section'}</button> {a.state === 'deleted' ? <button disabled={disabled || !fresh} onClick={() => { setRepair(a); setTarget('') }}>Repair target…</button> : null}</li>
      })}</ul>
      <button disabled={issuePage === 0} onClick={() => setIssuePage(issuePage-1)}>Previous targets</button> <button disabled={(issuePage+1)*25 >= issues.length} onClick={() => setIssuePage(issuePage+1)}>Next targets</button>
      {repair ? <form onSubmit={e => { e.preventDefault(); change({ type:'repair',anchorId:repair.id,targetId:target }); setRepair(null) }}><p>Choose the intended replacement for: {repair.label || repair.id.slice(0,8)}. No text matching is performed.</p><label>Existing target <select required value={target} onChange={e => setTarget(e.target.value)}><option value="">Choose explicitly</option>{history.anchors.filter(a => a.state === 'active' && a.kind === repair.kind).map(a => <option key={a.id} value={a.id}>{currentDocs.find(d => d.id === a.documentId)?.title} · {a.label || a.kind} · {a.id.slice(0,8)}</option>)}</select></label><button disabled={disabled || !fresh}>Confirm target</button> <button type="button" onClick={() => setRepair(null)}>Cancel</button></form> : null}
    </> : null}
  </section>
}
