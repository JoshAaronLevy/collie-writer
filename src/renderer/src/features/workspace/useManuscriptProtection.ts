import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { Editor } from '@tiptap/core'
import type { DocumentPayload } from '../../../../domain/editor/schema'
import {
  scopeOf,
  type CommitInput,
  type OpenProject,
  type SectionMetaInput
} from '../../../../shared/projects'
import type { StorageStatus } from '../../../../shared/storage'
import { editorIsComposing, serializeEditor } from '../../editor/adapter'
import { writingDestination } from '../../app/navigation'
import { type DraftRegistry, type DraftHandle } from './drafts'

type SectionFields = Pick<SectionMetaInput, 'title' | 'status' | 'synopsis'>
export type ManuscriptProtection = {
  fields: SectionFields
  changeFields: (change: Partial<SectionFields>) => void
  manuscriptDirty: boolean
  committing: boolean
  retry: CommitInput | null
  conflict: OpenProject | null
  metaPending: RefObject<SectionMetaInput | null>
  changed: () => void
  isManuscriptDirty: () => boolean
  textProtected: () => boolean
  markProtected: () => void
  resetManuscript: (next: OpenProject) => void
  flushManuscript: () => Promise<OpenProject | null>
}

/** One retained manuscript draft and exact retry owner for the workspace session. */
export function useManuscriptProtection({
  current,
  editorRef,
  composition,
  drafts,
  alive,
  storage,
  closing,
  canAutoProtect,
  proofreadingPending,
  updateHead,
  setError
}: {
  current: RefObject<OpenProject | null>
  editorRef: RefObject<Editor | null>
  composition: RefObject<boolean>
  drafts: DraftRegistry
  alive: RefObject<boolean>
  storage: StorageStatus
  closing: boolean
  canAutoProtect: () => boolean
  proofreadingPending: () => boolean
  updateHead: (next: OpenProject) => void
  setError: (message: string) => void
}): ManuscriptProtection {
  const project = current.current
  const [editVersion, setEditVersion] = useState(0)
  const [protectedVersion, setProtectedVersion] = useState(0)
  const [fields, setFields] = useState<SectionFields>({ title: '', status: 'draft', synopsis: '' })
  const sectionFields = useRef(fields)
  const [committing, setCommitting] = useState(false)
  const [retry, setRetry] = useState<CommitInput | null>(null)
  const [conflict, setConflict] = useState<OpenProject | null>(null)
  const metaPending = useRef<SectionMetaInput | null>(null)
  const editVersionRef = useRef(0),
    protectedVersionRef = useRef(0),
    retryVersion = useRef(0)
  const retryCommit = useRef<CommitInput | null>(null)
  const committingTask = useRef<Promise<OpenProject | null> | null>(null)
  const sectionDirty = isMetaDirty()
  const manuscriptDirty =
    editVersion !== protectedVersion || sectionDirty || retry !== null || committing
  const dirty = manuscriptDirty || drafts.hasUnprotected()
  function changeFields(change: Partial<SectionFields>): void {
    sectionFields.current = { ...sectionFields.current, ...change }
    setFields(sectionFields.current)
  }
  function resetManuscript(next: OpenProject): void {
    const selected = next.documents.find((doc) => doc.id === next.documentId)!
    changeFields({
      title: selected.title,
      status: selected.status as SectionFields['status'],
      synopsis: selected.synopsis
    })
    metaPending.current = null
    setConflict(null)
    editVersionRef.current = 0
    protectedVersionRef.current = 0
    setEditVersion(0)
    setProtectedVersion(0)
    retryCommit.current = null
    setRetry(null)
  }
  function textProtected(): boolean {
    return editVersionRef.current === protectedVersionRef.current
  }
  function markProtected(): void {
    protectedVersionRef.current = editVersionRef.current
    setProtectedVersion(editVersionRef.current)
  }
  function isMetaDirty(): boolean {
    const doc = current.current?.documents.find((item) => item.id === current.current?.documentId),
      fields = sectionFields.current
    return (
      !!doc &&
      (fields.title !== doc.title ||
        fields.status !== doc.status ||
        fields.synopsis !== doc.synopsis)
    )
  }
  function isManuscriptDirty(): boolean {
    return (
      editVersionRef.current !== protectedVersionRef.current ||
      isMetaDirty() ||
      !!retryCommit.current ||
      !!committingTask.current
    )
  }
  function changed(): void {
    editVersionRef.current += 1
    setEditVersion(editVersionRef.current)
    window.collie.setUnprotectedChanges(true)
  }
  const onProtectionTick = useEffectEvent(() => {
    if (
      (isManuscriptDirty() || drafts.hasUnprotected()) &&
      !retryCommit.current &&
      !metaPending.current &&
      canAutoProtect()
    )
      void flushManuscript()
  })
  useEffect(() => {
    if (!project?.documentId || !dirty || closing || storage.state !== 'ready') return
    const timer = setTimeout(() => {
      onProtectionTick()
    }, 900)
    return () => clearTimeout(timer)
  }, [
    editVersion,
    fields,
    project?.projectId,
    project?.workspaceId,
    project?.documentId,
    dirty,
    closing,
    storage.state
  ])
  useEffect(() => {
    if (!project?.documentId || storage.state !== 'ready') return
    const timer = setInterval(() => {
      onProtectionTick()
    }, 5000)
    return () => clearInterval(timer)
  }, [project?.projectId, project?.workspaceId, project?.documentId, storage.state])
  async function protectText(
    value: DocumentPayload,
    version: number,
    prior?: CommitInput
  ): Promise<OpenProject | null> {
    const p = current.current
    if (!p) return null
    const input = prior ?? {
      ...scopeOf(p),
      documentId: p.documentId,
      operationId: crypto.randomUUID(),
      expectedRevisionId: p.revisionId,
      payload: value
    }
    setCommitting(true)
    setError('')
    window.collie.setUnprotectedChanges(true)
    retryCommit.current = input
    retryVersion.current = version
    setRetry(input)
    const result = await window.collie.commitDocument(input).catch(() => ({
      ok: false as const,
      requestId: input.operationId,
      error: {
        code: 'UNAVAILABLE' as const,
        message: 'The local acknowledgment is unavailable. Retry keeps this exact draft operation.'
      }
    }))
    if (!alive.current) return null
    if (result.ok) {
      const next = {
        ...current.current!,
        documents: current.current!.documents.map((d) =>
          d.id === input.documentId ? { ...d, revisionId: result.value.revisionId } : d
        ),
        payload: input.payload,
        revisionId: result.value.revisionId,
        headCommitId: result.value.headCommitId
      }
      updateHead(next)
      protectedVersionRef.current = version
      setProtectedVersion(version)
      retryCommit.current = null
      setRetry(null)
      setCommitting(false)
      return next
    }
    setError(result.error.message)
    if (result.error.code === 'STALE_REVISION') {
      const stored = await window.collie.openSection({ ...scopeOf(p), documentId: p.documentId })
      if (stored.ok) setConflict(stored.value)
    }
    setCommitting(false)
    return null
  }
  async function flushManuscript(): Promise<OpenProject | null> {
    if (proofreadingPending()) {
      setError(
        'Reconcile the proofreading correction before saving or navigating. Its exact operation is retained.'
      )
      return null
    }
    if (!current.current) return null
    const editor = editorRef.current
    if (!editor) {
      setError('This document could not be opened safely for editing. Its stored copy is retained.')
      return null
    }
    if (composition.current || editorIsComposing(editor)) {
      setError('Finish composing the current text before saving or closing.')
      return null
    }
    let requested: DocumentPayload
    try {
      requested = serializeEditor(editor)
    } catch {
      setError(
        'This edit cannot be protected yet. Keep the window open and copy the visible writing; unsupported content was not discarded.'
      )
      return null
    }
    const version = editVersionRef.current
    const previous = committingTask.current
    const task = (previous ?? Promise.resolve(current.current)).then(async (result) => {
      if (previous && !result) return null
      if (
        retryCommit.current &&
        !(await protectText(retryCommit.current.payload, retryVersion.current, retryCommit.current))
      )
        return null
      const written =
        version !== protectedVersionRef.current
          ? await protectText(requested, version)
          : current.current
      if (!written || !isMetaDirty()) return written
      const fields = { ...sectionFields.current }
      metaPending.current ??= {
        ...scopeOf(written),
        documentId: written.documentId,
        operationId: crypto.randomUUID(),
        expectedHead: written.headCommitId,
        title: fields.title.trim(),
        status: fields.status,
        synopsis: fields.synopsis
      }
      const meta = await window.collie.updateSectionMeta(metaPending.current).catch(() => ({
        ok: false as const,
        requestId: metaPending.current!.operationId,
        error: {
          code: 'UNAVAILABLE' as const,
          message:
            'The section-details outcome is unknown. Retry the same details before changing them.'
        }
      }))
      if (!meta.ok) {
        if (meta.error.code !== 'UNAVAILABLE') metaPending.current = null
        setError(meta.error.message)
        if (meta.error.code === 'STALE_REVISION') {
          const stored = await window.collie.openSection({
            ...scopeOf(written),
            documentId: written.documentId
          })
          if (stored.ok) setConflict(stored.value)
        }
        return null
      }
      metaPending.current = null
      updateHead(meta.value)
      if (
        fields.title === sectionFields.current.title &&
        fields.status === sectionFields.current.status &&
        fields.synopsis === sectionFields.current.synopsis
      ) {
        const saved = meta.value.documents.find((doc) => doc.id === meta.value.documentId)!
        changeFields({
          title: saved.title,
          status: saved.status as SectionFields['status'],
          synopsis: saved.synopsis
        })
      }
      return meta.value
    })
    committingTask.current = task
    try {
      return await task
    } finally {
      if (committingTask.current === task) committingTask.current = null
      window.collie.setUnprotectedChanges(isManuscriptDirty() || drafts.hasUnprotected())
    }
  }
  const manuscriptHandle = useRef<DraftHandle | null>(null)
  if (project)
    manuscriptHandle.current = {
      read: () => ({
        scope: scopeOf(current.current ?? project!),
        kind: 'manuscript',
        entityId: (current.current ?? project!).documentId,
        label: 'manuscript and section details',
        dirty: editVersionRef.current !== protectedVersionRef.current || isMetaDirty(),
        composing:
          composition.current || (!!editorRef.current && editorIsComposing(editorRef.current)),
        busy: !!committingTask.current,
        pendingOperation: retryCommit.current ?? metaPending.current,
        policy: 'flush',
        target: writingDestination(
          current.current ?? project!,
          (current.current ?? project!).documentId
        )
      }),
      flush: async () => !!(await flushManuscript()),
      focus: () => editorRef.current?.commands.focus()
    }
  useLayoutEffect(() => {
    if (!project) return
    return drafts.register('manuscript', {
      read: () => manuscriptHandle.current!.read(),
      flush: (mode) => manuscriptHandle.current!.flush!(mode),
      focus: () => manuscriptHandle.current!.focus?.()
    })
  }, [drafts, project])
  return {
    fields,
    changeFields,
    manuscriptDirty,
    committing,
    retry,
    conflict,
    metaPending,
    changed,
    isManuscriptDirty,
    textProtected,
    markProtected,
    resetManuscript,
    flushManuscript
  }
}
