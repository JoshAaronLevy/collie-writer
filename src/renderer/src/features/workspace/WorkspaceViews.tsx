import { ImportButton } from '../imports/ImportButton'
import ConnectionSettings from '../settings/ConnectionSettings'
import UpdateSettings from '../settings/UpdateSettings'
import { AppButton } from '../../components/ui/Controls'
import styles from './WorkspaceViews.module.css'
import exportStyles from '../export/ExportWorkspace.module.css'
import OnboardingWizard from '../onboarding/OnboardingWizard'
import ProjectDetailsForm from '../project-details/ProjectDetailsForm'
import ProjectLibrary from '../library/ProjectLibrary'
import '../projects/Projects.css'
import { sameProject } from '../../../../shared/access'
import { sameScope } from '../../../../shared/project-files'
import HistoryPanel from '../outline/HistoryPanel'
import WritingWorkspace from './WritingWorkspace'
import NotesPanel from '../projects/NotesPanel'
import SourcesPanel from '../projects/SourcesPanel'
import SourceInspector from '../projects/SourceInspector'
import EvidencePanel from '../projects/EvidencePanel'
import SearchPanel from '../projects/SearchPanel'
import CitationsPanel from '../projects/CitationsPanel'
import DocxExportPanel from '../projects/DocxExportPanel'
import InterchangeImportPanel from '../projects/InterchangeImportPanel'
import { ProjectManagement, RecoveryPanel } from '../projects/LifecyclePanel'
import ProjectFileActions from '../projects/ProjectFileActions'
import { projectFileNeedsAttention } from '../projects/project-file-presentation'
import AccessPanel from '../projects/AccessPanel'
import TutorialPanel from '../projects/TutorialPanel'
import SettingsPanel from '../settings/SettingsPanel'
import ProjectStorageSummary from '../settings/ProjectStorageSummary'
import StorageInventoryPanel from '../settings/StorageInventoryPanel'
import { useWorkspaceSession } from './workspaceContext'
import { RetainedRegion } from './RetainedRegion'
import { WorkspaceNavigation } from './WorkspaceNavigation'
export default function WorkspaceViews(): React.JSX.Element {
  const {
    composition: compositionRef,
    drafts,
    destination,
    storage,
    location,
    setLocation,
    list,
    project,
    access,
    busy,
    setBusy,
    acting,
    closing,
    committing,
    setError,
    setNotice,
    history,
    annotationCapture,
    noteDirty,
    sourceDirty,
    inspectionTarget,
    setCitationContext,
    outlineRetry,
    data,
    startupPending,
    current,
    dirty,
    files,
    fileActive,
    accessReadOnly,
    accessTransition,
    available,
    updateProject,
    refreshData,
    navigate,
    navigateSection,
    navigateSearch,
    loadHistory,
    performOutline,
    flush,
    run,
    waitActive,
    lifecycleFile,
    manage,
    resetLocal,
    afterNoteCommit,
    changeAccess,
    openTutorial,
    chooseProject,
    research,
    navigating,
    setData,
    setList,
    goBack,
    backDestination
  } = useWorkspaceSession()
  return (
    <>
      <RetainedRegion name="setup" label="New project">
        {startupPending && storage.state !== 'unavailable' && location?.state !== 'required' ? (
          <p role="status">Opening local projects…</p>
        ) : (
          <OnboardingWizard />
        )}
      </RetainedRegion>
      <RetainedRegion name="library" label="Projects">
        <ProjectLibrary />
      </RetainedRegion>
      <div className="projects">
        <WorkspaceNavigation />
      </div>
      <div
        inert={navigating || closing}
        onCompositionStartCapture={() => {
          compositionRef.current = true
          drafts.changed()
        }}
        onCompositionEndCapture={() => {
          compositionRef.current = false
          drafts.changed()
        }}
      >
        <RetainedRegion name="write" label="Writing">
          <WritingWorkspace />
        </RetainedRegion>
        <RetainedRegion name="history" label="Manuscript history">
          {project ? (
            <HistoryPanel
              key={project.projectId}
              project={project}
              readOnly={accessReadOnly || accessTransition}
              history={history}
              disabled={busy || acting || closing || committing || fileActive}
              change={(change) => run(() => performOutline(change))}
              read={(id) => run(() => loadHistory(id))}
              navigate={(doc, anchor) => run(() => navigateSection(doc, anchor))}
            />
          ) : null}
        </RetainedRegion>
      </div>
      <div className="research-destinations">
        <div
          inert={navigating || closing}
          onCompositionStartCapture={() => {
            compositionRef.current = true
            drafts.changed()
          }}
          onCompositionEndCapture={() => {
            compositionRef.current = false
            drafts.changed()
          }}
        >
          <RetainedRegion name="research-inspector" label="Source inspector">
            {project && inspectionTarget ? (
              <SourceInspector
                readOnly={accessReadOnly || accessTransition}
                key={`${project.projectId}-${inspectionTarget.sourceId}`}
                project={project}
                sourceId={inspectionTarget.sourceId}
                focusExcerptId={inspectionTarget.excerptId}
                focusVersionId={inspectionTarget.versionId}
                focusPageIndex={inspectionTarget.pageIndex}
                disabled={
                  busy || closing || outlineRetry || sourceDirty || storage.state !== 'ready'
                }
                onCommitted={afterNoteCommit}
                close={() => {
                  if (backDestination) void goBack()
                  else
                    research({
                      kind: 'sources',
                      sourceId: inspectionTarget.sourceId,
                      page: 'usage'
                    })
                }}
              />
            ) : null}
          </RetainedRegion>
          <RetainedRegion name="research-notes" label="Notes and annotations">
            {project ? (
              <NotesPanel
                key={project.projectId}
                project={project}
                capture={annotationCapture}
                focusAnnotationId={
                  destination.kind === 'workspace' &&
                  destination.view === 'research' &&
                  destination.target.kind === 'notes'
                    ? (destination.target.annotationId ?? null)
                    : null
                }
                focusNoteId={
                  destination.kind === 'workspace' &&
                  destination.view === 'research' &&
                  destination.target.kind === 'notes'
                    ? (destination.target.noteId ?? null)
                    : null
                }
                disabled={
                  accessReadOnly ||
                  accessTransition ||
                  busy ||
                  closing ||
                  outlineRetry ||
                  storage.state !== 'ready'
                }
                onCommitted={afterNoteCommit}
                navigate={(id, anchor) => navigateSection(id, anchor)}
              />
            ) : null}
          </RetainedRegion>
          <RetainedRegion name="research-sources" label="Sources">
            {project ? (
              <SourcesPanel
                readOnly={accessReadOnly || accessTransition}
                key={project.projectId}
                project={project}
                focusPage={
                  destination.kind === 'workspace' &&
                  destination.view === 'research' &&
                  destination.target.kind === 'sources'
                    ? destination.target.page
                    : undefined
                }
                focusSourceId={
                  destination.kind === 'workspace' &&
                  destination.view === 'research' &&
                  destination.target.kind === 'sources'
                    ? (destination.target.sourceId ?? null)
                    : null
                }
                disabled={busy || closing || outlineRetry || storage.state !== 'ready'}
                onCommitted={afterNoteCommit}
                onInspect={(sourceId) => research({ kind: 'inspector', sourceId })}
              />
            ) : null}
          </RetainedRegion>
          <RetainedRegion name="research-evidence" label="Questions and claims">
            {project ? (
              <EvidencePanel
                readOnly={accessReadOnly || accessTransition}
                key={project.projectId}
                project={project}
                focusSourceId={
                  destination.kind === 'workspace' &&
                  destination.view === 'research' &&
                  destination.target.kind === 'evidence'
                    ? destination.target.sourceId
                    : undefined
                }
                focusItem={
                  destination.kind === 'workspace' &&
                  destination.view === 'research' &&
                  destination.target.kind === 'evidence'
                    ? (destination.target.item ?? null)
                    : null
                }
                disabled={
                  busy ||
                  closing ||
                  outlineRetry ||
                  noteDirty ||
                  sourceDirty ||
                  storage.state !== 'ready'
                }
                onCommitted={afterNoteCommit}
                navigate={(id, anchor) => navigateSection(id, anchor)}
                inspect={(sourceId, excerptId) =>
                  research({ kind: 'inspector', sourceId, excerptId })
                }
              />
            ) : null}
          </RetainedRegion>
          <RetainedRegion name="search" label="Project search">
            {project ? (
              <SearchPanel
                key={project.projectId}
                project={project}
                active={destination.kind === 'workspace' && destination.view === 'search'}
                navigate={navigateSearch}
              />
            ) : null}
          </RetainedRegion>
        </div>
      </div>
      <div className={styles['workspace-utility-views']}>
        <div
          inert={navigating || closing}
          onCompositionStartCapture={() => {
            compositionRef.current = true
            drafts.changed()
          }}
          onCompositionEndCapture={() => {
            compositionRef.current = false
            drafts.changed()
          }}
        >
          <RetainedRegion name="export" label="Export">
            {project ? (
              <DocxExportPanel
                paid={access?.paid ?? false}
                key={project.projectId}
                project={project}
                disabled={busy || closing || acting || fileActive || storage.state !== 'ready'}
                flush={flush}
                onProject={updateProject}
              />
            ) : null}
            <details className={exportStyles['export-reference-tools']}>
              <summary>Citation style and bibliography preview</summary>
              {project ? (
                <CitationsPanel
                  readOnly={accessReadOnly || accessTransition}
                  key={project.projectId}
                  project={project}
                  dirty={dirty}
                  disabled={busy || closing || acting || fileActive || storage.state !== 'ready'}
                  flush={flush}
                  onCommitted={afterNoteCommit}
                  onContext={(sources, view) =>
                    setCitationContext({ projectId: project.projectId, sources, view })
                  }
                  navigate={navigateSection}
                  source={(sourceId) => research({ kind: 'sources', sourceId })}
                />
              ) : null}
            </details>
          </RetainedRegion>

          <RetainedRegion name="details" label="Project actions">
            {project ? (
              <>
                <h1>Project actions</h1>
                <ImportButton />
                <p>
                  Manage details, the selected project file, separate copies, and local organization
                  for “{project.title}”.
                </p>
              </>
            ) : null}
            {project ? (
              <ProjectDetailsForm
                key={project.projectId}
                project={project}
                disabled={busy || acting || closing || fileActive || storage.state !== 'ready'}
                readOnly={accessReadOnly || accessTransition}
              />
            ) : null}
            {project &&
            sameScope(project, files.scope) &&
            !projectFileNeedsAttention(files, project) ? (
              <ProjectFileActions />
            ) : null}
            {project ? (
              <ProjectManagement
                key={`${project.projectId}-${project.title}`}
                project={project}
                disabled={!available || acting || fileActive || closing}
                archive={() => run(() => manage())}
                backup={() => run(() => lifecycleFile('backup'))}
                move={() => run(() => lifecycleFile('move'))}
                duplicate={() => run(() => lifecycleFile('duplicate'))}
                restore={() => run(() => lifecycleFile('restore'))}
              />
            ) : null}
            {project ? (
              <InterchangeImportPanel
                key={`import-${project.projectId}`}
                project={project}
                disabled={
                  busy ||
                  closing ||
                  acting ||
                  fileActive ||
                  accessReadOnly ||
                  accessTransition ||
                  storage.state !== 'ready'
                }
                flush={flush}
                onProject={updateProject}
              />
            ) : null}
          </RetainedRegion>
          <RetainedRegion name="settings-appearance" label="Appearance and accessibility">
            <SettingsPanel />
          </RetainedRegion>
          <RetainedRegion name="settings-ai" label="ChatGPT">
            <ConnectionSettings />
          </RetainedRegion>
          <RetainedRegion name="settings-updates" label="Updates">
            <UpdateSettings />
          </RetainedRegion>
          <RetainedRegion name="settings-access" label="Collie access">
            <AccessPanel
              access={access}
              project={project}
              list={list}
              disabled={!available || busy || acting || fileActive || closing}
              designate={() => run(() => changeAccess('designate'))}
              finish={() => run(() => changeAccess('finish'))}
              importGrant={() => run(() => changeAccess('import'))}
            />
          </RetainedRegion>
          <RetainedRegion name="settings-data" label="Data and recovery">
            <h1>Data and recovery</h1>
            <p>
              Local protection, selected project files and separate backups are different copies.
              Recovery material stays retained. Clearing picker history removes no content; Archive
              and Reset organize or retain local work and do not free storage space.
            </p>
            {!location ? (
              <p role="status">Finding the local working folder…</p>
            ) : (
              <details className={styles['working-location']} open={location.state === 'required'}>
                <summary>Working-data location</summary>
                <p>{location.message}</p>
                {location.path ? (
                  <>
                    <p className={styles['location-path']}>{location.path}</p>
                    <AppButton
                      variant="subtle"
                      disabled={!available || acting || fileActive || closing}
                      onClick={() =>
                        run(async () => {
                          const result = await window.collie.revealWorkingData()
                          if (!result.ok) setError(result.error.message)
                        })
                      }
                    >
                      Show local working folder
                    </AppButton>
                  </>
                ) : (
                  <AppButton
                    variant="default"
                    disabled={acting}
                    onClick={() =>
                      run(async () => {
                        const result = await window.collie.chooseWorkingLocation()
                        if (result.ok) setLocation(result.value)
                        else setError(result.error.message)
                      })
                    }
                  >
                    Choose local working folder…
                  </AppButton>
                )}
                <p>
                  This folder holds local working copies for your projects, including writing,
                  research, citations and saved conversations. It also retains recovery and
                  rebuildable search indexes. It is separate from each project&apos;s selected
                  .collie file.
                </p>
                <p>
                  Keep this folder outside sync or mirroring tools. Portable .collie files can go in
                  your chosen local cloud folders. Normal close keeps unsaved writing here; deleting
                  this folder can remove the only copy of that work.
                </p>
              </details>
            )}
            <ProjectStorageSummary
              project={project}
              status={project && sameScope(project, files.scope) ? files : null}
              dirty={dirty}
              disabled={!available || acting || fileActive || closing}
              reveal={() =>
                run(async () => {
                  if (!current.current) return
                  const result = await window.collie.revealProjectFile({
                    projectId: current.current.projectId,
                    workspaceId: current.current.workspaceId
                  })
                  if (!result.ok) setError(result.error.message)
                })
              }
              openActions={() => {
                if (!project) return
                void navigate({
                  kind: 'workspace',
                  scope: { projectId: project.projectId, workspaceId: project.workspaceId },
                  view: 'details'
                })
              }}
            />
            {storage.state === 'unavailable' ? (
              <p role="alert">
                The storage process is unavailable. Keep this window open and copy any unprotected
                text before quitting.
              </p>
            ) : null}
            <StorageInventoryPanel
              active={destination.kind === 'settings' && destination.page === 'data'}
              disabled={!available || closing || navigating}
            />
            <RecoveryPanel
              data={data}
              openProject={(scope) =>
                run(async () => {
                  await chooseProject(scope)
                  await waitActive()
                  await refreshData()
                })
              }
              disabled={!available || acting || fileActive || closing}
              refresh={() => run(refreshData)}
              reveal={() =>
                run(async () => {
                  const result = await window.collie.revealWorkingData()
                  if (!result.ok) setError(result.error.message)
                })
              }
              inspect={(id) => run(() => lifecycleFile('recover', id))}
              reset={(review) => run(() => resetLocal(review))}
              recoverReset={(id) =>
                run(async () => {
                  setBusy(true)
                  if (current.current && !(await flush(false, 'replace'))) return
                  const result = await window.collie.recoverReset(id)
                  if (result.ok) {
                    setData(result.value)
                    setList(result.value.projects)
                  } else setError(result.error.message)
                })
              }
              cleanup={() =>
                run(async () => {
                  const result = await window.collie.clearPickerHistory()
                  if (result.ok) {
                    setData(result.value)
                    setList(result.value.projects)
                    setNotice('Picker history cleared. All work and retained recovery were kept.')
                  } else setError(result.error.message)
                })
              }
            />
          </RetainedRegion>
          <RetainedRegion name="help-tutorial" label="Tutorial">
            <TutorialPanel
              ready={
                !!access?.sampleProject &&
                list.projects.some((p) => sameProject(p, access?.sampleProject ?? null))
              }
              active={!!project && sameProject(project, access?.sampleProject ?? null)}
              disabled={!available || busy || acting || fileActive || closing}
              start={() => run(() => openTutorial(false))}
              reset={() => run(() => openTutorial(true))}
            />
          </RetainedRegion>
        </div>
      </div>
    </>
  )
}
