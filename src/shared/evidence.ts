import { hasControlCharacters } from './control-characters'
import { isId } from '../domain/editor/schema'
import type { OpenInput } from './projects'

export type EvidenceRole = 'support' | 'challenge' | 'background' | 'potential_use'
export type ResearchState = 'active' | 'archived'
export type DecisionState = 'candidate' | 'kept' | 'rejected'
export type ResearchItem = {
  id: string
  revisionId: string
  text: string
  state: ResearchState
  documentId: string | null
  noteId: string | null
  documentRevisionId: string | null
  createdAt: string
  updatedAt: string
}
export type EvidenceLink = {
  id: string
  revisionId: string
  sourceId: string
  excerptId: string | null
  claimId: string | null
  documentId: string | null
  targetRevisionId: string
  role: EvidenceRole
  origin: 'human'
  review: 'reviewed' | 'needs_review'
  state: 'active' | 'removed'
  createdAt: string
  updatedAt: string
}
export type ResearchDecision = {
  questionId: string
  sourceId: string
  revisionId: string
  state: DecisionState
  reason: string
  origin: 'human'
  createdAt: string
  updatedAt: string
}
export type EvidenceSource = {
  id: string
  title: string
  state: 'active' | 'trashed' | 'merged'
  replacementId: string | null
  activeVersionId: string | null
}
export type EvidenceSection = {
  id: string
  title: string
  revisionId: string
  state: 'active' | 'archived' | 'trashed' | 'merged'
  replacementId: string | null
}
export type EvidenceNote = { id: string; title: string; state: 'active' | 'archived' | 'trashed' }
export type EvidenceExcerpt = {
  id: string
  sourceId: string
  versionId: string
  sha256: string
  pageIndex: number | null
  quote: string
  kind: 'extracted' | 'transcription' | 'correction'
}
export type SourceSection = { sourceId: string; documentId: string }
export type CitationOccurrence = { sourceId: string; documentId: string; citationId: string }
export type EvidenceRevision = {
  entityType: 'question' | 'claim' | 'link' | 'decision'
  entityKey: string
  revisionId: string
  snapshot: string
  createdAt: string
}
export type EvidenceView = {
  questions: ResearchItem[]
  claims: ResearchItem[]
  links: EvidenceLink[]
  decisions: ResearchDecision[]
  sources: EvidenceSource[]
  sections: EvidenceSection[]
  notes: EvidenceNote[]
  excerpts: EvidenceExcerpt[]
  sourceSections: SourceSection[]
  citations: CitationOccurrence[]
  revisions: EvidenceRevision[]
  headCommitId: string
}
export type EvidenceChange =
  | {
      type: 'createQuestion' | 'createClaim'
      id: string
      text: string
      documentId: string | null
      noteId: string | null
    }
  | {
      type: 'updateQuestion' | 'updateClaim'
      id: string
      expectedRevisionId: string
      text: string
      documentId: string | null
      noteId: string | null
      state: ResearchState
    }
  | {
      type: 'createLink'
      id: string
      sourceId: string
      excerptId: string | null
      claimId: string | null
      documentId: string | null
      expectedTargetRevisionId: string
      role: EvidenceRole
    }
  | {
      type: 'changeLink'
      id: string
      expectedRevisionId: string
      role: EvidenceRole
      review: 'reviewed' | 'needs_review'
      state: 'active' | 'removed'
    }
  | {
      type: 'decide'
      questionId: string
      sourceId: string
      expectedRevisionId: string | null
      state: DecisionState
      reason: string
    }
export type EvidenceChangeInput = OpenInput & { operationId: string; change: EvidenceChange }

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k))
const line = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max && !hasControlCharacters(v, true)
const nullableId = (v: unknown): boolean => v === null || isId(v)
const role = (v: unknown): v is EvidenceRole =>
  ['support', 'challenge', 'background', 'potential_use'].includes(String(v))
