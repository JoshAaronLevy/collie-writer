import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Radio } from '@mantine/core'
import { BookOpen, FileText, GraduationCap, PenLine, Search } from 'lucide-react'
import { canEditProject, sameProject, type AccessView } from '../../../../shared/access'
import type { CreateInput } from '../../../../shared/projects'
import {
  projectTemplates,
  projectTypes,
  isProjectTemplate,
  type ProjectTemplate
} from '../../../../domain/projects/templates'
import { ProjectDetailsFields } from '../project-details/ProjectDetailsFields'
import { detailsErrors } from '../project-details/detailsErrors'
import { AppButton, ChoiceField } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import {
  emptySetupDraft,
  readSetupDraft,
  writeSetupDraft,
  discardSetupDraft,
  writeAuthorPreference,
  type SetupDraft,
  type SetupReceipt,
  type SetupEditingIntent
} from './setup-draft'
import styles from './OnboardingWizard.module.css'

const descriptions: Record<ProjectTemplate, string> = {
  book: 'Develop a substantial idea across chapters.',
  essay: 'Make a focused argument supported by sources.',
  article: 'Write a focused piece for readers or publication.',
  report: 'Present findings and practical recommendations.',
  critique: 'Build a research-supported argument against a study or publication.',
  research: 'Present research through methods, results, and discussion.',
  blank: 'Start with an empty draft and shape your own outline.'
}
const icons = {
  book: BookOpen,
  essay: GraduationCap,
  article: FileText,
  report: FileText,
  critique: Search,
  research: GraduationCap,
  blank: PenLine
}
const primary = projectTemplates.filter((template) => projectTypes[template].primary)
const secondary = projectTemplates.filter((template) => !projectTypes[template].primary)
const persistenceMessage =
  'Setup progress could not be saved in this app profile. Keep this window open and retry saving before continuing.'

const completionSaveMessage =
  'The project opened, but setup completion could not be saved. Your project is kept; return to New project to finish setup.'
const completionCleanupMessage =
  'Your project opened. Setup cleanup could not finish; return to New project to retry without creating another project.'

function editingIntent(access: AccessView | null): SetupEditingIntent | null {
  if (!access || access.state === 'unavailable' || access.storageWarning || access.transition)
    return null
  return {
    mode: access.paid ? 'keep' : 'designate',
    expectedRevision: access.revision,
    freeProject: access.freeProject ? { ...access.freeProject } : null
  }
}

