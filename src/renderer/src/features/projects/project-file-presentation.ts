import { fileBusy, sameScope, type FileStatus } from '../../../../shared/project-files'
import type { OpenInput, ProjectListing } from '../../../../shared/projects'

export type SavePresentation = 'idle' | 'saving' | 'unconfirmed'

export function projectFileNeedsAttention(status: FileStatus, scope: OpenInput | null): boolean {
  return (
    !!scope &&
    sameScope(scope, status.scope) &&
    (['external-change', 'unavailable', 'interrupted'].includes(status.state) ||
      (status.job?.kind === 'save' &&
        sameScope(scope, status.job.scope) &&
        status.job.state === 'failed'))
  )
}

export function savePresentation(
  scope: OpenInput | null,
  status: FileStatus,
  requestedScope: OpenInput | null,
  pendingScope: OpenInput | null
): SavePresentation {
  if (!scope) return 'idle'
  if (
    (requestedScope && sameScope(scope, requestedScope)) ||
    (status.job?.kind === 'save' && sameScope(scope, status.job.scope) && fileBusy(status.job))
  )
    return 'saving'
  return pendingScope && sameScope(scope, pendingScope) ? 'unconfirmed' : 'idle'
}

export function projectFilePresentation(
  project: ProjectListing | null,
  status: FileStatus,
  dirty = false,
  saveState: SavePresentation = 'idle'
): { label: string; detail: string; saveLabel: string } {
  const current = !!project && sameScope(project, status.scope)
  const destination = current ? status.destination : project?.destination
  const name = destination?.path.split(/[/\\]/).pop() ?? 'project file'
  const state = current ? status.state : !destination ? 'unsaved' : 'recorded'
  const failed =
    current &&
    status.job?.kind === 'save' &&
    sameScope(project, status.job.scope) &&
    status.job.state === 'failed'
  const saving = current && saveState === 'saving'
  const retry =
    current &&
    (saveState === 'unconfirmed' || failed || state === 'interrupted' || state === 'unavailable')
  const messages = {
    unsaved: ['No project file yet', 'First Save asks where to put your .collie file.'],
    checking: ['Checking project file…', 'Checking the file at its saved location.'],
    saved: [`Saved to ${name}`, 'Closing keeps local work. Save updates the project file.'],
    recorded: [`Last saved to ${name}`, 'File availability is checked when opened.'],
    pending: [
      'Unsaved changes',
      'Save updates the project file. Closing keeps changes on this computer.'
    ],
    'external-change': [
      'Project file changed',
      'Save replaces this file with your local work and retains the previous version. Use Save As to keep both files.'
    ],
    unavailable: [
      'Project file unavailable',
      'Reconnect its location, locate the file, or use Save As to choose another location.'
    ],
    interrupted: [
      'Save not confirmed',
      'Open Project recovery to check the earlier Save. Existing files are kept.'
    ]
  }
  const [label, detail] = saving
    ? ['Saving…', 'Edits made after this Save starts may need another Save.']
    : current && saveState === 'unconfirmed'
      ? ['Save not confirmed — Retry', 'Retry checks the same Save before saving newer changes.']
      : state === 'external-change' || state === 'interrupted'
        ? messages[state]
        : failed
          ? ['Couldn’t save — Retry', messages.unavailable[1]]
          : dirty && ['saved', 'recorded', 'pending'].includes(state)
            ? [
                'Unsaved changes',
                'Recent edits still need saving on this computer and to the project file.'
              ]
            : messages[state]
  return {
    label,
    detail,
    saveLabel: saving ? 'Saving…' : retry ? 'Retry Save' : destination ? 'Save' : 'Save…'
  }
}
