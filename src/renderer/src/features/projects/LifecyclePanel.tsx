import { useState } from 'react'
import type { DataLocations } from '../../../../shared/project-lifecycle'
import type { OpenInput, OpenProject } from '../../../../shared/projects'

export function ProjectManagement({ project, disabled, archive, backup, move, duplicate }: {
  project: OpenProject; disabled: boolean; archive: () => void
  backup: () => void; move: () => void; duplicate: () => void
}): React.JSX.Element {
  return <section aria-labelledby="manage-heading">
    <h2 id="manage-heading">Project files and organization</h2>
    <div className="project-actions">
      <button disabled={disabled} onClick={backup}>Backup to new file…</button>
      <button disabled={disabled || !project.destination} onClick={move}>Move to new location…</button>
      <button disabled={disabled} onClick={duplicate}>Duplicate project</button>
      <button disabled={disabled} onClick={archive}>{project.archived ? 'Unarchive project' : 'Archive project'}</button>
    </div>
    <p>Backup leaves the save location unchanged. Move changes it only after reopening the new file and keeps the old file. Duplicate starts without a destination. Archive only changes this computer’s project list.</p>
  </section>
}

export function RecoveryPanel({ data, disabled, refresh, reveal, inspect, recoverReset, cleanup, reset, openProject }: {
  data: DataLocations | null; disabled: boolean; refresh: () => void; inspect: (id: string) => void
  reveal:()=>void
  openProject: (scope: OpenInput) => void; recoverReset: (id: string) => void; cleanup: () => void; reset: (review: string) => void
}): React.JSX.Element {
  const [confirmation, setConfirmation] = useState('')
  return <details className="recovery-panel" id="data-locations" tabIndex={-1}>
    <summary>Recovery, backups and Data Locations</summary>
    <p>Local recovery has no automatic expiry. Protect locally or Save acknowledges writing; unacknowledged keystrokes may be lost after force quit or power loss. Removing app data or using an uninstaller that removes it can destroy unsaved work.</p>
    <button disabled={disabled} onClick={refresh}>Refresh recovery and size</button>
    <button disabled={disabled} onClick={reveal}>Show local working and recovery folder</button>
    {data ? <>
      <p className="location-path">Working data and recovery: {data.root}</p>
      <p>{data.sizeComplete ? 'Approximate local size' : 'Partial local size (some items could not be counted)'}: {(data.bytes / 1048576).toFixed(1)} MiB. Includes working projects, retained archives, journals and reset recovery. Chosen files elsewhere are additional.</p>
      <p>{data.issues ? `${data.issues} interrupted or unreadable recovery entries remain retained. Open the related project to reconcile its destination, or inspect an available version below.` : 'Local discovery finished. Selected files are checked when opened; catalog entries do not prove current external availability.'}</p>
      <h3>Backups and retained versions</h3>
      <p>Inspection validates the archive and offers an independent copy. Current work and original files stay intact.</p>
      {data.items.length ? <ul className="project-list">{data.items.map(item => <li key={item.id}>
        <p>{item.kind}{item.projectId ? ` · project ${item.projectId.slice(0, 8)}` : ''}{item.head ? ` · revision ${item.head.slice(0, 8)}` : ''}</p>
        <p className="location-path">{item.path}</p><p>{item.status}</p>
        <button disabled={disabled} onClick={() => inspect(item.id)}>Inspect and restore copy</button>
      </li>)}</ul> : <p>No retained portable versions found. Local projects remain recoverable in the project list above.</p>}
      {data.resets.length ? <><h3>Reset recovery</h3><ul>{data.resets.map(batch => <li key={batch.id}>{batch.projects} projects · {batch.id.slice(0, 8)} <button disabled={disabled} onClick={() => recoverReset(batch.id)}>Recover these projects</button></li>)}</ul></> : null}
      <h3>Cleanup</h3>
      <p>There are no disposable content caches in this version. Clear picker history only removes the remembered picker folder. It cannot remove projects, backups, journals or retained versions. No automatic blob deletion is performed.</p>
      <button disabled={disabled} onClick={cleanup}>Clear picker history</button>
      <details>
        <summary>Reset local work</summary>
        <p>Review every affected project below. Open each project and use Save or Backup before resetting if you need a copy outside this computer. Reset removes these projects from the active list and clears picker history, but retains a recoverable local copy. It does not erase chosen files or reclaim recovery space.</p>
        <ol>{data.projects.projects.map(project => <li key={project.projectId}>
          {project.title} · {project.projectId.slice(0, 8)}{project.archived ? ' · archived' : ''} · last local commit {new Date(project.updatedAt).toLocaleString()}.
          {' '}{!project.destination ? 'No destination; this computer holds the only known copy.' : project.destination.headCommitId !== project.headCommitId ? `Newer local work; last assigned file: ${project.destination.path}` : `Assigned file (availability not confirmed here): ${project.destination.path}`}
          <button disabled={disabled} onClick={() => openProject({ projectId: project.projectId, workspaceId: project.workspaceId })}>Open to Save or Backup</button>
        </li>)}</ol>
        {data.projects.issues.length ? <p role="alert">Unreadable projects prevent reset. Their original files remain retained.</p> : null}
        <label htmlFor="reset-confirmation">Type RESET LOCAL WORK to acknowledge removing these projects from the active list</label>
        <input id="reset-confirmation" value={confirmation} disabled={disabled} onChange={event => setConfirmation(event.target.value)} autoComplete="off" />
        <button disabled={disabled || confirmation !== 'RESET LOCAL WORK' || !!data.projects.issues.length || !data.projects.projects.length} onClick={() => { setConfirmation(''); reset(data.review) }}>Review reset in native dialog…</button>
      </details>
    </> : <p>Recovery details are loading or unavailable. Existing work is retained.</p>}
  </details>
}
