import { ContentSurface } from '../../components/ui/Feedback'
import styles from './SettingsPanel.module.css'

export default function ConnectionSettings():React.JSX.Element {
  return <ContentSurface labelledBy="ai-settings-title" className={styles['settings-panel']}>
    <h1 id="ai-settings-title">AI connections</h1>
    <p>AI connections are not available in this build. Writing, research, Save and export work without an AI account.</p>
    <p>When an eligible integration is available, AI features will use your own supported subscription account with explicit context sharing. Collie Writer will not offer an API-key or paid-token fallback.</p>
    <p>No provider is connected, and no writing is sent to an AI service. Collie access is a separate setting.</p>
  </ContentSurface>
}
