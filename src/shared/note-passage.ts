import { isId } from '../domain/editor/schema'
import { exact, record } from './projects'
import { isTranscriptKey, type TranscriptKey } from './conversation-transcript'

export const PASSAGE_LIMIT = 20_000
/** Separate from the frozen whole-message AI recall reference. Offsets are UTF-16 units. */
export type PassageSelection = {
  conversationId: string
  conversationRevisionId: string
  key: TranscriptKey
  start: number
  end: number
  quote: string
}
export type NotePassage = PassageSelection & {
  version: 1
  conversationTitle: string
  role: string
  attemptId: string | null
}
export function isPassageSelection(v: unknown): v is PassageSelection {
  return (
    record(v) &&
    exact(v, ['conversationId', 'conversationRevisionId', 'key', 'start', 'end', 'quote']) &&
    isId(v.conversationId) &&
    isId(v.conversationRevisionId) &&
    isTranscriptKey(v.key) &&
    Number.isSafeInteger(v.start) &&
    Number(v.start) >= 0 &&
    Number.isSafeInteger(v.end) &&
    Number(v.end) > Number(v.start) &&
    typeof v.quote === 'string' &&
    !!v.quote.trim() &&
    v.quote.length <= PASSAGE_LIMIT &&
    v.quote.length === Number(v.end) - Number(v.start)
  )
}
export function isNotePassage(v: unknown): v is NotePassage {
  if (
    !record(v) ||
    !exact(v, [
      'version',
      'conversationTitle',
      'role',
      'attemptId',
      'conversationId',
      'conversationRevisionId',
      'key',
      'start',
      'end',
      'quote'
    ])
  )
    return false
  const { version, conversationTitle, role, attemptId, ...selection } = v
  return (
    version === 1 &&
    typeof conversationTitle === 'string' &&
    conversationTitle.length <= 500 &&
    typeof role === 'string' &&
    role.length <= 500 &&
    (attemptId === null || isId(attemptId)) &&
    (selection.key && record(selection.key) && selection.key.segment === 'native'
      ? isId(attemptId)
      : attemptId === null) &&
    isPassageSelection(selection)
  )
}
