import {
  IconDeviceFloppy,
  IconChevronDown,
  IconHourglass,
  IconAlertTriangle
} from '@tabler/icons-react'
import { IconButton } from '../../components/ui/IconButton'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { sameScope } from '../../../../shared/project-files'
import { useWorkspaceSession } from './workspaceContext'
import styles from './SaveMenu.module.css'

export default function SaveMenu(): React.JSX.Element {
  const {
    project,
    files,
    available,
    busy,
    acting,
    closing,
    navigating,
    fileActive,
    saveState,
    run,
    save,
    openFile,
    lifecycleFile,
    workspace,
    navigate
  } = useWorkspaceSession()
  const disabled =
    !project ||
    !sameScope(project, files.scope) ||
    !available ||
    busy ||
    acting ||
    closing ||
    navigating ||
    fileActive
  const saving = saveState === 'saving'
  const unconfirmed = saveState === 'unconfirmed'
  return (
    <div className={styles['save-menu']} role="group" aria-label="Save project">
      <IconButton
        className={styles['save-button']}
        variant="default"
        pending={saving}
        disabled={disabled}
        label={unconfirmed ? 'Retry pending Save' : saving ? 'Saving project' : 'Save'}
        description={
          saving
            ? 'Saving project. Open Save options for progress and available cancellation.'
            : unconfirmed
              ? 'Retry pending Save. Check the same request before saving newer edits.'
              : 'Save the project to its selected file, or choose a file on first Save.'
        }
        onClick={() => run(() => save(false))}
      >
        <IconDeviceFloppy aria-hidden="true" />
        {saving || unconfirmed ? (
          <span className={styles['save-state']} aria-hidden="true">
            {saving ? <IconHourglass /> : <IconAlertTriangle />}
          </span>
        ) : null}
      </IconButton>
      <ActionMenu
        label="Save options"
        icon={<IconChevronDown aria-hidden="true" />}
        triggerClassName={styles['save-options']}
        actions={[
          {
            id: 'save-as',
            label: 'Save As…',
            disabled: disabled || unconfirmed,
            onSelect: () => run(() => save(true))
          },
          {
            id: 'backup',
            label: 'Make a separate backup…',
            disabled: disabled || unconfirmed,
            onSelect: () => run(() => lifecycleFile('backup'))
          },
          {
            id: 'locate',
            label: 'Locate moved file…',
            disabled: disabled || unconfirmed || !files.destination,
            onSelect: () => run(() => openFile(false, true))
          },
          {
            id: 'details',
            label:
              fileActive || saving
                ? 'View file progress and actions'
                : 'File details and project actions',
            disabled: !project || closing || navigating,
            onSelect: () => {
              const next = workspace('details')
              if (next) void navigate(next)
            }
          }
        ]}
      />
    </div>
  )
}
