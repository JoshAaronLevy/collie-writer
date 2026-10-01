import { useEffect, useState } from 'react'
import type { OpenProject } from '../../../../shared/projects'
import type { EvidenceChange, EvidenceLink, EvidenceRole, EvidenceView, ResearchItem } from '../../../../shared/evidence'

const scope = (project: OpenProject) => ({ projectId: project.projectId, workspaceId: project.workspaceId })
const roles: EvidenceRole[] = ['support','challenge','background','potential_use']
const title = (view: EvidenceView | null, id: string): string => view?.sources.find(s => s.id === id)?.title ?? id.slice(0,8)
const section = (view: EvidenceView | null, id: string): string => view?.sections.find(s => s.id === id)?.title ?? id.slice(0,8)
const oldValue = (snapshot: string): string => { try { const value = JSON.parse(snapshot) as Record<string,unknown>; return String(value.text ?? [value.state,value.role,value.reason].filter(Boolean).join(' · ')).slice(0,400) } catch { return 'Prior revision retained' } }

export default function EvidencePanel({ project, focusItem, disabled, readOnly, dirtyChanged, onCommitted, navigate, inspect }: { project: OpenProject; focusItem: {kind:'question'|'claim';id:string}|null; disabled: boolean; readOnly:boolean; dirtyChanged:(dirty:boolean)=>void; onCommitted: () => Promise<void>; navigate: (id: string, anchor?: string) => Promise<void>; inspect: (sourceId: string, excerptId: string) => void }): React.JSX.Element {
  const [view,setView] = useState<EvidenceView|null>(null)
  const [busy,setBusy] = useState(false),[error,setError] = useState(''),[message,setMessage] = useState('')
  const [questionId,setQuestionId] = useState<string|null>(null),[claimId,setClaimId] = useState<string|null>(null)
  const [questionText,setQuestionText] = useState(''),[claimText,setClaimText] = useState('')
  const [questionSection,setQuestionSection] = useState(''),[questionNote,setQuestionNote] = useState('')
  const [claimSection,setClaimSection] = useState(''),[claimNote,setClaimNote] = useState('')
  const [focusSource,setFocusSource] = useState(''),[focusSection,setFocusSection] = useState('')
  const [decisionSource,setDecisionSource] = useState(''),[decisionReason,setDecisionReason] = useState('')
  const [linkSource,setLinkSource] = useState(''),[linkExcerpt,setLinkExcerpt] = useState(''),[linkTargetKind,setLinkTargetKind] = useState<'claim'|'section'>('claim'),[linkTarget,setLinkTarget] = useState(''),[linkRole,setLinkRole] = useState<EvidenceRole>('support')
  const question = view?.questions.find(x => x.id === questionId),claim = view?.claims.find(x => x.id === claimId)
  const locked = disabled || busy
  const selectedDecision = view?.decisions.find(d => d.questionId === questionId && d.sourceId === decisionSource)
  const draftPending=!!view&&(questionText!==(question?.text??'')||questionSection!==(question?.documentId??'')||questionNote!==(question?.noteId??'')||claimText!==(claim?.text??'')||claimSection!==(claim?.documentId??'')||claimNote!==(claim?.noteId??'')||decisionReason!==(selectedDecision?.reason??''))

  useEffect(() => { let live = true; void window.collie.readEvidence(scope(project)).then(result => { if (!live) return; if (result.ok) setView(result.value); else setError(result.error.message) }); return () => { live = false } },[project.projectId,project.workspaceId,project.headCommitId])
  async function mutate(change: EvidenceChange): Promise<void> {
    if(readOnly){setError('Choose this project for free editing before changing research.');return}
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await window.collie.changeEvidence({ ...scope(project),operationId:crypto.randomUUID(),change })
      if (!result.ok) { setError(result.error.message); return }
      if (change.type === 'createQuestion') setQuestionId(change.id)
      if (change.type === 'createClaim') setClaimId(change.id)
      setView(result.value); setMessage('Research change protected locally. Save or back up the project file separately.')
      await onCommitted()
    } finally { setBusy(false) }
  }
  function chooseItem(kind: 'question'|'claim', item: ResearchItem | null): void {
    if(draftPending){setError('Save or discard pending research form edits before selecting another item.');return}
    if (kind === 'question') { setQuestionId(item?.id ?? null); setQuestionText(item?.text ?? ''); setQuestionSection(item?.documentId ?? ''); setQuestionNote(item?.noteId ?? ''); setDecisionSource(''); setDecisionReason('') }
    else { setClaimId(item?.id ?? null); setClaimText(item?.text ?? ''); setClaimSection(item?.documentId ?? ''); setClaimNote(item?.noteId ?? '') }
  }
  useEffect(()=>{if(!focusItem||!view||draftPending||focusItem.id===(focusItem.kind==='question'?questionId:claimId))return;const target=(focusItem.kind==='question'?view.questions:view.claims).find(x=>x.id===focusItem.id);if(target){chooseItem(focusItem.kind,target);document.querySelector('.evidence-panel')?.scrollIntoView({block:'start'})}},[focusItem?.id,focusItem?.kind,view?.questions,view?.claims])
  function discardDrafts():void{
    setQuestionText(question?.text??'');setQuestionSection(question?.documentId??'');setQuestionNote(question?.noteId??'')
    setClaimText(claim?.text??'');setClaimSection(claim?.documentId??'');setClaimNote(claim?.noteId??'')
    setDecisionReason(selectedDecision?.reason??'');setError('')
  }
  function saveItem(kind: 'question'|'claim'): void {
    const selected = kind === 'question' ? question : claim
    const text = kind === 'question' ? questionText : claimText
    const documentId = (kind === 'question' ? questionSection : claimSection) || null
    const noteId = (kind === 'question' ? questionNote : claimNote) || null
    if (!text.trim()) { setError('Enter a question or claim first.'); return }
    if (selected) void mutate({type:kind === 'question' ? 'updateQuestion' : 'updateClaim',id:selected.id,expectedRevisionId:selected.revisionId,text,documentId,noteId,state:selected.state})
    else { const id = crypto.randomUUID(); void mutate({type:kind === 'question' ? 'createQuestion' : 'createClaim',id,text,documentId,noteId}) }
  }
  function linkStatus(link: EvidenceLink): string[] {
    if (!view) return []
    const issues: string[] = []
    const source = view.sources.find(s => s.id === link.sourceId)
    if (source?.state !== 'active') issues.push(`source ${source?.state ?? 'missing'}`)
    const target = link.claimId ? view.claims.find(c => c.id === link.claimId) : view.sections.find(s => s.id === link.documentId)
    if (!target) issues.push('target missing')
    else { if (target.state !== 'active') issues.push(`target ${target.state}`); if (target.revisionId !== link.targetRevisionId) issues.push('target wording or structure changed; review again') }
    if (link.excerptId) { const excerpt = view.excerpts.find(e => e.id === link.excerptId); if (!excerpt) issues.push('excerpt missing'); else if (excerpt.versionId !== (view.sources.find(s => s.id === excerpt.sourceId)?.activeVersionId ?? null)) issues.push('excerpt belongs to an older source version') }
    if (link.review === 'needs_review') issues.push('marked for review')
    return issues
  }
  const activeSources = view?.sources.filter(s => s.state === 'active') ?? []
  const activeSections = view?.sections.filter(s => s.state === 'active') ?? []
  const activeClaims = view?.claims.filter(c => c.state === 'active') ?? []
  useEffect(()=>{dirtyChanged(draftPending)},[draftPending])
  useEffect(()=>()=>dirtyChanged(false),[])
  const filteredExcerpts = view?.excerpts.filter(e => e.sourceId === linkSource) ?? []
  const related = view?.links.filter(link => link.documentId === focusSection || view?.claims.some(c => c.id === link.claimId && c.documentId === focusSection)) ?? []
  const history = (entityType: 'question'|'claim'|'link'|'decision', entityKey: string): React.JSX.Element | null => { const rows = view?.revisions.filter(r => r.entityType === entityType && r.entityKey === entityKey) ?? []; return rows.length ? <details><summary>{rows.length} earlier revision{rows.length === 1 ? '' : 's'}</summary><ol>{rows.map(r => <li key={r.revisionId}>{r.createdAt.slice(0,19)} · {oldValue(r.snapshot)}</li>)}</ol></details> : null }

  return <section className="evidence-panel" aria-labelledby="evidence-title">
    <h2 id="evidence-title">Questions, claims and evidence</h2>
    <p>These are human-organized research relationships. A support link records your assessment, not proof. Actual citations in draft text are listed separately.</p>
    {draftPending?<p role="status">Research form edits are not saved yet. <button type="button" disabled={locked} onClick={discardDrafts}>Discard pending research form edits</button></p>:null}
    <div className="evidence-columns">
      <div>
        <h3>Research questions</h3>
        <button type="button" disabled={locked||readOnly} onClick={() => chooseItem('question',null)}>New question</button>
        <ul>{view?.questions.map(q => <li key={q.id}><button type="button" disabled={locked} aria-current={q.id === questionId ? 'true' : undefined} onClick={() => chooseItem('question',q)}>{q.text}</button> · {q.state}{q.documentId && view?.sections.find(s => s.id === q.documentId)?.revisionId !== q.documentRevisionId ? ' · section changed' : ''}</li>)}</ul>
        <label>Question <textarea value={questionText} maxLength={10000} onChange={e => setQuestionText(e.target.value)} rows={3} disabled={locked||readOnly} /></label>
        <label>Related section <select value={questionSection} onChange={e => setQuestionSection(e.target.value)} disabled={locked||readOnly}><option value="">None</option>{activeSections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        <label>Related note <select value={questionNote} onChange={e => setQuestionNote(e.target.value)} disabled={locked||readOnly}><option value="">None</option>{view?.notes.filter(n => n.state === 'active').map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
        <button type="button" disabled={locked||readOnly || !questionText.trim()} onClick={() => saveItem('question')}>{question ? 'Save question' : 'Create question'}</button>
        {question ? <><button type="button" disabled={locked||readOnly} onClick={() => void mutate({type:'updateQuestion',id:question.id,expectedRevisionId:question.revisionId,text:question.text,documentId:question.documentId,noteId:question.noteId,state:question.state === 'active' ? 'archived' : 'active'})}>{question.state === 'active' ? 'Archive question' : 'Restore question'}</button>{history('question',question.id)}</> : null}
      </div>
      <div>
        <h3>Claims</h3>
        <button type="button" disabled={locked||readOnly} onClick={() => chooseItem('claim',null)}>New claim</button>
        <ul>{view?.claims.map(c => <li key={c.id}><button type="button" disabled={locked} aria-current={c.id === claimId ? 'true' : undefined} onClick={() => chooseItem('claim',c)}>{c.text}</button> · {c.state}{c.documentId && view?.sections.find(s => s.id === c.documentId)?.revisionId !== c.documentRevisionId ? ' · section changed' : ''}</li>)}</ul>
        <label>Claim <textarea value={claimText} maxLength={10000} onChange={e => setClaimText(e.target.value)} rows={3} disabled={locked||readOnly} /></label>
        <label>Related section <select value={claimSection} onChange={e => setClaimSection(e.target.value)} disabled={locked||readOnly}><option value="">None</option>{activeSections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
        <label>Related note <select value={claimNote} onChange={e => setClaimNote(e.target.value)} disabled={locked||readOnly}><option value="">None</option>{view?.notes.filter(n => n.state === 'active').map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
        <button type="button" disabled={locked||readOnly || !claimText.trim()} onClick={() => saveItem('claim')}>{claim ? 'Save claim' : 'Create claim'}</button>
        {claim ? <><button type="button" disabled={locked||readOnly} onClick={() => void mutate({type:'updateClaim',id:claim.id,expectedRevisionId:claim.revisionId,text:claim.text,documentId:claim.documentId,noteId:claim.noteId,state:claim.state === 'active' ? 'archived' : 'active'})}>{claim.state === 'active' ? 'Archive claim' : 'Restore claim'}</button>{history('claim',claim.id)}</> : null}
      </div>
    </div>
    <h3>Question-specific source decision</h3>
    <p>Rejecting a source here does not remove it from another question, section, excerpt or actual citation.</p>
    <label>Question <select value={questionId ?? ''} onChange={e => chooseItem('question',view?.questions.find(q => q.id === e.target.value) ?? null)} disabled={locked}><option value="">Choose question</option>{view?.questions.map(q => <option key={q.id} value={q.id}>{q.text}</option>)}</select></label>
    <label>Source <select value={decisionSource} onChange={e => { if(decisionReason!==(selectedDecision?.reason??'')){setError('Save or discard the pending decision reason before selecting another source.');return}setDecisionSource(e.target.value); setDecisionReason(view?.decisions.find(d => d.questionId === questionId && d.sourceId === e.target.value)?.reason ?? '') }} disabled={locked || !question}><option value="">Choose source</option>{view?.sources.filter(s => s.state !== 'merged').map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
    <label>Reason <textarea value={decisionReason} maxLength={2000} onChange={e => setDecisionReason(e.target.value)} rows={2} disabled={locked||readOnly || !decisionSource} /></label>
    <div className="project-actions">{(['candidate','kept','rejected'] as const).map(state => <button type="button" key={state} disabled={locked||readOnly || !question || !decisionSource || state === 'rejected' && !decisionReason.trim()} onClick={() => void mutate({type:'decide',questionId:question!.id,sourceId:decisionSource,expectedRevisionId:selectedDecision?.revisionId ?? null,state,reason:decisionReason})}>{state === 'candidate' ? 'Mark candidate' : state === 'kept' ? 'Keep for this question' : 'Reject for this question'}</button>)}</div>
    {selectedDecision ? <div><p>Current decision: {selectedDecision.state}. {selectedDecision.reason}</p>{history('decision',`${selectedDecision.questionId}|${selectedDecision.sourceId}`)}</div> : null}
    <ul>{view?.decisions.filter(d => d.questionId === questionId).map(d => <li key={d.sourceId}>{title(view,d.sourceId)} · {d.state}{d.reason ? ` · ${d.reason}` : ''}</li>)}</ul>
    <h3>Link source evidence</h3>
    <div className="evidence-link-form">
      <label>Source <select value={linkSource} onChange={e => { setLinkSource(e.target.value); setLinkExcerpt('') }} disabled={locked||readOnly}><option value="">Choose source</option>{activeSources.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
      <label>Exact excerpt (optional) <select value={linkExcerpt} onChange={e => setLinkExcerpt(e.target.value)} disabled={locked||readOnly || !linkSource}><option value="">Whole source or potential use</option>{filteredExcerpts.map(e => <option key={e.id} value={e.id}>{e.quote.slice(0,100)} · {e.kind} · version {e.sha256.slice(0,8)}</option>)}</select></label>
      <label>Target type <select value={linkTargetKind} onChange={e => { setLinkTargetKind(e.target.value as 'claim'|'section'); setLinkTarget('') }} disabled={locked||readOnly}><option value="claim">Claim</option><option value="section">Section</option></select></label>
      <label>Target <select value={linkTarget} onChange={e => setLinkTarget(e.target.value)} disabled={locked||readOnly}><option value="">Choose target</option>{linkTargetKind === 'claim' ? activeClaims.map(c => <option key={c.id} value={c.id}>{c.text}</option>) : activeSections.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select></label>
      <label>Role <select value={linkRole} onChange={e => setLinkRole(e.target.value as EvidenceRole)} disabled={locked||readOnly}>{roles.map(role => <option key={role} value={role}>{role.replace('_',' ')}</option>)}</select></label>
      <button type="button" disabled={locked||readOnly || !linkSource || !linkTarget} onClick={() => { const revisionId = linkTargetKind === 'claim' ? view?.claims.find(c => c.id === linkTarget)?.revisionId : view?.sections.find(s => s.id === linkTarget)?.revisionId; if (!revisionId) { setError('Choose a current target.'); return } void mutate({type:'createLink',id:crypto.randomUUID(),sourceId:linkSource,excerptId:linkExcerpt || null,claimId:linkTargetKind === 'claim' ? linkTarget : null,documentId:linkTargetKind === 'section' ? linkTarget : null,expectedTargetRevisionId:revisionId,role:linkRole}) }}>Create manual evidence link</button>
    </div>
    <h3>Section to evidence</h3>
    <label>Section <select value={focusSection} onChange={e => { setFocusSection(e.target.value); setFocusSource('') }}><option value="">Choose section</option>{view?.sections.map(s => <option key={s.id} value={s.id}>{s.title} · {s.state}</option>)}</select></label>
    {focusSection ? <><p>Sources linked to this section in the source library: {view?.sourceSections.filter(x => x.documentId === focusSection).map(x => title(view,x.sourceId)).join('; ') || 'none'}.</p><p>Actual citation occurrences in current draft text: {view?.citations.filter(x => x.documentId === focusSection).length ?? 0}. Manual evidence links below are separate.</p><ul>{view?.citations.filter(x => x.documentId === focusSection).map(x => <li key={`${x.citationId}-${x.sourceId}`}>Actual citation: {title(view,x.sourceId)} <button type="button" onClick={() => void navigate(x.documentId,x.citationId)}>Go to citation</button></li>)}</ul><button type="button" onClick={() => void navigate(view?.sections.find(s => s.id === focusSection)?.replacementId ?? focusSection)}>Go to section{view?.sections.find(s => s.id === focusSection)?.replacementId ? ' replacement' : ''}</button></> : null}
    <h3>Source to sections and evidence</h3>
    <label>Source <select value={focusSource} onChange={e => { setFocusSource(e.target.value); setFocusSection('') }}><option value="">Choose source</option>{view?.sources.map(s => <option key={s.id} value={s.id}>{s.title} · {s.state}</option>)}</select></label>
    {focusSource ? <><ul>{view?.sourceSections.filter(x => x.sourceId === focusSource).map(x => <li key={x.documentId}><button type="button" onClick={() => void navigate(x.documentId)}>{section(view,x.documentId)}</button> · source-library use</li>)}</ul><p>Actual citation occurrences in current draft text: {view?.citations.filter(x => x.sourceId === focusSource).length ?? 0}. A manual link or rejection does not change them.</p><ul>{view?.citations.filter(x => x.sourceId === focusSource).map(x => <li key={`${x.documentId}-${x.citationId}`}>Actual citation in {section(view,x.documentId)} <button type="button" onClick={() => void navigate(x.documentId,x.citationId)}>Go to citation</button></li>)}</ul></> : null}
    <h3>Manual evidence links and provenance</h3>
    <ul>{(focusSection ? related : focusSource ? view?.links.filter(x => x.sourceId === focusSource) : view?.links)?.map(link => { const excerpt = view?.excerpts.find(e => e.id === link.excerptId),issues = linkStatus(link); return <li key={link.id} className="evidence-link"><p><strong>{link.role.replace('_',' ')}</strong> · {title(view!,link.sourceId)} → {link.claimId ? view?.claims.find(c => c.id === link.claimId)?.text ?? 'missing claim' : section(view!,link.documentId!)} · {link.state} · human {link.review}</p>{excerpt ? <blockquote>{excerpt.quote}</blockquote> : <p>Whole source; no exact excerpt attached.</p>}{excerpt ? <p>{excerpt.kind} · page {excerpt.pageIndex === 0 ? 'plain text' : excerpt.pageIndex ?? 'unavailable'} · original version {excerpt.sha256.slice(0,12)} <button type="button" onClick={() => inspect(excerpt.sourceId,excerpt.id)}>Go to exact excerpt</button></p> : null}{issues.length ? <p role="status">Review needed: {issues.join('; ')}.</p> : null}<p>Linked {link.createdAt.slice(0,19)} · last changed {link.updatedAt.slice(0,19)}. This is a manual relationship, not an actual citation.</p><label>Evidence role <select value={link.role} disabled={locked||readOnly} onChange={e => void mutate({type:'changeLink',id:link.id,expectedRevisionId:link.revisionId,role:e.target.value as EvidenceRole,review:'needs_review',state:link.state})}>{roles.map(role => <option key={role} value={role}>{role.replace('_',' ')}</option>)}</select></label><div className="project-actions"><button type="button" disabled={locked||readOnly} onClick={() => void mutate({type:'changeLink',id:link.id,expectedRevisionId:link.revisionId,role:link.role,review:'reviewed',state:'active'})}>Confirm against current target</button><button type="button" disabled={locked||readOnly} onClick={() => void mutate({type:'changeLink',id:link.id,expectedRevisionId:link.revisionId,role:link.role,review:'needs_review',state:link.state})}>Needs review</button><button type="button" disabled={locked||readOnly} onClick={() => void mutate({type:'changeLink',id:link.id,expectedRevisionId:link.revisionId,role:link.role,review:link.review,state:link.state === 'active' ? 'removed' : 'active'})}>{link.state === 'active' ? 'Remove link' : 'Restore link'}</button>{link.claimId ? <button type="button" onClick={() => chooseItem('claim',view?.claims.find(c => c.id === link.claimId) ?? null)}>Go to claim</button> : <button type="button" onClick={() => void navigate(view?.sections.find(s => s.id === link.documentId)?.replacementId ?? link.documentId!)}>Go to section</button>}</div>{history('link',link.id)}</li> })}</ul>
    {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}
  </section>
}
