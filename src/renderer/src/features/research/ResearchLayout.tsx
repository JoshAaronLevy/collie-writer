import type { ReactNode } from 'react'
import { AppButton } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import './ResearchLayout.css'

export function ResearchHeader({ title, children, id }: { title: string; children?: ReactNode; id?: string }): React.JSX.Element {
  const session = useWorkspaceSession()
  return <header className="research-heading"><div><p className="research-project-name">{session.project?.title}</p><h1 id={id}>{title}</h1>{children ? <p>{children}</p> : null}</div><div className="research-actions">
    {session.backDestination ? <AppButton variant="default" onClick={() => { void session.goBack() }}>Back to {session.backLabel}</AppButton> : null}
    <AppButton variant="subtle" onClick={() => { const target = session.workspace('write'); if (target) void session.navigate(target) }}>Return to writing</AppButton>
  </div></header>
}
export function ResearchLayout({ sidebar, children }: { sidebar: ReactNode; children: ReactNode }): React.JSX.Element {
  return <div className="research-layout"><aside className="research-list-pane">{sidebar}</aside><div className="research-detail-pane">{children}</div></div>
}
