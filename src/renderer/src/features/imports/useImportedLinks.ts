import { useEffect, useState } from 'react'
import type { OpenInput } from '../../../../shared/projects'
import type { ImportedLinks } from '../../../../shared/imported-links'
import type { TranscriptEntry } from '../../../../shared/conversation-transcript'

type Links = Record<string, ImportedLinks | null>
const emptyEntries: TranscriptEntry[] = []
/** Three concurrent local reads, limited to the mounted window; no persistent link cache. */
export function useImportedLinks(
  scope: OpenInput | null,
  entries: TranscriptEntry[] = emptyEntries,
  head?: string
): { values: Links; retry: () => void } {
  const ids = entries
    .map((entry) => `${entry.key.messageId}/${entry.key.messageRevision}`)
    .join(':')
  const key = `${scope?.projectId}:${scope?.workspaceId}:${head}:${ids}`
  const [result, setResult] = useState<{ key: string; values: Links }>({ key: '', values: {} })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!scope || !ids) return
    let current = true,
      next = 0
    const messages = ids.split(':').map((value) => value.split('/'))
    const values: Links = {}
    async function read(): Promise<void> {
      while (current && next < messages.length) {
        const [messageId, revision] = messages[next++]
        let value: ImportedLinks | null = null
        try {
          const r = await window.collie.conversation({
            ...scope!,
            action: 'imported-links',
            messageId,
            offset: 0
          })
          if (
            r.ok &&
            r.value.type === 'imported-links' &&
            r.value.target.messageId === messageId &&
            r.value.target.messageRevision === revision
          )
            value = r.value
        } catch {
          /* A real failure is shown beside this message. */
        }
        if (!current) return
        values[messageId] = value
        setResult({ key, values: { ...values } })
      }
    }
    void Promise.all(Array.from({ length: Math.min(3, messages.length) }, read))
    return () => {
      current = false
    }
  }, [scope, ids, key, retry])
  return { values: result.key === key ? result.values : {}, retry: () => setRetry((n) => n + 1) }
}
