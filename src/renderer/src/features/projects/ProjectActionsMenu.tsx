import { useState } from 'react'
import { IconChevronDown } from '@tabler/icons-react'
import type { ProjectListing, OpenInput } from '../../../../shared/projects'
import type { ArchiveInput } from '../../../../shared/project-lifecycle'
import { sameScope } from '../../../../shared/project-files'
import { ActionMenu, type MenuAction } from '../../components/ui/ActionMenu'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { scopeOf } from '../workspace/useWorkspaceController'
import styles from './ProjectDialogs.module.css'

export default function ProjectActionsMenu({
  project,
  library = false,
  className
}: {
  project: ProjectListing
  library?: boolean
  className?: string
}): React.JSX.Element {
  const session = useWorkspaceSession()
  const [confirmation, setConfirmation] = useState<(ArchiveInput & { title: string }) | null>(null)
  const scope = scopeOf(project)
  const disabled =
    !session.available ||
    session.busy ||
    session.acting ||
    session.closing ||
    session.navigating ||
    session.fileActive ||
    session.startupPending
  const fileDisabled = disabled || session.saveState === 'unconfirmed'
  const current = sameScope(session.project, scope) && sameScope(session.files.scope, scope)

  function act(work: () => Promise<unknown> | void, target: OpenInput = scope): void {
    session.run(async () => {
      if (!sameScope(session.current.current, target)) await session.chooseProject(target)
      if (sameScope(session.current.current, target)) await work()
    })
  }
  const actions: MenuAction[] = [
    ...(library
      ? [
          {
            id: 'open',
            label: 'Open project',
            disabled,
            onSelect: () => session.run(() => session.chooseProject(scope))
          }
        ]
      : []),
    {
      id: 'details',
      label: 'Project details…',
      disabled,
      onSelect: () => act(() => session.setProjectDetailsOpen(true))
    },
    {
      id: 'save-as',
      label: 'Save As…',
      disabled: fileDisabled,
      onSelect: () => act(() => session.save(true))
    },
    {
      id: 'backup',
      label: 'Make a backup…',
      disabled: fileDisabled,
      onSelect: () => act(() => session.lifecycleFile('backup'))
    },
    {
      id: 'duplicate',
      label: 'Duplicate project',
      disabled: fileDisabled,
      onSelect: () => act(() => session.lifecycleFile('duplicate'))
    },
    {
      id: 'archive',
      label: project.archived ? 'Unarchive project…' : 'Archive project…',
      disabled,
      onSelect: () => {
        session.setError('')
        setConfirmation({ scope, archived: !project.archived, title: project.title })
      }
    }
  ]
  if (current && session.files.destination)
    actions.push(
      {
        id: 'reveal',
        label: 'Show project file',
        disabled,
        onSelect: () =>
          act(async () => {
            const result = await window.collie.revealProjectFile(scope)
            if (!result.ok) session.setError(result.error.message)
          })
      },
      ...(session.files.state === 'unavailable'
        ? [
            {
              id: 'locate',
              label: 'Locate project file…',
              disabled: fileDisabled,
              onSelect: () => act(() => session.openFile(false, true))
            }
          ]
        : []),
      {
        id: 'saved-version',
        label: 'View saved version…',
        disabled: fileDisabled,
        onSelect: () => act(() => session.openFile(true))
      }
    )
  if (library)
    actions.push({
      id: 'remove-local-copy',
      label: 'Remove local copy…',
      disabled: fileDisabled,
      onSelect: () => session.setLocalCopyTarget(scope)
    })
  else
    actions.push(
      {
        id: 'restore',
        label: 'Open backup…',
        disabled: fileDisabled,
        onSelect: () => act(() => session.lifecycleFile('restore'))
      },
      {
        id: 'import',
        label: 'Import document…',
        disabled,
        onSelect: () =>
          act(async () => {
            const next = session.workspace('details')
            if (next) await session.navigate(next)
          })
      }
    )
  return (
    <>
      <ActionMenu
        label="Project actions"
        accessibleLabel={`Actions for ${project.title}`}
        icon={library ? undefined : <IconChevronDown aria-hidden="true" />}
        triggerClassName={className}
        disabled={disabled}
        actions={actions}
      />
      <AppDialog
        opened={!!confirmation}
        onClose={() => setConfirmation(null)}
        title={confirmation?.archived ? 'Archive project' : 'Unarchive project'}
        dismissible={!disabled}
        size="sm"
      >
        <p>
          <strong>{confirmation?.title}</strong>
        </p>
        <p>
          {confirmation?.archived
            ? 'Hide this project from active Projects. You can reopen it from Archived; its files are kept.'
            : 'Return this project to All active in Projects.'}
        </p>
        {session.error ? <p role="alert">{session.error}</p> : null}
        <div className={styles['project-dialog-actions']}>
          <AppButton
            disabled={disabled}
            onClick={() => {
              const input = confirmation
              if (input)
                act(async () => {
                  if (await session.archive({ scope: input.scope, archived: input.archived }))
                    setConfirmation(null)
                }, input.scope)
            }}
          >
            {confirmation?.archived ? 'Archive project' : 'Unarchive project'}
          </AppButton>
          <AppButton variant="subtle" disabled={disabled} onClick={() => setConfirmation(null)}>
            Cancel
          </AppButton>
        </div>
      </AppDialog>
    </>
  )
}
