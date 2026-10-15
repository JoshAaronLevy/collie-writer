import { ConversationSlot } from '../ai/conversations/ConversationSlot'
import { ChapterMaterialPanel } from './ChapterMaterialPanel'
import type { SecondaryPanel } from './useWritingPreferences'
import styles from './WritingWorkspace.module.css'

export function WritingSidePanel({
  mode,
  active
}: {
  mode: SecondaryPanel
  active: boolean
}): React.JSX.Element {
  return (
    <div
      className={styles['writing-side-content']}
      data-ai={mode === 'ai'}
      data-conversation-visible={active && mode === 'ai'}
    >
      <div className={styles['writing-chat-slot']} hidden={mode !== 'ai'} inert={mode !== 'ai'}>
        <ConversationSlot active={active && mode === 'ai'} />
      </div>
      <div hidden={mode !== 'material'} inert={mode !== 'material'}>
        <ChapterMaterialPanel active={active && mode === 'material'} />
      </div>
    </div>
  )
}