const itemState = (v: unknown): v is ResearchState => ['active', 'archived'].includes(String(v))
const decisionState = (v: unknown): v is DecisionState =>
  ['candidate', 'kept', 'rejected'].includes(String(v))
const timestamp = (v: unknown): boolean => line(v, 40) && Number.isFinite(Date.parse(v))
export function isEvidenceChangeInput(v: unknown): v is EvidenceChangeInput {
  if (
    !object(v) ||
    !exact(v, ['projectId', 'workspaceId', 'operationId', 'change']) ||
    ![v.projectId, v.workspaceId, v.operationId].every(isId) ||
    !object(v.change)
  )
    return false
  const c = v.change
  if (c.type === 'createQuestion' || c.type === 'createClaim')
    return (
      exact(c, ['type', 'id', 'text', 'documentId', 'noteId']) &&
      isId(c.id) &&
      line(c.text, 10000) &&
      !!c.text.trim() &&
      nullableId(c.documentId) &&
      nullableId(c.noteId)
    )
  if (c.type === 'updateQuestion' || c.type === 'updateClaim')
    return (
      exact(c, ['type', 'id', 'expectedRevisionId', 'text', 'documentId', 'noteId', 'state']) &&
      isId(c.id) &&
      isId(c.expectedRevisionId) &&
      line(c.text, 10000) &&
      !!c.text.trim() &&
      nullableId(c.documentId) &&
      nullableId(c.noteId) &&
      itemState(c.state)
    )
  if (c.type === 'createLink')
    return (
      exact(c, [
        'type',
        'id',
        'sourceId',
        'excerptId',
        'claimId',
        'documentId',
        'expectedTargetRevisionId',
        'role'
      ]) &&
      isId(c.id) &&
      isId(c.sourceId) &&
      nullableId(c.excerptId) &&
      nullableId(c.claimId) &&
      nullableId(c.documentId) &&
      (c.claimId === null) !== (c.documentId === null) &&
      isId(c.expectedTargetRevisionId) &&
      role(c.role)
    )
  if (c.type === 'changeLink')
    return (
      exact(c, ['type', 'id', 'expectedRevisionId', 'role', 'review', 'state']) &&
      isId(c.id) &&
      isId(c.expectedRevisionId) &&
      role(c.role) &&
      ['reviewed', 'needs_review'].includes(String(c.review)) &&
      ['active', 'removed'].includes(String(c.state))
    )
  if (c.type === 'decide')
    return (
      exact(c, ['type', 'questionId', 'sourceId', 'expectedRevisionId', 'state', 'reason']) &&
      isId(c.questionId) &&
      isId(c.sourceId) &&
      nullableId(c.expectedRevisionId) &&
      decisionState(c.state) &&
      line(c.reason, 2000) &&
      (c.state !== 'rejected' || !!c.reason.trim())
    )
  return false
}
export function isEvidenceView(v: unknown): v is EvidenceView {
  if (
    !object(v) ||
    !exact(v, [
      'questions',
      'claims',
      'links',
      'decisions',
      'sources',
      'sections',
      'notes',
      'excerpts',
      'sourceSections',
      'citations',
      'revisions',
      'headCommitId'
    ]) ||
    !isId(v.headCommitId)
  )
    return false
  const list = (
    name: string,
    max: number,
    valid: (item: Record<string, unknown>) => boolean
  ): boolean =>
    Array.isArray(v[name]) &&
    v[name].length <= max &&
    v[name].every((item: unknown) => object(item) && valid(item))
  const item = (x: Record<string, unknown>): boolean =>
    exact(x, [
      'id',
      'revisionId',
      'text',
      'state',
      'documentId',
      'noteId',
      'documentRevisionId',
      'createdAt',
      'updatedAt'
    ]) &&
    isId(x.id) &&
    isId(x.revisionId) &&
    line(x.text, 10000) &&
    !!x.text.trim() &&
    itemState(x.state) &&
    nullableId(x.documentId) &&
    nullableId(x.noteId) &&
    nullableId(x.documentRevisionId) &&
    timestamp(x.createdAt) &&
    timestamp(x.updatedAt)
  return (
    list('questions', 10000, item) &&
    list('claims', 10000, item) &&
    list(
      'links',
      50000,
      (x) =>
        exact(x, [
          'id',
          'revisionId',
          'sourceId',
          'excerptId',
          'claimId',
          'documentId',
          'targetRevisionId',
          'role',
          'origin',
          'review',
          'state',
          'createdAt',
          'updatedAt'
        ]) &&
        [x.id, x.revisionId, x.sourceId, x.targetRevisionId].every(isId) &&
        nullableId(x.excerptId) &&
        nullableId(x.claimId) &&
        nullableId(x.documentId) &&
        (x.claimId === null) !== (x.documentId === null) &&
        role(x.role) &&
        x.origin === 'human' &&
        ['reviewed', 'needs_review'].includes(String(x.review)) &&
        ['active', 'removed'].includes(String(x.state)) &&
        timestamp(x.createdAt) &&
        timestamp(x.updatedAt)
    ) &&
    list(
      'decisions',
      50000,
      (x) =>
        exact(x, [
          'questionId',
          'sourceId',
          'revisionId',
          'state',
          'reason',
          'origin',
          'createdAt',
          'updatedAt'
        ]) &&
        [x.questionId, x.sourceId, x.revisionId].every(isId) &&
        decisionState(x.state) &&
        line(x.reason, 2000) &&
        x.origin === 'human' &&
        timestamp(x.createdAt) &&
        timestamp(x.updatedAt)
    ) &&
    list(
      'sources',
      100000,
      (x) =>
        exact(x, ['id', 'title', 'state', 'replacementId', 'activeVersionId']) &&
        isId(x.id) &&
        line(x.title, 2000) &&
        ['active', 'trashed', 'merged'].includes(String(x.state)) &&
        nullableId(x.replacementId) &&
        nullableId(x.activeVersionId)
    ) &&
    list(
      'sections',
      10000,
      (x) =>
        exact(x, ['id', 'title', 'revisionId', 'state', 'replacementId']) &&
        isId(x.id) &&
        isId(x.revisionId) &&
        line(x.title, 500) &&
        ['active', 'archived', 'trashed', 'merged'].includes(String(x.state)) &&
        nullableId(x.replacementId)
    ) &&
    list(
      'notes',
      100000,
      (x) =>
        exact(x, ['id', 'title', 'state']) &&
        isId(x.id) &&
        line(x.title, 500) &&
        ['active', 'archived', 'trashed'].includes(String(x.state))
    ) &&
    list(
      'excerpts',
      100000,
      (x) =>
        exact(x, ['id', 'sourceId', 'versionId', 'sha256', 'pageIndex', 'quote', 'kind']) &&
        [x.id, x.sourceId, x.versionId].every(isId) &&
        typeof x.sha256 === 'string' &&
        /^[a-f0-9]{64}$/.test(x.sha256) &&
        (x.pageIndex === null || (Number.isSafeInteger(x.pageIndex) && Number(x.pageIndex) >= 0)) &&
        line(x.quote, 10000) &&
        ['extracted', 'transcription', 'correction'].includes(String(x.kind))
    ) &&
    list(
      'sourceSections',
      50000,
      (x) => exact(x, ['sourceId', 'documentId']) && isId(x.sourceId) && isId(x.documentId)
    ) &&
    list(
      'citations',
      50000,
      (x) =>
        exact(x, ['sourceId', 'documentId', 'citationId']) &&
        [x.sourceId, x.documentId, x.citationId].every(isId)
    ) &&
    list(
      'revisions',
      100000,
      (x) =>
        exact(x, ['entityType', 'entityKey', 'revisionId', 'snapshot', 'createdAt']) &&
        ['question', 'claim', 'link', 'decision'].includes(String(x.entityType)) &&
        line(x.entityKey, 100) &&
        isId(x.revisionId) &&
        line(x.snapshot, 100000) &&
        timestamp(x.createdAt)
    )
  )
}
