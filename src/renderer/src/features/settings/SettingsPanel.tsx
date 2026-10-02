import { useRef, useState } from 'react'
import { Palette, ShieldCheck } from 'lucide-react'
import { isZoomLevel, ZOOM_LEVELS, type SupportPreview } from '../../../../shared/support'
import { useVisualPreferences } from '../../theme/VisualPreferencesProvider'
import { AppButton, ChoiceField, SelectField, TextareaField } from '../../components/ui/Controls'
import { AppDialog } from '../../components/ui/AppDialog'
import { ContentSurface, EmptyState, StatusBanner } from '../../components/ui/Feedback'
import styles from './SettingsPanel.module.css'

export default function SettingsPanel(): React.JSX.Element {
  const { preferences, updatePreferences, zoomIssue, zoomPending, retryZoom } = useVisualPreferences()
  const [preview, setPreview] = useState<SupportPreview | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewPending, setPreviewPending] = useState(false)
  const [previewIssue, setPreviewIssue] = useState<string | null>(null)
  const previewRequest = useRef(0)

  function closePreview(): void {
    previewRequest.current += 1
    setPreviewPending(false)
    setPreviewOpen(false)
  }

  async function preparePreview(): Promise<void> {
    if (previewPending) return
    const request = ++previewRequest.current
    setPreviewPending(true)
    setPreviewIssue(null)
    try {
      const result = await window.collie.readSupportPreview()
      if (request !== previewRequest.current) return
      if (result.ok) setPreview(result.value)
      else setPreviewIssue(result.error.message)
    } catch {
      if (request === previewRequest.current) setPreviewIssue('The support preview could not be prepared. Try again when you are ready.')
    } finally {
      if (request === previewRequest.current) setPreviewPending(false)
    }
  }

  return <>
    <ContentSurface id="settings" labelledBy="settings-title" className={styles['settings-panel']}>
      <div className={styles['settings-heading']}>
        <Palette size={22} aria-hidden="true" />
        <h2 id="settings-title" tabIndex={-1}>Display and privacy</h2>
      </div>
      <p className={styles['settings-introduction']}>Make this space comfortable for you. Display choices stay on this computer and apply immediately.</p>
      <div className={styles['appearance-fields']}>
        <SelectField label="Appearance" description="System follows your computer’s light or dark appearance."
          value={preferences.appearance} data={[
            { value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }
          ]} onChange={event => {
            const appearance = event.currentTarget.value
            if (appearance === 'system' || appearance === 'light' || appearance === 'dark') updatePreferences({ appearance })
          }} />
        <div className={styles['zoom-field']}>
          <SelectField label="Interface zoom" description="System zoom shortcuts also remain available in View."
            value={String(preferences.zoom)} disabled={zoomPending} error={zoomIssue}
            data={ZOOM_LEVELS.map(level => ({ value: String(level), label: `${level}%` }))}
            onChange={event => {
              const zoom = Number(event.currentTarget.value)
              if (isZoomLevel(zoom)) updatePreferences({ zoom })
            }} />
          {zoomIssue ? <AppButton variant="default" pending={zoomPending} onClick={retryZoom}>Retry zoom</AppButton> : null}
        </div>
      </div>
      <div className={styles['accessibility-fields']}>
        <ChoiceField label="High contrast" description="Strengthen text and borders. Your system’s increased contrast is also respected."
          checked={preferences.contrast} onChange={event => updatePreferences({ contrast: event.currentTarget.checked })} />
        <ChoiceField label="Reduce motion" description="Remove nonessential animation. Your system’s reduced-motion preference is also respected."
          checked={preferences.reducedMotion} onChange={event => updatePreferences({ reducedMotion: event.currentTarget.checked })} />
      </div>
      <details className={styles['privacy-disclosure']}>
        <summary>Where your data lives</summary>
        <p>Working projects, unsaved recovery and retained file operations stay in the local working folder shown under Data Locations. Search indexes are rebuildable; source originals, excerpts, backups and recovery are not disposable caches. A project file exists separately only after Save; a backup is another chosen file.</p>
        <p>The display choices here stay in the app profile. Signed access documents and the free project choice live separately under the local working folder. When configured, optional purchase connections use OS-protected credentials in the app profile and contact the purchase service only for actions you request. Connection tokens never enter project files or support previews. Direct-build updates connect only when you choose Help → Check for updates; there are no automatic update checks, content analytics or crash uploads. Your own cloud provider may sync a selected project file; Collie Writer cannot confirm when that upload finishes.</p>
        <p>Clear picker history only forgets a folder hint. Reset local work retains a recovery batch, but deleting app data outside Collie Writer can remove the only local copy. Save or back up each project before any reset.</p>
        <AppButton variant="default" onClick={() => {
          const target = document.getElementById('data-locations') as HTMLDetailsElement | null
          if (target) { target.open = true; target.focus(); target.scrollIntoView({ block: 'start' }) }
        }}>Open Data Locations and recovery</AppButton>
      </details>
      <div className={styles['support-section']}>
        <div>
          <h3>Support preview</h3>
          <p>Review a content-free summary before choosing what to share. Nothing is sent automatically.</p>
        </div>
        <AppButton variant="default" leftSection={<ShieldCheck size={18} aria-hidden="true" />}
          onClick={() => setPreviewOpen(true)}>Review support preview</AppButton>
      </div>
    </ContentSurface>
    <AppDialog opened={previewOpen} onClose={closePreview} title="Support preview">
      <div className={styles['support-dialog']}>
        <p>Includes app and runtime versions, storage state, elapsed runtime and known error codes. It contains no writing, filenames, paths, URLs, source titles, hashes, account details or secrets. Nothing is sent automatically.</p>
        {preview ? <>
          <TextareaField label="Preview to review and copy" description="Select and copy only if you choose to share it."
            classNames={{ input: styles['support-preview-text'] }}
            readOnly rows={12} value={JSON.stringify(preview, null, 2)} onFocus={event => event.currentTarget.select()} />
          <p role="status">Preview ready. This is a snapshot from when you prepared it.</p>
          <AppButton variant="default" pending={previewPending} onClick={() => { void preparePreview() }}>
            {previewPending ? 'Refreshing preview…' : 'Refresh preview'}
          </AppButton>
        </> : <EmptyState title="Choose what you share" action={
          <AppButton data-autofocus pending={previewPending} onClick={() => { void preparePreview() }}>
            {previewPending ? 'Preparing preview…' : 'Prepare content-free preview'}
          </AppButton>
        }>Prepare a local summary, then read and copy it here.</EmptyState>}
        {previewIssue ? <StatusBanner tone="error" title="Preview unavailable">{previewIssue}</StatusBanner> : null}
        <div className={styles['support-dialog-actions']}><AppButton variant="default" onClick={closePreview}>Close preview</AppButton></div>
      </div>
    </AppDialog>
  </>
}
