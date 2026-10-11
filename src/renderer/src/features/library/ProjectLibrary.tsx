import { useState } from 'react'
import { TextInput } from '@mantine/core'
import { Archive, RotateCcw } from 'lucide-react'
import { canEditProject, sameProject } from '../../../../shared/access'
import { sameScope } from '../../../../shared/project-files'
import { type ProjectListing } from '../../../../shared/projects'
import { projectTypes, templateForKind } from '../../../../domain/projects/templates'
import ProjectActionsMenu from '../projects/ProjectActionsMenu'
import { AppButton } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { scopeOf } from '../workspace/useWorkspaceController'
import styles from './ProjectLibrary.module.css'
import { projectFilePresentation } from '../projects/project-file-presentation'

const dates = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric'
})
const kindLabel = (item: ProjectListing): string =>
  item.projectKind ? projectTypes[templateForKind(item.projectKind)].name : 'Project'

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
      !normalized || `${item.title} ${kindLabel(item)}`.toLocaleLowerCase().includes(normalized)
  )
  const unavailable =
    !session.available ||
    session.acting ||
    session.fileActive ||
    session.closing ||
    session.navigating ||
    startupPending

  function status(item: ProjectListing): string {
    const typing = !!project && sameScope(project, item) && session.dirty
    return projectFilePresentation(item, files, typing, session.saveState).label
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
                  {kindLabel(item)} · {dates.format(new Date(item.updatedAt))}
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
                <ProjectActionsMenu project={item} library />
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

      <div className={styles['project-library-secondary-actions']}>
        <AppButton
          variant="subtle"
          disabled={unavailable}
          onClick={() => session.run(() => session.lifecycleFile('restore'))}
        >
          Open backup…
        </AppButton>
        <AppButton
          variant="subtle"
          disabled={unavailable}
          onClick={() => session.run(session.refresh)}
        >
          <RotateCcw size={16} aria-hidden="true" /> Refresh projects
        </AppButton>
        <AppButton
          variant="subtle"
          onClick={() => {
            void session.navigate({ kind: 'settings', page: 'data' })
          }}
        >
          Storage
        </AppButton>
      </div>
    </section>
  )
}
