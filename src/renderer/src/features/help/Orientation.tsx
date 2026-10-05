import { useRef, useState } from 'react'
import { useWorkspaceSession } from '../workspace/WorkspaceSession'
import { AppButton } from '../../components/ui/Controls'
import styles from './WritingGuide.module.css'

const key = 'collie.orientation.v1'
function dismissed(): boolean {
  try {
    return localStorage.getItem(key) === '{"version":1,"dismissed":true}'
  } catch {
    return false
  }
}
export default function Orientation(): React.JSX.Element | null {
  const { project, destination, navigate, writingView } = useWorkspaceSession()
  const [hidden, setHidden] = useState(dismissed),
    [issue, setIssue] = useState('')
  const fallback = useRef<HTMLButtonElement>(null)
  if (
    hidden ||
    !project ||
    destination.kind !== 'workspace' ||
    destination.view !== 'write' ||
    writingView.preferences.focus
  )
    return null
  function dismiss(): void {
    try {
      localStorage.setItem(key, '{"version":1,"dismissed":true}')
      setHidden(true)
      requestAnimationFrame(() => document.getElementById('workspace')?.focus())
    } catch {
      setIssue('This choice could not be remembered. You can hide these tips for this session.')
      fallback.current?.focus()
    }
  }
  return (
    <aside className={styles['writing-orientation']} aria-labelledby="orientation-title">
      <h2 id="orientation-title">Your writing space, in three steps</h2>
      <ol className={styles['orientation-points']}>
        <li>
          <strong>Write.</strong> Choose a section in the outline. Draft changes are protected
          locally.
        </li>
        <li>
          <strong>Research.</strong> Add sources, inspect originals and connect evidence to your
          argument.
        </li>
        <li>
          <strong>Keep and share.</strong> Save chooses a project file. Export creates a separate
          reading copy.
        </li>
      </ol>
      <div className={styles['guide-actions']}>
        <AppButton
          variant="default"
          onClick={() => void navigate({ kind: 'help', page: 'tutorial' })}
        >
          Explore the optional tutorial
        </AppButton>
        <AppButton variant="subtle" onClick={dismiss}>
          Dismiss tips on this device
        </AppButton>
      </div>
      {issue ? (
        <>
          <p role="status">{issue}</p>
          <AppButton
            ref={fallback}
            variant="subtle"
            onClick={() => {
              setHidden(true)
              requestAnimationFrame(() => document.getElementById('workspace')?.focus())
            }}
          >
            Hide for this session
          </AppButton>
        </>
      ) : null}
    </aside>
  )
}
