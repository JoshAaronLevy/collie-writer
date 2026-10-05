import { AppButton } from '../../components/ui/Controls'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { sameScope } from '../../../../shared/project-files'
import { useWorkspaceSession } from './WorkspaceSession'
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
  return (
    <div className={styles['save-menu']}>
      <AppButton variant="default" disabled={disabled} onClick={() => run(() => save(false))}>
        Save
      </AppButton>
      <ActionMenu
        label="Save options"
        actions={[
          { id: 'save-as', label: 'Save As…', disabled, onSelect: () => run(() => save(true)) },
          {
            id: 'backup',
            label: 'Make a separate backup…',
            disabled,
            onSelect: () => run(() => lifecycleFile('backup'))
          },
          {
            id: 'locate',
            label: 'Locate moved file…',
            disabled: disabled || !files.destination,
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
