import { Palette } from 'lucide-react'
import { isZoomLevel, ZOOM_LEVELS } from '../../../../shared/support'
import { useVisualPreferences } from '../../theme/VisualPreferencesProvider'
import { AppButton, ChoiceField, SelectField } from '../../components/ui/Controls'
import { ContentSurface } from '../../components/ui/Feedback'
import AuthorPreferenceSettings from '../onboarding/AuthorPreferenceSettings'
import styles from './SettingsPanel.module.css'

export default function SettingsPanel(): React.JSX.Element {
  const { preferences, updatePreferences, zoomIssue, zoomPending, retryZoom } =
    useVisualPreferences()
  return (
    <>
      <ContentSurface
        id="settings"
        labelledBy="settings-title"
        className={styles['settings-panel']}
      >
        <div className={styles['settings-heading']}>
          <Palette size={22} aria-hidden="true" />
          <h2 id="settings-title" tabIndex={-1}>
            Appearance and accessibility
          </h2>
        </div>
        <p className={styles['settings-introduction']}>
          Make this space comfortable for you. Display choices stay on this computer and apply
          immediately.
        </p>
        <div className={styles['appearance-fields']}>
          <SelectField
            label="Appearance"
            description="System follows your computer’s light or dark appearance."
            value={preferences.appearance}
            data={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' }
            ]}
            onChange={(event) => {
              const appearance = event.currentTarget.value
              if (appearance === 'system' || appearance === 'light' || appearance === 'dark')
                updatePreferences({ appearance })
            }}
          />
          <div className={styles['zoom-field']}>
            <SelectField
              label="Interface zoom"
              description="System zoom shortcuts also remain available in View."
              value={String(preferences.zoom)}
              disabled={zoomPending}
              error={zoomIssue}
              data={ZOOM_LEVELS.map((level) => ({ value: String(level), label: `${level}%` }))}
              onChange={(event) => {
                const zoom = Number(event.currentTarget.value)
                if (isZoomLevel(zoom)) updatePreferences({ zoom })
              }}
            />
            {zoomIssue ? (
              <AppButton variant="default" pending={zoomPending} onClick={retryZoom}>
                Retry zoom
              </AppButton>
            ) : null}
          </div>
        </div>
        <div className={styles['accessibility-fields']}>
          <ChoiceField
            label="High contrast"
            description="Strengthen text and borders. Your system’s increased contrast is also respected."
            checked={preferences.contrast}
            onChange={(event) => updatePreferences({ contrast: event.currentTarget.checked })}
          />
          <ChoiceField
            label="Reduce motion"
            description="Remove nonessential animation. Your system’s reduced-motion preference is also respected."
            checked={preferences.reducedMotion}
            onChange={(event) => updatePreferences({ reducedMotion: event.currentTarget.checked })}
          />
        </div>
        <AuthorPreferenceSettings />
      </ContentSurface>
    </>
  )
}
