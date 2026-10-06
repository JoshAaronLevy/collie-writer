import { useState } from 'react'
import { TextInput } from '@mantine/core'
import { Archive, FolderOpen, MoreHorizontal, RotateCcw } from 'lucide-react'
import { canEditProject, sameProject } from '../../../../shared/access'
import { sameScope } from '../../../../shared/project-files'
import { projectMessages, type ProjectSummary } from '../../../../shared/projects'
import { projectTypes, templateForKind } from '../../../../domain/projects/templates'
import { ActionMenu } from '../../components/ui/ActionMenu'
import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { scopeOf } from '../workspace/useWorkspaceController'
import styles from './ProjectLibrary.module.css'

const dates = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})

export default function ProjectLibrary(): React.JSX.Element {
  const session = useWorkspaceSession()
  const [query, setQuery] = useState('')
  const {
    list,
    libraryView,
    setLibraryView,
    libraryIssue,
    startupPending,
    access,
    project,
    files
  } = session
  const active = list.projects.filter((item) => !item.archived)
  const archived = list.projects.filter((item) => item.archived)
  const source =
    libraryView === 'archived' ? archived : libraryView === 'recent' ? active.slice(0, 8) : active
  const normalized = query.trim().toLocaleLowerCase()
  const visible = source.filter(
    (item) =>
      !normalized ||
      `${item.title} ${projectTypes[templateForKind(item.projectKind)].name}`
        .toLocaleLowerCase()
        .includes(normalized)
  )
  const unavailable =
    !session.available ||
    session.acting ||
    session.fileActive ||
    session.closing ||
    session.navigating ||
    startupPending
  const recoveryAttentionCount =
    (session.data?.resets.length ?? 0) + (session.data?.issues ?? 0) + list.issues.length

  function status(item: ProjectSummary): string {
    const typing = !!project && sameScope(project, item) && session.dirty
    if (!item.destination)
      return typing
        ? 'New typing needs local protection · no project file yet'
        : 'Protected on this device · no project file yet'
    if (project && sameScope(project, item) && sameScope(files.scope, item)) {
      if (files.state === 'checking')
        return 'Checking the selected file · local work remains available'
      if (files.state === 'external-change')
        return 'Selected file differs · Save writes your local work'
      if (files.state === 'unavailable')
        return 'Selected file unavailable · local work remains available'
      if (files.state === 'interrupted') return 'Interrupted file operation · review recovery'
      if (files.state === 'pending')
        return typing
          ? 'Unsaved changes · new typing needs local protection'
          : 'Unsaved changes · protected on this device'
      if (files.state === 'saved')
        return typing
          ? 'New typing needs local protection · selected file contains the last Save'
          : 'Saved to selected file on this device'
    }
    if (typing) return 'New typing needs local protection · selected-file status not yet confirmed'
    return item.headCommitId === item.destination.headCommitId
      ? 'Selected file recorded · availability checked when opened'
      : 'Newer work protected locally · selected file is older'
  }

  return (
    <section
      className={styles['project-library-container']}
      aria-labelledby="project-library-heading"
    >
      <div className={styles['project-library-heading']}>
        <div>
          <p className={styles['project-library-eyebrow']}>Your writing</p>
          <h1 id="project-library-heading">Projects</h1>
          <p>
            Pick up where you left off, or begin something new. A .collie file opens a whole saved
            project, including its research and conversations.
          </p>
        </div>
        <div className={styles['project-library-primary-actions']}>
          <AppButton
            disabled={startupPending || session.acting || session.closing || session.navigating}
            onClick={() => {
              void session.navigate({ kind: 'setup' })
            }}
          >
            New project
          </AppButton>
          <AppButton
            variant="default"
            disabled={unavailable}
            onClick={() => session.run(() => session.openFile())}
          >
            Open project file…
          </AppButton>
        </div>
      </div>

      {libraryIssue ? (
        <StatusBanner tone="warning" title="Choose a project to continue">
          {libraryIssue}
        </StatusBanner>
      ) : null}
      {recoveryAttentionCount > 0 ? (
        <StatusBanner tone="warning" title="Local recovery needs review">
          <p>
            Unreadable or interrupted entries, or projects retained from a local reset, are
            available for review. Nothing was removed.
          </p>
          <AppButton
            variant="default"
            onClick={() => {
              void session.navigate({ kind: 'settings', page: 'data' })
            }}
          >
            Review recovery
          </AppButton>
        </StatusBanner>
      ) : null}

      <div className={styles['project-library-controls']}>
        <div
          className={styles['project-library-view-options']}
          role="group"
          aria-label="Project view"
        >
          {(['recent', 'active', 'archived'] as const).map((view) => (
            <AppButton
              key={view}
              variant={libraryView === view ? 'filled' : 'subtle'}
              aria-pressed={libraryView === view}
              onClick={() => setLibraryView(view)}
            >
              {view === 'recent'
                ? 'Recent'
                : view === 'active'
                  ? `All active (${active.length})`
                  : `Archived (${archived.length})`}
            </AppButton>
          ))}
        </div>
        <TextInput
          label="Filter projects"
          placeholder="Search titles or types"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
      </div>

      {libraryView === 'archived' ? (
        <p>
          Archive keeps project data on this computer. It changes visibility and frees no space.
        </p>
      ) : null}
      {startupPending ? (
        <p role="status">Opening the local project list…</p>
      ) : visible.length ? (
        <ul className={styles['project-library-list']}>
          {visible.map((item) => (
            <li key={item.projectId} className={styles['project-library-row']}>
              <button
                type="button"
                className={styles['project-library-open']}
                aria-current={sameProject(project, item) ? 'page' : undefined}
                disabled={unavailable}
                onClick={() => session.run(() => session.chooseProject(scopeOf(item)))}
              >
                <span className={styles['project-library-title']}>{item.title}</span>
                <span className={styles['project-library-meta']}>
                  {projectTypes[templateForKind(item.projectKind)].name} ·{' '}
                  {dates.format(new Date(item.updatedAt))}
                  {sameProject(item, access?.sampleProject ?? null) ? ' · Tutorial sample' : ''}
                  {item.archived ? ' · Archived' : ''}
                  {access
                    ? canEditProject(access, item)
                      ? ' · Editable'
                      : ' · Reading only'
                    : ' · Checking editing access'}
                </span>
                <span className={styles['project-library-file-state']}>{status(item)}</span>
              </button>
              <div className={styles['project-library-row-actions']}>
                <ActionMenu
                  label="Actions"
                  accessibleLabel={`Actions for ${item.title}, ${projectTypes[templateForKind(item.projectKind)].name}`}
                  actions={[
                    {
                      id: 'open',
                      label: 'Open project',
                      icon: <FolderOpen size={16} aria-hidden="true" />,
                      disabled: unavailable,
                      onSelect: () => session.run(() => session.chooseProject(scopeOf(item)))
                    },
                    {
                      id: 'manage',
                      label: 'Project actions',
                      icon: <MoreHorizontal size={16} aria-hidden="true" />,
                      disabled: unavailable,
                      onSelect: () =>
                        session.run(() => session.chooseProject(scopeOf(item), 'details'))
                    }
                  ]}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles['project-library-empty']}>
          <Archive size={24} aria-hidden="true" />
          <h2>
            {normalized
              ? 'No matching projects'
              : libraryView === 'archived'
                ? 'No archived projects'
                : 'No projects in this view'}
          </h2>
          <p>
            {normalized
              ? 'Try another title or type.'
              : libraryView === 'archived'
                ? 'Archived projects will appear here without deleting their local work.'
                : 'Create a project or open a project file to begin.'}
          </p>
          {normalized ? (
            <AppButton variant="default" onClick={() => setQuery('')}>
              Clear filter
            </AppButton>
          ) : libraryView === 'recent' && active.length ? (
            <AppButton variant="default" onClick={() => setLibraryView('active')}>
              See all active projects
            </AppButton>
          ) : null}
        </div>
      )}

      {list.issues.length ? (
        <div className={styles['project-library-issues']} role="alert">
          <h2>Some local projects need attention</h2>
          {list.issues.map((issue) => (
            <p key={issue.projectId}>{projectMessages[issue.code]}</p>
          ))}
          <AppButton
            variant="default"
            onClick={() => {
              void session.navigate({ kind: 'settings', page: 'data' })
            }}
          >
            Open Data and recovery
          </AppButton>
        </div>
      ) : null}
      <div className={styles['project-library-secondary-actions']}>
        <AppButton
          variant="subtle"
          disabled={unavailable}
          onClick={() => session.run(() => session.lifecycleFile('restore'))}
        >
          Restore backup…
        </AppButton>
        <AppButton
          variant="subtle"
          disabled={unavailable}
          onClick={() => session.run(session.refreshData)}
        >
          <RotateCcw size={16} aria-hidden="true" /> Refresh projects
        </AppButton>
        <AppButton
          variant="subtle"
          onClick={() => {
            void session.navigate({ kind: 'settings', page: 'data' })
          }}
        >
          Data and recovery
        </AppButton>
      </div>
    </section>
  )
}