export default function OnboardingWizard(): React.JSX.Element {
  const session = useWorkspaceSession()
  const [initial] = useState(readSetupDraft)
  const [draft, setDraft] = useState<SetupDraft>(() => initial.draft ?? emptySetupDraft())
  const latest = useRef(draft)
  useLayoutEffect(() => {
    latest.current = draft
  }, [draft])
  const [unreadable, setUnreadable] = useState(initial.issue)
  const [persistenceIssue, setPersistenceIssue] = useState<string | null>(null)
  const [issue, setIssue] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [working, setWorking] = useState(false)
  const workingRef = useRef(false)
  const [moreOpen, setMoreOpen] = useState(() => {
    const template = initial.draft?.template
    return !!template && !projectTypes[template].primary
  })
  const heading = useRef<HTMLHeadingElement>(null),
    title = useRef<HTMLInputElement>(null),
    byline = useRef<HTMLInputElement>(null)
  const selected = draft.template
  const created = draft.receipt
  const scope = created ? { projectId: created.projectId, workspaceId: created.workspaceId } : null
  const editable =
    !!scope && !!editingIntent(session.access) && canEditProject(session.access, scope)
  const switching =
    !!session.access &&
    !session.access.paid &&
    !!session.access.freeProject &&
    !sameProject(scope, session.access.freeProject)
  const busy =
    working ||
    session.busy ||
    session.acting ||
    session.closing ||
    session.fileActive ||
    session.navigating

  useEffect(() => {
    if (
      session.destination.kind === 'setup' &&
      !session.navigating &&
      !session.composition.current &&
      !document.querySelector('[role="dialog"], [role="alertdialog"]')
    )
      heading.current?.focus({ preventScroll: true })
  }, [
    session.destination.kind,
    session.focusRevision,
    draft.step,
    session.navigating,
    session.composition
  ])

  function save(next: SetupDraft): boolean {
    latest.current = next
    setDraft(next)
    if (writeSetupDraft(next)) {
      setPersistenceIssue(null)
      return true
    }
    setPersistenceIssue(persistenceMessage)
    return false
  }
  function change(patch: Partial<SetupDraft>): void {
    if (latest.current.request || unreadable) return
    save({ ...latest.current, ...patch })
    setIssue(null)
  }
  function selectType(template: ProjectTemplate): void {
    change({ template })
    if (!projectTypes[template].primary) setMoreOpen(true)
  }
  function reviewUnreadable(): void {
    const saved = readSetupDraft()
    if (saved.issue) {
      setUnreadable(saved.issue)
      return
    }
    const next = saved.draft ?? emptySetupDraft()
    latest.current = next
    setDraft(next)
    setUnreadable(null)
    setPersistenceIssue(null)
    setMoreOpen(!!next.template && !projectTypes[next.template].primary)
  }
  function clearUnreadable(): void {
    if (!discardSetupDraft()) {
      setPersistenceIssue(
        'The unreadable setup draft could not be cleared. Keep your existing projects and try again later.'
      )
      return
    }
    const next = emptySetupDraft()
    latest.current = next
    setDraft(next)
    setUnreadable(null)
    setIssue(null)
    setPersistenceIssue(null)
  }
  function retryStorage(): void {
    if (writeSetupDraft(latest.current)) setPersistenceIssue(null)
    else setPersistenceIssue(persistenceMessage)
  }

  async function leave(): Promise<void> {
    if (workingRef.current) return
    const moved = await session.navigate({ kind: 'library' })
    if (!moved) return
    if (latest.current.request) return // Keep dispatched requests and receipts until completion is confirmed.
    if (!discardSetupDraft()) {
      setPersistenceIssue(
        'The setup draft could not be cleared. It will remain available when you return.'
      )
      session.setError(
        'The setup draft could not be cleared from this app profile. It will remain available when you return.'
      )
      return
    }
    const next = emptySetupDraft()
    latest.current = next
    setDraft(next)
    setIssue(null)
    setAttempted(false)
  }

  async function sendCreate(input: CreateInput, rememberAuthor: boolean): Promise<void> {
    const result = await session.createSetupProject(input)
    if (!result.ok) {
      setIssue(
        result.error.code === 'UNAVAILABLE'
          ? 'The result is unknown. Resume this same creation request; your project will not be created twice.'
          : result.error.message
      )
      return
    }
    const receipt: SetupReceipt = {
      projectId: result.value.projectId,
      workspaceId: result.value.workspaceId,
      documentId: result.value.documentId
    }
    const next: SetupDraft = {
      ...latest.current,
      step: 'opening',
      template: input.template,
      title: input.title,
      byline: input.byline,
      description: input.description,
      request: input,
      receipt
    }
    if (!save(next)) {
      setIssue(
        'The project was created, but setup progress could not be saved. Retry saving setup here; after a restart, resume the same creation request.'
      )
      return
    }
    const authorRemembered = writeAuthorPreference(rememberAuthor ? input.byline : '')
    setIssue(null)
    await finishCreated('write')
    if (!authorRemembered)
      session.setNotice(
        'Your project is kept. The author preference could not be saved; review it in Settings.'
      )
  }
  function beginCreate(): void {
    if (workingRef.current || session.actionTask.current || unreadable) return
    setAttempted(true)
    const current = latest.current
    if (!current.template) return
    const fields = {
      title: current.title,
      byline: current.byline,
      description: current.description,
      projectKind: projectTypes[current.template].kind
    }
    const errors = detailsErrors(fields, true)
    if (errors.title || errors.byline || errors.description) {
      setIssue('Review the highlighted fields before creating this project.')
      if (errors.title) title.current?.focus()
      else if (errors.byline) byline.current?.focus()
      else document.getElementById('project-setup-description')?.focus()
      return
    }
    if (persistenceIssue) {
      setIssue('Save the setup draft before creating a project.')
      return
    }
    if (!session.available) {
      setIssue(
        'Choose a safe local working folder before creating a project. Your setup details are kept here.'
      )
      return
    }
    const intent = editingIntent(session.access)
    if (!intent) {
      setIssue('Check editing access before creating this project. Your details are kept.')
      return
    }
    workingRef.current = true
    setWorking(true)
    setIssue(null)
    session.run(async () => {
      try {
        const preparation = await session.prepareSetupCreation()
        if (!preparation.ok) {
          setIssue(preparation.message)
          return
        }
        const checked = await session.readSetupAccess()
        const freshIntent = checked.ok ? editingIntent(checked.value) : null
        if (
          !freshIntent ||
          freshIntent.mode !== intent.mode ||
          freshIntent.expectedRevision !== intent.expectedRevision ||
          !(
            (intent.freeProject === null && freshIntent.freeProject === null) ||
            sameProject(intent.freeProject, freshIntent.freeProject)
          )
        ) {
          setIssue(
            'Editing access changed or could not be read. Review the current choice, then confirm creation again.'
          )
          return
        }
        const input: CreateInput = {
          operationId: crypto.randomUUID(),
          template: current.template!,
          title: current.title.trim(),
          byline: current.byline.trim(),
          description: current.description
        }
        const next: SetupDraft = {
          ...current,
          step: 'creating',
          title: input.title,
          byline: input.byline,
          request: input,
          receipt: null,
          editingIntent: intent
        }
        if (!save(next)) {
          setIssue(persistenceMessage)
          return
        }
        await sendCreate(input, current.rememberAuthor)
      } catch {
        setIssue(
          'Creation could not be confirmed. Resume the same request when storage is available.'
        )
      } finally {
        workingRef.current = false
        setWorking(false)
      }
    })
  }
  function resumeCreation(): void {
    if (
      workingRef.current ||
      session.actionTask.current ||
      !draft.request ||
      draft.receipt ||
      persistenceIssue ||
      unreadable
    )
      return
    workingRef.current = true
    setWorking(true)
    setIssue(null)
    session.run(async () => {
      try {
        const preparation = await session.prepareSetupCreation()
        if (!preparation.ok) {
          setIssue(preparation.message)
          return
        }
        if (!save(latest.current)) return
        await sendCreate(latest.current.request!, latest.current.rememberAuthor)
      } catch {
        setIssue('The result remains unknown. This exact request is kept for another retry.')
      } finally {
        workingRef.current = false
        setWorking(false)
      }
    })
  }
  async function finishCreated(mode: 'write' | 'read'): Promise<void> {
    const saved = latest.current
    if (!saved.receipt || !save(saved)) return
    const result = await session.completeSetupProject(saved.receipt, saved.editingIntent, mode)
    if (!result.ok) {
      setIssue(result.message)
      return
    }
    // Persist a completion tombstone before cleanup. Retire v1 first so partial
    // cleanup cannot resurrect an older operation or its retired AI screen.
    if (!save({ ...saved, step: 'completed', completion: saved.completion ?? mode })) {
      session.setError(completionSaveMessage)
      return
    }
    if (!discardSetupDraft()) {
      setPersistenceIssue(
        'The completed setup record could not be cleared. Your project remains available.'
      )
      session.setError(completionCleanupMessage)
      return
    }
    const next = emptySetupDraft()
    latest.current = next
    setDraft(next)
    setAttempted(false)
    setIssue(null)
    session.setError((message) =>
      message === completionSaveMessage || message === completionCleanupMessage ? '' : message
    )
  }
  function openCreated(mode: 'write' | 'read'): void {
    if (workingRef.current || session.actionTask.current || !latest.current.receipt || unreadable)
      return
    const current = latest.current
    // A recovery click is a fresh deliberate choice, with its consequence shown
    // beside the action. A restored legacy receipt carries no prior switch consent.
    if (mode === 'write') {
      const intent = editingIntent(session.access)
      if (!intent) {
        setIssue('Check editing access before continuing. Your project is kept.')
        return
      }
      if (!save({ ...current, editingIntent: intent })) return
    }
    workingRef.current = true
    setWorking(true)
    setIssue(null)
    session.run(async () => {
      try {
        await finishCreated(mode)
      } catch {
        setIssue('Opening could not be confirmed. This same project is kept for retry.')
      } finally {
        workingRef.current = false
        setWorking(false)
      }
    })
  }
  function checkAccess(): void {
    session.run(async () => {
      const result = await session.readSetupAccess()
      setIssue(
        result.ok
          ? null
          : 'Editing access could not be read. Your setup and any created project are kept.'
      )
    })
  }

  const cards = (templates: ProjectTemplate[]): React.JSX.Element[] =>
    templates.map((template) => {
      const Icon = icons[template]
      return (
        <Radio.Card
          key={template}
          value={template}
          className={styles['project-type-card']}
          tabIndex={selected === template || (selected === null && template === 'book') ? 0 : -1}
          disabled={busy || !!unreadable}
        >
          <span className={styles['project-type-card-top']}>
            <Icon size={23} aria-hidden="true" />
            <Radio.Indicator aria-hidden="true" />
          </span>
          <span className={styles['project-type-card-title']}>{projectTypes[template].name}</span>
          <span className={styles['project-type-card-description']}>{descriptions[template]}</span>
        </Radio.Card>
      )
    })
  const stage = draft.step === 'type' ? 1 : 2
  const headingText =
    draft.step === 'type'
      ? 'What are you working on?'
      : draft.step === 'details'
        ? 'Give your project a name'
        : draft.step === 'creating'
          ? 'Creating your project'
          : working
            ? 'Opening your project'
            : 'Finish opening your project'

  return (
    <section className={styles['project-selection-container']} aria-labelledby="setup-heading">
      <div className={styles['setup-introduction']}>
        <p className={styles['setup-step']}>
          {draft.step === 'type' || draft.step === 'details'
            ? `Step ${stage} of 2 · ${stage === 1 ? 'Project type' : 'Project details'}`
            : 'Project setup'}
        </p>
        <h1 id="setup-heading" ref={heading} tabIndex={-1}>
          {headingText}
        </h1>
        <p>
          {draft.step === 'type'
            ? 'Choose a starting point for your nonfiction writing.'
            : draft.step === 'details'
              ? 'Add the details you want to carry with this project.'
              : draft.step === 'creating'
                ? 'Your request is kept on this device while Collie creates the project.'
                : working
                  ? 'Finishing setup locally…'
                  : 'Your project is kept. Continue opening it or review Projects and recovery.'}
        </p>
      </div>
      {unreadable ? (
        <StatusBanner tone="error" title="Saved setup needs attention">
          <p>{unreadable} Discarding it will not remove any project.</p>
          <div className={styles['setup-actions']}>
            <AppButton variant="default" onClick={reviewUnreadable}>
              Retry reading setup
            </AppButton>
            <AppButton variant="subtle" onClick={clearUnreadable}>
              Discard unreadable setup draft
            </AppButton>
          </div>
        </StatusBanner>
      ) : null}
      {persistenceIssue ? (
        <StatusBanner tone="error" title="Setup could not be saved">
          <p>{persistenceIssue}</p>
          {!unreadable ? (
            <AppButton variant="default" onClick={retryStorage}>
              Retry saving setup
            </AppButton>
          ) : null}
        </StatusBanner>
      ) : null}
      {issue ? (
        <StatusBanner tone="warning" title="Setup needs attention">
          {issue}
        </StatusBanner>
      ) : null}

      {draft.step === 'type' ? (
        <>
          <Radio.Group
            name="collie-project-type"
            label="Project type"
            value={selected ?? ''}
            onChange={(value) => {
              if (isProjectTemplate(value)) selectType(value)
            }}
          >
            <div className={styles['project-type-grid']}>{cards(primary)}</div>
            <div className={styles['more-starting-points']}>
              <AppButton
                variant="subtle"
                disabled={busy || !!unreadable || (!!selected && !projectTypes[selected].primary)}
                aria-expanded={moreOpen}
                aria-controls="more-project-types"
                onClick={() => setMoreOpen((open) => !open)}
              >
                More starting points {moreOpen ? '−' : '+'}
              </AppButton>
              {selected && !projectTypes[selected].primary ? (
                <p>Your selected starting point stays visible here.</p>
              ) : null}
              {moreOpen ? (
                <div id="more-project-types" className={styles['project-type-grid']}>
                  {cards(secondary)}
                </div>
              ) : null}
            </div>
          </Radio.Group>
          <div className={styles['setup-actions']}>
            <AppButton
              variant="default"
              disabled={busy || !!unreadable || !session.available}
              onClick={() => session.run(() => session.openFile())}
            >
              Open existing project…
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={busy || !!unreadable || !session.available}
              onClick={() => session.run(() => session.openTutorial(false))}
            >
              Explore an example
            </AppButton>
            {session.list.projects.length ? (
              <AppButton
                variant="subtle"
                disabled={busy}
                onClick={() => {
                  void leave()
                }}
              >
                Cancel
              </AppButton>
            ) : null}
            <AppButton
              className={styles['setup-primary-action']}
              disabled={!selected || busy || !!unreadable}
              onClick={() => {
                if (selected) save({ ...latest.current, step: 'details' })
              }}
            >
              Continue
            </AppButton>
          </div>
          {!selected ? (
            <p className={styles['setup-hint']}>Select a project type to continue.</p>
          ) : null}
        </>
      ) : null}

      {draft.step === 'details' && selected ? (
        <>
          <div className={styles['details-introduction']}>
            <span className={styles['selected-project-type']}>{projectTypes[selected].name}</span>
            {!created ? (
              <AppButton
                variant="subtle"
                disabled={busy || !!unreadable}
                onClick={() => save({ ...latest.current, step: 'type' })}
              >
                Change type
              </AppButton>
            ) : null}
          </div>
          <form
            className={styles['project-setup-form']}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              beginCreate()
            }}
          >
            <ProjectDetailsFields
              value={{
                title: draft.title,
                byline: draft.byline,
                description: draft.description,
                projectKind: projectTypes[selected].kind
              }}
              showType={false}
              creating
              showErrors={attempted}
              disabled={busy || !!unreadable || !!draft.request}
              titleRef={title}
              bylineRef={byline}
              descriptionId="project-setup-description"
              onChange={(value) =>
                change({
                  title: value.title,
                  byline: value.byline,
                  description: value.description
                })
              }
              afterByline={
                <ChoiceField
                  label="Remember this author on this computer"
                  description="You can change or clear this preference in Settings. It stays out of project files until you create a project with it."
                  checked={draft.rememberAuthor}
                  disabled={busy || !!unreadable}
                  onChange={(event) => change({ rememberAuthor: event.currentTarget.checked })}
                />
              }
            />
            <p className={styles['setup-hint']}>
              Your description stays with this project. It is not sent to an AI provider or added to
              manuscript pages automatically.
            </p>
            {!session.available ? (
              <StatusBanner tone="warning" title="Local storage is needed">
                Choose a safe device-local working folder before Create. Your setup details remain
                here.{' '}
                <AppButton
                  variant="default"
                  onClick={() => {
                    void session.navigate({ kind: 'settings', page: 'data' })
                  }}
                >
                  Open Data and recovery
                </AppButton>
              </StatusBanner>
            ) : null}
            {switching ? (
              <p className={styles['editing-choice']}>
                Creating this project will make it your free writing project. Your other projects
                will remain available to read and export.
              </p>
            ) : null}
            {!editingIntent(session.access) ? (
              <StatusBanner tone="warning" title="Editing access needs attention">
                <p>Check Collie access before creating this project. Your details are kept.</p>
                <AppButton variant="default" disabled={busy} onClick={checkAccess}>
                  Check editing access
                </AppButton>
                <AppButton
                  variant="subtle"
                  disabled={busy}
                  onClick={() => void session.navigate({ kind: 'settings', page: 'access' })}
                >
                  Open Collie access
                </AppButton>
              </StatusBanner>
            ) : null}
            <div className={styles['setup-actions']}>
              <AppButton
                variant="default"
                disabled={busy}
                onClick={() => save({ ...latest.current, step: 'type' })}
              >
                Back
              </AppButton>
              <AppButton
                variant="subtle"
                disabled={busy}
                onClick={() => {
                  void leave()
                }}
              >
                Cancel
              </AppButton>
              <AppButton
                type="submit"
                className={styles['setup-primary-action']}
                disabled={
                  busy || !!unreadable || !!persistenceIssue || !editingIntent(session.access)
                }
              >
                {working
                  ? 'Creating project…'
                  : switching
                    ? 'Create and write here'
                    : 'Create project'}
              </AppButton>
            </div>
          </form>
        </>
      ) : null}

      {draft.step === 'creating' ? (
        <div className={styles['setup-completion']}>
          <p>
            {working
              ? 'Creating your project locally…'
              : 'The result of the creation request needs to be confirmed. Resuming repeats the same request and will not make a second project.'}
          </p>
          <div className={styles['setup-actions']}>
            <AppButton
              disabled={busy || !!persistenceIssue || !!unreadable}
              pending={working}
              onClick={resumeCreation}
            >
              Resume project creation
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={busy}
              onClick={() => {
                void leave()
              }}
            >
              Leave setup and keep request
            </AppButton>
          </div>
        </div>
      ) : null}

      {working && created ? <p role="status">Opening your project…</p> : null}
      {!working && (draft.step === 'opening' || draft.step === 'completed') && created ? (
        <div className={styles['setup-completion']}>
          <p className={styles['created-confirmation']}>
            “{draft.title}” is already created. Continuing uses this same project.
          </p>
          {draft.step === 'completed' ? (
            <p>
              The project was opened successfully. Finish opening it again and clearing the retained
              setup record.
            </p>
          ) : editable ? (
            <p>This project is editable under your current Collie access.</p>
          ) : (
            <p className={styles['editing-choice']}>
              {switching
                ? 'Writing here will make this your free writing project. Your other projects will remain available to read and export.'
                : 'Continue writing in this project, or open it for reading while you resolve editing access.'}
            </p>
          )}
          <div className={styles['setup-actions']}>
            <AppButton
              disabled={
                busy ||
                !!unreadable ||
                !!persistenceIssue ||
                (draft.step !== 'completed' && !editingIntent(session.access))
              }
              onClick={() => openCreated(draft.step === 'completed' ? 'read' : 'write')}
            >
              {draft.step === 'completed'
                ? 'Open project and finish setup'
                : editable
                  ? 'Continue to writing'
                  : 'Write in this project'}
            </AppButton>
            {draft.step !== 'completed' ? (
              <AppButton
                variant="default"
                disabled={busy || !!unreadable || !!persistenceIssue}
                onClick={() => openCreated('read')}
              >
                Open for reading
              </AppButton>
            ) : null}
            <AppButton variant="subtle" disabled={busy} onClick={checkAccess}>
              Check editing access
            </AppButton>
            <AppButton variant="subtle" disabled={busy} onClick={() => void leave()}>
              Review Projects; keep setup
            </AppButton>
          </div>
        </div>
      ) : null}
    </section>
  )
}
