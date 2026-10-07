import { ReviewOptionsDialog, type ReviewOptionsTarget } from './ReviewOptionsDialog'
import { captureSelection } from '../../editor/selection'
import { isEditableKind, effectiveState } from '../../../../shared/outline'
import { IconSearch, IconMaximize, IconMinimize, IconX } from '@tabler/icons-react'
import { IconButton } from '../../components/ui/IconButton'
import { useEffectEvent } from 'react'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { TextInput, Textarea } from '@mantine/core'
import { AppButton, SelectField } from '../../components/ui/Controls'
import { ActionMenu } from '../../components/ui/ActionMenu'
import RichDraft from '../../editor/RichDraft'
import { editorIsComposing } from '../../editor/adapter'
import SaveMenu from './SaveMenu'
import ProjectFileActions from '../projects/ProjectFileActions'
import OutlinePanel from '../outline/OutlinePanel'
import { useWorkspaceSession } from './workspaceContext'
import { PaneResizeHandle } from './PaneResizeHandle'
import { WritingSidePanel } from './WritingSidePanel'
import { readableWriting } from './readableWriting'
import type { SecondaryPanel } from './useWritingPreferences'
import { AiProviderIndicator } from '../ai-connections/AiProviderIndicator'
import { sameScope } from '../../../../shared/project-files'
import styles from './WritingWorkspace.module.css'

