import NewProjectForm from '../project-details/NewProjectForm'
import ProjectDetailsForm from '../project-details/ProjectDetailsForm'
import '../projects/Projects.css'
import { templateNames, templateForKind } from '../../../../domain/projects/templates'
import { projectMessages } from '../../../../shared/projects'
import { sameProject } from '../../../../shared/access'
import type { DocumentPayload } from '../../../../domain/editor/schema'
import OutlinePanel from '../outline/OutlinePanel'
import HistoryPanel from '../outline/HistoryPanel'
import RichDraft from '../../editor/RichDraft'
import NotesPanel from '../projects/NotesPanel'
import SourcesPanel from '../projects/SourcesPanel'
import SourceInspector from '../projects/SourceInspector'
import EvidencePanel from '../projects/EvidencePanel'
import SearchPanel from '../projects/SearchPanel'
import CitationsPanel from '../projects/CitationsPanel'
import DocxExportPanel from '../projects/DocxExportPanel'
import InterchangeImportPanel from '../projects/InterchangeImportPanel'
import { ProjectManagement, RecoveryPanel } from '../projects/LifecyclePanel'
import AccessPanel from '../projects/AccessPanel'
import TutorialPanel from '../projects/TutorialPanel'
import SettingsPanel from '../settings/SettingsPanel'
import { useWorkspaceSession } from './WorkspaceSession'
import { scopeOf } from './useWorkspaceController'
import { RetainedRegion } from './RetainedRegion'
import { WorkspaceNavigation } from './WorkspaceNavigation'
import { AppButton } from '../../components/ui/Controls'
function readableDocument(payload: DocumentPayload): string {
  const pieces: string[] = []
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return
    if ('type' in value && value.type === 'text' && 'text' in value && typeof value.text === 'string') { pieces.push(value.text); return }
    if ('type' in value && value.type === 'hardBreak') { pieces.push('\n'); return }
    if ('content' in value && Array.isArray(value.content)) { for (const child of value.content) visit(child); if ('type' in value && ['paragraph','heading','tableRow'].includes(String(value.type))) pieces.push('\n') }
  }
  visit(payload.ast)
  return pieces.join('')
}

