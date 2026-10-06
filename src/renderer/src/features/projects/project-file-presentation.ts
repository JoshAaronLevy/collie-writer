import { fileBusy, type FileStatus } from '../../../../shared/project-files'

export function projectFileStatusMessage(status: FileStatus, dirty: boolean): string {
  const messages: Record<FileStatus['state'], string> = {
    unsaved: dirty
      ? 'No project file selected. Use Save to choose a location.'
      : 'Protected locally · no project file selected. Use Save to choose a location.',
    checking: 'Checking the selected file…',
    saved: dirty
      ? 'The selected file contains the last saved project.'
      : 'Saved to the selected file on this device.',
    pending: dirty
      ? 'Local changes have not been saved to the selected file. Use Save to update it.'
      : 'Changes are protected locally. Use Save to update the selected file.',
    'external-change':
      'The selected file differs from its last saved version. Save writes your current local project.',
    unavailable: 'Selected file unavailable. Local recovery remains on this computer.',
    interrupted:
      'A previous file operation was interrupted. Review retained versions in Data and recovery.'
  }
  const message =
    fileBusy(status.job) && status.job?.kind === 'save'
      ? 'Saving a captured project to the selected location…'
      : messages[status.state]
  return dirty ? `New typing still needs local protection. ${message}` : message
}
