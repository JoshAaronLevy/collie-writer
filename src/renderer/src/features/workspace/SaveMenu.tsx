import { IconDeviceFloppy, IconChevronDown } from '@tabler/icons-react'
import { AppButton } from '../../components/ui/Controls'
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
      <AppButton
        className={styles['save-button']}
        variant="default"
        leftSection={<IconDeviceFloppy size={18} aria-hidden="true" />}
        pending={saving}
        disabled={disabled}
        aria-label={unconfirmed ? 'Retry pending Save' : saving ? 'Saving project' : 'Save'}
        onClick={() => run(() => save(false))}
      >
        {saving ? 'Saving…' : unconfirmed ? 'Retry Save' : 'Save'}
      </AppButton>
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
            label: 'File details and project actions',
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
