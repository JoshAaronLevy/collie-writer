import { ImportProvider } from './features/imports/ImportProvider'
import { ProofreadingProvider } from './features/ai/proofreading/ProofreadingProvider'
import { ProofreadingNotice } from './features/ai/proofreading/ProofreadingPanel'
import {
  ConversationProvider,
  ConversationPresentation
} from './features/ai/conversations/ConversationProvider'
import { ConversationNotice } from './features/ai/conversations/ConversationPanel'
import { useEffect, useRef, useState } from 'react'
import { IconBook, IconFolderOpen, IconMenu2, IconSettings } from '@tabler/icons-react'
import { IconButton } from './components/ui/IconButton'
import type { AppInfo } from '../../shared/commands'
import type { StorageStatus } from '../../shared/storage'
import SaveMenu from './features/workspace/SaveMenu'
import AboutPanel from './features/settings/AboutPanel'
import Orientation from './features/help/Orientation'
import { AiConnectionsProvider } from './features/ai-connections/AiConnectionsProvider'
import { AiConnectionNotice } from './features/ai-connections/AiConnectionNotice'
import { AiWorkNotice } from './features/ai/AiWorkNotice'
import { AiProviderIndicator } from './features/ai-connections/AiProviderIndicator'
import WorkspaceViews from './features/workspace/WorkspaceViews'
import { WorkspaceSessionProvider } from './features/workspace/WorkspaceSession'
import { useWorkspaceSession } from './features/workspace/workspaceContext'
import { WorkspaceStatus } from './features/workspace/WorkspaceStatus'
import { RetainedRegion } from './features/workspace/RetainedRegion'
import { ActionMenu } from './components/ui/ActionMenu'
import { AppLogo } from './components/AppLogo'
import { AppButton } from './components/ui/Controls'
import { StatusBanner } from './components/ui/Feedback'
import { useVisualPreferences } from './theme/visualPreferencesContext'
import styles from './App.module.css'

export default function App(): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [failed, setFailed] = useState(false)
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({
    state: 'starting',
    sequence: 0
  })
  useEffect(() => {
    let active = true
    const applyStorageStatus = (next: StorageStatus): void => {
      if (active)
        setStorageStatus((previous) => (next.sequence >= previous.sequence ? next : previous))
    }
    const unsubscribe = window.collie.onStorageStatus(applyStorageStatus)
    window.collie
      .getStorageStatus()
      .then((result) => {
        applyStorageStatus(result.ok ? result.value : { state: 'unavailable', sequence: 0 })
      })
      .catch(() => applyStorageStatus({ state: 'unavailable', sequence: 0 }))
    window.collie
      .getInfo()
      .then((result) => {
        if (!active) return
        if (result.ok) setInfo(result.value)
        else setFailed(true)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])
  return (
    <WorkspaceSessionProvider storage={storageStatus}>
      <AiConnectionsProvider>
        <ImportProvider>
          <ConversationProvider>
            <ProofreadingProvider>
              <AppShell info={info} failed={failed} />
              <ConversationPresentation />
            </ProofreadingProvider>
          </ConversationProvider>
        </ImportProvider>
      </AiConnectionsProvider>
    </WorkspaceSessionProvider>
  )
}

function AppShell({ info, failed }: { info: AppInfo | null; failed: boolean }): React.JSX.Element {
  const { persistenceIssue, zoomIssue } = useVisualPreferences()
  const { navigate, returnToWork, project, navigating, destination, writingView } =
    useWorkspaceSession()
  const content = useRef<HTMLElement>(null)
  const channel = info
    ? info.channel === 'production'
      ? 'Direct'
      : info.channel === 'beta'
        ? 'Beta'
        : 'Development'
    : null

  return (
    <div
      className={styles['app-shell']}
      data-research={
        destination.kind === 'workspace' &&
        (destination.view === 'research' || destination.view === 'search')
      }
      data-writing={destination.kind === 'workspace' && destination.view === 'write'}
      data-focus={
        destination.kind === 'workspace' &&
        destination.view === 'write' &&
        writingView.preferences.focus
      }
    >
      <a
        className={styles['skip-link']}
        href="#workspace"
        onClick={(event) => {
          event.preventDefault()
          content.current?.focus()
        }}
      >
        Skip to workspace
      </a>
      <header className={styles['app-header']}>
        <div className={styles['app-identity']}>
          <AppLogo />
          <span className={styles['app-wordmark']}>Collie Writer</span>
          {channel && channel !== 'Direct' ? (
            <span className={styles['build-label']}>{channel}</span>
          ) : null}
        </div>
        <nav aria-label="App sections" className={styles['app-navigation']}>
          {project && destination.kind !== 'workspace' && destination.kind !== 'setup' ? (
            <SaveMenu />
          ) : null}
          <AppButton
            variant="subtle"
            disabled={navigating}
            onClick={() => {
              void navigate({ kind: 'library' })
            }}
          >
            Projects
          </AppButton>
          {project && !(destination.kind === 'workspace' && destination.view === 'write') ? (
            <AppButton variant="subtle" disabled={navigating} onClick={returnToWork}>
              Return to work
            </AppButton>
          ) : null}
          <AiProviderIndicator global />
          <IconButton
            label="Settings"
            variant="subtle"
            onClick={() => {
              void navigate({ kind: 'settings', page: 'appearance' })
            }}
          >
            <IconSettings aria-hidden="true" />
          </IconButton>
          <ActionMenu
            label="App menu"
            icon={<IconMenu2 aria-hidden="true" />}
            actions={[
              {
                id: 'tutorial',
                label: 'Explore the tutorial',
                icon: <IconBook size={18} aria-hidden="true" />,
                onSelect: () => {
                  void navigate({ kind: 'help', page: 'tutorial' })
                }
              },
              {
                id: 'data',
                label: 'Storage',
                icon: <IconFolderOpen size={18} aria-hidden="true" />,
                onSelect: () => {
                  void navigate({ kind: 'settings', page: 'data' })
                }
              },
              {
                id: 'settings',
                label: 'About and help',
                icon: <IconSettings size={18} aria-hidden="true" />,
                onSelect: () => {
                  void navigate({ kind: 'help', page: 'about' })
                }
              }
            ]}
          />
        </nav>
      </header>
      <main ref={content} id="workspace" tabIndex={-1} className={styles['workspace-content']}>
        {persistenceIssue ? (
          <div className={styles['app-notice']}>
            <StatusBanner tone="warning" title="Display preferences">
              {persistenceIssue}
            </StatusBanner>
          </div>
        ) : null}
        {zoomIssue && !(destination.kind === 'settings' && destination.page === 'appearance') ? (
          <div className={styles['app-notice']}>
            <StatusBanner tone="warning" title="Interface zoom needs attention">
              <p>Your zoom choice could not be applied. Local writing remains available.</p>
              <AppButton
                variant="default"
                onClick={() => void navigate({ kind: 'settings', page: 'appearance' })}
              >
                Review display settings
              </AppButton>
            </StatusBanner>
          </div>
        ) : null}
        <WorkspaceStatus />
        <AiConnectionNotice />
        <AiWorkNotice />
        <ConversationNotice />
        <ProofreadingNotice />
        <Orientation />
        <WorkspaceViews />
        <RetainedRegion name="help-about" label="About and help">
          <AboutPanel info={info} />
        </RetainedRegion>
      </main>
      {failed || !info ? (
        <footer className={styles['app-footer']}>
          <p role={failed ? 'alert' : 'status'}>
            {failed ? 'Application information could not be loaded.' : 'Starting Collie Writer…'}
          </p>
        </footer>
      ) : null}
    </div>
  )
}
