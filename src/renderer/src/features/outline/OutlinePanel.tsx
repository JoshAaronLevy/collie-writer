import { useEffect, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import { canParent, effectiveState, type OutlineChange, type OutlineDocument, type OutlineKind } from '../../../../shared/outline'

export default function OutlinePanel({ project, disabled, change, select }: { project: OpenProject; disabled: boolean; change: (value: OutlineChange) => void; select: (id: string) => void }): React.JSX.Element {
  const [focusId, setFocusId] = useState(project.documentId), [showRemoved, setShowRemoved] = useState(false)
  const [mode, setMode] = useState<'create' | 'move' | 'split' | 'merge' | 'details' | null>(null)
  const [kind, setKind] = useState<OutlineKind>('text'), [title, setTitle] = useState(''), [parentId, setParentId] = useState(''), [position, setPosition] = useState(0)
  const [targetId, setTargetId] = useState(''), [boundary, setBoundary] = useState(''), [status, setStatus] = useState<'draft' | 'review' | 'complete'>('draft'), [synopsis, setSynopsis] = useState('')
  const docs = project.documents, focused = docs.find(d => d.id === focusId) ?? docs.find(d => d.id === project.documentId)!
  useEffect(() => { setFocusId(project.documentId) }, [project.documentId])
  const state = effectiveState(focused,docs)
  const siblings = docs.filter(d => d.parentId === focused.parentId).sort((a,b) => a.position-b.position)
  function open(next: typeof mode): void {
    setMode(next); setTitle(next === 'details' ? focused.title : ''); setParentId(focused.parentId ?? ''); setPosition(focused.position); setTargetId(''); setBoundary(''); setStatus(focused.status as typeof status); setSynopsis(focused.synopsis)
  }
  function move(doc: OutlineDocument, destination: OutlineDocument): void {
    if (doc.id === destination.id || doc.state === 'merged') return
    const others = docs.filter(d => d.parentId === destination.parentId && d.id !== doc.id).sort((a,b) => a.position-b.position)
    change({ type: 'move',documentId: doc.id,parentId: destination.parentId,position: others.findIndex(d => d.id === destination.id) })
  }
  function branch(parent: string | null): React.JSX.Element {
    return <ol className="outline-tree">{docs.filter(d => d.parentId === parent).sort((a,b) => a.position-b.position).filter(d => showRemoved || effectiveState(d,docs) === 'active').map(d => <li key={d.id}>
      <button type="button" draggable={!disabled && d.state !== 'merged'} onDragStart={event => { event.dataTransfer.setData('application/x-collie-outline',d.id); event.dataTransfer.effectAllowed = 'move' }} onDragOver={event => { if (!disabled && event.dataTransfer.types.includes('application/x-collie-outline')) event.preventDefault() }} onDrop={event => { event.preventDefault(); if (disabled) return; const source = docs.find(x => x.id === event.dataTransfer.getData('application/x-collie-outline')); if (source) move(source,d) }} aria-pressed={focused.id === d.id} disabled={disabled} onClick={() => { setFocusId(d.id); setMode(null); if (d.kind === 'text') select(d.id) }}>
        {d.title} <small>{d.kind === 'text' ? 'Section' : d.kind} · {d.status}{effectiveState(d,docs) !== 'active' ? ` · ${effectiveState(d,docs)}` : ''}</small>
      </button>
      {docs.some(child => child.parentId === d.id) ? branch(d.id) : null}
    </li>)}</ol>
  }
  const parentOptions = docs.filter(d => (mode === 'create' || d.id !== focused.id) && canParent(mode === 'create' ? kind : focused.kind,d) && effectiveState(d,docs) === 'active')
  return <section className="outline-panel" aria-label="Manuscript outline">
    <h3>Outline</h3>
    <p>Drag a row before another row, or use Move and the Up/Down buttons. Parts contain chapters or sections; chapters contain sections.</p>
    <label><input type="checkbox" checked={showRemoved} onChange={e => setShowRemoved(e.target.checked)} /> Show archived, trashed and merged items</label>
    {branch(null)}
    <p aria-live="polite">Selected outline item: {focused.title} · {state}</p>
    {focused.state === 'merged' ? <p>This section was merged. <button disabled={disabled} onClick={() => select(focused.replacementId!)}>Open replacement section</button> Its earlier content remains in history.</p> : <div className="project-actions">
      <button disabled={disabled || focused.position === 0} onClick={() => change({ type:'move',documentId:focused.id,parentId:focused.parentId,position:focused.position-1 })}>Up</button>
      <button disabled={disabled || focused.position === siblings.length-1} onClick={() => change({ type:'move',documentId:focused.id,parentId:focused.parentId,position:focused.position+1 })}>Down</button>
      <button disabled={disabled} onClick={() => open('move')}>Move…</button>
      <button disabled={disabled} onClick={() => open('details')}>Outline details…</button>
      <button disabled={disabled || state !== 'active' || focused.kind !== 'text' || focused.id !== project.documentId} onClick={() => open('split')}>Split section…</button>
      <button disabled={disabled || state !== 'active' || focused.kind !== 'text'} onClick={() => open('merge')}>Merge into…</button>
      <button disabled={disabled || focused.state === 'archived'} onClick={() => change({ type:'state',documentId:focused.id,state:'archived' })}>Archive</button>
      <button disabled={disabled || focused.state === 'trashed'} onClick={() => change({ type:'state',documentId:focused.id,state:'trashed' })}>Move to trash</button>
      {focused.state !== 'active' ? <button disabled={disabled} onClick={() => change({ type:'state',documentId:focused.id,state:'active' })}>Restore item</button> : null}
    </div>}
    <button disabled={disabled} onClick={() => { open('create'); setParentId('') }}>Add outline item…</button>
    {mode ? <form className="outline-form" onSubmit={e => {
      e.preventDefault()
      if (mode === 'create') change({ type:'create',kind,title,parentId:parentId || null })
      if (mode === 'move') change({ type:'move',documentId:focused.id,parentId:parentId || null,position })
      if (mode === 'split') change({ type:'split',documentId:focused.id,afterBlockId:boundary,title })
      if (mode === 'merge') change({ type:'merge',documentId:focused.id,targetId })
      if (mode === 'details') change({ type:'details',documentId:focused.id,title,status,synopsis })
      setMode(null)
    }}>
      <h4>{mode === 'merge' ? `Append “${focused.title}” to another section` : `${mode[0].toUpperCase()}${mode.slice(1)} outline item`}</h4>
      {mode === 'create' ? <label>Kind <select value={kind} onChange={e => { setKind(e.target.value as OutlineKind); setParentId('') }}><option value="text">Section</option><option value="chapter">Chapter</option><option value="part">Part</option></select></label> : null}
      {['create','split','details'].includes(mode) ? <label>Title <input autoFocus required maxLength={500} value={title} onChange={e => setTitle(e.target.value)} /></label> : null}
      {mode === 'move' || mode === 'create' ? <label>Parent <select value={parentId} onChange={e => { setParentId(e.target.value); setPosition(0) }}><option value="">Manuscript root</option>{parentOptions.map(d => <option key={d.id} value={d.id}>{d.title} · {d.kind}</option>)}</select></label> : null}
      {mode === 'move' ? <label>Position <select value={position} onChange={e => setPosition(Number(e.target.value))}>{Array.from({ length: docs.filter(d => d.parentId === (parentId || null) && d.id !== focused.id).length+1 },(_,i) => <option key={i} value={i}>{i+1}</option>)}</select></label> : null}
      {mode === 'split' ? <><p>Split only between complete top-level blocks. A table or list stays together. Pending edits are protected before the change; a changed boundary is rejected.</p><label>Split after <select required value={boundary} onChange={e => setBoundary(e.target.value)}><option value="">Choose a boundary</option>{project.payload.ast.content.slice(0,-1).map((b,i) => <option key={b.attrs.blockId} value={b.attrs.blockId}>Block {i+1} · {b.type}</option>)}</select></label>{project.payload.ast.content.length < 2 ? <p>Add and protect at least two paragraphs/blocks before splitting.</p> : null}</> : null}
      {mode === 'merge' ? <><p>The target’s writing comes first, followed by this section. The source becomes a tombstone linking to the target; a checkpoint preserves its title and synopsis.</p><label>Append to <select required value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">Choose a section</option>{docs.filter(d => d.kind === 'text' && d.id !== focused.id && effectiveState(d,docs) === 'active').map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label></> : null}
      {mode === 'details' ? <><label>Status <select value={status} onChange={e => setStatus(e.target.value as typeof status)}><option value="draft">Draft</option><option value="review">Review</option><option value="complete">Complete</option></select></label><label>Synopsis <textarea maxLength={10000} value={synopsis} onChange={e => setSynopsis(e.target.value)} /></label></> : null}
      <button type="submit" disabled={disabled}>Apply {mode}</button> <button type="button" onClick={() => setMode(null)}>Cancel</button>
    </form> : null}
    <p>Archive and trash keep content. At least one active section must remain. Restore a containing part/chapter to make its children active again.</p>
  </section>
}
