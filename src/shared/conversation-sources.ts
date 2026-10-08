import { isId } from '../domain/editor/schema'
import { exact, record } from './projects'
import { isSourceMetadata, type SourceMetadata } from './sources'
import { researchUrl } from './conversation-research'
import { hasControlCharacters } from './control-characters'

export type ReferenceOrigin = {
  attemptId: string
  revisionId: string
  reference: { kind: 'web'; url: string } | { kind: 'text'; text: string }
}
export type ReferenceCandidate = { id: string; revisionId: string; title: string; reason: string }
export type ReferenceSave = {
  operationId: string
  origin: ReferenceOrigin
  metadata: SourceMetadata
  verified: boolean
  existingSourceId: string | null
  candidates: ReferenceCandidate[]
}
export type ReferenceReceipt = ReferenceSave & {
  version: 1
  digest: string
  sourceId: string
  conversationId: string
  createdAt: string
}
export function isReferenceOrigin(v: unknown): v is ReferenceOrigin {
  if (
    !record(v) ||
    !exact(v, ['attemptId', 'revisionId', 'reference']) ||
    !isId(v.attemptId) ||
    !isId(v.revisionId) ||
    !record(v.reference)
  )
    return false
  const r = v.reference
  return r.kind === 'web'
    ? exact(r, ['kind', 'url']) && researchUrl(r.url)
    : r.kind === 'text' &&
        exact(r, ['kind', 'text']) &&
        typeof r.text === 'string' &&
        !!r.text.trim() &&
        r.text.length <= 2000 &&
        !hasControlCharacters(r.text, true)
}
export function isReferenceCandidate(v: unknown): v is ReferenceCandidate {
  return (
    record(v) &&
    exact(v, ['id', 'revisionId', 'title', 'reason']) &&
    isId(v.id) &&
    isId(v.revisionId) &&
    typeof v.title === 'string' &&
    v.title.length <= 2000 &&
    typeof v.reason === 'string' &&
    v.reason.length <= 100
  )
}
export function isReferenceSave(v: unknown): v is ReferenceSave {
  return (
    record(v) &&
    exact(v, ['operationId', 'origin', 'metadata', 'verified', 'existingSourceId', 'candidates']) &&
    isId(v.operationId) &&
    isReferenceOrigin(v.origin) &&
    isSourceMetadata(v.metadata) &&
    typeof v.verified === 'boolean' &&
    (v.existingSourceId === null || isId(v.existingSourceId)) &&
    Array.isArray(v.candidates) &&
    v.candidates.length <= 12 &&
    v.candidates.every(isReferenceCandidate) &&
    new Set(v.candidates.map((c) => c.id)).size === v.candidates.length
  )
}
export function isReferenceReceipt(v: unknown): v is ReferenceReceipt {
  if (!record(v)) return false
  const { version, digest, sourceId, conversationId, createdAt, ...save } = v
  return (
    JSON.stringify(v).length <= 192000 &&
    isReferenceSave(save) &&
    version === 1 &&
    typeof digest === 'string' &&
    /^[a-f0-9]{64}$/.test(digest) &&
    isId(sourceId) &&
    isId(conversationId) &&
    typeof createdAt === 'string' &&
    Number.isFinite(Date.parse(createdAt)) &&
    new Date(createdAt).toISOString() === createdAt
  )
}
