import { useState } from 'react'
import { AppButton } from '../../../components/ui/Controls'
import { useConversations } from './conversationState'
import { useWorkspaceSession } from '../../workspace/workspaceContext'
import type { ChatDraft } from '../../../../../shared/conversation-drafts'
import styles from './Conversations.module.css'

export function ConversationDraftRecovery(): React.JSX.Element {
  const c = useConversations(),
    [confirm, setConfirm] = useState<{ id: string; draft: ChatDraft } | null>(null),
    [notice, setNotice] = useState('')
  const session = useWorkspaceSession()
  const blocked =
    c.busy ||
    !!c.pending ||
    session.closing ||
    session.navigating ||
    session.accessTransition ||
    c.composingRef.current
  return (
    <div className={styles['draft-recovery']} aria-label="Saved chat drafts">
      <p>Drafts stay on this device. They are not sent or included in the project file.</p>
      {!Object.keys(c.drafts).length ? <p>No recovered drafts for this project.</p> : null}
      <ul className={styles['conversation-list']}>
        {Object.entries(c.drafts).map(([id, draft]) => {
          const chat =
            (c.page?.conversation.id === id ? c.page.conversation : undefined) ??
            [...c.currentItems, ...c.items, ...c.draftProtection.chats].find(
              (item) => item.id === id
            )
          return (
            <li key={id}>
              <strong>
                {chat?.title ?? 'Unavailable conversation'}
                {chat?.state === 'archived' ? ' · Archived' : ''}
              </strong>
              <p className={styles['draft-preview']}>
                {draft.text.slice(0, 300) || 'Context choice only'}
              </p>
              {draft.text ? (
                <details>
                  <summary>View full draft</summary>
                  <textarea
                    aria-label={`Draft for ${chat?.title ?? 'unavailable conversation'}`}
                    readOnly
                    value={draft.text}
                  />
                </details>
              ) : null}
              <div className={styles['conversation-actions']}>
                {chat ? (
                  <AppButton
                    size="compact-sm"
                    variant="subtle"
                    disabled={blocked}
                    onClick={() => c.choose(id)}
                  >
                    Open chat
                  </AppButton>
                ) : null}
                <AppButton
                  size="compact-sm"
                  variant="subtle"
                  disabled={!draft.text}
                  onClick={() => {
                    void window.collie
                      .conversationPresentation('copy', draft.text)
                      .then((ok) =>
                        setNotice(
                          ok
                            ? 'Draft copied.'
                            : 'Could not copy. Use View full draft to select and copy the text.'
                        )
                      )
                      .catch(() =>
                        setNotice(
                          'Could not copy. Use View full draft to select and copy the text.'
                        )
                      )
                  }}
                >
                  Copy draft
                </AppButton>
                <AppButton
                  size="compact-sm"
                  variant="subtle"
                  disabled={blocked}
                  onClick={() => setConfirm({ id, draft: { ...draft } })}
                >
                  Discard draft…
                </AppButton>
              </div>
              {confirm?.id === id ? (
                <div>
                  <p>
                    Discard this device’s unsent draft and context choice? Saved messages are kept.
                  </p>
                  <AppButton
                    size="compact-sm"
                    disabled={blocked}
                    onClick={() => {
                      if (
                        draft.text === confirm.draft.text &&
                        draft.contextPolicy === confirm.draft.contextPolicy
                      )
                        c.draftProtection.clear(id)
                      else setNotice('The draft changed. Review it before discarding.')
                      setConfirm(null)
                    }}
                  >
                    Discard draft
                  </AppButton>
                  <AppButton size="compact-sm" variant="subtle" onClick={() => setConfirm(null)}>
                    Keep draft
                  </AppButton>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {notice ? <p role="status">{notice}</p> : null}
    </div>
  )
}
