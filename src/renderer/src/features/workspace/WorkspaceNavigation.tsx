import { AppButton } from '../../components/ui/Controls'
import { useWorkspaceSession } from './WorkspaceSession'
import styles from './WorkspaceNavigation.module.css'

export function WorkspaceNavigation(): React.JSX.Element {
  const { destination, project, workspace, navigate, research, inspectionTarget } = useWorkspaceSession()
  return <>
    {project && destination.kind === 'workspace' ? <nav aria-label="Project sections" className={styles['workspace-navigation']}>
      {(['write', 'research', 'search', 'export', 'history', 'details'] as const).map(view => <AppButton key={view}
        variant={destination.view === view ? 'filled' : 'subtle'} aria-current={destination.view === view ? 'page' : undefined}
        onClick={() => {
          if (view === 'research') research({ kind: 'sources' })
          else { const next = workspace(view); if (next) void navigate(next) }
        }}>{view === 'details' ? 'Project actions' : view[0].toUpperCase() + view.slice(1)}</AppButton>)}
    </nav> : null}
    {destination.kind === 'workspace' && destination.view === 'research' ? <nav aria-label="Research sections" className={styles['research-navigation']}>
      <AppButton variant={destination.target.kind === 'sources' ? 'default' : 'subtle'} onClick={() => research({kind:'sources'})}>Sources</AppButton>
      <AppButton variant={destination.target.kind === 'notes' ? 'default' : 'subtle'} onClick={() => research({kind:'notes'})}>Notes and annotations</AppButton>
      <AppButton variant={destination.target.kind === 'evidence' ? 'default' : 'subtle'} onClick={() => research({kind:'evidence'})}>Questions and claims</AppButton>
      {inspectionTarget ? <AppButton variant={destination.target.kind === 'inspector' ? 'default' : 'subtle'} onClick={() => research({kind:'inspector',sourceId:inspectionTarget.sourceId})}>Source inspector</AppButton> : null}
    </nav> : null}
    {destination.kind === 'settings' ? <nav aria-label="Settings sections" className={styles['settings-navigation']}>
      {(['appearance', 'data', 'access'] as const).map(page => <AppButton key={page} variant={destination.page === page ? 'default' : 'subtle'}
        onClick={() => { void navigate({kind:'settings',page}) }}>{page === 'appearance' ? 'Display and privacy' : page === 'data' ? 'Data and recovery' : 'Collie access'}</AppButton>)}
    </nav> : null}
  </>
}
