import { useRef, useState } from 'react'
import { IconShieldCheck } from '@tabler/icons-react'
import type { AppInfo } from '../../../../shared/commands'
import type { SupportPreview } from '../../../../shared/support'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { AppButton, TextareaField } from '../../components/ui/Controls'
import { AppDialog } from '../../components/ui/AppDialog'
import { ContentSurface, StatusBanner } from '../../components/ui/Feedback'
import NativeHelpActions from './NativeHelpActions'
import { AppLogo } from '../../components/AppLogo'
import styles from './SettingsPanel.module.css'

export default function AboutPanel({ info }: { info: AppInfo | null }): React.JSX.Element {
  const { navigate } = useWorkspaceSession()
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
    setPreview(null)
    setPreviewIssue(null)
    try {
      const result = await window.collie.readSupportPreview()
      if (request !== previewRequest.current) return
      if (result.ok) setPreview(result.value)
      else setPreviewIssue(result.error.message)
    } catch {
      if (request === previewRequest.current)
        setPreviewIssue('The support preview could not be prepared. Try again when you are ready.')
    } finally {
      if (request === previewRequest.current) setPreviewPending(false)
    }
  }

  return (
    <>
      <ContentSurface labelledBy="about-title" className={styles['settings-panel']}>
        <div className={styles['about-branding']}>
          <AppLogo size="about" />
          <div className={styles['about-introduction']}>
            <h1 id="about-title">About Collie Writer</h1>
            <p>A local home for nonfiction writing and research. Ad-free, always.</p>
          </div>
        </div>
        <p>
          {info
            ? `Version ${info.version} · ${info.channel} · ${info.platform}`
            : 'Application information is unavailable.'}
        </p>
        <NativeHelpActions kind="licenses" />
        <AppButton
          variant="default"
          onClick={() => void navigate({ kind: 'help', page: 'tutorial' })}
        >
          Writing guide and optional tutorial
        </AppButton>
        <details className={styles['privacy-disclosure']}>
          <summary>Where your data lives</summary>
          <p>
            Working projects and unsaved recovery stay in the local working folder under Settings →
            Storage. Save chooses or updates a project file containing writing, research, originals
            and saved AI conversations; Backup makes another copy. Your cloud provider may sync a
            selected file, but Collie cannot confirm its upload.
          </p>
          <p>
            Display choices, remembered author and unfinished project setup (including its title and
            description) stay in the local app profile. Connection credentials stay out of project
            files and support previews. Optional purchase-service connections and update checks run
            only when requested. There are no automatic update checks, content analytics or crash
            uploads.
          </p>
          <p>
            Storage offers safe cache cleanup. Originals, history and unsaved recovery are not
            disposable cache; Archive only changes library visibility. Save or back up projects
            before removing app data, which may hold the only copy of unsaved work.
          </p>
          <AppButton
            variant="default"
            onClick={() => void navigate({ kind: 'settings', page: 'data' })}
          >
            Open Storage
          </AppButton>
        </details>
        <div className={styles['support-section']}>
          <div>
            <h3>Support preview</h3>
            <p>
              Review a content-free summary before choosing what to share. Nothing is sent
              automatically.
            </p>
          </div>
          <AppButton
            variant="default"
            leftSection={<IconShieldCheck size={18} aria-hidden="true" />}
            onClick={() => {
              setPreviewOpen(true)
              void preparePreview()
            }}
          >
            Review support preview
          </AppButton>
        </div>
      </ContentSurface>
      <AppDialog
        opened={previewOpen}
        onClose={closePreview}
        title="Support preview"
        classNames={{
          content: styles['support-dialog-content'],
          body: styles['support-dialog-container']
        }}
      >
        <div className={styles['support-dialog']}>
          <div className={styles['support-dialog-body']}>
            <p>
              Includes app and runtime versions, storage state, elapsed runtime and known error
              codes. It contains no writing, filenames, paths, URLs, source titles, hashes, account
              details or secrets. Nothing is sent automatically.
            </p>
            {preview ? (
              <>
                <TextareaField
                  label="Preview to review and copy"
                  description="Select and copy only if you choose to share it."
                  classNames={{ input: styles['support-preview-text'] }}
                  readOnly
                  rows={12}
                  value={JSON.stringify(preview, null, 2)}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <p role="status">
                  Preview ready. This is a snapshot from when you opened or refreshed it.
                </p>
              </>
            ) : previewPending ? (
              <p role="status">Preparing preview…</p>
            ) : null}
            {previewIssue ? (
              <StatusBanner tone="error" title="Preview unavailable">
                {previewIssue}
              </StatusBanner>
            ) : null}
          </div>
          <div className={styles['support-dialog-actions']}>
            {preview || previewIssue ? (
              <AppButton
                variant="default"
                pending={previewPending}
                onClick={() => void preparePreview()}
              >
                {previewIssue ? 'Try again' : 'Refresh preview'}
              </AppButton>
            ) : null}
            <AppButton data-autofocus variant="default" onClick={closePreview}>
              Close preview
            </AppButton>
          </div>
        </div>
      </AppDialog>
    </>
  )
}
