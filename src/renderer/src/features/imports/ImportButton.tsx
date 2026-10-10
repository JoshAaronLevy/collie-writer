import { IconFileImport } from '@tabler/icons-react'
import { IconButton } from '../../components/ui/IconButton'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useProjectImport } from './importContext'
export function ImportButton(): React.JSX.Element {
  const imports = useProjectImport(),
    session = useWorkspaceSession()
  return (
    <IconButton
      label="Import chats, research or notes"
      aria-haspopup="dialog"
      variant="subtle"
      disabled={
        !session.project ||
        !session.available ||
        session.closing ||
        session.navigating ||
        session.fileActive ||
        imports.busy
      }
      onClick={(event) => imports.open(event.currentTarget)}
    >
      <IconFileImport aria-hidden="true" />
    </IconButton>
  )
}
