import { useState } from 'react'
import { AppButton, ChoiceField } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useAiConnections } from '../ai-connections/connectionState'
import styles from '../help/WritingGuide.module.css'

export default function TutorialPanel({
  ready,
  active,
  disabled,
  start,
  reset
}: {
  ready: boolean
  active: boolean
  disabled: boolean
  start: () => void
  reset: () => void
}): React.JSX.Element {
  const connections = useAiConnections()
  const [acknowledged, setAcknowledged] = useState(false)
  const { navigate, workspace, research, project } = useWorkspaceSession()
  function go(view: 'write' | 'details' | 'export'): void {
    const next = workspace(view)
    if (next) void navigate(next)
  }
  return (
    <section className={styles['writing-guide']} aria-labelledby="tutorial-title">
      <h1 id="tutorial-title">A first writing path</h1>
      <p>
        Start with your own nonfiction idea, or explore a separate sample about evaluating a
        research claim. Its study and data are synthetic teaching material, not real findings. The
        sample starts on this device. Saving a file, exporting, and sending a reviewed AI request
        are separate actions you choose.
      </p>
      <div className={styles['guide-actions']}>
        <AppButton disabled={disabled} onClick={start}>
          {ready ? 'Open tutorial sample' : 'Create optional tutorial sample'}
        </AppButton>
        <AppButton variant="default" onClick={() => void navigate({ kind: 'library' })}>
          Open Projects
        </AppButton>
      </div>
      <p>
        {active
          ? 'The tutorial sample is open.'
          : project
            ? 'Guide actions below apply to your currently open project. Open the sample above to practice separately.'
            : 'Create or open a project to follow the guide.'}{' '}
        The current trusted sample has a separate editing allowance alongside your free personal
        project.
      </p>
      <ol className={styles['guide-steps']}>
        <li>
          <strong>Choose a project and make it yours.</strong>
          <p>
            Projects → New project starts with a nonfiction type, title and author. Description is
            optional. These are the two setup steps; creating the project opens writing. If another
            project uses your free writing slot, the details step explains the switch before you
            confirm.
          </p>
          <AppButton
            variant="subtle"
            disabled={disabled}
            onClick={() => void navigate({ kind: 'setup' })}
          >
            Create a personal project
          </AppButton>
        </li>
        <li>
          <strong>Manage ChatGPT once for all projects.</strong>
          <p>
            ChatGPT in the header shows your account status and opens the connection dialog. You can
            dismiss its startup prompt or turn automatic prompting off there. In Write, AI opens
            conversations and proofreading; each tool shows its own availability. Connecting sends
            no writing. Review each request before sending it.
          </p>
          <AppButton
            variant="subtle"
            disabled={disabled}
            aria-haspopup="dialog"
            onClick={(event) => connections.openDialog(event.currentTarget)}
          >
            Manage ChatGPT
          </AppButton>
        </li>
        <li>
          <strong>Write, then Save deliberately.</strong>
          <p>
            Choose a section in Write and edit a sentence. Local protection keeps changes on this
            device. Save opens a native picker the first time; cancelling keeps local recovery and
            assigns no file. The .collie file contains the whole saved project, including research,
            citations, managed originals and saved AI conversations. Closing protects local writing
            without updating that file. Save options contains Save As and a separate backup.
          </p>
          <AppButton variant="subtle" disabled={!project || disabled} onClick={() => go('write')}>
            Open Write
          </AppButton>
        </li>
        <li>
          <strong>Inspect the evidence.</strong>
          <p>
            Research → Sources holds originals, citation details and Usage and context. In a fresh
            sample, inspect the synthetic study’s retained text, extract it and select an exact
            excerpt. The before/after numbers do not establish causation.
          </p>
          <AppButton
            variant="subtle"
            disabled={!project || disabled}
            onClick={() => research({ kind: 'sources' })}
          >
            Open Sources
          </AppButton>
        </li>
        <li>
          <strong>Link evidence and revise.</strong>
          <p>
            Research → Questions and claims lets you link excerpts as support or challenge. These
            assessments are distinct from citations inserted in Write. Notes and annotations keep
            your own observations separate from exact quotations.
          </p>
          <AppButton
            variant="subtle"
            disabled={!project || disabled}
            onClick={() => research({ kind: 'evidence' })}
          >
            Open Questions and claims
          </AppButton>
        </li>
        <li>
          <strong>Review, then export a reading copy.</strong>
          <p>
            Export asks for sections and format, then preflight review, then a native destination.
            Bibliography and citation style tools are below the export flow. Review source metadata
            or explicitly acknowledge omissions for that captured revision. Each result reports
            output and format losses.
          </p>
          <AppButton variant="subtle" disabled={!project || disabled} onClick={() => go('export')}>
            Open Export
          </AppButton>
        </li>
        <li>
          <strong>Return with confidence.</strong>
          <p>
            Projects lists local work; opening an eligible recent project restores its section.
            Project actions holds details, import, history-related file controls, copies and
            archive. Archive hides projects without freeing space. Settings → Data and recovery
            shows working and selected-file locations and holds retained versions. Reset retains
            local recovery rather than reclaiming space. Export never replaces a project backup.
          </p>
          <div className={styles['guide-actions']}>
            <AppButton
              variant="subtle"
              disabled={!project || disabled}
              onClick={() => go('details')}
            >
              Project actions
            </AppButton>
            <AppButton
              variant="subtle"
              onClick={() => void navigate({ kind: 'settings', page: 'access' })}
            >
              Collie access
            </AppButton>
            <AppButton
              variant="subtle"
              onClick={() => void navigate({ kind: 'settings', page: 'data' })}
            >
              Data and recovery
            </AppButton>
          </div>
        </li>
      </ol>
      {ready ? (
        <details className={styles['guide-disclosure']}>
          <summary>Create a fresh tutorial sample</summary>
          <p>
            Older tutorial copies remain in Projects with your edits and selected files intact. Only
            the fresh sample receives the sample editing allowance; older copies remain readable and
            exportable.
          </p>
          <ChoiceField
            label="Keep the previous sample as a separate project and create a fresh sample"
            checked={acknowledged}
            disabled={disabled}
            onChange={(event) => setAcknowledged(event.currentTarget.checked)}
          />
          <AppButton
            variant="default"
            disabled={disabled || !acknowledged}
            onClick={() => {
              setAcknowledged(false)
              reset()
            }}
          >
            Create a fresh sample
          </AppButton>
        </details>
      ) : null}
    </section>
  )
}