export default function WritingWorkspace(): React.JSX.Element {
  const session = useWorkspaceSession()
  const {
    project,
    writingView,
    sectionTitle,
    setSectionTitle,
    sectionStatus,
    setSectionStatus,
    sectionSynopsis,
    setSectionSynopsis,
    sectionFields: sectionFieldsRef,
    busy,
    acting,
    closing,
    committing,
    retry,
    outlineRetry,
    sectionReadOnly,
    accessReadOnly,
    accessTransition,
    storage,
    metaPending,
    editorRef,
    editorReady,
    citationContext,
    dirty,
    editorEpoch,
    setError,
    changed,
    isDirty,
    actionTask,
    flushManuscript,
    imageUrls,
    importImage,
    run,
    performOutline,
    navigateSection,
    saveSectionMeta,
    files,
    fileActive,
    available,
    workspace,
    navigate,
    captureAnnotation,
    flush,
    refresh,
    conflict
  } = session
  const { preferences, update, issue } = writingView
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 78rem)').matches)
  const [mobilePane, setMobilePane] = useState<'editor' | 'outline' | 'panel'>('editor')
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [reviewOptionsOpen, setReviewOptionsOpen] = useState(false)
  const [reviewOptionsTarget, setReviewOptionsTarget] = useState<ReviewOptionsTarget | null>(null)
  const optionsContextKey = `${project?.projectId}:${project?.workspaceId}:${project?.documentId}:${session.destination.kind}:${session.destination.kind === 'workspace' ? session.destination.view : ''}`
  const [lastOptionsContext, setLastOptionsContext] = useState(optionsContextKey)
  if (lastOptionsContext !== optionsContextKey) {
    setLastOptionsContext(optionsContextKey)
    setReviewOptionsOpen(false)
  }
  const handledReveal = useRef(0)
  const editorPane = useRef<HTMLElement>(null),
    outlinePane = useRef<HTMLElement>(null),
    sidePane = useRef<HTMLElement>(null)
  const visible = session.destination.kind === 'workspace' && session.destination.view === 'write'
  useEffect(() => {
    const media = window.matchMedia('(max-width: 78rem)')
    const change = (): void => {
      if (media.matches) {
        const active = document.activeElement
        setMobilePane(
          active && outlinePane.current?.contains(active)
            ? 'outline'
            : active && sidePane.current?.contains(active)
              ? 'panel'
              : 'editor'
        )
      }
      setNarrow(media.matches)
    }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const paneKey = `${visible}:${project?.documentId ?? ''}`
  const [lastPaneKey, setLastPaneKey] = useState(paneKey)
  if (lastPaneKey !== paneKey) {
    setLastPaneKey(paneKey)
    if (visible) setMobilePane('editor')
  }
  const onPanelReveal = useEffectEvent(() => {
    if (
      visible &&
      writingView.revealRevision !== handledReveal.current &&
      !session.composition.current
    ) {
      handledReveal.current = writingView.revealRevision
      if (preferences.panel === 'closed') return
      setMobilePane('panel')
      requestAnimationFrame(() => {
        if (sidePane.current && !sidePane.current.closest('[hidden],[inert]'))
          sidePane.current.focus({ preventScroll: true })
      })
    }
  })
  // Present only the latest committed navigation request, after retained regions update.
  useEffect(() => {
    const frame = requestAnimationFrame(() => onPanelReveal())
    return () => cancelAnimationFrame(frame)
  }, [visible, writingView.revealRevision, preferences.panel, session.composition])
  useEffect(() => {
    if (
      !visible ||
      !narrow ||
      session.composition.current ||
      (editorRef.current && editorIsComposing(editorRef.current))
    )
      return
    if (mobilePane === 'editor') {
      editorRef.current?.commands.focus()
      return
    }
    const pane = mobilePane === 'outline' ? outlinePane.current : sidePane.current
    pane?.focus({ preventScroll: true })
  }, [mobilePane, narrow, visible, editorRef, session.composition])
  if (!project) return <p>Open a project from Projects to begin writing.</p>
  const blocked = busy || acting || closing || session.navigating
  const readOnly = sectionReadOnly || accessReadOnly || accessTransition
  function changeView(action: () => void): void {
    if (
      session.composition.current ||
      (editorRef.current && editorIsComposing(editorRef.current))
    ) {
      setError('Finish composing text before changing the writing view.')
      return
    }
    action()
  }
  function panel(mode: SecondaryPanel): void {
    changeView(() => {
      update({ panel: mode, focus: false })
      setMobilePane(mode === 'closed' ? 'editor' : 'panel')
      if (mode === 'closed') requestAnimationFrame(() => editorRef.current?.commands.focus())
    })
  }
  function go(view: 'search' | 'export' | 'history' | 'details'): void {
    const next = workspace(view)
    if (next) void navigate(next)
  }
  const status = !available
    ? 'Local protection unavailable'
    : retry
      ? 'Local protection needs retry'
      : committing
        ? 'Protecting changes…'
        : dirty
          ? 'Changes need local protection'
          : 'Protected on this device'
  const fileStatus = !sameScope(project, files.scope)
    ? 'Checking file status…'
    : fileActive
      ? 'File operation in progress…'
      : {
          unsaved: 'Not yet saved to a project file',
          checking: 'Checking selected file…',
          saved: dirty ? 'Changes waiting for Save' : 'Project file saved on this device',
          pending: 'Unsaved changes · use Save to update the project file',
          'external-change': 'Selected file differs · Save writes your local work',
          unavailable: 'Selected file unavailable',
          interrupted: 'File operation interrupted'
        }[files.state]
  const outlineHidden = preferences.focus || (narrow && mobilePane !== 'outline')
  const panelHidden =
    preferences.focus || preferences.panel === 'closed' || (narrow && mobilePane !== 'panel')
  const editorHidden = narrow && !preferences.focus && mobilePane !== 'editor'
  return (
    <section
      className={styles['writing-workspace']}
      data-focus={preferences.focus}
      data-panel={preferences.panel}
      data-narrow={narrow}
      style={
        {
          '--writing-outline-width': `${preferences.outlineWidth}px`,
          '--writing-panel-width': `${preferences.panelWidth}px`
        } as CSSProperties
      }
    >
      <header className={styles['writing-header']}>
        <div className={styles['writing-project-heading']}>
          <p className={styles['writing-eyebrow']}>Manuscript</p>
          <h1>{project.title}</h1>
          {project.subtitle ? (
            <p className={styles['writing-project-subtitle']}>{project.subtitle}</p>
          ) : null}
          <details className={styles['writing-save-state']}>
            <summary>Save and local protection</summary>
            <p role="status">
              {status} · {fileStatus}
            </p>
            <p>
              Local protection restores your writing after closing, including unsaved changes. Save
              updates the project file; your cloud provider manages any upload separately.
            </p>
            {session.notice ? <p>{session.notice}</p> : null}
            <AppButton
              variant="subtle"
              disabled={!available || blocked || !dirty}
              onClick={() =>
                run(async () => {
                  await flush()
                  await refresh()
                })
              }
            >
              {retry ? 'Retry local protection' : 'Protect pending drafts'}
            </AppButton>
            <ProjectFileActions />
          </details>
        </div>
        <div className={styles['writing-header-actions']}>
          <SaveMenu />
          <AppButton variant="subtle" onClick={() => session.research({ kind: 'sources' })}>
            Research
          </AppButton>
          <IconButton
            label="Search manuscript and research"
            variant="subtle"
            onClick={() => go('search')}
          >
            <IconSearch aria-hidden="true" />
          </IconButton>
          <AppButton variant="subtle" onClick={() => go('export')}>
            Export
          </AppButton>
          <ActionMenu
            label="Project"
            actions={[
              { id: 'details', label: 'Project and file actions', onSelect: () => go('details') },
              { id: 'history', label: 'Manuscript history', onSelect: () => go('history') },
              {
                id: 'library',
                label: 'All projects',
                onSelect: () => {
                  void navigate({ kind: 'library' })
                }
              },
              {
                id: 'protect',
                label: retry ? 'Retry local protection' : 'Protect pending drafts',
                disabled: !available || blocked || !dirty,
                onSelect: () =>
                  run(async () => {
                    await flush()
                    await refresh()
                  })
              }
            ]}
          />
          <IconButton
            label={preferences.focus ? 'Exit focus mode' : 'Focus mode'}
            variant={preferences.focus ? 'filled' : 'subtle'}
            aria-pressed={preferences.focus}
            onClick={() =>
              changeView(() => {
                update({ focus: !preferences.focus })
                setMobilePane('editor')
                editorRef.current?.commands.focus()
              })
            }
          >
            {preferences.focus ? (
              <IconMinimize aria-hidden="true" />
            ) : (
              <IconMaximize aria-hidden="true" />
            )}
          </IconButton>
        </div>
      </header>
      {issue ? <p role="status">{issue}</p> : null}
      {!preferences.focus ? (
        <div className={styles['writing-view-actions']}>
          {narrow ? (
            <>
              <AppButton
                variant={mobilePane === 'editor' ? 'default' : 'subtle'}
                aria-pressed={mobilePane === 'editor'}
                onClick={() => changeView(() => setMobilePane('editor'))}
              >
                Manuscript
              </AppButton>
              <AppButton
                variant={mobilePane === 'outline' ? 'default' : 'subtle'}
                aria-pressed={mobilePane === 'outline'}
                onClick={() => changeView(() => setMobilePane('outline'))}
              >
                Outline
              </AppButton>
            </>
          ) : null}
          <div
            className={styles['writing-panel-options']}
            role="group"
            aria-label="Writing companion"
          >
            {(['notes', 'source'] as const).map((mode) => (
              <AppButton
                variant={preferences.panel === mode ? 'default' : 'subtle'}
                aria-pressed={preferences.panel === mode}
                key={mode}
                onClick={() =>
                  panel(
                    preferences.panel === mode && (!narrow || mobilePane === 'panel')
                      ? 'closed'
                      : mode
                  )
                }
              >
                {mode === 'notes' ? 'Notes' : 'Sources'}
              </AppButton>
            ))}
            <AiProviderIndicator
              active={preferences.panel === 'ai'}
              onOpen={() =>
                panel(
                  preferences.panel === 'ai' && (!narrow || mobilePane === 'panel')
                    ? 'closed'
                    : 'ai'
                )
              }
            />
            {preferences.panel !== 'closed' ? (
              <IconButton
                label="Close writing companion"
                variant="subtle"
                onClick={() => panel('closed')}
              >
                <IconX aria-hidden="true" />
              </IconButton>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className={styles['writing-layout']}>
        <aside
          ref={outlinePane}
          tabIndex={-1}
          className={styles['writing-outline-pane']}
          hidden={outlineHidden}
          inert={outlineHidden}
          aria-label="Manuscript outline"
        >
          <OutlinePanel
            key={project.projectId}
            project={project}
            issue={session.error}
            readOnly={accessReadOnly || accessTransition}
            disabled={blocked || committing || fileActive}
            change={(change, done) => {
              if (actionTask.current || closing) {
                done?.(false)
                return
              }
              run(async () => {
                let success = false
                try {
                  success = await performOutline(change)
                } finally {
                  done?.(success)
                }
              })
            }}
            select={(id) =>
              run(async () => {
                await navigateSection(id)
                if (session.current.current?.documentId === id) setMobilePane('editor')
              })
            }
          />
        </aside>
        {!outlineHidden && !narrow ? (
          <PaneResizeHandle
            label="Outline width"
            min={200}
            max={360}
            value={preferences.outlineWidth}
            change={(outlineWidth) => update({ outlineWidth })}
          />
        ) : null}
        <article
          ref={editorPane}
          tabIndex={-1}
          className={styles['writing-manuscript-pane']}
          hidden={editorHidden}
          inert={editorHidden}
          aria-label="Manuscript editing"
        >
          <div className={styles['writing-section-heading']}>
            <div>
              <h2>{sectionTitle}</h2>
              {readOnly ? <p>Reading only</p> : null}
            </div>
            <AppButton
              variant="subtle"
              aria-expanded={metadataOpen}
              onClick={() => changeView(() => setMetadataOpen(!metadataOpen))}
            >
              Details
            </AppButton>
          </div>
          {sectionReadOnly ? (
            <p role="status">
              This section is archived or in trash. Restore it and any removed parent in the outline
              to edit it.
            </p>
          ) : null}
          <form
            className={styles['writing-section-details']}
            hidden={!metadataOpen}
            inert={!metadataOpen}
            onSubmit={(event) => {
              event.preventDefault()
              run(saveSectionMeta)
            }}
          >
            <TextInput
              label="Item title"
              value={sectionTitle}
              maxLength={500}
              required
              disabled={blocked || outlineRetry || readOnly || !!metaPending.current}
              onChange={(event) => {
                sectionFieldsRef.current.title = event.currentTarget.value
                setSectionTitle(event.currentTarget.value)
              }}
            />
            <SelectField
              label="Status"
              value={sectionStatus}
              disabled={blocked || outlineRetry || readOnly || !!metaPending.current}
              onChange={(event) => {
                sectionFieldsRef.current.status = event.currentTarget.value as
                  'draft' | 'review' | 'complete'
                setSectionStatus(sectionFieldsRef.current.status)
              }}
            >
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="complete">Complete</option>
            </SelectField>
            <Textarea
              label="Synopsis"
              value={sectionSynopsis}
              maxLength={10000}
              disabled={blocked || outlineRetry || readOnly || !!metaPending.current}
              onChange={(event) => {
                sectionFieldsRef.current.synopsis = event.currentTarget.value
                setSectionSynopsis(event.currentTarget.value)
              }}
            />
            <AppButton type="submit" disabled={blocked || readOnly}>
              {metaPending.current ? 'Retry details' : 'Save details'}
            </AppButton>
          </form>
          <RichDraft
            key={`${project.projectId}-${project.documentId}-${editorEpoch}`}
            payload={project.payload}
            references={{
              focusAnchor:
                session.referenceAnchor?.documentId === project.documentId
                  ? session.referenceAnchor.id
                  : null,
              focusRequest: session.referenceAnchor?.request,
              projectId: project.projectId,
              sources:
                citationContext?.projectId === project.projectId ? citationContext.sources : [],
              labels: new Map(
                !dirty &&
                  citationContext?.projectId === project.projectId &&
                  citationContext.view?.headCommitId === project.headCommitId
                  ? citationContext.view.labels.map((label) => [label.id, label.text])
                  : []
              )
            }}
            disabled={
              busy ||
              closing ||
              outlineRetry ||
              sectionReadOnly ||
              accessReadOnly ||
              accessTransition ||
              storage.state !== 'ready'
            }
            onReviewOptions={() => {
              if (
                blocked ||
                !visible ||
                session.composition.current ||
                document.querySelector('[role="dialog"], [role="alertdialog"]')
              )
                return
              const doc = project.documents.find((d) => d.id === project.documentId)
              if (
                !doc ||
                !isEditableKind(doc.kind) ||
                effectiveState(doc, project.documents) !== 'active'
              )
                return
              // Selection positions only; no serialization or AI context capture.
              setReviewOptionsTarget({
                scope: { projectId: project.projectId, workspaceId: project.workspaceId },
                documentId: doc.id,
                title: doc.title,
                kind: doc.kind,
                selection: captureSelection(editorRef.current),
                opener:
                  document.activeElement instanceof HTMLElement ? document.activeElement : null
              })
              setReviewOptionsOpen(true)
            }}
            onReady={editorReady}
            onChange={changed}
            onIssue={setError}
            onBlur={() => {
              if (isDirty() && !actionTask.current) void flushManuscript()
            }}
            imageUrl={(assetId) => imageUrls.current.get(assetId)}
            importImage={(details) => run(() => importImage(details))}
          />
          <div className={styles['writing-section-actions']}>
            <AppButton
              variant="subtle"
              disabled={blocked || readOnly}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => run(captureAnnotation)}
            >
              Annotate selection
            </AppButton>
            <AppButton variant="subtle" onClick={() => go('history')}>
              History
            </AppButton>
            <AppButton
              variant="subtle"
              onClick={() =>
                changeView(() => {
                  editorRef.current?.commands.focus()
                  editorRef.current?.commands.selectAll()
                })
              }
            >
              Select all for copying
            </AppButton>
          </div>
          {conflict ? (
            <details className={styles['writing-conflict']} open>
              <summary>Stored writing differs from this draft</summary>
              <p>
                Keep your draft open for copying. This stored version is a separate read-only copy.
              </p>
              <Textarea
                label="Stored section text for copying"
                readOnly
                value={readableWriting(conflict.payload.ast)}
              />
            </details>
          ) : null}
        </article>
        {!panelHidden && !narrow ? (
          <PaneResizeHandle
            label="Companion panel width"
            min={260}
            max={460}
            direction={-1}
            value={preferences.panelWidth}
            change={(panelWidth) => update({ panelWidth })}
          />
        ) : null}
        <aside
          ref={sidePane}
          tabIndex={-1}
          className={styles['writing-companion-pane']}
          hidden={panelHidden}
          inert={panelHidden}
          aria-label="Writing companion"
        >
          <WritingSidePanel
            key={project.projectId}
            mode={preferences.panel}
            active={visible && !panelHidden}
          />
        </aside>
      </div>
      <ReviewOptionsDialog
        opened={reviewOptionsOpen}
        target={reviewOptionsTarget}
        close={() => setReviewOptionsOpen(false)}
      />
    </section>
  )
}
