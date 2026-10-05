import PresentationBoundary from '../../components/PresentationBoundary'
import { useEffectEvent } from 'react'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { replaceControlCharacters } from '../../../../shared/control-characters'
import { TextInput, Textarea } from '@mantine/core'
import { AppButton, TextareaField } from '../../components/ui/Controls'
import { EmptyState } from '../../components/ui/Feedback'
import { ResearchHeader, ResearchLayout } from '../research/ResearchLayout'
import { useResearchData } from '../research/researchContext'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import './SourceInspector.css'
import { useRetainedDraft } from '../workspace/DraftOwner'
import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFWorker, RenderTask } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { OpenProject } from '../../../../shared/projects'
import {
  PDF_EXTRACTOR,
  PDF_INSPECTION_LIMIT,
  PDF_PAGE_LIMIT,
  TEXT_EXTRACTOR,
  type InspectionChange,
  type InspectionView,
  type InspectedVersion,
  type SourceExcerpt
} from '../../../../shared/inspection'
import type { SourceAttachment, SourceAttachmentInput } from '../../../../shared/sources'

const tidy = (value: unknown): string =>
  typeof value === 'string' ? replaceControlCharacters(value).trim().slice(0, 500) : ''
async function deadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PARSER_TIMEOUT')), ms)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}
type Loaded = {
  versionId: string
  pdf: PDFDocumentProxy | null
  text: string | null
  labels: string[] | null
  title: string
  author: string
}

