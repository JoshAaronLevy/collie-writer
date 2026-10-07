import FilePanel from './FilePanel'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { scopeOf } from '../workspace/useWorkspaceController'
import { sameScope } from '../../../../shared/project-files'

export default function ProjectFileActions(): React.JSX.Element {
  const session = useWorkspaceSession()
  const { project, files, dirty, available, acting, closing, run, save, current, setError } =
    session
  return (
    <FilePanel
      status={files}
      dirty={dirty}
      saveState={session.saveState}
      disabled={!project || !sameScope(project, files.scope) || !available || acting || closing}
      save={(as) => run(() => save(as))}
      reveal={() =>
        run(async () => {
          if (!current.current) return
          const result = await window.collie.revealProjectFile(scopeOf(current.current))
          if (!result.ok) setError(result.error.message)
        })
      }
      locate={() => run(() => session.openFile(false, true))}
      inspect={() => run(() => session.openFile(true))}
      answer={(id, choice) => {
        void window.collie
          .answerFileJob({ id, choice })
          .then((result) => {
            if (!result.ok) setError(result.error.message)
          })
          .catch(() =>
            setError(
              'The file choice could not be confirmed. Review the retained file operation before continuing.'
            )
          )
      }}
      cancel={(id) => {
        void window.collie
          .cancelFileJob(id)
          .then((result) => {
            if (!result.ok) setError(result.error.message)
          })
          .catch(() =>
            setError(
              'File cancellation could not be confirmed. The operation remains pending until its outcome is known.'
            )
          )
      }}
      consent={(id) => {
        void window.collie
          .confirmFileOverwrite(id)
          .then((result) => {
            if (!result.ok) setError(result.error.message)
          })
          .catch(() =>
            setError(
              'Replacement consent could not be confirmed. Review the retained file operation before continuing.'
            )
          )
      }}
    />
  )
}
