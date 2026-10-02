import { ContentSurface } from '../../components/ui/Feedback'
import NativeHelpActions from './NativeHelpActions'
import styles from './SettingsPanel.module.css'

export default function UpdateSettings():React.JSX.Element {
  return <ContentSurface labelledBy="updates-title" className={styles['settings-panel']}>
    <h1 id="updates-title">Updates</h1>
    <p>Checks happen only when you ask. Configured direct builds contact their signed release feed without sending writing or project files. Development builds and releases without a configured feed cannot check for updates.</p>
    <NativeHelpActions kind="updates" />
    <p>An available update asks before downloading and restarting. Restart waits for pending drafts and file operations; unresolved work keeps the app open. You can install a downloaded update later from here or the native Help menu.</p>
  </ContentSurface>
}