export default function SourceInspector({
  project,
  sourceId,
  focusExcerptId,
  focusVersionId,
  focusPageIndex,
  disabled,
  readOnly,
  onCommitted,
  close
}: {
  project: OpenProject
  sourceId: string
  focusExcerptId: string | null
  focusVersionId: string | null
  focusPageIndex: number | null
  disabled: boolean
  readOnly: boolean
  onCommitted: () => Promise<void>
  close: () => void
}): React.JSX.Element {
  const session = useWorkspaceSession(),
    research = useResearchData()
  const [sourceTitle, setSourceTitle] = useState('Source original'),
    [excerptId, setExcerptId] = useState<string | null>(null),
    [excerptQuery, setExcerptQuery] = useState(''),
    [showTranscription, setShowTranscription] = useState(false),
    [readRevision, setReadRevision] = useState(0)
  const visible =
    session.destination.kind === 'workspace' &&
    session.destination.view === 'research' &&
    session.destination.target.kind === 'inspector' &&
    session.destination.target.sourceId === sourceId
  const [reimportPendingValue, setReimportPendingValue, reimportPending] =
    useSynchronousState<SourceAttachmentInput | null>(null)
  const [pendingExcerptValue, setPendingExcerptValue, pendingExcerpt] = useSynchronousState<{
    operationId: string
    change: InspectionChange
  } | null>(null)
  const [view, setView] = useState<InspectionView | null>(null),
    [attachments, setAttachments] = useState<SourceAttachment[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null),
    [loadedVersionId, setLoadedVersionId] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(1),
    [pageText, setPageText] = useState(''),
    [busy, setBusy] = useState(false),
    [extracting, setExtracting] = useState(false)
  const [progress, setProgress] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState('')
  const [manualQuote, setManualQuote] = useState(''),
    [manualLabel, setManualLabel] = useState('Manual transcription')
  const [correctionFor, setCorrectionFor] = useState<SourceExcerpt | null>(null),
    [correctionQuote, setCorrectionQuote] = useState(''),
    [correctionLabel, setCorrectionLabel] = useState('Human correction')
  const draftPending =
    !!manualQuote ||
    manualLabel !== 'Manual transcription' ||
    (!!correctionFor &&
      (correctionQuote !== correctionFor.quote || correctionLabel !== 'Human correction')) ||
    !!pendingExcerptValue ||
    !!reimportPendingValue
  const [reimportBytes, setReimportBytes] = useState<{ current: number; total: number } | null>(
    null
  )
  const [loadedValue, setLoadedValue, loaded] = useSynchronousState<Loaded | null>(null),
    task = useRef<PDFDocumentLoadingTask | null>(null),
    pdfWorker = useRef<{ port: Worker; worker: PDFWorker } | null>(null),
    cancelled = useRef(false),
    reimportOperation = useRef<string | null>(null),
    selection = useRef<HTMLTextAreaElement | null>(null),
    canvas = useRef<HTMLCanvasElement | null>(null),
    panel = useRef<HTMLElement | null>(null)
  const focusedExcerpt = useRef<string | null>(null)
  const selected = view?.versions.find((v) => v.id === selectedVersionId),
    active = view?.versions.find((v) => v.id === view.activeVersionId)
  const page = view?.pages.find((p) => p.versionId === selectedVersionId && p.index === pageIndex)
  const loading = busy || extracting || disabled || !!pendingExcerptValue || !!reimportPendingValue

  const sourceKey = `${project.projectId}:${project.workspaceId}:${sourceId}:${readRevision}`
  const [lastSourceKey, setLastSourceKey] = useState(sourceKey)
  if (lastSourceKey !== sourceKey) {
    setLastSourceKey(sourceKey)
    setView(null)
    setSelectedVersionId(null)
    setLoadedVersionId(null)
    setPageText('')
  }

  const inspectionHead = view?.headCommitId

  const pageTextKey = `${sourceKey}:${selectedVersionId}:${pageIndex}:${page?.textHash}:${page?.state}`
  const [lastPageTextKey, setLastPageTextKey] = useState(pageTextKey)
  if (lastPageTextKey !== pageTextKey) {
    setLastPageTextKey(pageTextKey)
    setPageText('')
  }

  async function mutate(change: InspectionChange): Promise<InspectionView | null> {
    const operation =
      change.type === 'excerpt'
        ? (pendingExcerpt.current ?? { operationId: crypto.randomUUID(), change })
        : { operationId: crypto.randomUUID(), change }
    if (change.type === 'excerpt') setPendingExcerptValue(operation)
    try {
      const result = await window.collie.changeInspection({
        ...{ projectId: project.projectId, workspaceId: project.workspaceId, sourceId },
        ...operation
      })
      if (!result.ok) {
        if (result.error.code !== 'UNAVAILABLE' && change.type === 'excerpt')
          setPendingExcerptValue(null)
        setError(result.error.message)
        return null
      }
      if (change.type === 'excerpt') setPendingExcerptValue(null)
      setView(result.value)
      return result.value
    } catch {
      setError(
        'The source change has an unknown outcome. Keep this view and retry the pending excerpt.'
      )
      return null
    }
  }
  async function retryExcerpt(): Promise<void> {
    if (!pendingExcerpt.current) return
    setBusy(true)
    try {
      if (await mutate(pendingExcerpt.current.change)) {
        setManualQuote('')
        setManualLabel('Manual transcription')
        setCorrectionFor(null)
        setCorrectionQuote('')
        setCorrectionLabel('Human correction')
        await onCommitted()
      }
    } finally {
      setBusy(false)
    }
  }

  async function closePdf(): Promise<void> {
    const old = task.current,
      owned = pdfWorker.current
    task.current = null
    pdfWorker.current = null
    owned?.port.terminate()
    try {
      owned?.worker.destroy()
    } catch {
      // The worker port is already terminated; continue releasing the loading task.
    }
    if (old)
      try {
        await deadline(old.destroy(), 1000)
      } catch {
        // Destruction is best effort after termination; no resource can be reused.
      }
  }
  async function ensure(attachmentId: string): Promise<void> {
    if (!allowInspectionTargetChange()) return
    setBusy(true)
    setError('')
    try {
      const next = await mutate({ type: 'ensure', attachmentId })
      if (next) {
        setSelectedVersionId(next.versions.find((v) => v.attachmentId === attachmentId)?.id ?? null)
        await onCommitted()
      }
    } finally {
      setBusy(false)
    }
  }
  async function chooseActive(v: InspectedVersion): Promise<void> {
    setBusy(true)
    setError('')
    try {
      if (await mutate({ type: 'choose', versionId: v.id, expectedRevisionId: v.revisionId })) {
        setMessage(
          'Active version changed. Earlier excerpts remain tied to their original versions.'
        )
        await onCommitted()
      }
    } finally {
      setBusy(false)
    }
  }
  async function markOpenFailure(
    v: InspectedVersion,
    reason: 'password_required' | 'unsupported' | 'failed'
  ): Promise<void> {
    if (v.status === 'indexed' || v.status === 'no_text') return
    const started = await mutate({
      type: 'start',
      versionId: v.id,
      extractorVersion: v.mediaType === 'application/pdf' ? PDF_EXTRACTOR : TEXT_EXTRACTOR,
      totalPages: v.totalPages ?? 0,
      documentTitle: v.documentTitle,
      documentAuthor: v.documentAuthor
    })
    if (started) {
      await mutate({ type: 'finish', versionId: v.id, outcome: reason })
      await onCommitted()
    }
  }
  async function openVersion(v: InspectedVersion, jump?: number): Promise<void> {
    if (extracting || !allowInspectionTargetChange()) return
    setBusy(true)
    setError('')
    setMessage('')
    setPageText('')
    setSelectedVersionId(v.id)
    try {
      await closePdf()
      setLoadedValue(null)
      setLoadedVersionId(null)
      const access = await window.collie.openInspectedAsset({
        ...{ projectId: project.projectId, workspaceId: project.workspaceId, sourceId },
        versionId: v.id
      })
      if (!access.ok) {
        if (access.error.code === 'LIMIT_EXCEEDED') await markOpenFailure(v, 'unsupported')
        setError(access.error.message)
        return
      }
      const response = await deadline(fetch(access.value.url, { cache: 'no-store' }), 30000)
      if (!response.ok) throw new Error('SOURCE_UNAVAILABLE')
      const bytes = await deadline(response.arrayBuffer(), 30000)
      if (bytes.byteLength !== access.value.bytes || bytes.byteLength > PDF_INSPECTION_LIMIT)
        throw new Error('SOURCE_CHANGED')
      if (v.mediaType === 'text/plain') {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        if (jump !== undefined && jump !== 0) {
          setError(
            'That page does not exist in this plain text original. No other page was substituted.'
          )
          return
        }
        setLoadedValue({ versionId: v.id, pdf: null, text, labels: null, title: '', author: '' })
        setLoadedVersionId(v.id)
        setPageIndex(0)
      } else {
        const pdfjs = await import('pdfjs-dist')
        const base = new URL('pdfjs/', window.location.href).href
        const port = new Worker(pdfWorkerUrl, { type: 'module' }),
          worker = pdfjs.PDFWorker.create({ port })
        pdfWorker.current = { port, worker }
        await deadline(worker.promise, 10000)
        const loadingTask = pdfjs.getDocument({
          data: new Uint8Array(bytes),
          worker,
          cMapUrl: `${base}cmaps/`,
          cMapPacked: true,
          iccUrl: `${base}iccs/`,
          standardFontDataUrl: `${base}standard_fonts/`,
          wasmUrl: `${base}wasm/`,
          useWorkerFetch: true,
          useSystemFonts: false,
          enableXfa: false,
          stopAtErrors: true,
          maxImageSize: 20_000_000
        })
        task.current = loadingTask
        const pdf = await deadline(loadingTask.promise, 30000)
        if (pdf.numPages < 1 || pdf.numPages > 10000) throw new Error('PAGE_LIMIT')
        const labels = await deadline(pdf.getPageLabels(), 10000).catch(() => null)
        const metadata = (await deadline(pdf.getMetadata(), 10000).catch(() => null)) as {
          info?: { Title?: unknown; Author?: unknown }
        } | null
        setLoadedValue({
          versionId: v.id,
          pdf,
          text: null,
          labels,
          title: tidy(metadata?.info?.Title),
          author: tidy(metadata?.info?.Author)
        })
        if (jump !== undefined && (jump < 1 || jump > pdf.numPages)) {
          setLoadedValue(null)
          await closePdf()
          setError('That page is not present in this original. No other page was substituted.')
          return
        }
        setLoadedVersionId(v.id)
        setPageIndex(jump ?? 1)
      }
    } catch (problem) {
      const reason =
        problem &&
        typeof problem === 'object' &&
        'name' in problem &&
        problem.name === 'PasswordException'
          ? 'password_required'
          : problem instanceof Error && problem.message === 'PAGE_LIMIT'
            ? 'unsupported'
            : 'failed'
      await closePdf()
      await markOpenFailure(v, reason)
      setError(
        reason === 'password_required'
          ? 'This PDF requires a password. Its original remains stored; no text was extracted.'
          : reason === 'unsupported'
            ? 'This PDF exceeds the supported page limit. Its original remains stored.'
            : 'The selected source could not be opened safely. Its original and earlier excerpts remain stored.'
      )
    } finally {
      setBusy(false)
    }
  }
  async function extract(): Promise<void> {
    const v = selected,
      asset = loaded.current
    if (!v || !asset || asset.versionId !== v.id || extracting) return
    cancelled.current = false
    setExtracting(true)
    setError('')
    setMessage('')
    const totalPages = asset.pdf?.numPages ?? 0,
      extractorVersion = asset.pdf ? PDF_EXTRACTOR : TEXT_EXTRACTOR
    try {
      const started = await mutate({
        type: 'start',
        versionId: v.id,
        extractorVersion,
        totalPages,
        documentTitle: asset.title,
        documentAuthor: asset.author
      })
      if (!started) return
      await onCommitted()
      const total = asset.pdf ? Math.min(totalPages, PDF_PAGE_LIMIT) : 1
      let truncated = false,
        parserFailed = false
      for (let step = 0; step < total && !cancelled.current; step++) {
        const index = asset.pdf ? step + 1 : 0
        if (started.pages.some((p) => p.versionId === v.id && p.index === index)) {
          setProgress(`Retained page ${step + 1} of ${total}`)
          continue
        }
        let text = '',
          state: 'text' | 'no_text' | 'failed' = 'no_text',
          error: string | null = null,
          pageTruncated = false
        try {
          if (asset.pdf) {
            const pdfPage = await deadline(asset.pdf.getPage(index), 10000)
            const content = await deadline(pdfPage.getTextContent(), 10000)
            const pieces: string[] = []
            let length = 0
            for (const item of content.items) {
              if (!('str' in item)) continue
              const part = `${item.str}${item.hasEOL ? '\n' : ' '}`
              if (length + part.length > 100000) {
                pieces.push(part.slice(0, 100000 - length))
                truncated = true
                pageTruncated = true
                break
              }
              pieces.push(part)
              length += part.length
            }
            text = pieces.join('')
          } else {
            const full = asset.text ?? ''
            if (full.length > 100000) {
              truncated = true
              pageTruncated = true
            }
            text = full.slice(0, 100000)
          }
          text = replaceControlCharacters(text, true)
          state = text.trim() ? 'text' : 'no_text'
          if (pageTruncated)
            error =
              'Text exceeded the 100,000-character page limit; only the saved prefix is available.'
        } catch {
          state = 'failed'
          error = 'Page text could not be extracted within the parser limit.'
          parserFailed = true
          await closePdf()
          setLoadedValue(null)
          setLoadedVersionId(null)
        }
        if (cancelled.current) break
        const label = asset.pdf ? tidy(asset.labels?.[index - 1]).slice(0, 100) || null : null
        if (
          !(await mutate({
            type: 'page',
            versionId: v.id,
            pageIndex: index,
            label,
            state,
            text: state === 'text' ? text : '',
            error
          }))
        )
          break
        setProgress(
          `Processed ${step + 1} of ${total} ${asset.pdf ? 'PDF pages' : 'text versions'}.`
        )
        if (parserFailed) break
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      if (
        await mutate({
          type: 'finish',
          versionId: v.id,
          outcome: parserFailed ? 'failed' : cancelled.current || truncated ? 'cancelled' : 'done'
        })
      ) {
        setMessage(
          parserFailed
            ? 'A page parser failed. Saved pages remain inspectable; reopen the version to continue.'
            : cancelled.current
              ? 'Extraction stopped. Saved pages remain inspectable; resume to continue.'
              : truncated
                ? 'Text exceeded the 100,000-character page limit. The retained extraction is partial.'
                : totalPages > PDF_PAGE_LIMIT
                  ? 'Only the first 400 pages were processed. Coverage is partial.'
                  : 'Extraction finished. Review the page coverage and text before quoting.'
        )
        await onCommitted()
      }
    } catch {
      await mutate({
        type: 'finish',
        versionId: v.id,
        outcome: cancelled.current ? 'cancelled' : 'failed'
      })
      setError(
        'Extraction stopped after a parser or storage error. Already saved pages and originals remain.'
      )
      await onCommitted()
    } finally {
      setExtracting(false)
      setProgress('')
    }
  }
  function cancelExtraction(): void {
    cancelled.current = true
    setProgress('Stopping after the current page…')
  }
  async function excerpt(): Promise<void> {
    const v = selected,
      area = selection.current
    if (!v || !area || !page || page.state !== 'text') return
    const start = area.selectionStart,
      end = area.selectionEnd,
      quote = pageText.slice(start, end)
    if (!quote.trim() || quote.length > 10000) {
      setError('Select up to 10,000 characters in saved extracted text.')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (
        await mutate({
          type: 'excerpt',
          id: crypto.randomUUID(),
          versionId: v.id,
          pageIndex,
          kind: 'extracted',
          quote,
          startOffset: start,
          endOffset: end,
          label: 'Selected extracted text',
          supersedesId: null
        })
      ) {
        setMessage('Exact excerpt saved with its source version, page and text range.')
        await onCommitted()
      }
    } finally {
      setBusy(false)
    }
  }
  async function transcribe(): Promise<void> {
    const v = selected
    if (!v || !manualQuote.trim() || !manualLabel.trim()) return
    setBusy(true)
    setError('')
    try {
      if (
        await mutate({
          type: 'excerpt',
          id: crypto.randomUUID(),
          versionId: v.id,
          pageIndex,
          kind: 'transcription',
          quote: manualQuote,
          startOffset: null,
          endOffset: null,
          label: manualLabel,
          supersedesId: null
        })
      ) {
        setManualQuote('')
        setManualLabel('Manual transcription')
        setShowTranscription(false)
        setMessage(
          'Labeled manual transcription saved. It is not represented as extracted PDF text.'
        )
        await onCommitted()
      }
    } finally {
      setBusy(false)
    }
  }
  async function correct(): Promise<void> {
    const original = correctionFor
    if (!original || !correctionQuote.trim() || !correctionLabel.trim()) return
    setBusy(true)
    setError('')
    try {
      if (
        await mutate({
          type: 'excerpt',
          id: crypto.randomUUID(),
          versionId: original.versionId,
          pageIndex: original.pageIndex,
          kind: 'correction',
          quote: correctionQuote,
          startOffset: null,
          endOffset: null,
          label: correctionLabel,
          supersedesId: original.id
        })
      ) {
        setCorrectionFor(null)
        setMessage('Correction saved as a new record. The original quotation is unchanged.')
        await onCommitted()
      }
    } finally {
      setBusy(false)
    }
  }
  async function reimport(retry = false): Promise<void> {
    if (readOnly || busy || extracting || (!retry && !allowInspectionTargetChange())) return
    setBusy(true)
    setError('')
    try {
      if (!reimportPending.current) {
        const picked = await window.collie.pickSourceVersion({
          projectId: project.projectId,
          workspaceId: project.workspaceId
        })
        if (!picked.ok) {
          setError(picked.error.message)
          return
        }
        if (!picked.value) return
        setReimportPendingValue({
          ...{ projectId: project.projectId, workspaceId: project.workspaceId, sourceId },
          operationId: crypto.randomUUID(),
          token: picked.value.token
        })
      }
      const input = reimportPending.current
      if (!input) throw new Error('Source import request was not retained')
      reimportOperation.current = input.operationId
      setReimportBytes(null)
      const result = await window.collie.attachSourceFile(input)
      if (!result.ok) {
        if (result.error.code !== 'UNAVAILABLE') setReimportPendingValue(null)
        setError(result.error.message)
        return
      }
      setReimportPendingValue(null)
      setAttachments(result.value.sources.find((s) => s.id === sourceId)?.attachments ?? [])
      const inspected = await window.collie.readInspection({
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        sourceId
      })
      if (inspected.ok) {
        setView(inspected.value)
        setSelectedVersionId(
          inspected.value.versions.find((v) => v.attachmentId === input.operationId)?.id ??
            selectedVersionId
        )
        setMessage(
          'New immutable version copied. Compare it before choosing whether to make it active.'
        )
      } else setError(inspected.error.message)
      await onCommitted()
    } catch {
      setError(
        reimportPending.current
          ? 'The copy has an unknown outcome. Retry the same original copy before continuing.'
          : 'The original was copied, but its view could not refresh. Reload source inspection.'
      )
    } finally {
      reimportOperation.current = null
      setReimportBytes(null)
      setBusy(false)
    }
  }
  async function navigateExcerpt(item: SourceExcerpt): Promise<void> {
    if (!allowInspectionTargetChange()) return
    setExcerptId(item.id)
    const version = view?.versions.find((row) => row.id === item.versionId)
    if (!version) {
      setError('The original version is missing. The exact excerpt remains available.')
      return
    }
    if (item.pageIndex === null) {
      setSelectedVersionId(version.id)
      setLoadedVersionId(null)
      setLoadedValue(null)
      await closePdf()
      setError(
        'This excerpt has no page anchor. Its quote is retained; open the original explicitly to inspect it.'
      )
      return
    }
    await openVersion(version, item.pageIndex)
  }
  function allowInspectionTargetChange(): boolean {
    if (session.composition.current || busy || extracting) return false
    if (!draftPending) return true
    setError(
      'Save or explicitly discard the transcription or correction before changing its source page.'
    )
    return false
  }
  const draftBinding = useRetainedDraft('transcription', {
    read: () => ({
      scope: { projectId: project.projectId, workspaceId: project.workspaceId },
      kind: 'transcription',
      entityId: sourceId,
      label: 'transcription or correction',
      dirty: draftPending,
      composing: false,
      busy,
      pendingOperation: pendingExcerpt.current ?? reimportPending.current,
      policy: 'explicit',
      issue: error,
      target: {
        kind: 'workspace',
        scope: { projectId: project.projectId, workspaceId: project.workspaceId },
        view: 'research',
        target: {
          kind: 'inspector',
          sourceId,
          versionId: selectedVersionId ?? undefined,
          pageIndex: loadedVersionId ? pageIndex : undefined,
          excerptId: excerptId ?? undefined
        }
      }
    }),
    focus: () => panel.current?.focus()
  })
  useRetainedDraft('inspection-operation', {
    read: () => ({
      scope: { projectId: project.projectId, workspaceId: project.workspaceId },
      kind: 'source-inspection',
      entityId: sourceId,
      label: 'source inspection',
      dirty: false,
      composing: false,
      busy: busy || extracting,
      pendingOperation: null,
      policy: 'operation',
      status: progress || (busy ? 'Working…' : message) || undefined,
      issue: error || undefined,
      target: {
        kind: 'workspace',
        scope: { projectId: project.projectId, workspaceId: project.workspaceId },
        view: 'research',
        target: { kind: 'inspector', sourceId }
      }
    })
  })
  const chosenExcerpt = view?.excerpts.find((item) => item.id === excerptId)
  const excerptLinks = research.view?.links.filter((item) => item.excerptId === excerptId) ?? []
  const versionName = (id: string): string => {
    const index = view?.versions.findIndex((item) => item.id === id) ?? -1
    const version = view?.versions[index]
    return version
      ? `${version.mediaType === 'application/pdf' ? 'PDF' : 'Text'} original ${index + 1} · ${new Date(version.createdAt).toLocaleDateString()}`
      : 'Missing original'
  }
  useEffect(() => {
    let alive = true
    setLoadedValue(null)
    void window.collie
      .readInspection({ projectId: project.projectId, workspaceId: project.workspaceId, sourceId })
      .then((r) => {
        if (alive) {
          if (r.ok) {
            setView(r.value)
            setSelectedVersionId(r.value.activeVersionId ?? r.value.versions[0]?.id ?? null)
          } else setError(r.error.message)
        }
      })
      .catch(() => {
        if (alive) setError('Source inspection could not be loaded. Reload it to retry.')
      })
    void window.collie
      .readSources({ projectId: project.projectId, workspaceId: project.workspaceId })
      .then((r) => {
        if (alive && r.ok) {
          const source = r.value.sources.find((s) => s.id === sourceId)
          setAttachments(source?.attachments ?? [])
          setSourceTitle(source?.metadata.title ?? 'Missing source')
        }
      })
      .catch(() => {
        if (alive)
          setError('Source details could not be read. The original and excerpts are retained.')
      })
    return () => {
      alive = false
      cancelled.current = true
      void closePdf()
    }
  }, [project.projectId, project.workspaceId, sourceId, readRevision, setLoadedValue])

  const onInspectionNavigation = useEffectEvent(() => {
    if (!visible || !view || busy || extracting || draftPending) return
    const key = `${focusExcerptId}:${focusVersionId}:${focusPageIndex}:${session.focusRevision}:${readRevision}`
    if (focusedExcerpt.current === key) return
    if (!focusExcerptId && !focusVersionId) {
      focusedExcerpt.current = null
      return
    }
    focusedExcerpt.current = key
    if (focusExcerptId) {
      const excerpt = view.excerpts.find((item) => item.id === focusExcerptId)
      if (excerpt) {
        setExcerptQuery('')
        void navigateExcerpt(excerpt)
      } else setError('The requested excerpt is missing. No different excerpt was selected.')
    } else if (focusVersionId) {
      const version = view.versions.find((item) => item.id === focusVersionId)
      if (version) void openVersion(version, focusPageIndex ?? undefined)
      else setError('The requested original version is missing. No newer version was substituted.')
    }
  })

  // Present only the latest committed navigation request, after retained regions update.
  useEffect(() => {
    const frame = requestAnimationFrame(() => onInspectionNavigation())
    return () => cancelAnimationFrame(frame)
  }, [
    focusExcerptId,
    focusVersionId,
    focusPageIndex,
    session.focusRevision,
    readRevision,
    view?.sourceId,
    busy,
    extracting,
    draftPending,
    visible
  ])

  useEffect(() => {
    if (
      !visible ||
      !inspectionHead ||
      busy ||
      extracting ||
      draftPending ||
      inspectionHead === project.headCommitId
    )
      return
    let live = true
    void Promise.all([
      window.collie.readInspection({
        projectId: project.projectId,
        workspaceId: project.workspaceId,
        sourceId
      }),
      window.collie.readSources({ projectId: project.projectId, workspaceId: project.workspaceId })
    ])
      .then(([inspection, sources]) => {
        if (!live) return
        if (inspection.ok) setView(inspection.value)
        else setError(inspection.error.message)
        if (sources.ok) {
          const source = sources.value.sources.find((item) => item.id === sourceId)
          setSourceTitle(source?.metadata.title ?? 'Missing source')
          setAttachments(source?.attachments ?? [])
        } else setError(sources.error.message)
      })
      .catch(() => {
        if (live)
          setError(
            'Updated inspection details could not be read. Your loaded original and excerpts remain available.'
          )
      })
    return () => {
      live = false
    }
  }, [
    project.projectId,
    project.workspaceId,
    project.headCommitId,
    visible,
    busy,
    extracting,
    draftPending,
    sourceId,
    inspectionHead
  ])

  useEffect(
    () =>
      window.collie.onSourceProgress((p) => {
        if (p.operationId === reimportOperation.current)
          setReimportBytes({ current: p.transferred, total: p.total })
      }),
    []
  )

  useEffect(() => {
    let alive = true
    if (page?.state === 'text' && selectedVersionId) {
      void window.collie
        .readInspectedPage({
          ...{ projectId: project.projectId, workspaceId: project.workspaceId, sourceId },
          versionId: selectedVersionId,
          pageIndex
        })
        .then((r) => {
          if (alive) {
            if (r.ok) setPageText(r.value.text)
            else setError(r.error.message)
          }
        })
        .catch(() => {
          if (alive) setError('Saved page text could not be loaded. Reopen the original to retry.')
        })
    }
    return () => {
      alive = false
    }
  }, [
    project.projectId,
    project.workspaceId,
    sourceId,
    selectedVersionId,
    pageIndex,
    page?.textHash,
    page?.state
  ])

  useEffect(() => {
    if (!loaded.current?.pdf || loaded.current.versionId !== selectedVersionId || !canvas.current)
      return
    let live = true
    const running: { render: RenderTask | null } = { render: null }
    const doc = loaded.current.pdf
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const pdfPage = await deadline(doc.getPage(pageIndex), 10000)
        if (!live || !canvas.current) return
        const plain = pdfPage.getViewport({ scale: 1 }),
          scale = Math.min(1.2, Math.sqrt(4_000_000 / (plain.width * plain.height)))
        const viewport = pdfPage.getViewport({ scale })
        const element = canvas.current,
          context = element.getContext('2d')
        if (!context) throw new Error('CANVAS_UNAVAILABLE')
        element.width = Math.ceil(viewport.width)
        element.height = Math.ceil(viewport.height)
        running.render = pdfPage.render({
          canvas: element,
          canvasContext: context,
          viewport,
          annotationMode: pdfjs.AnnotationMode.DISABLE
        })
        await deadline(running.render.promise, 15000)
      } catch {
        running.render?.cancel()
        if (live)
          setError(
            'This PDF page could not be rendered. Its source bytes and earlier excerpts remain available.'
          )
      }
    })()
    return () => {
      live = false
      running.render?.cancel()
    }
  }, [loadedVersionId, selectedVersionId, pageIndex, loaded])
  return (
    <section
      tabIndex={-1}
      {...draftBinding}
      ref={panel}
      className="source-inspector"
      aria-label="Source original and excerpts"
    >
      <ResearchHeader title={sourceTitle}>
        Read the original, keep exact excerpts, and return to your argument.
      </ResearchHeader>
      <div className="research-actions">
        <AppButton variant="subtle" onClick={close}>
          Return to context
        </AppButton>
        <AppButton
          variant="subtle"
          onClick={() => session.research({ kind: 'sources', sourceId, page: 'usage' })}
        >
          Where this source is used
        </AppButton>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
      {progress ? <p role="status">{progress}</p> : null}
      {reimportBytes ? (
        <p role="status">
          Copying new original:{' '}
          {Math.round((100 * reimportBytes.current) / Math.max(1, reimportBytes.total))}%
        </p>
      ) : null}
      {pendingExcerptValue ? (
        <AppButton
          disabled={busy || extracting || disabled || readOnly}
          onClick={() => void retryExcerpt()}
        >
          Retry pending excerpt
        </AppButton>
      ) : null}
      {reimportPendingValue ? (
        <AppButton
          disabled={busy || extracting || disabled || readOnly}
          onClick={() => void reimport(true)}
        >
          Retry original copy
        </AppButton>
      ) : null}
      {draftPending ? (
        <p role="status">
          Keep this view until the transcription, correction or pending copy is resolved.{' '}
          <AppButton
            variant="subtle"
            disabled={loading}
            onClick={() => {
              setManualQuote('')
              setManualLabel('Manual transcription')
              setCorrectionFor(null)
              setCorrectionQuote('')
              setCorrectionLabel('Human correction')
              setShowTranscription(false)
            }}
          >
            Discard form edits
          </AppButton>
        </p>
      ) : null}
      {!view ? (
        <EmptyState title="Source inspection">
          <AppButton
            variant="default"
            disabled={loading}
            onClick={() => setReadRevision((value) => value + 1)}
          >
            Reload source inspection
          </AppButton>
        </EmptyState>
      ) : null}
      <details className="research-disclosure">
        <summary>Originals and version history ({view?.versions.length ?? 0})</summary>
        <p>Originals stay local. Reimporting retains earlier versions and their excerpts.</p>
        <AppButton variant="default" disabled={loading || readOnly} onClick={() => void reimport()}>
          Add a newer PDF or text original…
        </AppButton>
        {attachments
          .filter(
            (item) =>
              ['application/pdf', 'text/plain'].includes(item.mediaType) &&
              !view?.versions.some((version) => version.attachmentId === item.id)
          )
          .map((item) => (
            <p key={item.id}>
              <AppButton variant="light" disabled={loading} onClick={() => void ensure(item.id)}>
                Inspect {item.name}
              </AppButton>
            </p>
          ))}
        <ul className="inspector-version-list">
          {view?.versions.map((version) => (
            <li key={version.id}>
              <strong>{versionName(version.id)}</strong>
              <p>
                {view.activeVersionId === version.id ? 'Active version · ' : ''}
                {version.status === 'extracting'
                  ? 'extraction interrupted or running'
                  : version.status}{' '}
                · {version.pagesWithText} pages or text parts with saved text
              </p>
              <div className="research-actions">
                <AppButton
                  variant="default"
                  disabled={loading}
                  onClick={() => {
                    if (allowInspectionTargetChange()) {
                      setExcerptId(null)
                      void openVersion(version)
                    }
                  }}
                >
                  Open this original
                </AppButton>
                {view.activeVersionId !== version.id ? (
                  <AppButton
                    variant="subtle"
                    disabled={loading || readOnly || draftPending}
                    onClick={() => void chooseActive(version)}
                  >
                    Use as active version
                  </AppButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </details>
      <ResearchLayout
        sidebar={
          <>
            <h2>Retained excerpts</h2>
            <TextInput
              label="Find an excerpt"
              type="search"
              value={excerptQuery}
              onChange={(event) => setExcerptQuery(event.currentTarget.value)}
            />
            <ul className="research-item-list">
              {view?.excerpts
                .filter((item) =>
                  `${item.quote} ${item.label}`
                    .toLocaleLowerCase()
                    .includes(excerptQuery.toLocaleLowerCase())
                )
                .map((item) => (
                  <li key={item.id}>
                    <AppButton
                      variant="subtle"
                      className="research-item-button"
                      classNames={{ label: 'research-item-label', inner: 'research-item-inner' }}
                      aria-current={excerptId === item.id ? 'true' : undefined}
                      disabled={loading}
                      onClick={() => void navigateExcerpt(item)}
                    >
                      <span>{item.quote.slice(0, 140)}</span>
                      <small>
                        {item.kind} ·{' '}
                        {item.pageIndex === 0
                          ? 'plain text'
                          : item.pageIndex === null
                            ? 'no page anchor'
                            : `PDF page ${item.pageIndex}`}{' '}
                        ·{' '}
                        {view.activeVersionId === item.versionId
                          ? 'active original'
                          : 'earlier original'}
                      </small>
                    </AppButton>
                  </li>
                ))}
            </ul>
            {!view?.excerpts.length ? (
              <p>
                Open an original and extract its text, then select a passage to keep an exact
                excerpt.
              </p>
            ) : null}
          </>
        }
      >
        <PresentationBoundary
          label="Excerpt details"
          render={() => (
            <>
              {chosenExcerpt ? (
                <section className="inspector-excerpt" aria-label="Selected exact excerpt">
                  <h2>{chosenExcerpt.label}</h2>
                  <blockquote className="research-quote">{chosenExcerpt.quote}</blockquote>
                  <p>
                    {chosenExcerpt.kind} · {versionName(chosenExcerpt.versionId)} ·{' '}
                    {chosenExcerpt.pageIndex === 0
                      ? 'plain text'
                      : chosenExcerpt.pageIndex === null
                        ? 'page unavailable'
                        : `PDF page ${chosenExcerpt.pageIndex}${chosenExcerpt.pageLabel ? ` (label ${chosenExcerpt.pageLabel})` : ''}`}
                  </p>
                  {view?.activeVersionId !== chosenExcerpt.versionId ? (
                    <p role="status">
                      This excerpt belongs to an earlier original. Its quote and original anchor
                      have been retained.
                    </p>
                  ) : null}
                  <div className="research-actions">
                    <AppButton
                      variant="light"
                      disabled={loading || readOnly}
                      onClick={() => {
                        if (!allowInspectionTargetChange()) return
                        setCorrectionFor(chosenExcerpt)
                        setCorrectionQuote(chosenExcerpt.quote)
                        setCorrectionLabel('Human correction')
                      }}
                    >
                      Correct as a new record
                    </AppButton>
                    <AppButton
                      variant="subtle"
                      disabled={loading || draftPending}
                      onClick={() => setExcerptId(null)}
                    >
                      Hide excerpt detail
                    </AppButton>
                  </div>
                  <details className="research-disclosure">
                    <summary>Exact context and provenance</summary>
                    <p className="inspector-context">
                      {chosenExcerpt.contextBefore}
                      <strong>{chosenExcerpt.quote}</strong>
                      {chosenExcerpt.contextAfter}
                    </p>
                    <p>
                      {chosenExcerpt.startOffset !== null
                        ? `Saved text offsets ${chosenExcerpt.startOffset}–${chosenExcerpt.endOffset}.`
                        : 'Human-authored text without extracted offsets.'}
                    </p>
                    <p>
                      Original SHA-256:{' '}
                      <code>
                        {view?.versions.find((item) => item.id === chosenExcerpt.versionId)
                          ?.sha256 ?? 'unavailable'}
                      </code>
                    </p>
                    {chosenExcerpt.supersedesId ? (
                      <AppButton
                        variant="subtle"
                        disabled={loading}
                        onClick={() => {
                          const original = view?.excerpts.find(
                            (item) => item.id === chosenExcerpt.supersedesId
                          )
                          if (original) void navigateExcerpt(original)
                          else setError('The earlier excerpt is unavailable.')
                        }}
                      >
                        Open the unchanged earlier excerpt
                      </AppButton>
                    ) : null}
                  </details>
                  {excerptLinks.length ? (
                    <div>
                      <h3>Used as evidence</h3>
                      {excerptLinks.map((link) => (
                        <AppButton
                          key={link.id}
                          variant="subtle"
                          onClick={() =>
                            session.research({
                              kind: 'evidence',
                              item: { kind: 'link', id: link.id }
                            })
                          }
                        >
                          {link.role.replace('_', ' ')} ·{' '}
                          {link.claimId
                            ? (research.view?.claims.find((item) => item.id === link.claimId)
                                ?.text ?? 'Missing claim')
                            : (research.view?.sections.find((item) => item.id === link.documentId)
                                ?.title ?? 'Missing section')}{' '}
                          · {link.state}
                        </AppButton>
                      ))}
                    </div>
                  ) : (
                    <p>No manual evidence links use this excerpt yet.</p>
                  )}
                </section>
              ) : null}
              {correctionFor ? (
                <form
                  className="research-form inspector-transcription"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void correct()
                  }}
                >
                  <h3>Correction to retained excerpt</h3>
                  <p>The original remains unchanged.</p>
                  <TextareaField
                    label="Corrected passage"
                    disabled={readOnly || loading}
                    value={correctionQuote}
                    maxLength={10000}
                    onChange={(event) => setCorrectionQuote(event.currentTarget.value)}
                    rows={4}
                  />
                  <TextInput
                    label="Required correction label"
                    disabled={readOnly || loading}
                    value={correctionLabel}
                    maxLength={200}
                    onChange={(event) => setCorrectionLabel(event.currentTarget.value)}
                  />
                  <div className="research-actions">
                    <AppButton
                      type="submit"
                      disabled={
                        loading || readOnly || !correctionQuote.trim() || !correctionLabel.trim()
                      }
                    >
                      Save correction
                    </AppButton>
                    <AppButton
                      variant="default"
                      disabled={loading}
                      onClick={() => setCorrectionFor(null)}
                    >
                      Cancel correction
                    </AppButton>
                  </div>
                </form>
              ) : null}
            </>
          )}
        />
        {selected ? (
          <section aria-label="Original reader">
            <h2>{versionName(selected.id)}</h2>
            <p>
              {selected.status} · {selected.pagesProcessed} processed · {selected.pagesWithText}{' '}
              with text
              {selected.totalPages !== null ? ` · ${selected.totalPages} total PDF pages` : ''}
            </p>
            {active && active.id !== selected.id ? (
              <p role="status">
                Viewing an earlier original (
                {active.sha256 === selected.sha256 ? 'same file bytes' : 'different file bytes'}{' '}
                from the active version).
              </p>
            ) : null}
            <details className="research-disclosure">
              <summary>Version metadata and extraction details</summary>
              <p>
                Title at import: {selected.metadata.title}. Active title at import:{' '}
                {active?.metadata.title ?? 'none'}.
              </p>
              <p>
                PDF metadata: {selected.documentTitle || 'no title'};{' '}
                {selected.documentAuthor || 'no author'}. Active PDF:{' '}
                {active?.documentTitle || 'no title'}; {active?.documentAuthor || 'no author'}.
              </p>
              <p>
                Original SHA-256: <code>{selected.sha256}</code>. Extractor:{' '}
                {selected.extractorVersion ?? 'not run'}.
              </p>
              <p>
                PDF pages are inert images. Extracted text may be incomplete or out of reading
                order. Scanned pages need manual transcription; OCR is not included.
              </p>
            </details>
            {loadedVersionId === selected.id ? (
              <>
                <div className="research-actions">
                  <AppButton
                    variant="default"
                    disabled={
                      loading || selected.status === 'indexed' || selected.status === 'no_text'
                    }
                    onClick={() => void extract()}
                  >
                    {selected.pagesProcessed ? 'Resume text extraction' : 'Extract text'}
                  </AppButton>
                  {extracting ? (
                    <AppButton variant="light" onClick={cancelExtraction}>
                      Cancel extraction
                    </AppButton>
                  ) : null}
                </div>
                {loadedValue?.pdf ? (
                  <div className="research-actions">
                    <AppButton
                      variant="default"
                      disabled={loading || draftPending || pageIndex <= 1}
                      onClick={() => {
                        setExcerptId(null)
                        setPageIndex((value) => value - 1)
                      }}
                    >
                      Previous page
                    </AppButton>
                    <span>
                      PDF page {pageIndex} of {loadedValue.pdf.numPages}
                      {loadedValue.labels?.[pageIndex - 1]
                        ? ` · label ${loadedValue.labels[pageIndex - 1]}`
                        : ''}
                    </span>
                    <AppButton
                      variant="default"
                      disabled={loading || draftPending || pageIndex >= loadedValue.pdf.numPages}
                      onClick={() => {
                        setExcerptId(null)
                        setPageIndex((value) => value + 1)
                      }}
                    >
                      Next page
                    </AppButton>
                  </div>
                ) : (
                  <p>Plain text original; no PDF page number.</p>
                )}
                {loadedValue?.pdf ? (
                  <canvas
                    ref={canvas}
                    className="inspected-pdf-canvas"
                    role="img"
                    aria-label={`Rendered PDF page ${pageIndex}`}
                  />
                ) : null}
                <Textarea
                  label="Saved extracted source text"
                  ref={selection}
                  value={pageText}
                  readOnly
                  rows={9}
                />
                {page?.error ? <p role="alert">{page.error}</p> : null}
                {page?.state === 'failed' ? (
                  <p role="alert">
                    This page could not yield reliable text. The original is retained.
                  </p>
                ) : !pageText ? (
                  <p>
                    No saved text on this page. Extract text above, or transcribe a scanned passage
                    manually.
                  </p>
                ) : (
                  <AppButton disabled={loading || readOnly} onClick={() => void excerpt()}>
                    Save selected exact excerpt
                  </AppButton>
                )}
                <div className="research-actions">
                  <AppButton
                    variant="subtle"
                    disabled={loading || readOnly}
                    aria-expanded={showTranscription}
                    onClick={() => setShowTranscription(true)}
                  >
                    Write a manual transcription
                  </AppButton>
                </div>
                <form
                  className="research-form inspector-transcription"
                  hidden={!showTranscription}
                  inert={!showTranscription}
                  onSubmit={(event) => {
                    event.preventDefault()
                    void transcribe()
                  }}
                >
                  <TextareaField
                    label="Manual transcription or reading note"
                    disabled={readOnly || loading}
                    value={manualQuote}
                    maxLength={10000}
                    onChange={(event) => setManualQuote(event.currentTarget.value)}
                    rows={4}
                  />
                  <TextInput
                    label="Required transcription label"
                    disabled={readOnly || loading}
                    value={manualLabel}
                    maxLength={200}
                    onChange={(event) => setManualLabel(event.currentTarget.value)}
                  />
                  <div className="research-actions">
                    <AppButton
                      type="submit"
                      disabled={loading || readOnly || !manualQuote.trim() || !manualLabel.trim()}
                    >
                      Save labeled transcription
                    </AppButton>
                    <AppButton
                      variant="default"
                      disabled={loading}
                      onClick={() => {
                        setManualQuote('')
                        setManualLabel('Manual transcription')
                        setShowTranscription(false)
                      }}
                    >
                      Cancel transcription
                    </AppButton>
                  </div>
                </form>
              </>
            ) : (
              <AppButton
                variant="default"
                disabled={loading}
                onClick={() => void openVersion(selected)}
              >
                Open original
              </AppButton>
            )}
          </section>
        ) : (
          <EmptyState title="Attach an original to start reading">
            Open the source’s Originals and history view to attach a local PDF or text file.
            Existing attachments can be prepared under Originals and version history above.
          </EmptyState>
        )}
      </ResearchLayout>
    </section>
  )
}
