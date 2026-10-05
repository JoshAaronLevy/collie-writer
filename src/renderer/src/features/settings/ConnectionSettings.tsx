import { ContentSurface } from '../../components/ui/Feedback'
import { AppButton } from '../../components/ui/Controls'
import { AiConnectionPanel } from '../ai-connections/AiConnectionPanel'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import styles from './SettingsPanel.module.css'

export default function ConnectionSettings(): React.JSX.Element {
  const session = useWorkspaceSession()
  return (
    <ContentSurface labelledBy="ai-settings-title" className={styles['settings-panel']}>
      <h1 id="ai-settings-title">AI connections</h1>
      <p>
        Use your own supported account for AI when it is available. Writing, research, Save and
        export work without one.
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
            ? 'Continue writing without AI'
            : 'Continue without AI'}
      </AppButton>
    </ContentSurface>
  )
}