export default function WorkspaceViews(): React.JSX.Element {
  const { composition, drafts, actionTask, destination, storage, location, setLocation, list, project, access, sectionTitle, setSectionTitle, sectionStatus, setSectionStatus, sectionSynopsis, setSectionSynopsis,
sectionFields, busy, setBusy, acting, closing, committing, retry, setError, notice, setNotice, history, annotationCapture, noteDirty,
sourceDirty,
inspectionTarget, citationContext, setCitationContext, outlineRetry, conflict, data, showArchived, setShowArchived,
metaPending, current, editorRef, imageUrls, anchorToFocus, sectionReadOnly, dirty, fileActive, accessReadOnly, accessTransition, available,
updateProject, isDirty, changed, refresh, refreshData, importImage, navigateSection, navigateSearch, loadHistory, performOutline, saveSectionMeta, flush, flushManuscript,
run, waitActive, openFile, lifecycleFile, manage, resetLocal, captureAnnotation, afterNoteCommit, changeAccess, openTutorial, chooseProject, research, navigate, navigating, editorEpoch, setData, setList } = useWorkspaceSession()
  return <div className="projects">
<WorkspaceNavigation />
<div inert={navigating || closing} onCompositionStartCapture={() => { composition.current = true; drafts.changed() }} onCompositionEndCapture={() => { composition.current = false; drafts.changed() }}>
<RetainedRegion name="setup" label="New project">
<h1>New project</h1><NewProjectForm />    <div className="project-actions" id="new-project" tabIndex={-1}>
      <button disabled={!available || acting || fileActive || closing} onClick={() => run(() => openFile())}>Open project file…</button>
      <button disabled={!available || acting || fileActive || closing} onClick={() => run(() => lifecycleFile('restore'))}>Restore backup…</button>
      <button disabled={!available || acting || fileActive || closing} onClick={() => run(refreshData)}>Refresh projects</button>
    </div>

</RetainedRegion>
<RetainedRegion name="library" label="Projects">
<h1>Your projects</h1><div className="project-actions">
<AppButton onClick={() => { void navigate({kind:'setup'}) }}>New project</AppButton>
<AppButton variant="default" disabled={!available || acting || fileActive || closing} onClick={() => run(() => openFile())}>Open project file…</AppButton>
<AppButton variant="default" disabled={!available || acting || fileActive || closing} onClick={() => run(() => lifecycleFile('restore'))}>Restore backup…</AppButton>
<AppButton variant="subtle" disabled={!available || acting || fileActive || closing} onClick={() => run(refreshData)}>Refresh projects</AppButton>
</div>    <h2>Recent and recovered local projects</h2>
    <p>Each entry shows its last local commit. Open it to check the selected file and reconcile an interrupted save.</p>
    <label><input type="checkbox" checked={showArchived} onChange={event => setShowArchived(event.target.checked)} /> Show archived projects</label>
    <ul className="project-list">{list.projects.filter(p => showArchived || !p.archived).map(p => <li key={p.projectId}>
      <button aria-current={project?.projectId === p.projectId ? 'true' : undefined} disabled={!available || acting || fileActive || closing} onClick={() => run(() => chooseProject(scopeOf(p)))}>
        {p.title} · {templateNames[templateForKind(p.projectKind)]}{sameProject(p,access?.sampleProject??null)?' · tutorial sample':''}{p.archived ? ' · archived' : ''} <span className="project-id">{p.projectId.slice(0, 8)}</span>
        <small>{p.destination ? `${p.destination.path} · availability checked on open${p.headCommitId !== p.destination.headCommitId ? ' · newer edits protected locally' : ''}` : 'Local recovery · no file destination'} · {new Date(p.updatedAt).toLocaleString()}</small>
      </button>
    </li>)}</ul>
    {list.issues.map(issue => <p role="alert" key={issue.projectId}>Project {issue.projectId.slice(0, 8)}: {projectMessages[issue.code]}</p>)}

</RetainedRegion>
<RetainedRegion name="write" label="Writing">
    {project ? <div className="writing-inspection-layout"><div className="draft-panel">
      <h2>{project.title} · {project.projectId.slice(0, 8)}</h2>
      <OutlinePanel key={project.projectId} project={project} readOnly={accessReadOnly||accessTransition} disabled={busy || acting || closing || committing || fileActive} change={change => run(() => performOutline(change))} select={id => run(() => navigateSection(id))} />
      {sectionReadOnly ? <p role="status">This section is archived or in trash. Restore its outline item and any removed parent to edit it.</p> : null}
      <form className="section-details" onSubmit={event => { event.preventDefault(); run(saveSectionMeta) }}>
        <label>Section title <input value={sectionTitle} maxLength={500} required disabled={busy || closing || outlineRetry || sectionReadOnly || accessReadOnly || accessTransition || !!metaPending.current} onChange={event => { sectionFields.current.title = event.target.value; setSectionTitle(event.target.value); metaPending.current = null }} /></label>
        <label>Status <select value={sectionStatus} disabled={busy || closing || outlineRetry || sectionReadOnly || accessReadOnly || accessTransition || !!metaPending.current} onChange={event => { sectionFields.current.status = event.target.value as 'draft' | 'review' | 'complete'; setSectionStatus(sectionFields.current.status); metaPending.current = null }}><option value="draft">Draft</option><option value="review">Review</option><option value="complete">Complete</option></select></label>
        <label>Synopsis <textarea value={sectionSynopsis} maxLength={10000} disabled={busy || closing || outlineRetry || sectionReadOnly || accessReadOnly || accessTransition || !!metaPending.current} onChange={event => { sectionFields.current.synopsis = event.target.value; setSectionSynopsis(event.target.value); metaPending.current = null }} /></label>
        <button type="submit" disabled={busy || acting || closing || sectionReadOnly || accessReadOnly || accessTransition}>{metaPending.current ? 'Retry section details' : 'Save section details'}</button>
      </form>
      <RichDraft key={`${project.projectId}-${project.documentId}-${editorEpoch}`} payload={project.payload} references={{focusAnchor:anchorToFocus.current,projectId:project.projectId,sources:citationContext?.projectId===project.projectId?citationContext.sources:[],labels:new Map(!dirty&&citationContext?.projectId===project.projectId&&citationContext.view?.headCommitId===project.headCommitId?citationContext.view.labels.map(label=>[label.id,label.text]):[])}} disabled={busy || closing || outlineRetry || sectionReadOnly || accessReadOnly || accessTransition || storage.state !== 'ready'} onReady={editor => { editorRef.current = editor; if (editor && anchorToFocus.current) { const id = anchorToFocus.current; anchorToFocus.current = null; let target: number | null = null; editor.state.doc.descendants((node,position) => { if (node.attrs.blockId === id || node.attrs.citationId === id || node.attrs.footnoteId === id) { target = position; return false }; return true }); if (target !== null) { editor.commands.setTextSelection(Math.min(target+1,editor.state.doc.content.size)); editor.commands.focus(); editor.view.dispatch(editor.state.tr.scrollIntoView()) } else setError('The exact passage is no longer present in this section.') } }} onChange={changed} onIssue={setError} onBlur={() => { if (isDirty() && !actionTask.current) void flushManuscript() }} imageUrl={assetId => imageUrls.current.get(assetId)} importImage={() => run(importImage)} />
        <button type="button" disabled={busy || closing || sectionReadOnly || accessReadOnly || accessTransition} onMouseDown={event => event.preventDefault()} onClick={() => { void captureAnnotation() }}>Annotate selection</button>
        <div className="project-actions"><button disabled={busy || committing || closing || outlineRetry || sectionReadOnly || (!accessTransition && accessReadOnly) || !dirty || storage.state !== 'ready'} onClick={() => { void flush().then(() => refresh()) }}>{committing ? 'Protecting…' : retry ? 'Retry local commit' : 'Protect locally'}</button>
        <button onClick={() => { editorRef.current?.commands.focus(); editorRef.current?.commands.selectAll() }}>Select all for copying</button></div>
        <p>For an emergency copy, select this section and use your system Copy command, then paste into another local document.</p>
      <p role="status">{notice}</p>
      {conflict ? <details className="conflict-panel" open><summary>Stored version differs from this visible draft</summary><p>Keep this draft open for copying. The stored section below is a separate read-only copy; Collie Writer has not overwritten either version.</p><textarea readOnly aria-label="Stored section text for copying" value={readableDocument(conflict.payload)} /></details> : null}
    </div></div> : <p>Open a project from Projects to begin writing.</p>}
</RetainedRegion>
<RetainedRegion name="research-inspector" label="Source inspector">
{project && inspectionTarget ?<SourceInspector readOnly={accessReadOnly||accessTransition} key={`${project.projectId}-${inspectionTarget.sourceId}`} project={project} sourceId={inspectionTarget.sourceId} focusExcerptId={inspectionTarget.excerptId} focusVersionId={inspectionTarget.versionId} focusPageIndex={inspectionTarget.pageIndex} disabled={busy||closing||outlineRetry||sourceDirty||storage.state!=='ready'} onCommitted={afterNoteCommit} close={() => research({ kind: 'sources' })} />:null}
</RetainedRegion>
<RetainedRegion name="research-notes" label="Notes and annotations">
{project ? <NotesPanel key={project.projectId} project={project} capture={annotationCapture} focusNoteId={destination.kind==='workspace'&&destination.view==='research'&&destination.target.kind==='notes'?destination.target.noteId??null:null} disabled={accessReadOnly || accessTransition || busy || closing || outlineRetry || storage.state !== 'ready'} onCommitted={afterNoteCommit} navigate={(id,anchor) => navigateSection(id,anchor)} /> : null}
</RetainedRegion>
<RetainedRegion name="research-sources" label="Sources">
{project ? <SourcesPanel readOnly={accessReadOnly||accessTransition} key={project.projectId} project={project} focusSourceId={destination.kind==='workspace'&&destination.view==='research'&&destination.target.kind==='sources'?destination.target.sourceId??null:null} disabled={busy || closing || outlineRetry || storage.state !== 'ready'} onCommitted={afterNoteCommit} onInspect={sourceId=>research({kind:'inspector',sourceId})} /> : null}
</RetainedRegion>
<RetainedRegion name="research-evidence" label="Questions and claims">
{project ? <EvidencePanel readOnly={accessReadOnly||accessTransition} key={project.projectId} project={project} focusItem={destination.kind==='workspace'&&destination.view==='research'&&destination.target.kind==='evidence'?destination.target.item??null:null} disabled={busy || closing || outlineRetry || noteDirty || sourceDirty || storage.state !== 'ready'} onCommitted={afterNoteCommit} navigate={(id,anchor)=>navigateSection(id,anchor)} inspect={(sourceId,excerptId)=>research({kind:'inspector',sourceId,excerptId})} /> : null}
</RetainedRegion>
<RetainedRegion name="search" label="Project search">
{project ? <SearchPanel key={project.projectId} project={project} navigate={navigateSearch} /> : null}
</RetainedRegion>
<RetainedRegion name="export" label="Export">
{project ? <CitationsPanel readOnly={accessReadOnly||accessTransition} key={project.projectId} project={project} dirty={dirty} disabled={busy||closing||acting||fileActive||storage.state!=='ready'} flush={flush} onCommitted={afterNoteCommit} onContext={(sources,view)=>setCitationContext({projectId:project.projectId,sources,view})} navigate={navigateSection} source={sourceId=>research({kind:'sources',sourceId})} /> : null}
{project ? <DocxExportPanel paid={access?.paid??false} key={project.projectId} project={project} disabled={busy||closing||acting||fileActive||storage.state!=='ready'} flush={flush} onProject={updateProject} /> : null}
</RetainedRegion>
<RetainedRegion name="history" label="Manuscript history">
{project ? <HistoryPanel key={project.projectId} project={project} readOnly={accessReadOnly||accessTransition} history={history} disabled={busy || acting || closing || committing || fileActive} change={change => run(() => performOutline(change))} read={id => run(() => loadHistory(id))} navigate={(doc,anchor) => run(() => navigateSection(doc,anchor))} /> : null}
</RetainedRegion>
<RetainedRegion name="details" label="Project actions">
{project?<ProjectDetailsForm key={project.projectId} project={project} disabled={busy||acting||closing||fileActive||storage.state!=='ready'} readOnly={accessReadOnly||accessTransition}/>:null}
{project ? <ProjectManagement key={`${project.projectId}-${project.title}`} project={project} disabled={!available || acting || fileActive || closing} archive={() => run(() => manage())} backup={() => run(() => lifecycleFile('backup'))} move={() => run(() => lifecycleFile('move'))} duplicate={() => run(() => lifecycleFile('duplicate'))} /> : null}
{project ? <InterchangeImportPanel key={`import-${project.projectId}`} project={project} disabled={busy||closing||acting||fileActive||accessReadOnly||accessTransition||storage.state!=='ready'} flush={flush} onProject={updateProject} /> : null}
</RetainedRegion>
<RetainedRegion name="settings-appearance" label="Appearance and privacy">
<SettingsPanel />
</RetainedRegion>
<RetainedRegion name="settings-access" label="Collie access">
<AccessPanel access={access} project={project} list={list} disabled={!available||busy||acting||fileActive||closing} designate={()=>run(()=>changeAccess('designate'))} finish={()=>run(()=>changeAccess('finish'))} importGrant={()=>run(()=>changeAccess('import'))}/>
</RetainedRegion>
<RetainedRegion name="settings-data" label="Data and recovery">
    {!location ? <p role="status">Finding the local working folder…</p> : <details className="working-location" open={location.state === 'required'}>
      <summary>Working-data location</summary><p>{location.message}</p>
      {location.path ? <p className="location-path">{location.path}</p> : <button disabled={acting} onClick={() => run(async () => { const result = await window.collie.chooseWorkingLocation(); if (result.ok) setLocation(result.value); else setError(result.error.message) })}>Choose local working folder…</button>}
      <p>Keep this folder outside sync or mirroring tools. Portable files can go in your chosen local cloud folders.</p>
    </details>}
    {storage.state === 'unavailable' ? <p role="alert">The storage process is unavailable. Keep this window open and copy any unprotected text before quitting.</p> : null}
    <RecoveryPanel data={data} openProject={scope => run(async () => { await chooseProject(scope); await waitActive(); await refreshData() })} disabled={!available || acting || fileActive || closing} refresh={() => run(refreshData)} reveal={()=>run(async()=>{const result=await window.collie.revealWorkingData();if(!result.ok)setError(result.error.message)})} inspect={id => run(() => lifecycleFile('recover', id))} reset={review => run(() => resetLocal(review))} recoverReset={id => run(async () => {
      setBusy(true); if (current.current && !await flush(false, 'replace')) return
      const result = await window.collie.recoverReset(id)
      if (result.ok) { setData(result.value); setList(result.value.projects) } else setError(result.error.message)
    })} cleanup={() => run(async () => {
      const result = await window.collie.clearPickerHistory()
      if (result.ok) { setData(result.value); setList(result.value.projects); setNotice('Picker history cleared. All work and retained recovery were kept.') } else setError(result.error.message)
    })} />

</RetainedRegion>
<RetainedRegion name="help-tutorial" label="Tutorial">
<TutorialPanel ready={!!access?.sampleProject&&list.projects.some(p=>sameProject(p,access?.sampleProject??null))} active={!!project&&sameProject(project,access?.sampleProject??null)} disabled={!available||busy||acting||fileActive||closing} start={()=>run(()=>openTutorial(false))} reset={()=>run(()=>openTutorial(true))}/>
</RetainedRegion>
</div>
</div>
}
