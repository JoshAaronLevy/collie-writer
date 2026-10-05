import { useRef, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { AppInfo } from '../../../../shared/commands'
import type { StorageStatus } from '../../../../shared/storage'
import type { SupportPreview } from '../../../../shared/support'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { AppButton, TextareaField } from '../../components/ui/Controls'
import { AppDialog } from '../../components/ui/AppDialog'
import { ContentSurface, EmptyState, StatusBanner } from '../../components/ui/Feedback'
import NativeHelpActions from './NativeHelpActions'
import { AppLogo } from '../../components/AppLogo'
import styles from './SettingsPanel.module.css'

export default function AboutPanel({
  info,
  storage
}: {
  info: AppInfo | null
  storage: StorageStatus
}): React.JSX.Element {
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
          <summary>Runtime and local storage</summary>
          <p>
            {storage.state === 'ready'
              ? `SQLite ${storage.runtime.sqliteVersion} · Node ${storage.runtime.nodeVersion} · Node-API ${storage.runtime.napiVersion}`
              : storage.state === 'starting'
                ? 'Waiting for a local working folder or starting storage…'
                : 'Storage is unavailable. Keep this window open and copy unprotected writing.'}
          </p>
          <p>
            The support preview below includes the remaining app/runtime versions without project
            content.
          </p>
        </details>
        <details className={styles['privacy-disclosure']}>
          <summary>Where your data lives</summary>
          <p>
            Working projects, unsaved recovery and retained file operations stay in the local
            working folder shown under Data Locations. Search indexes are rebuildable; source
            originals, excerpts, backups and recovery are not disposable caches. A project file
            exists separately only after Save; a backup is another chosen file.
          </p>
          <p>
            Display choices, orientation dismissal, writing layout, the last-section hint, an
            optional remembered author, and unfinished new-project setup stay in the local app
            profile. The setup draft can contain a title and description; cancelling before creation
            or finishing clears it, while an uncertain creation request stays for safe retry. Signed
            access documents and the free project choice live separately under the local working
            folder. When configured, optional purchase connections use OS-protected credentials in
            the app profile and contact the purchase service only for actions you request.
            Connection tokens never enter project files or support previews. Direct-build updates
            connect only when you choose Check for updates in Settings or the native Help menu;
            there are no automatic update checks, content analytics or crash uploads. Your own cloud
            provider may sync a selected project file; Collie Writer cannot confirm when that upload
            finishes.
          </p>
          <p>
            Clear picker history only forgets a folder hint. Reset local work retains a recovery
            batch, but deleting app data outside Collie Writer can remove the only local copy. Save
            or back up each project before any reset.
          </p>
          <AppButton
            variant="default"
            onClick={() => {
              void navigate({ kind: 'settings', page: 'data' })
            }}
          >
            Open Data Locations and recovery
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
            leftSection={<ShieldCheck size={18} aria-hidden="true" />}
            onClick={() => setPreviewOpen(true)}
          >
            Review support preview
          </AppButton>
        </div>
      </ContentSurface>
      <AppDialog opened={previewOpen} onClose={closePreview} title="Support preview">
        <div className={styles['support-dialog']}>
          <p>
            Includes app and runtime versions, storage state, elapsed runtime and known error codes.
            It contains no writing, filenames, paths, URLs, source titles, hashes, account details
            or secrets. Nothing is sent automatically.
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
              <p role="status">Preview ready. This is a snapshot from when you prepared it.</p>
              <AppButton
                variant="default"
                pending={previewPending}
                onClick={() => {
                  void preparePreview()
                }}
              >
                {previewPending ? 'Refreshing preview…' : 'Refresh preview'}
              </AppButton>
            </>
          ) : (
            <EmptyState
              title="Choose what you share"
              action={
                <AppButton
                  data-autofocus
                  pending={previewPending}
                  onClick={() => {
                    void preparePreview()
                  }}
                >
                  {previewPending ? 'Preparing preview…' : 'Prepare content-free preview'}
                </AppButton>
              }
            >
              Prepare a local summary, then read and copy it here.
            </EmptyState>
          )}
          {previewIssue ? (
            <StatusBanner tone="error" title="Preview unavailable">
              {previewIssue}
            </StatusBanner>
          ) : null}
          <div className={styles['support-dialog-actions']}>
            <AppButton variant="default" onClick={closePreview}>
              Close preview
            </AppButton>
          </div>
        </div>
      </AppDialog>
    </>
  )
}
