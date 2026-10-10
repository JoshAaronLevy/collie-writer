import {
  confirmationCommand,
  isCommitValue,
  type CommitValue,
  type ImportCommitCommand,
  type CommitRequest
} from '../../../../shared/import-commit'
import type { ResearchTarget } from '../../app/navigation'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { TextInput } from '@mantine/core'
import {
  isReviewChoice,
  type ReviewChoice,
  type ReviewRequest,
  type ReviewValue,
  type ReviewTab
} from '../../../../shared/import-review'
import type { OpenInput } from '../../../../shared/projects'
import type { PlanPage } from '../../../../shared/import-multipart'
import type { GraphValue } from '../../../../shared/import-graph'
import { sameScope } from '../../../../shared/project-files'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { AppButton, ChoiceField, SelectField, TextareaField } from '../../components/ui/Controls'
import { ImportSourceFields } from './ImportSourceFields'
import { ImportTranscriptPreview } from './ImportTranscriptPreview'
import styles from './ImportProvider.module.css'

type Page = Extract<ReviewValue, { type: 'review-page' }>
type Detail = Extract<ReviewValue, { type: 'review-item' }>
type Manifest = Extract<ReviewValue, { type: 'confirmation-page' }>
type Form = { choice: ReviewChoice; tags: string; categories: string }
type State = {
  scope: OpenInput | null
  shown: boolean
  page: Page | null
  detail: Detail | null
  form: Form | null
  dirty: boolean
  composing: boolean
  busy: boolean
  issue: string
  pending: ReviewRequest | null
  pendingCommit: ImportCommitCommand | null
  completed: CommitValue | null
  acceptedChat: { conversationId: string; revisionId: string } | null
  manifest: Manifest | null
  sources: Extract<ReviewValue, { type: 'review-sources' }> | null
  query: string
  partialReason: string
  partialConsent: boolean
  text: Extract<GraphValue, { type: 'graph-text' }> | null
  transcript: boolean
}
const initial: State = {
  scope: null,
  shown: false,
  page: null,
  detail: null,
  form: null,
  dirty: false,
  composing: false,
  busy: false,
  issue: '',
  pending: null,
  pendingCommit: null,
  completed: null,
  acceptedChat: null,
  manifest: null,
  sources: null,
  query: '',
  partialReason: 'Unfinished or blocked material explicitly excluded from this partial import.',
  partialConsent: false,
  text: null,
  transcript: false
}
const formFor = (choice: ReviewChoice): Form => ({
  choice,
  tags: choice.labels
    .filter((l) => l.kind === 'tag')
    .map((l) => l.name)
    .join('\n'),
  categories: choice.labels
    .filter((l) => l.kind === 'category')
    .map((l) => l.name)
    .join('\n')
})
export function useImportReview(options: {
  scope: OpenInput | null
  plan: PlanPage | null
  disabled: boolean
  focus: () => void
  onDestination: (target: ResearchTarget) => void
}): { content: ReactNode; busy: boolean; locked: boolean; shown: boolean; completed: boolean } {
  const session = useWorkspaceSession(),
    [state, render] = useState<State>(initial),
    owned = useRef(state),
    latest = useRef({ session, options }),
    composing = useRef(false)
  useLayoutEffect(() => {
    latest.current = { session, options }
  })
  useLayoutEffect(() => {
    if (owned.current.scope && !sameScope(owned.current.scope, options.scope)) {
      owned.current = { ...initial }
      render(owned.current)
    }
  }, [options.scope])
  useEffect(() => {
    const captured = latest.current.options.scope,
      batchId = options.plan?.plan.batchId
    if (!captured || !batchId) return
    let disposed = false
    void window.collie
      .importAnalysis({ ...captured, action: 'import-report', batchId, offset: 0 })
      .then((result) => {
        if (
          !disposed &&
          result.ok &&
          isCommitValue(result.value) &&
          sameScope(captured, latest.current.options.scope)
        )
          patch({
            scope: captured,
            completed: result.value.receipt ? result.value : null,
            acceptedChat: null
          })
      })
      .catch(() => {})
    return () => {
      disposed = true
    }
  }, [options.scope?.projectId, options.scope?.workspaceId, options.plan?.plan.batchId])
  function patch(update: Partial<State>): void {
    owned.current = { ...owned.current, ...update }
    render(owned.current)
    latest.current.session.drafts.changed()
  }
  function scope(): OpenInput {
    const s = owned.current.scope ?? latest.current.options.scope
    if (!s || !sameScope(s, latest.current.session.current.current))
      throw new Error('Reopen the original project to review this import.')
    return s
  }
  async function request(input: ReviewRequest): Promise<ReviewValue> {
    const result = await window.collie.importAnalysis(input)
    if (!result.ok) throw new Error(result.error.message)
    const value = result.value
    if (
      ![
        'review-page',
        'review-item',
        'review-sources',
        'confirmation-page',
        'review-unapplied'
      ].includes(value.type)
    )
      throw new Error('The protected review could not be read.')
    return value as ReviewValue
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (owned.current.busy || composing.current) return
    const captured = scope()
    patch({ busy: true, issue: '' })
    try {
      await work()
    } catch (e) {
      if (sameScope(captured, latest.current.session.current.current))
        patch({
          issue:
            e instanceof Error
              ? e.message
              : 'The review reply is uncertain. Your exact request and draft are retained.'
        })
    } finally {
      if (sameScope(captured, owned.current.scope)) patch({ busy: false })
    }
  }
  async function load(
    tab: ReviewTab = owned.current.page?.tab ?? 'chats',
    offset = 0
  ): Promise<void> {
    const s = owned.current
    if (!s.page) return
    const value = await request({
      ...scope(),
      action: 'review-page',
      reviewId: s.page.review.id,
      tab,
      offset
    })
    if (
      value.type === 'review-page' &&
      sameScope(owned.current.scope, latest.current.session.current.current)
    )
      patch({ page: value })
  }
  async function open(): Promise<void> {
    if (owned.current.dirty || owned.current.pending || owned.current.pendingCommit) {
      patch({
        shown: true,
        issue:
          'Save or discard the retained correction before opening a different analysis revision.'
      })
      return
    }
    const plan = latest.current.options.plan
    if (!plan) return
    patch({ scope: scope(), shown: true })
    await run(async () => {
      const value = await request({
        ...scope(),
        action: 'review-open',
        planId: plan.plan.id,
        proposalId: plan.proposalId
      })
      if (value.type === 'review-page')
        patch({
          page: value,
          detail: null,
          form: null,
          manifest: null,
          sources: null,
          text: null,
          transcript: false
        })
      if (value.type === 'review-page' && value.manifestId) {
        const saved = await request({
          ...scope(),
          action: 'confirmation-page',
          reviewId: value.review.id,
          manifestId: value.manifestId,
          offset: 0
        })
        if (saved.type === 'confirmation-page') {
          patch({ manifest: saved })
          await commitRequest({
            ...scope(),
            action: 'import-outcome',
            command: confirmationCommand(saved.manifest)
          })
        }
      }
      await latest.current.session.refreshConversationHead(scope())
    })
  }
  async function detail(itemId: string, offset = 0): Promise<void> {
    if (!owned.current.page || owned.current.dirty || owned.current.pending) return
    await run(async () => {
      const value = await request({
        ...scope(),
        action: 'review-item',
        reviewId: owned.current.page!.review.id,
        itemId,
        offset
      })
      if (value.type === 'review-item')
        patch({
          detail: value,
          form: formFor(value.row.choice),
          dirty: false,
          sources: null,
          text: null,
          transcript: false
        })
    })
  }
  function change(update: Partial<ReviewChoice>): void {
    const f = owned.current.form
    if (!f) return
    patch({
      form: { ...f, choice: { ...f.choice, ...update } },
      dirty: true,
      manifest: null,
      partialConsent: false
    })
  }
  async function apply(input: ReviewRequest): Promise<void> {
    patch({ pending: input })
    const value = await request(input)
    await applied(value)
  }
  async function applied(value: ReviewValue): Promise<void> {
    if (value.type === 'review-page') {
      patch({ pending: null, page: value, dirty: false, manifest: null })
      const item = owned.current.detail?.row.id
      if (item) {
        const refreshed = await request({
          ...scope(),
          action: 'review-item',
          reviewId: value.review.id,
          itemId: item,
          offset: owned.current.detail!.offset
        })
        if (refreshed.type === 'review-item')
          patch({ detail: refreshed, form: formFor(refreshed.row.choice) })
      }
    } else if (value.type === 'confirmation-page') patch({ pending: null, manifest: value })
    await latest.current.session.refreshConversationHead(scope())
  }
  async function reconcile(): Promise<void> {
    const original = owned.current.pending
    if (
      !original ||
      !['review-save', 'review-chat', 'review-partial', 'confirmation-prepare'].includes(
        original.action
      )
    )
      return
    await run(async () => {
      const value = await request({
        ...scope(),
        action: 'review-reconcile',
        command: original as Extract<
          ReviewRequest,
          { action: 'review-save' | 'review-chat' | 'review-partial' | 'confirmation-prepare' }
        >
      })
      if (value.type === 'review-unapplied')
        patch({
          pending: null,
          issue:
            'This request was not applied. The correction is retained; adjust it or retry Save explicitly.'
        })
      else await applied(value)
    })
  }
  async function save(includeMessages = false): Promise<void> {
    const s = owned.current
    if (!s.form || !s.page || !s.detail) return
    const labels = [
        ...s.form.tags
          .split('\n')
          .filter((name) => name.trim())
          .map((name) => ({ kind: 'tag' as const, name: name.trim() })),
        ...s.form.categories
          .split('\n')
          .filter((name) => name.trim())
          .map((name) => ({ kind: 'category' as const, name: name.trim() }))
      ],
      choice = {
        ...s.form.choice,
        labels,
        ...(includeMessages ? { state: 'include' as const } : {})
      }
    if (!isReviewChoice(choice)) {
      patch({
        issue:
          'Complete the required source title and supported fields, and keep labels within 100 entries of 100 characters each.'
      })
      return
    }
    await run(() =>
      apply({
        ...scope(),
        action: includeMessages ? 'review-chat' : 'review-save',
        reviewId: s.page!.review.id,
        operationId: crypto.randomUUID(),
        expectedRevision: s.detail!.revisionId,
        choice
      })
    )
  }
  async function prepareConfirmation(): Promise<void> {
    const s = owned.current
    if (!s.page?.revisionId || s.dirty || s.pending) return
    await run(async () => {
      const protectedProject = await latest.current.session.flush(false, 'save', [
        'project-import-review'
      ])
      if (!protectedProject)
        throw new Error(
          'Protect or finish the current project drafts before preparing confirmation.'
        )
      await apply({
        ...scope(),
        action: 'confirmation-prepare',
        reviewId: s.page!.review.id,
        operationId: crypto.randomUUID(),
        expectedRevision: s.page!.revisionId!
      })
    })
  }
  async function commitRequest(input: CommitRequest): Promise<void> {
    const result = await window.collie.importAnalysis(input)
    if (!result.ok) throw new Error(result.error.message)
    if (!isCommitValue(result.value))
      throw new Error(
        'The import receipt could not be read. Check the saved outcome before retrying.'
      )
    if (!sameScope(input, latest.current.session.current.current)) return
    if (result.value.receipt) {
      if (
        owned.current.pendingCommit &&
        JSON.stringify(owned.current.pendingCommit) !== JSON.stringify(result.value.receipt.command)
      )
        throw new Error(
          'A different completed import was found. Reconcile the retained exact confirmation before continuing.'
        )
      patch({ completed: result.value, pendingCommit: null, dirty: false, shown: true })
      await latest.current.session.refreshConversationHead(input)
    } else if (input.action === 'import-outcome') {
      if (!owned.current.pendingCommit) return
      patch({
        pendingCommit: null,
        issue:
          'This exact confirmation has not been applied. Confirm explicitly to try again; no analysis is repeated.'
      })
    } else patch({ completed: null, issue: 'No completed import is recorded for this selection.' })
  }
  async function confirmImport(): Promise<void> {
    const s = owned.current
    if (!s.manifest?.current || s.dirty || s.pending || s.pendingCommit || s.completed?.receipt)
      return
    const command = confirmationCommand(s.manifest.manifest)
    await run(async () => {
      if (!(await latest.current.session.flush(false, 'save', ['project-import-review'])))
        throw new Error(
          'Protect or finish the current project drafts before confirming this import.'
        )
      if (latest.current.options.disabled || !sameScope(scope(), latest.current.options.scope))
        return
      patch({ pendingCommit: command })
      await commitRequest({ ...scope(), action: 'import-commit', command })
    })
  }
  async function readText(textId: string, offset = 0): Promise<void> {
    if (!owned.current.page || !owned.current.form) return
    await run(async () => {
      const result = await window.collie.projectImport({
        ...scope(),
        action: 'graph-text',
        batchId: owned.current.page!.review.batchId,
        graphId: owned.current.page!.review.graphId,
        recordId: owned.current.form!.choice.recordId,
        textId,
        offset
      })
      if (!result.ok) throw new Error(result.error.message)
      if (result.value.type === 'graph-text') patch({ text: result.value })
    })
  }
  const composition = useRetainedDraft('project-import-review', {
    read: () => ({
      scope: owned.current.scope ?? { projectId: '', workspaceId: '' },
      kind: 'project-import-review',
      entityId: owned.current.page?.review.id ?? null,
      label: 'Import review correction',
      dirty: owned.current.dirty,
      composing: composing.current,
      busy: owned.current.busy,
      pendingOperation: owned.current.pendingCommit ?? owned.current.pending,
      policy: 'retain',
      explicitSave: true,
      issue: owned.current.issue,
      target: {
        kind: 'workspace',
        scope: owned.current.scope ?? { projectId: '', workspaceId: '' },
        view: 'details'
      }
    }),
    focus: () => {
      patch({ shown: true })
      latest.current.options.focus()
    }
  })
  const p = state.page,
    d = state.detail,
    f = state.form,
    blocked = options.disabled || state.busy || !!state.pending || !!state.pendingCommit,
    reviewCurrent =
      !!p?.current &&
      options.plan?.current &&
      p.review.planId === options.plan.plan.id &&
      p.review.proposalId === options.plan.proposalId,
    editable = reviewCurrent && !blocked && !state.completed?.receipt,
    variant = d?.variants.find((v) => v.record.id === f?.choice.recordId)
  const completed =
    state.completed?.receipt?.batchId === options.plan?.plan.batchId ? state.completed : null
  const content = (
    <section className={styles.preview} aria-label="Review proposed import">
      {!completed?.receipt ? (
        <div className={styles.actions}>
          <AppButton
            variant="default"
            disabled={blocked || !options.plan?.current}
            onClick={() => void open()}
          >
            Review proposed import
          </AppButton>
          {state.page ? (
            <AppButton variant="subtle" onClick={() => patch({ shown: !state.shown })}>
              {state.shown ? 'Hide review' : 'Show retained review'}
            </AppButton>
          ) : null}
        </div>
      ) : null}
      <AppButton
        variant="subtle"
        disabled={state.busy || !options.plan || !session.available || session.closing}
        onClick={() => {
          patch({ scope: scope() })
          void run(() =>
            commitRequest({
              ...scope(),
              action: 'import-report',
              batchId: options.plan!.plan.batchId,
              offset: 0
            })
          )
        }}
      >
        Check completed import
      </AppButton>
      {state.pendingCommit ? (
        <section aria-label="Import outcome recovery">
          <p role="alert">
            The confirmation reply is uncertain. Keep this exact confirmation until its saved
            outcome is known.
          </p>
          <AppButton
            disabled={state.busy || !session.available || session.closing}
            onClick={() =>
              void run(() =>
                commitRequest({
                  ...scope(),
                  action: 'import-outcome',
                  command: state.pendingCommit!
                })
              )
            }
          >
            Check saved import outcome
          </AppButton>
        </section>
      ) : null}
      {completed?.receipt ? (
        <section className={styles.preview} aria-label="Completed import">
          <h2>Import completed</h2>
          <p role="status">
            {completed.counts!.chats} chats, {completed.counts!.messages} messages,{' '}
            {completed.counts!.newSources} new sources, {completed.counts!.reusedSources} reused
            sources and {completed.counts!.notes} notes are protected in this project.{' '}
            {completed.counts!.excluded} original records were skipped. Use Save to write the
            project file.
          </p>
          <p>Checking this receipt makes no ChatGPT request.</p>
          <ul>
            {completed.entries.map((e) => (
              <li key={e.itemId}>
                {e.kind}: {e.title || 'Original message'} · {e.action}
                {e.action !== 'exclude' && e.kind === 'chat' ? (
                  <AppButton
                    variant="subtle"
                    disabled={state.busy}
                    onClick={() =>
                      patch({
                        acceptedChat: {
                          conversationId: e.destinationId!,
                          revisionId: e.revisionId!
                        }
                      })
                    }
                  >
                    Open imported transcript
                  </AppButton>
                ) : null}
                {e.action !== 'exclude' && (e.kind === 'source' || e.kind === 'note') ? (
                  <AppButton
                    variant="subtle"
                    disabled={state.busy || state.dirty || !!state.pending || !!state.pendingCommit}
                    onClick={() =>
                      options.onDestination(
                        e.kind === 'source'
                          ? { kind: 'sources', sourceId: e.destinationId! }
                          : { kind: 'notes', noteId: e.destinationId! }
                      )
                    }
                  >
                    Open in Research
                  </AppButton>
                ) : null}
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            {[Math.max(0, completed.offset - 10), completed.offset + completed.entries.length].map(
              (offset, i) => (
                <AppButton
                  key={i}
                  variant="subtle"
                  disabled={
                    state.busy || (i === 0 ? completed!.offset === 0 : offset >= completed!.total)
                  }
                  onClick={() =>
                    void run(() =>
                      commitRequest({
                        ...scope(),
                        action: 'import-report',
                        batchId: completed!.receipt!.batchId,
                        offset
                      })
                    )
                  }
                >
                  {i === 0 ? 'Previous destinations' : 'Next destinations'}
                </AppButton>
              )
            )}
          </div>
          <details>
            <summary>Import receipt</summary>
            <p>
              {completed.receipt.id} · {completed.receipt.createdAt}
            </p>
          </details>
          {state.acceptedChat ? (
            <ImportTranscriptPreview
              key={state.acceptedChat.conversationId}
              scope={scope()}
              batchId={completed.receipt.batchId}
              graphId={completed.receipt.graphId}
              recordId={state.acceptedChat.conversationId}
              accepted={state.acceptedChat}
              files={[]}
              disabled={state.busy}
              onClose={() => patch({ acceptedChat: null })}
            />
          ) : null}
        </section>
      ) : null}
      {state.shown && p && !completed?.receipt ? (
        <>
          <h2>Review before importing</h2>
          <p role="status">
            Proposed: {p.counts.chats} chats · {p.counts.messages} messages · {p.counts.newSources}{' '}
            new sources · {p.counts.reusedSources} existing sources · {p.counts.notes} notes.{' '}
            {p.counts.excluded} original records explicitly excluded; {p.counts.retained} retained
            only. {p.undecided} undecided groups; {p.blocking} groups/issues block confirmation.
          </p>
          <p>
            Choose each destination explicitly. Original text stays unchanged. Source reuse
            preserves its existing metadata and verification.{' '}
            {p.partial ? 'This review contains an explicit partial-import revision.' : ''}
          </p>
          {!reviewCurrent ? (
            <p role="alert">
              Analysis or file choices changed. This saved review is retained for inspection. Open
              the current proposal to start its separate review.
            </p>
          ) : null}
          {state.issue ? <p role="alert">{state.issue}</p> : null}
          {state.pending ? (
            <>
              <p role="alert">
                The local reply is uncertain. Repeat this exact request to reconcile it; no ChatGPT
                request or final import is sent.
              </p>
              <AppButton
                disabled={state.busy || !session.available || session.closing}
                onClick={() => void reconcile()}
              >
                Reconcile saved review
              </AppButton>
            </>
          ) : null}
          <details>
            <summary>File coverage and retained analysis</summary>
            <ul>
              {p.files.map((file) => (
                <li key={file.id}>
                  {file.name}: {file.identified} of {file.records} eligible originals fully
                  identified.
                </li>
              ))}
            </ul>
            <p>
              Graph {p.review.graphId} · proposal {p.review.proposalId ?? 'no valid results'} ·{' '}
              {p.review.results.length} protected part results. Fragments that are unfinished,
              unresolved or unsupported cannot be accepted by a checkbox.
            </p>
          </details>
          {p.globalIssues.map((issue) => (
            <p key={issue} role="alert">
              {issue}
            </p>
          ))}
          <div className={styles.actions} aria-label="Review categories">
            {(['chats', 'sources', 'notes', 'issues'] as const).map((tab) => (
              <AppButton
                key={tab}
                variant="default"
                aria-pressed={p.tab === tab}
                disabled={blocked || state.dirty}
                onClick={() => void run(() => load(tab))}
              >
                {tab[0].toUpperCase() + tab.slice(1)}
              </AppButton>
            ))}
            <AppButton
              variant="subtle"
              disabled={blocked || state.dirty}
              onClick={() => void run(() => load(p.tab, p.offset))}
            >
              Refresh review
            </AppButton>
          </div>
          <p>
            {p.total} groups in {p.tab}. Showing {p.rows.length ? p.offset + 1 : 0}–
            {p.offset + p.rows.length}.
          </p>
          <ul className={styles.records}>
            {p.rows.map((row) => (
              <li key={row.id}>
                <strong>
                  {row.kind}: {row.title || 'Untitled'}
                </strong>{' '}
                · {row.choice.state} · {row.records} original representation(s)
                {!row.eligible ? ' · retained only' : ''}
                {row.blockers.map((b) => (
                  <p key={b}>{b}</p>
                ))}
                <AppButton
                  variant="subtle"
                  disabled={blocked || state.dirty}
                  onClick={() => void detail(row.id)}
                >
                  Review {row.kind}
                </AppButton>
              </li>
            ))}
          </ul>
          <div className={styles.actions}>
            <AppButton
              variant="subtle"
              disabled={blocked || state.dirty || p.offset === 0}
              onClick={() => void run(() => load(p.tab, Math.max(0, p.offset - 10)))}
            >
              Previous groups
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={blocked || state.dirty || p.offset + p.rows.length >= p.total}
              onClick={() => void run(() => load(p.tab, p.offset + p.rows.length))}
            >
              Next groups
            </AppButton>
          </div>
          {d && f ? (
            <form
              className={styles.reviewForm}
              onSubmit={(e) => {
                e.preventDefault()
                if (!blocked) void save()
              }}
              onCompositionStartCapture={() => {
                composing.current = true
                patch({ composing: true })
                composition.onCompositionStartCapture()
              }}
              onCompositionEndCapture={() => {
                composing.current = false
                patch({ composing: false })
                composition.onCompositionEndCapture()
              }}
            >
              <h3>
                Review {d.row.kind}: {d.row.title || 'Untitled'}
              </h3>
              {d.row.blockers.map((b) => (
                <p key={b} role="alert">
                  {b}
                </p>
              ))}
              <SelectField
                label="Disposition"
                disabled={!editable}
                value={f.choice.state}
                data={[
                  { value: 'undecided', label: 'Undecided' },
                  { value: 'include', label: 'Include this chosen original' },
                  { value: 'exclude', label: 'Exclude this identity group' }
                ]}
                onChange={(e) => change({ state: e.currentTarget.value as ReviewChoice['state'] })}
              />
              <TextInput
                label="Exclusion reason / decision note"
                maxLength={1000}
                value={f.choice.reason}
                disabled={!editable}
                onChange={(e) => change({ reason: e.currentTarget.value })}
              />
              <SelectField
                label="Original representation and path"
                value={f.choice.recordId}
                disabled={!editable}
                data={[
                  ...(!variant
                    ? [
                        {
                          value: f.choice.recordId,
                          label: 'Current chosen original (on another variants page)'
                        }
                      ]
                    : []),
                  ...d.variants.map((v) => ({
                    value: v.record.id,
                    label: `${v.record.label || v.record.kind} · ${v.record.path} · ${v.identified ? 'fully identified' : 'unfinished / unresolved'} · ${v.record.locator.pointer}`
                  }))
                ]}
                onChange={(e) => {
                  const v = d.variants.find((v) => v.record.id === e.currentTarget.value)
                  if (v) {
                    change({
                      recordId: v.record.id,
                      title: v.record.label.slice(0, 500),
                      metadata: v.metadata,
                      labels: v.labels,
                      reuse: null,
                      acknowledged: false
                    })
                    const next = owned.current.form!
                    patch({ form: formFor(next.choice), text: null, transcript: false })
                  }
                }}
              />
              <p>
                Choosing another representation resets its title, metadata, labels and reuse choice
                to that original. Ineligible alternate paths require a new analyzed file selection.
              </p>
              <div className={styles.actions}>
                <AppButton
                  variant="subtle"
                  disabled={blocked || state.dirty || d.offset === 0}
                  onClick={() => void detail(d.row.id, Math.max(0, d.offset - 10))}
                >
                  Earlier variants
                </AppButton>
                <AppButton
                  variant="subtle"
                  disabled={blocked || state.dirty || d.offset + d.variants.length >= d.total}
                  onClick={() => void detail(d.row.id, d.offset + d.variants.length)}
                >
                  Later variants
                </AppButton>
              </div>
              {d.row.kind !== 'message' ? (
                <TextInput
                  label="Destination title (your correction)"
                  maxLength={500}
                  value={f.choice.title}
                  disabled={!editable}
                  onChange={(e) =>
                    change({
                      title: e.currentTarget.value,
                      ...(f.choice.metadata
                        ? { metadata: { ...f.choice.metadata, title: e.currentTarget.value } }
                        : {})
                    })
                  }
                />
              ) : null}
              {variant ? (
                <>
                  <p>
                    Original title: {variant.record.label || 'not supplied'} · authorship:{' '}
                    {variant.authorship}. Role: {variant.record.role ?? 'not supplied'} · path:{' '}
                    {variant.record.path}.
                  </p>
                  {d.row.kind === 'source' ? (
                    <p>
                      Original reference decision: {variant.decision ?? 'not supplied'} · grade:{' '}
                      {variant.grade ?? 'not supplied'} · originating message record:{' '}
                      {variant.originatingRecordId ?? 'none supplied'}. These are original claims,
                      not source verification.
                    </p>
                  ) : null}
                  {variant.suggestedTitles.length ? (
                    <div>
                      <p>AI-suggested titles (inferred; not original metadata):</p>
                      {variant.suggestedTitles.map((title) => (
                        <AppButton
                          key={title}
                          variant="subtle"
                          disabled={!editable}
                          onClick={() =>
                            change({
                              title,
                              ...(f.choice.metadata
                                ? { metadata: { ...f.choice.metadata, title } }
                                : {})
                            })
                          }
                        >
                          Use “{title}”
                        </AppButton>
                      ))}
                    </div>
                  ) : null}
                  <details>
                    <summary>Original facts, unknown fields and mapping notices</summary>
                    <p>
                      Original record {variant.record.id} · {variant.record.locator.pointer} ·{' '}
                      {variant.record.disposition}
                    </p>
                    <dl>
                      {variant.record.facts.map((fact, i) => (
                        <div key={i}>
                          <dt>{fact.name}</dt>
                          <dd>{fact.value}</dd>
                        </div>
                      ))}
                    </dl>
                    <p>
                      Unknown fields: {variant.record.unknownFields.join(', ') || 'None supplied'}
                    </p>
                    <ul>
                      {[...new Set([...d.row.warnings, ...variant.losses])].map((loss) => (
                        <li key={loss}>{loss}</li>
                      ))}
                    </ul>
                  </details>
                  {variant.record.texts.map((text) => (
                    <AppButton
                      key={text.id}
                      variant="subtle"
                      disabled={blocked}
                      onClick={() => void readText(text.id)}
                    >
                      Read original text ({text.units.toLocaleString()} units)
                    </AppButton>
                  ))}
                  {d.row.kind === 'chat' ? (
                    <AppButton
                      variant="subtle"
                      onClick={() => patch({ transcript: !state.transcript })}
                    >
                      Inspect entire original transcript
                    </AppButton>
                  ) : null}
                </>
              ) : null}
              {state.text ? (
                <div>
                  <pre className={styles.original}>{state.text.text}</pre>
                  <p>
                    Original range {state.text.offset}–{state.text.offset + state.text.text.length}{' '}
                    of {state.text.total}.
                  </p>
                  {state.text.nextOffset !== null ? (
                    <AppButton
                      variant="subtle"
                      disabled={blocked}
                      onClick={() => void readText(state.text!.textId, state.text!.nextOffset!)}
                    >
                      Next original text
                    </AppButton>
                  ) : null}
                </div>
              ) : null}
              {d.parents.length ? (
                <p>
                  Original chat envelope(s):{' '}
                  {d.parents.map((p) => `${p.title} (${p.id})`).join('; ')}. Include that exact
                  envelope in Chats; a source can retain this locator without an imported chat.
                </p>
              ) : null}
              {d.row.kind === 'source' ? (
                <>
                  <p>
                    Source destination:{' '}
                    {f.choice.reuse
                      ? 'existing source, unchanged'
                      : 'new source with reviewed metadata'}
                    .
                  </p>
                  {f.choice.reuse ? (
                    <AppButton
                      variant="default"
                      disabled={!editable}
                      onClick={() => change({ reuse: null })}
                    >
                      Create a new source instead
                    </AppButton>
                  ) : null}
                  {f.choice.reuse ? (
                    <p>
                      Use existing source {f.choice.reuse.id}, frozen revision{' '}
                      {f.choice.reuse.revisionId}. Imported metadata corrections are retained in the
                      review; this source stays unchanged.
                    </p>
                  ) : (
                    <ImportSourceFields
                      value={f.choice.metadata}
                      disabled={!editable}
                      onChange={(metadata) =>
                        change({ metadata, title: metadata.title.slice(0, 500) })
                      }
                    />
                  )}
                  <TextInput
                    label="Find an existing source by title"
                    maxLength={100}
                    value={state.query}
                    disabled={blocked}
                    onChange={(e) => patch({ query: e.currentTarget.value })}
                  />
                  <AppButton
                    variant="subtle"
                    disabled={blocked}
                    onClick={() =>
                      void run(async () => {
                        const v = await request({
                          ...scope(),
                          action: 'review-sources',
                          query: owned.current.query,
                          offset: 0
                        })
                        if (v.type === 'review-sources') patch({ sources: v })
                      })
                    }
                  >
                    Find existing sources
                  </AppButton>
                  <ul>
                    {(state.sources?.rows ?? variant?.candidates ?? []).map((source) => (
                      <li key={source.id}>
                        {source.title} · {source.reason} · {source.state}
                        <AppButton
                          variant="subtle"
                          disabled={!editable || source.state !== 'active'}
                          onClick={() =>
                            change({
                              reuse: {
                                id: source.id,
                                revisionId: source.revisionId,
                                metadataDigest: source.metadataDigest
                              }
                            })
                          }
                        >
                          Use this existing source
                        </AppButton>
                      </li>
                    ))}
                  </ul>
                  {state.sources?.more ? (
                    <AppButton
                      variant="subtle"
                      disabled={blocked}
                      onClick={() =>
                        void run(async () => {
                          const v = await request({
                            ...scope(),
                            action: 'review-sources',
                            query: owned.current.query,
                            offset: owned.current.sources!.offset + 20
                          })
                          if (v.type === 'review-sources') patch({ sources: v })
                        })
                      }
                    >
                      More existing sources
                    </AppButton>
                  ) : null}
                </>
              ) : null}
              {d.row.kind === 'note' ? (
                <>
                  <TextareaField
                    label="Tags (one per line)"
                    disabled={!editable}
                    value={f.tags}
                    onChange={(e) =>
                      patch({
                        form: { ...f, tags: e.currentTarget.value },
                        dirty: true,
                        manifest: null
                      })
                    }
                  />
                  <TextareaField
                    label="Categories (one per line)"
                    disabled={!editable}
                    value={f.categories}
                    onChange={(e) =>
                      patch({
                        form: { ...f, categories: e.currentTarget.value },
                        dirty: true,
                        manifest: null
                      })
                    }
                  />
                </>
              ) : null}
              <ChoiceField
                label="I reviewed this original representation, conflicting variants, unknown metadata and conversion losses"
                disabled={!editable}
                checked={f.choice.acknowledged}
                onChange={(e) => change({ acknowledged: e.currentTarget.checked })}
              />
              <div className={styles.actions}>
                {d.row.kind === 'chat' ? (
                  <AppButton
                    variant="default"
                    disabled={
                      !editable ||
                      !f.choice.acknowledged ||
                      !variant?.identified ||
                      f.choice.recordId !== d.row.choice.recordId ||
                      d.readyMessages === 0 ||
                      state.composing
                    }
                    onClick={() => void save(true)}
                  >
                    Include this chat and {d.readyMessages} identified messages
                  </AppButton>
                ) : null}
                <AppButton type="submit" disabled={!editable || !state.dirty}>
                  Save review choice
                </AppButton>
                <AppButton
                  variant="default"
                  disabled={blocked || !state.dirty}
                  onClick={() =>
                    patch({
                      form: formFor(d.row.choice),
                      dirty: false,
                      text: null,
                      transcript: false
                    })
                  }
                >
                  Discard unsaved correction
                </AppButton>
              </div>
              {d.row.kind === 'chat' ? (
                <p>
                  The chat action explicitly includes this chosen envelope and the displayed number
                  of fully identified, unambiguous, still-undecided original messages. Your
                  acknowledgment covers their retained metadata and mapping notices. Existing
                  message choices are preserved; unfinished or conflicting messages remain for
                  individual review or explicit exclusion.
                </p>
              ) : null}
              <p>
                {state.dirty
                  ? 'This correction is retained in this window. Save the choice to protect it in the project.'
                  : 'Saved review choices are protected in this project.'}
              </p>
            </form>
          ) : null}
          {state.transcript && state.scope && f ? (
            <ImportTranscriptPreview
              key={f.choice.recordId}
              scope={state.scope}
              batchId={p.review.batchId}
              graphId={p.review.graphId}
              recordId={f.choice.recordId}
              files={[]}
              disabled={blocked}
              onClose={() => patch({ transcript: false })}
            />
          ) : null}
          <details>
            <summary>Review a partial import</summary>
            <p>
              This action explicitly excludes every currently undecided or blocked eligible group,
              plus any dependent messages or now-empty chats. It records your reason in one saved
              revision. Review the exclusions in Issues before preparing confirmation; accepted
              leftovers would require a separate future batch.
            </p>
            <TextInput
              label="Reason for outstanding exclusions"
              value={state.partialReason}
              maxLength={1000}
              disabled={blocked || state.dirty}
              onChange={(e) =>
                patch({ partialReason: e.currentTarget.value, partialConsent: false })
              }
            />
            <ChoiceField
              label="Exclude the disclosed outstanding and dependent material from this partial import"
              checked={state.partialConsent}
              disabled={blocked || state.dirty}
              onChange={(e) => patch({ partialConsent: e.currentTarget.checked })}
            />
            <AppButton
              variant="default"
              disabled={
                !editable || state.dirty || !state.partialConsent || !state.partialReason.trim()
              }
              onClick={() =>
                void run(() =>
                  apply({
                    ...scope(),
                    action: 'review-partial',
                    reviewId: p.review.id,
                    operationId: crypto.randomUUID(),
                    expectedRevision: p.revisionId,
                    reason: state.partialReason
                  })
                )
              }
            >
              Save outstanding exclusions
            </AppButton>
          </details>
          <AppButton
            disabled={
              !editable || state.dirty || p.blocking > 0 || p.undecided > 0 || !p.revisionId
            }
            onClick={() => void prepareConfirmation()}
          >
            Prepare final confirmation
          </AppButton>
          {state.manifest ? (
            <section className={styles.preview} aria-label="Final import confirmation">
              <h3>Final confirmation preview</h3>
              <p>
                Destination: <strong>{state.manifest.manifest.destinationTitle}</strong> ·{' '}
                {state.manifest.manifest.counts.chats} chats ·{' '}
                {state.manifest.manifest.counts.messages} messages ·{' '}
                {state.manifest.manifest.counts.newSources} new sources ·{' '}
                {state.manifest.manifest.counts.reusedSources} existing sources ·{' '}
                {state.manifest.manifest.counts.notes} notes ·{' '}
                {state.manifest.manifest.counts.excluded} excluded originals.
              </p>
              <p>
                {state.manifest.current &&
                session.project?.headCommitId === state.manifest.manifest.expectedHead &&
                options.plan?.proposalId === p.review.proposalId
                  ? 'This immutable preview matches the current protected project head.'
                  : 'This preview is stale. Refresh the review and prepare confirmation again.'}{' '}
                No content has been added.
              </p>
              <ul>
                {state.manifest.entries.map((entry) => (
                  <li key={entry.itemId}>
                    {entry.kind}: {entry.title || 'Original message'} · {entry.action} ·{' '}
                    {entry.destinationId ?? 'retained without destination'}
                    {entry.choice.state === 'exclude' ? ` · ${entry.choice.reason}` : ''}
                  </li>
                ))}
              </ul>
              <div className={styles.actions}>
                {[Math.max(0, state.manifest.offset - 10), state.manifest.offset + 10].map(
                  (offset, i) => (
                    <AppButton
                      key={i}
                      variant="subtle"
                      disabled={
                        blocked ||
                        (i === 0 ? state.manifest!.offset === 0 : offset >= state.manifest!.total)
                      }
                      onClick={() =>
                        void run(async () => {
                          const v = await request({
                            ...scope(),
                            action: 'confirmation-page',
                            reviewId: p.review.id,
                            manifestId: state.manifest!.manifest.id,
                            offset
                          })
                          if (v.type === 'confirmation-page') patch({ manifest: v })
                        })
                      }
                    >
                      {i === 0 ? 'Previous destinations' : 'Next destinations'}
                    </AppButton>
                  )
                )}
              </div>
              <details>
                <summary>Protected confirmation identifiers</summary>
                <p>
                  Manifest {state.manifest.manifest.id} · review revision{' '}
                  {state.manifest.manifest.revisionId} · receipt {state.manifest.manifest.receiptId}{' '}
                  · expected head {state.manifest.manifest.expectedHead}. Files, selected results,
                  corrections and destination IDs are frozen in this preview.
                </p>
              </details>
            </section>
          ) : null}
          <p>
            Confirm adds only these reviewed destinations. Preparing or dismissing this review does
            not add content. Confirmation is local and does not send another ChatGPT request.
          </p>
          <AppButton
            disabled={
              !editable ||
              state.dirty ||
              !state.manifest?.current ||
              session.project?.headCommitId !== state.manifest?.manifest.expectedHead
            }
            onClick={() => void confirmImport()}
          >
            Confirm import
          </AppButton>
        </>
      ) : state.issue ? (
        <p role="alert">{state.issue}</p>
      ) : null}
    </section>
  )
  return {
    content,
    shown: state.shown,
    completed: !!completed?.receipt,
    busy: state.busy,
    locked: state.busy || !!state.pending || !!state.pendingCommit || state.dirty || state.composing
  }
}
