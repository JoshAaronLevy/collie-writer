import { useState } from 'react'
import type { DataLocations } from '../../../../shared/project-lifecycle'
import type { OpenInput, OpenProject } from '../../../../shared/projects'
import { AppButton } from '../../components/ui/Controls'
import { TextInput } from '@mantine/core'
import { projectTypes, templateForKind } from '../../../../domain/projects/templates'
import styles from './ProjectManagement.module.css'
import recoveryStyles from './RecoveryPanel.module.css'

export function ProjectManagement({ project, disabled, archive, backup, move, duplicate, restore }: {
  project: OpenProject; disabled: boolean; archive: () => void
  backup: () => void; move: () => void; duplicate: () => void; restore: () => void
}): React.JSX.Element {
  return <section className={styles['project-management-container']} aria-labelledby="manage-heading">
    <h2 id="manage-heading">Copies and organization</h2>
    <p>These actions keep the original project and its writing unless you explicitly change its local organization or selected file location.</p>
    <div className={styles['project-management-grid']}>
      <div className={styles['project-management-action']}>
        <h3>Keep another copy</h3>
        <p>Backup writes a separate file without changing this project's Save destination. Duplicate creates a new local project with its own identity and no file destination.</p>
        <div className={styles['project-management-buttons']}>
          <AppButton variant="default" disabled={disabled} onClick={backup}>Backup to new file…</AppButton>
          <AppButton variant="default" disabled={disabled} onClick={duplicate}>Duplicate project</AppButton>
        </div>
      </div>
      <div className={styles['project-management-action']}>
        <h3>Location and visibility</h3>
        <p>Move selects a new file location and retains the old file. Archive only hides this project from active library views on this computer; it does not delete it.</p>
        <div className={styles['project-management-buttons']}>
          <AppButton variant="default" disabled={disabled || !project.destination} onClick={move}>Move to new location…</AppButton>
          <AppButton variant="default" disabled={disabled} onClick={archive}>{project.archived ? 'Unarchive project' : 'Archive project'}</AppButton>
        </div>
      </div>
    </div>
    <div className={styles['project-management-restore']}>
      <p>Have a backup file? Restore validates it and opens an independent project. The original remains available.</p>
      <AppButton variant="subtle" disabled={disabled} onClick={restore}>Restore backup as new project…</AppButton>
    </div>
  </section>
}

export function RecoveryPanel({ data, disabled, refresh, reveal, inspect, recoverReset, cleanup, reset, openProject }: {
  data: DataLocations | null; disabled: boolean; refresh: () => void; inspect: (id: string) => void
  reveal:()=>void
  openProject: (scope: OpenInput) => void; recoverReset: (id: string) => void; cleanup: () => void; reset: (review: string) => void
}): React.JSX.Element {
  const [confirmation, setConfirmation] = useState('')
  return <details className={recoveryStyles['recovery-panel']} id="data-locations" tabIndex={-1}>
    <summary>Recovery, backups and retained versions</summary>
    <p>Review local recovery and separate files before restoring a copy. Inspection never replaces current writing.</p>
    <div className={recoveryStyles['recovery-actions']}>
      <AppButton variant="default" disabled={disabled} onClick={refresh}>Refresh recovery</AppButton>
      <AppButton variant="subtle" disabled={disabled} onClick={reveal}>Show local working folder</AppButton>
    </div>
    {data ? <>
      <p className={recoveryStyles['recovery-path']}>Working data and recovery: {data.root}</p>
      <p>{data.sizeComplete ? 'Approximate local size' : 'Partial local size (some items could not be counted)'}: {(data.bytes / 1048576).toFixed(1)} MiB. Includes working projects, retained archives, journals and reset recovery. Chosen files elsewhere are additional.</p>
      <p>{data.issues ? `${data.issues} interrupted or unreadable recovery entries remain retained. Open the related project to reconcile its destination, or inspect an available version below.` : 'Local discovery finished. Selected files are checked when opened; catalog entries do not prove current external availability.'}</p>
      <h3>Backups and retained versions</h3>
      <p>Inspection validates the archive and offers an independent copy. Current work and original files stay intact.</p>
      {data.items.length ? <ul className={recoveryStyles['recovery-version-list']}>{data.items.map(item => <li key={item.id}>
        <strong>{item.kind === 'backup' ? 'Backup file' : item.kind === 'previous' ? 'Previous selected-file copy' : item.kind === 'candidate' ? 'Retained local snapshot' : 'Retained incoming file'}</strong>
        <p className={recoveryStyles['recovery-path']}>{item.path}</p><p>{item.status}</p>
        <AppButton variant="default" disabled={disabled} onClick={() => inspect(item.id)}>Inspect and restore copy</AppButton>
      </li>)}</ul> : <p>No retained portable versions found. Local projects remain recoverable in the project list above.</p>}
      {data.resets.length ? <><h3>Reset recovery</h3><ul className={recoveryStyles['reset-recovery-list']}>{data.resets.map(batch => <li key={batch.id}>{batch.projects} projects retained from a local reset <AppButton variant="default" disabled={disabled} onClick={() => recoverReset(batch.id)}>Recover these projects</AppButton></li>)}</ul></> : null}
      <details className={recoveryStyles['recovery-advanced']}>
        <summary>Picker history and recovery limits</summary>
        <p>Local recovery has no automatic expiry. Unacknowledged keystrokes may be lost after force quit or power loss. Removing app data can destroy unsaved work. There are no disposable content caches; picker history is only a folder hint.</p>
        <AppButton variant="default" disabled={disabled} onClick={cleanup}>Clear picker history</AppButton>
      </details>
      <details>
        <summary>Reset local work</summary>
        <p>Review every affected project below. Open each project and use Save or Backup before resetting if you need a copy outside this computer. Reset removes these projects from the active list and clears picker history, but retains a recoverable local copy. It does not erase chosen files or reclaim recovery space.</p>
        <ol>{data.projects.projects.map(project => <li key={project.projectId}>
          {project.title} · {projectTypes[templateForKind(project.projectKind)].name}{project.archived ? ' · archived' : ''} · last local commit {new Date(project.updatedAt).toLocaleString()}.
          {' '}{!project.destination ? 'No destination; this computer holds the only known copy.' : project.destination.headCommitId !== project.headCommitId ? `Newer local work; last assigned file: ${project.destination.path}` : `Assigned file (availability not confirmed here): ${project.destination.path}`}
          <AppButton variant="subtle" disabled={disabled} onClick={() => openProject({ projectId: project.projectId, workspaceId: project.workspaceId })}>Open to Save or Backup</AppButton>
        </li>)}</ol>
        {data.projects.issues.length ? <p role="alert">Unreadable projects prevent reset. Their original files remain retained.</p> : null}
        <TextInput id="reset-confirmation" label="Type RESET LOCAL WORK to acknowledge removing these projects from the active list" value={confirmation} disabled={disabled} onChange={event => setConfirmation(event.target.value)} autoComplete="off" />
        <AppButton variant="default" disabled={disabled || confirmation !== 'RESET LOCAL WORK' || !!data.projects.issues.length || !data.projects.projects.length} onClick={() => { setConfirmation(''); reset(data.review) }}>Review reset in native dialog…</AppButton>
      </details>
    </> : <p>Recovery details are loading or unavailable. Existing work is retained.</p>}
  </details>
}
