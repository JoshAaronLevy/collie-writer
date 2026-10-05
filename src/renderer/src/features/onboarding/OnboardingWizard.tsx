import { useEffect, useRef, useState } from 'react'
import { Radio } from '@mantine/core'
import { BookOpen, FileText, GraduationCap, PenLine, Search } from 'lucide-react'
import { canEditProject, sameProject } from '../../../../shared/access'
import type { CreateInput } from '../../../../shared/projects'
import {
  projectTemplates,
  projectTypes,
  isProjectTemplate,
  type ProjectTemplate
} from '../../../../domain/projects/templates'
import { ProjectDetailsFields, detailsErrors } from '../project-details/ProjectDetailsFields'
import { AppButton, ChoiceField } from '../../components/ui/Controls'
import { StatusBanner } from '../../components/ui/Feedback'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { AiConnectionPanel } from '../ai-connections/AiConnectionPanel'
import {
  emptySetupDraft,
  readSetupDraft,
  writeSetupDraft,
  discardSetupDraft,
  writeAuthorPreference,
  type SetupDraft,
  type SetupReceipt
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
  'Setup changes could not be saved in this app profile. Keep this window open and retry saving them before creating a project.'

export default function OnboardingWizard(): React.JSX.Element {
  const session = useWorkspaceSession()
  const [initial] = useState(readSetupDraft)
  const [draft, setDraft] = useState<SetupDraft>(() => initial.draft ?? emptySetupDraft())
  const latest = useRef(draft)
  // eslint-disable-next-line react-hooks/refs
  latest.current = draft
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
  const editable = !!scope && canEditProject(session.access, scope)
  const existingFree = session.list.projects.find((item) =>
    sameProject(item, session.access?.freeProject ?? null)
  )
  const busy =
    working || session.acting || session.closing || session.fileActive || session.navigating

  useEffect(() => {
    if (session.destination.kind === 'setup' && !session.navigating)
      heading.current?.focus({ preventScroll: true })
  }, [session.destination.kind, session.focusRevision, draft.step, session.navigating])

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
    if (latest.current.request && !latest.current.receipt) return // The exact request remains available on return.
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
      step: 'connection',
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
    if (!writeAuthorPreference(rememberAuthor ? input.byline : ''))
      setIssue(
        'The project was created. The author preference could not be saved; you can review it in Settings.'
      )
    else setIssue(null)
  }
  function beginCreate(): void {
    if (workingRef.current || unreadable) return
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
    workingRef.current = true
    setWorking(true)
    setIssue(null)
    session.run(async () => {
      try {
        if (!(await session.prepareSetupCreation())) {
          setIssue('Finish the pending project work shown above, then create this project.')
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
          receipt: null
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
    if (workingRef.current || !draft.request || draft.receipt || persistenceIssue || unreadable)
      return
    workingRef.current = true
    setWorking(true)
    setIssue(null)
    session.run(async () => {
      try {
        if (!(await session.prepareSetupCreation())) {
          setIssue('Finish the pending project work shown above, then resume creation.')
          return
        }
        await sendCreate(latest.current.request!, latest.current.rememberAuthor)
      } catch {
        setIssue('The result remains unknown. This exact request is kept for another retry.')
      } finally {
        workingRef.current = false
        setWorking(false)
      }
    })
  }
  function openCreated(target: 'write' | 'details'): void {
    if (workingRef.current || !latest.current.receipt) return
    workingRef.current = true
    setWorking(true)
    setIssue(null)
    session.run(async () => {
      try {
        const opened = await session.resumeSetupProject(latest.current.receipt!, target)
        if (!opened) {
          setIssue(
            'The project could not be opened. Its setup record is kept; review Projects or local recovery.'
          )
          return
        }
        if (target === 'write') {
          if (!discardSetupDraft()) {
            setPersistenceIssue(
              'The completed setup record could not be cleared. Your project is available in Projects.'
            )
            session.setError(
              'The completed setup record could not be cleared from this app profile. Your project remains available.'
            )
            return
          }
          const next = emptySetupDraft()
          latest.current = next
          setDraft(next)
          setAttempted(false)
        }
      } catch {
        setIssue('The project could not be opened. Its local record is still available.')
      } finally {
        workingRef.current = false
        setWorking(false)
      }
    })
  }
  function designate(): void {
    if (workingRef.current || !created) return
    workingRef.current = true
    setWorking(true)
    setIssue(null)
    session.run(async () => {
      try {
        if (!(await session.resumeSetupProject(created, 'setup'))) {
          setIssue('Open the created project before changing its free editing designation.')
          return
        }
        await session.changeAccess('designate')
      } catch {
        setIssue(
          'The free editing choice could not be saved. The project remains available for reading.'
        )
      } finally {
        workingRef.current = false
        setWorking(false)
      }
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
  const stage = draft.step === 'type' ? 1 : draft.step === 'details' ? 2 : 3
  const headingText =
    draft.step === 'type'
      ? 'What are you working on?'
      : draft.step === 'details'
        ? 'Give your project a name'
        : draft.step === 'creating'
          ? 'Creating your project'
          : 'Your project is ready'

  return (
    <section className={styles['project-selection-container']} aria-labelledby="setup-heading">
      <div className={styles['setup-introduction']}>
        <p className={styles['setup-step']}>
          Step {stage} of 3 ·{' '}
          {stage === 1 ? 'Project type' : stage === 2 ? 'Project details' : 'AI connection'}
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
                : 'Write, research, save, and export locally. AI is optional.'}
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
          {created ? (
            <>
              <p>
                This project has already been created. Its title, author and writing remain with the
                same project.
              </p>
              <dl className={styles['saved-project-details']}>
                <div>
                  <dt>Title</dt>
                  <dd>{draft.title}</dd>
                </div>
                <div>
                  <dt>Author</dt>
                  <dd>{draft.byline}</dd>
                </div>
                {draft.description ? (
                  <div>
                    <dt>Description</dt>
                    <dd>{draft.description}</dd>
                  </div>
                ) : null}
              </dl>
              <div className={styles['setup-actions']}>
                <AppButton variant="default" disabled={busy} onClick={() => openCreated('details')}>
                  Edit saved project details
                </AppButton>
                <AppButton
                  disabled={busy}
                  onClick={() => save({ ...latest.current, step: 'connection' })}
                >
                  Return to AI step
                </AppButton>
              </div>
            </>
          ) : (
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
                Your description stays with this project. It is not sent to an AI provider or added
                to manuscript pages automatically.
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
                  disabled={busy || !!unreadable || !!persistenceIssue}
                >
                  {working ? 'Creating project…' : 'Create project'}
                </AppButton>
              </div>
            </form>
          )}
        </>
      ) : null}

      {draft.step === 'creating' ? (
        <div className={styles['connection-content']}>
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

      {draft.step === 'connection' && created ? (
        <div className={styles['connection-content']}>
          <p className={styles['created-confirmation']}>
            “{draft.title}” was created on this device. It has no selected project-file destination
            yet.
          </p>
          <AiConnectionPanel />
          {!editable ? (
            <div className={styles['editing-choice']}>
              <h2>Choose where to edit</h2>
              <p>
                {existingFree
                  ? `“${existingFree.title}” is currently your free editable project. Choose this project if you want to write here instead; protect its pending work first.`
                  : 'Choose this project as your free editable project to write here.'}{' '}
                Reading, export, and backup remain available either way.
              </p>
              <AppButton
                variant="default"
                disabled={busy || !session.access || !session.available}
                onClick={designate}
              >
                Use this project for free writing
              </AppButton>
            </div>
          ) : null}
          {editable ? (
            <p role="status">This project is ready for writing under your current Collie access.</p>
          ) : null}
          {!editable ? (
            <p>You can also open this project for reading now and choose editing access later.</p>
          ) : null}
          <div className={styles['setup-actions']}>
            <AppButton
              variant="default"
              disabled={busy}
              onClick={() => save({ ...latest.current, step: 'details' })}
            >
              Back to project details
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={busy}
              onClick={() => {
                void leave()
              }}
            >
              Leave setup; keep project
            </AppButton>
            <AppButton
              className={styles['setup-primary-action']}
              disabled={busy}
              onClick={() => openCreated('write')}
            >
              Continue without AI
            </AppButton>
          </div>
        </div>
      ) : null}
    </section>
  )
}
