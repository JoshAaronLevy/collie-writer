import {
  CHATGPT_USAGE_URL,
  retryableImportTask,
  processedImportTasks
} from '../../../../shared/import-recovery'
import { ImportResults } from './ImportResults'
import { ImportProgress } from './ImportProgress'
import { importAvailability } from './import-availability'
import { useImportSelection } from './useImportSelection'
import { VisuallyHidden } from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { IconButton } from '../../components/ui/IconButton'
import type { ReactNode } from 'react'
import { useVisualPreferences } from '../../theme/visualPreferencesContext'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton, ChoiceField, SelectField, TextareaField } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useAiConnections } from '../ai-connections/connectionState'
import { sameScope } from '../../../../shared/project-files'
import { projectFailure } from '../../../../shared/projects'
import {
  IMPORT_LIMITS,
  type ImportCategory,
  type ImportPickResult
} from '../../../../shared/project-import'
import { ImportContext } from './importContext'
import styles from './ImportProvider.module.css'

const bytesLabel = (bytes: number): string =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 ** 2
      ? `${(bytes / 1024).toFixed(1)} KiB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MiB`
const categoryLabels: Record<ImportCategory, string> = {
  chats: 'AI conversations',
  sources: 'Sources',
  notes: 'Notes'
}

/** This provider stays mounted while setup and results share one retained selection. */
export function ImportProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const {
      state,
      flow,
      writable,
      blocked,
      success,
      presentation,
      exited,
      trackFocus,
      composition,
      ...intake
    } = useImportSelection(),
    session = useWorkspaceSession(),
    connections = useAiConnections(),
    { reducedMotion } = useVisualPreferences()
  const sameFindings = flow.intent === JSON.stringify([state.scope, state.selected, state.settings])
  const needsFindingsRecovery =
    !!flow.pendingDiscovery ||
    !!flow.pendingLocal ||
    !!flow.pendingAutomatic ||
    !!flow.pendingCommit ||
    !!(flow.summary && !flow.summary.current) ||
    !!(flow.summary && flow.conversations.length !== flow.summary.total)
  const retainedImportWork = !!connections.status?.work.some(
    (work) => work.feature === 'import' && sameScope(work.scope, flow.scope)
  )
  const catalog = connections.status?.catalog,
    selectedFiles = state.files.filter((f) => state.selected.includes(f.id)),
    modelId = catalog?.state === 'loaded' ? catalog.selectedModelId : null,
    availability = importAvailability(connections),
    ready = availability.ready,
    formBlocked = blocked || flow.locked,
    notice = state.issue || flow.issue,
    processingText =
      flow.phase === 'stopping'
        ? 'Stopping…'
        : flow.phase === 'checking'
          ? 'Checking import status…'
          : flow.phase === 'analyzing'
            ? flow.discovery
              ? flow.discovery.type === 'semantic'
                ? 'Interpreting selected content…'
                : 'Understanding file structure…'
              : 'Analyzing with ChatGPT…'
            : flow.phase === 'extracting'
              ? 'Extracting content locally…'
              : flow.phase === 'saving'
                ? 'Preparing summary…'
                : 'Reading files…'
  const resultStatus =
    flow.phase === 'checking'
      ? 'Checking import status…'
      : flow.phase === 'saving'
        ? 'Refreshing your summary…'
        : 'Importing…'
  const savedChoices = !intake.dirty && sameFindings,
    checkFindings =
      needsFindingsRecovery ||
      retainedImportWork ||
      (flow.phase === 'paused' && !!(flow.discovery || flow.page || flow.legacyAttemptId)),
    viewFindings =
      savedChoices &&
      (flow.phase !== 'ready' || needsFindingsRecovery) &&
      !!(
        flow.summary ||
        flow.localReviewId ||
        flow.page?.completed ||
        flow.legacyValid ||
        (flow.discovery && !flow.discovery.tasks.some((t) => t.state === 'pending'))
      ),
    continueFindings =
      savedChoices &&
      ['ready', 'paused'].includes(flow.phase) &&
      !!flow.discovery?.tasks.some(retryableImportTask),
    startNewVisible =
      savedChoices &&
      (flow.phase === 'paused' || flow.summary?.outcome !== 'ready') &&
      !!(flow.discovery || flow.legacyAttemptId || flow.page || flow.summary),
    retainedOutcome = !!connections.status?.work.some(
      (work) =>
        work.feature === 'import' &&
        sameScope(work.scope, flow.scope) &&
        work.state === 'retained-outcome'
    ),
    localProtection = !!connections.status?.work.some(
      (work) =>
        work.feature === 'import' &&
        sameScope(work.scope, flow.scope) &&
        ['protection-required', 'handoff-required', 'record-unavailable'].includes(work.state)
    ),
    showFindingsRecovery =
      !state.pending &&
      !state.uncertainPicker &&
      (flow.phase === 'paused' || flow.phase === 'ready' || needsFindingsRecovery) &&
      (checkFindings ||
        viewFindings ||
        continueFindings ||
        startNewVisible ||
        retainedOutcome ||
        localProtection)
  const legacyTransition =
    savedChoices && !!(flow.page || flow.legacyAttemptId) && flow.phase === 'paused'
  const analysisIncomplete = !!(
    flow.discovery?.tasks.some((t) =>
      flow.discovery?.type === 'semantic' ? t.state !== 'valid' : !t.normalizationId
    ) ||
    flow.discovery?.omitted ||
    flow.page?.failed ||
    flow.page?.remaining ||
    (flow.legacyAttemptId && !flow.legacyValid)
  )
  const announcement = !state.opened
    ? ''
    : state.screen === 'results' && flow.summary
      ? flow.busy
        ? resultStatus
        : flow.summary.outcome === 'already-present'
          ? 'This content is already in your project. Nothing new to import.'
          : flow.summary.outcome === 'empty'
            ? flow.summary.manifest.version >= 3 && flow.summary.manifest.partial
              ? 'No usable findings are ready. Some selected content could not be fully interpreted.'
              : analysisIncomplete
                ? 'Analysis could not produce usable findings. Your original files are kept.'
                : 'No importable content was found for your selection.'
            : `Ready to import. ${state.settings.categories
                .map((category) => {
                  const count = flow.summary!.manifest.counts[category]
                  const noun =
                    category === 'chats'
                      ? 'conversation'
                      : category === 'sources'
                        ? 'source'
                        : 'note'
                  return `${count} ${noun}${count === 1 ? '' : 's'}`
                })
                .join(', ')}.`
      : flow.busy
        ? `${processingText}${
            flow.phase === 'analyzing' && flow.discovery
              ? ` ${processedImportTasks(flow.discovery.tasks)} of ${flow.discovery.tasks.length} ${flow.discovery.type === 'semantic' ? 'content' : 'structure'} tasks processed.`
              : ''
          }`
        : state.busy
          ? 'Updating your selection…'
          : ''
  return (
    <ImportContext.Provider
      value={{
        open: intake.open,
        showAnalysis: intake.showAnalysis,
        busy: state.busy
      }}
    >
      {children}
      {success ? (
        <div className={styles.success} role="status">
          <p>{success.text}</p>
          <IconButton
            label="Dismiss import notice"
            variant="subtle"
            size="sm"
            onClick={intake.dismissSuccess}
          >
            <IconX size={16} aria-hidden="true" />
          </IconButton>
        </div>
      ) : null}
      <AppDialog
        title={
          state.screen === 'results'
            ? flow.summary?.outcome === 'ready'
              ? 'Ready to import'
              : 'Import summary'
            : 'Import into project'
        }
        opened={state.opened}
        size="38rem"
        classNames={{
          content: styles.dialogContent,
          header: styles.dialogHeader,
          title: styles.dialogTitle,
          body: styles.dialogBody
        }}
        onClose={() => {
          if (state.screen === 'results') {
            intake.showSetup()
          } else if (flow.busy) void flow.cancel()
          else void intake.close()
        }}
        dismissible={
          state.screen === 'results'
            ? !flow.busy
            : (flow.busy || !state.busy) && flow.phase !== 'stopping'
        }
        returnFocus={false}
        onExited={exited}
      >
        <VisuallyHidden role="status" aria-atomic="true">
          {announcement}
        </VisuallyHidden>
        <div
          ref={presentation}
          className={styles.presentation}
          tabIndex={-1}
          onFocusCapture={trackFocus}
        >
          {state.screen === 'results' && flow.summary ? (
            <ImportResults
              key={flow.summary.manifest.id}
              retainedAttempts={flow.retainedAttempts}
              summary={flow.summary}
              conversations={flow.conversations}
              categories={state.settings.categories}
              issue={flow.issue}
              busy={flow.busy || flow.phase === 'complete'}
              status={resultStatus}
              blocked={!writable}
              needsRecovery={needsFindingsRecovery}
              analysisIncomplete={analysisIncomplete}
              onCancel={() => {
                intake.showSetup()
              }}
              onAccept={() => void flow.accept()}
              onCheck={() => void flow.check()}
            />
          ) : (
            <div className={styles.intake} {...composition}>
              <div className={styles.body}>
                <p className={styles.subtitle}>{state.title}</p>
                {flow.busy ? (
                  <ImportProgress
                    label={processingText}
                    stopping={flow.phase === 'stopping'}
                    discovery={
                      ['analyzing', 'stopping'].includes(flow.phase) ? flow.discovery : null
                    }
                    reducedMotion={reducedMotion}
                  />
                ) : (
                  <>
                    <section aria-label="Files">
                      <div className={styles.fileHeading}>
                        <strong>Files</strong>
                        <AppButton
                          data-autofocus
                          data-import-focus
                          variant="light"
                          size="sm"
                          disabled={formBlocked}
                          onClick={() => void intake.addFiles()}
                        >
                          Add files
                        </AppButton>
                      </div>
                      <p className={styles.helper}>
                        JSON, text/Markdown, CSL-JSON, BibTeX and RIS.
                      </p>
                      <p className={styles.helper}>
                        Selected originals are kept in this project, including content you
                        don&apos;t import.
                      </p>
                      {selectedFiles.length ? (
                        <ul className={styles.files} aria-label="Selected files">
                          {selectedFiles.map((file) => (
                            <li key={file.id}>
                              <div>
                                <span>{file.originalName}</span>
                                <small>{bytesLabel(file.bytes)}</small>
                              </div>
                              <IconButton
                                label={`Remove ${file.originalName}`}
                                variant="subtle"
                                size="sm"
                                disabled={formBlocked}
                                onClick={() => intake.removeFile(file.id)}
                              >
                                <IconX size={16} aria-hidden="true" />
                              </IconButton>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={styles.empty}>Choose one or more files to import.</p>
                      )}
                    </section>
                    {state.results.some((r) => !['staged', 'duplicate'].includes(r.status)) ? (
                      <ul className={styles.fileIssues} role="alert">
                        {state.results
                          .filter((r) => !['staged', 'duplicate'].includes(r.status))
                          .map((result, i) => (
                            <li key={i}>
                              {result.name}: {pickMessage(result)}
                            </li>
                          ))}
                      </ul>
                    ) : null}
                    <fieldset disabled={formBlocked}>
                      <legend>Import</legend>
                      <div className={styles.categories}>
                        {(['chats', 'sources', 'notes'] as const).map((category) => (
                          <ChoiceField
                            key={category}
                            label={categoryLabels[category]}
                            checked={state.settings.categories.includes(category)}
                            onChange={(event) =>
                              intake.setCategory(category, event.currentTarget.checked)
                            }
                          />
                        ))}
                      </div>
                      {!state.settings.categories.length && selectedFiles.length ? (
                        <p className={styles.helper}>Choose at least one type of content.</p>
                      ) : null}
                    </fieldset>
                    <TextareaField
                      label="Additional instructions (optional)"
                      placeholder="Anything Collie should focus on or leave out?"
                      maxLength={IMPORT_LIMITS.instructions}
                      value={state.settings.instructions}
                      disabled={formBlocked}
                      autosize
                      minRows={2}
                      maxRows={5}
                      onChange={(event) => intake.setInstructions(event.currentTarget.value)}
                    />
                    <SelectField
                      label="Model"
                      description="Used only when ChatGPT interpretation is needed. Supported files do not need a connection or model."
                      value={modelId ?? ''}
                      disabled={
                        formBlocked ||
                        connections.busy ||
                        connections.statusUnavailable ||
                        !connections.status?.actions.selectModel
                      }
                      data={[
                        {
                          value: '',
                          label:
                            catalog?.state === 'loading'
                              ? 'Loading models…'
                              : 'Not needed for local import',
                          disabled: true
                        },
                        ...(catalog?.state === 'loaded'
                          ? catalog.models.map((m) => ({ value: m.id, label: m.label }))
                          : [])
                      ]}
                      onChange={(event) =>
                        intake.selectModel(event.currentTarget.value, event.currentTarget)
                      }
                    />
                    {continueFindings && availability.message ? (
                      <div className={styles.connection}>
                        <p className={styles.helper} role="status">
                          {availability.message}
                        </p>
                        {availability.action === 'check' ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            pending={connections.checking}
                            disabled={state.busy || session.closing || !session.available}
                            onClick={() => void connections.checkStatus(true)}
                          >
                            Check status
                          </AppButton>
                        ) : availability.action === 'manage' ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            disabled={
                              state.busy || !!state.pending || state.uncertainPicker || flow.locked
                            }
                            onClick={() => void intake.close(true)}
                          >
                            {connections.status?.connectionHealth.action === 'connect'
                              ? 'Connect ChatGPT'
                              : 'Manage ChatGPT'}
                          </AppButton>
                        ) : null}
                      </div>
                    ) : null}
                    {showFindingsRecovery ? (
                      <div className={styles.recovery}>
                        <p className={styles.helper}>
                          Nothing is added to Chats, Sources or Notes until you Accept a summary.
                          Project Save keeps your files and findings; it does not finish the import.
                        </p>
                        {checkFindings ? (
                          <AppButton
                            variant="light"
                            size="sm"
                            disabled={state.busy || flow.busy}
                            onClick={() => void flow.check()}
                          >
                            Check status
                          </AppButton>
                        ) : null}
                        {viewFindings ? (
                          <AppButton
                            variant="light"
                            size="sm"
                            disabled={state.busy || !flow.canEdit()}
                            onClick={() =>
                              void (flow.discovery
                                ? intake.submit(false, true)
                                : flow.viewResults())
                            }
                          >
                            View available results
                          </AppButton>
                        ) : null}
                        {continueFindings ? (
                          <AppButton
                            variant="light"
                            size="sm"
                            disabled={formBlocked || !ready}
                            onClick={() => void intake.submit(true)}
                          >
                            Continue analysis
                          </AppButton>
                        ) : null}
                        {legacyTransition ? (
                          <p className={styles.helper}>
                            Use new importer reads these retained files again. Your earlier review
                            and original files stay saved.
                          </p>
                        ) : null}
                        {legacyTransition ? (
                          <AppButton
                            variant="light"
                            size="sm"
                            disabled={
                              blocked || !flow.canEdit() || localProtection || retainedOutcome
                            }
                            onClick={() => void intake.transitionHybrid()}
                          >
                            Use new importer
                          </AppButton>
                        ) : null}
                        {startNewVisible ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            disabled={blocked || !flow.canEdit()}
                            onClick={() => void intake.startNew()}
                          >
                            Start new import
                          </AppButton>
                        ) : null}
                        {retainedOutcome ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            disabled={state.busy || flow.busy}
                            onClick={() => void flow.protect(true)}
                          >
                            Finish recovery
                          </AppButton>
                        ) : null}
                        {localProtection ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            disabled={state.busy || flow.busy}
                            onClick={() => void flow.protect()}
                          >
                            Try saving again
                          </AppButton>
                        ) : null}
                      </div>
                    ) : null}
                    {state.pending || state.uncertainPicker ? (
                      <div className={styles.recovery}>
                        <AppButton
                          variant="light"
                          size="sm"
                          pending={state.busy}
                          onClick={() => void intake.check()}
                        >
                          Check status
                        </AppButton>
                        {state.pending ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            disabled={state.busy || !writable}
                            onClick={() => void intake.resolve('retry')}
                          >
                            Try saving again
                          </AppButton>
                        ) : null}
                        {state.pending ? (
                          <AppButton
                            variant="subtle"
                            size="sm"
                            disabled={state.busy}
                            onClick={() => void intake.resolve('abandon')}
                          >
                            {state.pending.action === 'add-file'
                              ? 'Remove failed file'
                              : 'Restore saved choices'}
                          </AppButton>
                        ) : null}
                      </div>
                    ) : null}
                    <AppButton
                      variant="subtle"
                      size="sm"
                      onClick={() =>
                        void window.collie.conversationPresentation('open-link', CHATGPT_USAGE_URL)
                      }
                    >
                      Manage usage
                    </AppButton>
                    <p className={styles.helper}>
                      Collie reads supported data locally. Submit sends content needing
                      interpretation and your instructions to your selected ChatGPT account and
                      model.
                    </p>
                  </>
                )}
                {state.busy ? <p className={styles.helper}>Updating your selection…</p> : null}
                {!writable ? (
                  <p role="status">Open a writable project to continue importing.</p>
                ) : null}
                {notice ? (
                  <p role="alert" className={styles.issue}>
                    {notice}
                  </p>
                ) : null}
              </div>
              <footer className={styles.footer}>
                <div className={styles.footerActions}>
                  <AppButton
                    variant="default"
                    disabled={(!flow.busy && state.busy) || flow.phase === 'stopping'}
                    onClick={() => {
                      if (flow.busy) void flow.cancel()
                      else void intake.close()
                    }}
                  >
                    {flow.phase === 'stopping' ? 'Stopping…' : 'Cancel'}
                  </AppButton>
                  {!flow.busy ? (
                    <AppButton
                      disabled={
                        formBlocked || !selectedFiles.length || !state.settings.categories.length
                      }
                      onClick={() => void intake.submit()}
                    >
                      Submit
                    </AppButton>
                  ) : null}
                </div>
              </footer>
            </div>
          )}
        </div>
      </AppDialog>
    </ImportContext.Provider>
  )
}
function pickMessage(result: ImportPickResult): string {
  if (result.status === 'unsupported') return 'Choose JSON, text, Markdown, BibTeX or RIS.'
  if (result.status === 'not-staged') return 'Choose this file again after checking import status.'
  if (result.code === 'VALIDATION') return 'This file could not be read as supported UTF-8 text.'
  const failure = projectFailure('', result.code ?? 'UNAVAILABLE')
  return failure.ok ? 'The file could not be added.' : failure.error.message
}
