import { ContentSurface } from '../../components/ui/Feedback'
import { AppButton } from '../../components/ui/Controls'
import { AiConnectionPanel } from '../ai-connections/AiConnectionPanel'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import styles from './SettingsPanel.module.css'

export default function ConnectionSettings(): React.JSX.Element {
  const session = useWorkspaceSession()
  return (
    <ContentSurface labelledBy="ai-settings-title" className={styles['settings-panel']}>
      <h1 id="ai-settings-title">ChatGPT</h1>
      <p>
        Your ChatGPT connection is shared across all projects on this device. Manage it here or from
        ChatGPT in the header. The dialog also lets you change whether Collie prompts you at
        startup.
      </p>
      <AiConnectionPanel />
      <AppButton
        variant="default"
        onClick={() => {
          if (session.backDestination) void session.goBack()
          else if (session.project) session.returnToWork()
          else void session.navigate({ kind: 'library' })
        }}
      >
        {session.backDestination
          ? 'Return to previous view'
          : session.project
            ? 'Return to writing'
            : 'Return to Projects'}
      </AppButton>
    </ContentSurface>
  )
}
