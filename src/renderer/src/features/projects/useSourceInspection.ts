import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { useSynchronousState } from '../../hooks/useSynchronousState'
import { replaceControlCharacters } from '../../../../shared/control-characters'
import { useResearchData } from '../research/researchContext'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useRetainedDraft } from '../workspace/DraftOwner'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFWorker, RenderTask } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { EvidenceView } from '../../../../shared/evidence'
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

export type SourceInspectionProps = {
  project: OpenProject
  sourceId: string
  focusExcerptId: string | null
  focusVersionId: string | null
  focusPageIndex: number | null
  disabled: boolean
  readOnly: boolean
  onCommitted: () => Promise<void>
}

type InspectionOwner = {
  session: ReturnType<typeof useWorkspaceSession>
  research: ReturnType<typeof useResearchData>
  sourceTitle: string
  view: InspectionView | null
  attachments: SourceAttachment[]
  selected: InspectedVersion | undefined
  active: InspectedVersion | undefined
  loadedValue: Loaded | null
  loadedVersionId: string | null
  page: InspectionView['pages'][number] | undefined
  pageIndex: number
  setPageIndex: React.Dispatch<React.SetStateAction<number>>
  pageText: string
  busy: boolean
  extracting: boolean
  progress: string
  message: string
  error: string
  setError: (value: string) => void
  reimportBytes: { current: number; total: number } | null
  pendingExcerptValue: { operationId: string; change: InspectionChange } | null
  reimportPendingValue: SourceAttachmentInput | null
  manualQuote: string
  setManualQuote: (value: string) => void
  manualLabel: string
  setManualLabel: (value: string) => void
  correctionFor: SourceExcerpt | null
  setCorrectionFor: (value: SourceExcerpt | null) => void
  correctionQuote: string
  setCorrectionQuote: (value: string) => void
  correctionLabel: string
  setCorrectionLabel: (value: string) => void
  excerptNote: string
  setExcerptNote: (value: string) => void
  excerptQuery: string
  setExcerptQuery: (value: string) => void
  excerptId: string | null
  setExcerptId: (value: string | null) => void
  chosenExcerpt: SourceExcerpt | undefined
  excerptLinks: EvidenceView['links']
  showTranscription: boolean
  setShowTranscription: (value: boolean) => void
  loading: boolean
  draftPending: boolean
  draftBinding: ReturnType<typeof useRetainedDraft>
  panel: React.RefObject<HTMLElement | null>
  selection: React.RefObject<HTMLTextAreaElement | null>
  canvas: React.RefObject<HTMLCanvasElement | null>
  setReadRevision: React.Dispatch<React.SetStateAction<number>>
  versionName: (id: string) => string
  retryExcerpt: () => Promise<void>
  reimport: (retry?: boolean) => Promise<void>
  ensure: (attachmentId: string) => Promise<void>
  openVersion: (version: InspectedVersion, jump?: number) => Promise<void>
  chooseActive: (version: InspectedVersion) => Promise<void>
  allowInspectionTargetChange: () => boolean
  cancelExtraction: () => void
  extract: (version?: InspectedVersion) => Promise<void>
  excerpt: () => Promise<void>
  transcribe: () => Promise<void>
  correct: () => Promise<void>
  navigateExcerpt: (excerpt: SourceExcerpt) => Promise<void>
}

