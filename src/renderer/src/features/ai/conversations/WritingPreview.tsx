import { useState } from 'react'
import { Textarea } from '@mantine/core'
import type { ConversationTurn } from '../../../../../shared/conversations'
import { AppButton } from '../../../components/ui/Controls'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import { useConversations } from './conversationState'
import styles from './Conversations.module.css'

export function WritingPreview({ turn }: { turn: ConversationTurn }): React.JSX.Element | null {
  const c = useConversations(),
    s = useWorkspaceSession(),
    [opened, setOpened] = useState(false),
    [, refreshTarget] = useState(0),
    [issue, setIssue] = useState(''),
    [notice, setNotice] = useState('')
  if (
    turn.capture.version !== 7 ||
    turn.capture.planning.version !== 3 ||
    !turn.assistant ||
    turn.attempt.state !== 'completed'
  )
    return null
  const id = turn.attempt.id,
    response = turn.assistant,
    saved = c.draft.previews?.find((p) => p.attemptId === id),
    text = saved?.text ?? response.text,
    target = c.writing.target(id),
    blocked =
      c.busy ||
      !!c.pending ||
      c.readOnly ||
      !c.draftProtection.ready ||
      c.composingRef.current ||
      s.closing ||
      s.navigating ||
      s.busy ||
      s.acting ||
      s.fileActive ||
      s.accessTransition ||
      s.proofreadingLocked,
    writeVisible = s.destination.kind === 'workspace' && s.destination.view === 'write'
  function update(value: string): void {
    const previews = c.draft.previews ?? []
    if (!saved && previews.length >= 20) {
      setIssue(
        'Twenty edited previews are retained in this chat. Keep or discard an older preview before editing another.'
      )
      return
    }
    c.update({
      previews: [
        ...previews.filter((p) => p.attemptId !== id),
        { attemptId: id, messageRevision: response.revisionId, text: value }
      ]
    })
  }
  function act(work: () => void): void {
    try {
      work()
      setIssue('')
      refreshTarget((revision) => revision + 1)
    } catch (e) {
      setIssue(
        e instanceof Error ? e.message : 'The preview could not be inserted. Its text is kept.'
      )
    }
  }
  return (
    <div className={styles['writing-preview']}>
      <AppButton
        variant="subtle"
        disabled={!c.draftProtection.ready}
        onClick={() => setOpened(!opened)}
      >
        {opened ? 'Hide writing preview' : 'Review writing preview'}
      </AppButton>
      {opened ? (
        <>
          <p className={styles['conversation-caption']}>
            Plain text preview. Citation suggestions need the normal citation workflow. Edits stay
            on this device until inserted.
          </p>
          <Textarea
            label="Writing preview"
            value={text}
            maxLength={128000}
            autosize
            minRows={4}
            maxRows={16}
            readOnly={blocked}
            onChange={(e) => update(e.currentTarget.value)}
          />
          {text.length > 32000 ? (
            <p>
              Shorten this preview to 32,000 characters before inserting. The full original response
              stays in the conversation.
            </p>
          ) : null}
          <p className={styles['conversation-caption']}>
            {target && !target.used
              ? `${target.replacing ? 'Replace captured selection' : 'Insert at captured cursor'} · ${target.title}`
              : 'Choose a position in Write to use this saved preview.'}
          </p>
          {!writeVisible ? <p>Return to Write before choosing an insertion position.</p> : null}
          <div className={styles['conversation-actions']}>
            <AppButton
              disabled={
                blocked ||
                !writeVisible ||
                !target ||
                target.used ||
                !text.trim() ||
                text.length > 32000 ||
                (!!saved && saved.messageRevision !== response.revisionId)
              }
              onClick={() =>
                act(() => {
                  c.writing.insert(id, text)
                  setNotice(
                    'Inserted into the manuscript. Undo reverses this insertion; the response and preview are kept.'
                  )
                })
              }
            >
              {target?.replacing ? 'Replace selection' : 'Insert here'}
            </AppButton>
            <AppButton
              variant="subtle"
              disabled={blocked || !writeVisible}
              onClick={() =>
                act(() => {
                  c.writing.retarget(id)
                  setNotice(
                    'Using the current manuscript cursor or selection. Review the target before inserting.'
                  )
                })
              }
            >
              Use current cursor or selection
            </AppButton>
          </div>
          {saved ? (
            <details>
              <summary>Discard preview edits</summary>
              <p>The original response stays in this conversation.</p>
              <AppButton
                variant="subtle"
                disabled={blocked}
                onClick={() => {
                  c.update({ previews: c.draft.previews?.filter((p) => p.attemptId !== id) })
                  setNotice('Original response restored in the preview.')
                }}
              >
                Discard these edits
              </AppButton>
            </details>
          ) : null}
        </>
      ) : null}
      {issue ? <p role="alert">{issue}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  )
}
