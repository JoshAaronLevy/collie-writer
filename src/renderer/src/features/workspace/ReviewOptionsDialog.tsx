import { useLayoutEffect, useRef, useState } from 'react'
import { AppDialog } from '../../components/ui/AppDialog'
import { AppButton, ChoiceField } from '../../components/ui/Controls'
import { restoreSelection, type CapturedSelection } from '../../editor/selection'
import { useWorkspaceSession } from './workspaceContext'
import { sameScope } from '../../../../shared/project-files'
import styles from './ReviewOptionsDialog.module.css'
const groups = [
  {
    label: 'Writing',
    options: [
      'Spelling, grammar and punctuation',
      'Clarity and readability',
      'Tone and terminology consistency'
    ]
  },
  {
    label: 'Sources and claims',
    options: [
      'Faithfulness to research and cited sources',
      'Missing or unsuitable citations',
      'Relevant unused sources'
    ]
  },
  {
    label: 'Project consistency',
    options: ['Repeated or redundant statements', 'Conflicting claims across the manuscript']
  }
] as const
const initial = (): boolean[] => [true, false, false, false, false, false, false, false]
export type ReviewOptionsTarget = {
  scope: { projectId: string; workspaceId: string }
  documentId: string
  title: string
  kind: string
  selection: CapturedSelection | null
  opener: HTMLElement | null
}
export function ReviewOptionsDialog({
  opened,
  close,
  target
}: {
  opened: boolean
  close: () => void
  target: ReviewOptionsTarget | null
}): React.JSX.Element {
  const session = useWorkspaceSession(),
    project = session.project
  const [choices, setChoices] = useState(initial)
  const scopeKey = `${project?.projectId}:${project?.workspaceId}`
  const [lastScope, setLastScope] = useState(scopeKey)
  if (lastScope !== scopeKey) {
    setLastScope(scopeKey)
    setChoices(initial())
  }
  const current = useRef(session),
    openedRef = useRef(opened)
  const captured = useRef(target)
  useLayoutEffect(() => {
    current.current = session
    openedRef.current = opened
    captured.current = target
  })
  const item = target
  function exited(): void {
    const saved = captured.current
    requestAnimationFrame(() => {
      const s = current.current
      if (
        openedRef.current ||
        !saved ||
        captured.current !== saved ||
        !sameScope(s.project, saved.scope) ||
        s.project?.documentId !== saved.documentId ||
        s.closing ||
        s.navigating ||
        s.composition.current ||
        !document.hasFocus() ||
        document.querySelector('[role="dialog"], [role="alertdialog"]') ||
        s.destination.kind !== 'workspace' ||
        s.destination.view !== 'write'
      )
        return
      const editor = s.editorRef.current
      if (
        editor &&
        !editor.view.dom.closest('[hidden],[inert]') &&
        restoreSelection(saved.selection, editor)
      )
        editor.commands.focus(undefined, { scrollIntoView: false })
      else if (
        saved.opener?.isConnected &&
        !saved.opener.matches(':disabled') &&
        !saved.opener.closest('[hidden],[inert]')
      )
        saved.opener.focus({ preventScroll: true })
      else
        document
          .querySelector<HTMLElement>('[data-destination-region]:not([hidden]):not([inert])')
          ?.focus({ preventScroll: true })
    })
  }

  let index = 0
  return (
    <AppDialog
      opened={opened && lastScope === scopeKey}
      onClose={close}
      title={`AI review options${item ? ` — ${item.title}` : ''}`}
      returnFocus={false}
      onExited={exited}
    >
      <div className={styles['review-options']}>
        <p>
          <strong>
            {item?.kind === 'chapter' ? 'Chapter' : 'Section'}:{' '}
            {item?.title || 'Current writing item'}
          </strong>
        </p>
        <p>
          A future review will use this item’s own whole text, regardless of your selection. Child
          items are not included automatically.
        </p>
        {groups.map((group) => (
          <fieldset key={group.label} className={styles['review-options-group']}>
            <legend>{group.label}</legend>
            {group.options.map((label) => {
              const position = index++
              return (
                <ChoiceField
                  key={label}
                  label={label}
                  checked={choices[position]}
                  onChange={(e) => {
                    const checked = e.currentTarget.checked
                    setChoices((previous) =>
                      previous.map((choice, i) => (i === position ? checked : choice))
                    )
                  }}
                />
              )
            })}
          </fieldset>
        ))}
        <p>
          Source and project checks will require additional context in that future review. These
          choices do not inspect your sources or writing.
        </p>
        <p id="ai-review-unavailable">AI review will be available in a later update.</p>
        <div className={styles['review-options-actions']}>
          <AppButton disabled aria-describedby="ai-review-unavailable">
            Submit
          </AppButton>
          <AppButton variant="default" onClick={close}>
            Done
          </AppButton>
        </div>
      </div>
    </AppDialog>
  )
}
