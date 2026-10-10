import { isId } from '../domain/editor/schema'
import { exact, record } from './projects'
import { isTranscriptKey, type TranscriptKey } from './conversation-transcript'
export type ImportedLinks = {
  type: 'imported-links'
  conversationId: string
  revisionId: string
  target: TranscriptKey
  sources: { id: string; title: string; state: 'active' | 'trashed' }[]
  more: boolean
}
export function isImportedLinks(v: unknown): v is ImportedLinks {
  return (
    record(v) &&
    exact(v, ['type', 'conversationId', 'revisionId', 'target', 'sources', 'more']) &&
    v.type === 'imported-links' &&
    isId(v.conversationId) &&
    isId(v.revisionId) &&
    isTranscriptKey(v.target) &&
    v.target.segment === 'imported' &&
    Array.isArray(v.sources) &&
    v.sources.length <= 20 &&
    v.sources.every(
      (s) =>
        record(s) &&
        exact(s, ['id', 'title', 'state']) &&
        isId(s.id) &&
        typeof s.title === 'string' &&
        s.title.length <= 500 &&
        (s.state === 'active' || s.state === 'trashed')
    ) &&
    typeof v.more === 'boolean'
  )
}