/** One retained owner for local original loading, bounded text preparation and exact excerpt mutations. */
export function useSourceInspection({
  project,
  sourceId,
  focusExcerptId,
  focusVersionId,
  focusPageIndex,
  disabled,
  readOnly,
  onCommitted
}: SourceInspectionProps): InspectionOwner {
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
  const [excerptNote, setExcerptNote] = useState('')
  const [manualQuote, setManualQuote] = useState(''),
    [manualLabel, setManualLabel] = useState('Manual transcription')
  const [correctionFor, setCorrectionFor] = useState<SourceExcerpt | null>(null),
    [correctionQuote, setCorrectionQuote] = useState(''),
    [correctionLabel, setCorrectionLabel] = useState('Human correction')
  const draftPending =
    !!excerptNote ||
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
        change.type === 'excerpt'
          ? 'The excerpt save could not be confirmed. Retry the same excerpt.'
          : 'Text preparation could not be confirmed. The original and saved text are kept.'
      )
      return null
    }
  }
  async function retryExcerpt(): Promise<void> {
    if (!pendingExcerpt.current) return
    setBusy(true)
    try {
      if (await mutate(pendingExcerpt.current.change)) {
        setExcerptNote('')
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
        const version = next.versions.find((v) => v.attachmentId === attachmentId)
        await onCommitted()
        if (version) await openVersion(version)
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
      if (!['indexed', 'no_text', 'unsupported', 'password_required'].includes(v.status)) {
        setBusy(false)
        await extract(v)
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
  async function extract(v = selected): Promise<void> {
    const asset = loaded.current
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
        parserFailed = false,
        storageFailed = false
      for (let step = 0; step < total && !cancelled.current; step++) {
        const index = asset.pdf ? step + 1 : 0
        const retained = started.pages.find((p) => p.versionId === v.id && p.index === index)
        if (retained) {
          truncated ||= retained.state === 'text' && !!retained.error
          parserFailed ||= retained.state === 'failed'
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
        ) {
          storageFailed = true
          break
        }
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
          outcome:
            parserFailed || storageFailed
              ? 'failed'
              : cancelled.current || truncated
                ? 'cancelled'
                : 'done'
        })
      ) {
        setMessage(
          parserFailed || storageFailed
            ? 'Some text could not be prepared. The original and saved pages are kept.'
            : cancelled.current
              ? 'Text preparation stopped. Read the original again to continue.'
              : truncated
                ? 'Text exceeded the 100,000-character page limit. The retained extraction is partial.'
                : totalPages > PDF_PAGE_LIMIT
                  ? 'Only the first 400 pages were processed. Coverage is partial.'
                  : 'Source text is ready.'
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
          label: excerptNote.trim() || 'Excerpt',
          supersedesId: null
        })
      ) {
        setExcerptNote('')
        setMessage('Excerpt saved.')
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
      const inspected = await mutate({ type: 'ensure', attachmentId: input.operationId })
      await onCommitted()
      const version = inspected?.versions.find((v) => v.attachmentId === input.operationId)
      if (version) await openVersion(version)
      setMessage('New original attached. Earlier originals and excerpts are kept.')
    } catch {
      setError(
        reimportPending.current
          ? 'The copy has an unknown outcome. Retry the same original copy before continuing.'
          : 'The original was copied, but its view could not refresh. Reload original.'
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
      'Save or discard your excerpt note, transcription or correction before changing the original or page.'
    )
    return false
  }
  const draftBinding = useRetainedDraft('transcription', {
    read: () => ({
      scope: { projectId: project.projectId, workspaceId: project.workspaceId },
      kind: 'transcription',
      entityId: sourceId,
      label: 'excerpt note, transcription or correction',
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
        if (alive) setError('Original reader could not be loaded. Reload it to retry.')
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
    if (!visible || !view || disabled || busy || extracting || draftPending) return
    const key = `${focusExcerptId}:${focusVersionId}:${focusPageIndex}:${session.focusRevision}:${readRevision}`
    if (focusedExcerpt.current === key) return
    if (!focusExcerptId && !focusVersionId) {
      const version = view.versions.find((v) => v.id === view.activeVersionId) ?? view.versions[0]
      const attachment = attachments.find(
        (file) =>
          file.state === 'active' && ['application/pdf', 'text/plain'].includes(file.mediaType)
      )
      if (!version && !attachment) return
      focusedExcerpt.current = key
      if (version) void openVersion(version)
      else if (attachment) void ensure(attachment.id)
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
    view?.activeVersionId,
    view?.versions.length,
    attachments,
    disabled,
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
  return {
    session,
    research,
    sourceTitle,
    view,
    attachments,
    selected,
    active,
    loadedValue,
    loadedVersionId,
    page,
    pageIndex,
    setPageIndex,
    pageText,
    busy,
    extracting,
    progress,
    message,
    error,
    setError,
    reimportBytes,
    pendingExcerptValue,
    reimportPendingValue,
    manualQuote,
    setManualQuote,
    manualLabel,
    setManualLabel,
    correctionFor,
    setCorrectionFor,
    correctionQuote,
    setCorrectionQuote,
    correctionLabel,
    setCorrectionLabel,
    excerptNote,
    setExcerptNote,
    excerptQuery,
    setExcerptQuery,
    excerptId,
    setExcerptId,
    chosenExcerpt,
    excerptLinks,
    showTranscription,
    setShowTranscription,
    loading,
    draftPending,
    draftBinding,
    panel,
    selection,
    canvas,
    setReadRevision,
    versionName,
    retryExcerpt,
    reimport,
    ensure,
    openVersion,
    chooseActive,
    allowInspectionTargetChange,
    cancelExtraction,
    extract,
    excerpt,
    transcribe,
    correct,
    navigateExcerpt
  }
}
