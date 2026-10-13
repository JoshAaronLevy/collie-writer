import { useEffect, useRef, useState } from 'react'
import type { OpenInput } from '../../../../../shared/projects'
import type {
  TranscriptCursor,
  TranscriptEntry,
  TranscriptKey,
  TranscriptSource,
  TranscriptValue
} from '../../../../../shared/conversation-transcript'

type Page = Extract<TranscriptValue, { type: 'transcript' }>
type Position = {
  cursor: TranscriptCursor | null
  target: TranscriptKey | null
  direction: 'forward' | 'backward'
}
const tail: Position = { cursor: null, target: null, direction: 'backward' }
const mountedMessages = 20
const sameKey = (a: TranscriptKey, b: TranscriptKey): boolean =>
  a.segment === b.segment &&
  a.sequence === b.sequence &&
  a.messageId === b.messageId &&
  a.messageRevision === b.messageRevision

/** Read-only imported window, owned by the retained conversation controller. */
export function useImportedTranscript(
  scope: OpenInput | null,
  source: TranscriptSource | null,
  opening: number,
  target: TranscriptKey | null
): {
  page: Page | null
  loading: boolean
  issue: string
  older: () => void
  newer: () => void
  retry: () => void
} {
  const identity = `${scope?.projectId}:${scope?.workspaceId}:${source?.conversationId}:${opening}`
  const [owner, setOwner] = useState(identity)
  const [position, setPosition] = useState<Position>(
    target ? { ...tail, target, direction: 'forward' } : tail
  )
  const [page, setPage] = useState<Page | null>(null)
  const [issue, setIssue] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [finished, setFinished] = useState('')
  const retained = useRef<{ identity: string; page: Page } | null>(null)
  if (owner !== identity) {
    setOwner(identity)
    setPosition(target ? { ...tail, target, direction: 'forward' } : tail)
    setPage(null)
    setIssue('')
  }
  const readKey = `${identity}:${source?.revisionId}:${attempt}:${JSON.stringify(position)}`
  const loading = !!source && finished !== readKey
  useEffect(() => {
    let cancelled = false
    const previous = retained.current?.identity === identity ? retained.current.page : null
    // A revision refresh retains the visible first message, never a stale cursor.
    const changedRevision =
      previous &&
      previous.conversationId === source?.conversationId &&
      (previous.revisionId !== source.revisionId ||
        (position.cursor && position.cursor.revisionId !== source.revisionId))
    const requested =
      changedRevision && previous?.entries.length
        ? { cursor: null, target: previous.entries[0].key, direction: 'forward' as const }
        : position
    async function read(): Promise<void> {
      if (!scope || !source) return
      try {
        const result = await window.collie.conversation({
          ...scope,
          action: 'transcript-read',
          range: 'imported',
          source,
          ...requested
        })
        if (cancelled) return
        if (!result.ok) throw new Error(result.error.message)
        if (
          result.value.type !== 'transcript' ||
          result.value.source.conversationId !== source.conversationId ||
          result.value.source.revisionId !== source.revisionId ||
          result.value.entries.some((entry) => entry.key.segment !== 'imported')
        )
          throw new Error('Imported messages could not be read.')
        let next = result.value
        // Refresh the same bounded window if a native write changed the chat revision.
        const end = changedRevision ? previous?.entries.at(-1)?.key.sequence : undefined
        while (
          end !== undefined &&
          next.after &&
          next.entries.length < mountedMessages &&
          (next.entries.at(-1)?.key.sequence ?? -1) < end
        ) {
          const more = await window.collie.conversation({
            ...scope,
            action: 'transcript-read',
            range: 'imported',
            source,
            cursor: next.after,
            target: null,
            direction: 'forward'
          })
          if (cancelled) return
          if (!more.ok) throw new Error(more.error.message)
          if (
            more.value.type !== 'transcript' ||
            more.value.source.conversationId !== source.conversationId ||
            more.value.source.revisionId !== source.revisionId ||
            !more.value.entries.length ||
            more.value.entries.some((entry) => entry.key.segment !== 'imported')
          )
            throw new Error('Imported messages could not be refreshed.')
          next = {
            ...next,
            entries: [...next.entries, ...more.value.entries],
            after: more.value.after
          }
        }
        next = {
          ...next,
          entries: next.entries.map((entry) => {
            const saved = previous?.entries.find(
              (e) => sameKey(e.key, entry.key) && e.textUnits === entry.textUnits
            )
            return saved && saved.text.length > entry.text.length
              ? { ...entry, text: saved.text }
              : entry
          })
        }
        const old =
          !changedRevision && previous?.revisionId === source.revisionId && position.cursor
            ? previous
            : null
        const combined = [
          ...new Map(
            (requested.direction === 'backward'
              ? [...next.entries, ...(old?.entries ?? [])]
              : [...(old?.entries ?? []), ...next.entries]
            ).map((e) => [e.key.messageId, e])
          ).values()
        ]
        const entries =
          changedRevision || requested.direction === 'backward'
            ? combined.slice(0, mountedMessages)
            : combined.slice(-mountedMessages)
        const cursor = (entry: TranscriptEntry): TranscriptCursor => ({
          version: 1,
          conversationId: source.conversationId,
          revisionId: source.revisionId,
          key: entry.key
        })
        let windowPage: Page = {
          ...next,
          entries,
          before:
            !changedRevision &&
            requested.direction === 'forward' &&
            combined.length > entries.length
              ? cursor(entries[0])
              : requested.direction === 'forward' && old
                ? old.before
                : next.before,
          after:
            (changedRevision || requested.direction === 'backward') &&
            combined.length > entries.length
              ? cursor(entries[entries.length - 1])
              : requested.direction === 'backward' && old
                ? old.after
                : next.after
        }
        retained.current = { identity, page: windowPage }
        setPage(windowPage)
        setIssue('')
        // One slice request at a time, only for the bounded mounted window.
        for (const entry of entries) {
          let text = entry.text
          while (text.length < entry.textUnits) {
            const slice = await window.collie.conversation({
              ...scope,
              action: 'transcript-text',
              source,
              target: entry.key,
              offset: text.length
            })
            if (cancelled) return
            if (!slice.ok) throw new Error(slice.error.message)
            const value = slice.value
            if (
              value.type !== 'transcript-text' ||
              !sameKey(value.target, entry.key) ||
              value.source.conversationId !== source.conversationId ||
              value.source.revisionId !== source.revisionId ||
              value.offset !== text.length ||
              value.total !== entry.textUnits ||
              !value.text.length
            )
              throw new Error(
                'This imported message changed while being read. Reopen the chat to refresh it.'
              )
            text += value.text
          }
          if (text !== entry.text) {
            windowPage = {
              ...windowPage,
              entries: windowPage.entries.map((e) =>
                sameKey(e.key, entry.key) ? { ...e, text } : e
              )
            }
            retained.current = { identity, page: windowPage }
            setPage(windowPage)
          }
        }
      } catch (error) {
        if (!cancelled)
          setIssue(
            error instanceof Error
              ? error.message
              : 'Imported messages could not be read. Try again.'
          )
      } finally {
        if (!cancelled) setFinished(readKey)
      }
    }
    void read()
    return () => {
      cancelled = true
    }
  }, [readKey, identity, scope, source, position])
  function move(direction: 'forward' | 'backward'): void {
    const cursor = direction === 'forward' ? page?.after : page?.before
    if (loading || !cursor) return
    setIssue('')
    setPosition({ cursor, target: null, direction })
  }
  return {
    page,
    loading,
    issue,
    older: () => move('backward'),
    newer: () => move('forward'),
    retry: () => setAttempt((n) => n + 1)
  }
}
