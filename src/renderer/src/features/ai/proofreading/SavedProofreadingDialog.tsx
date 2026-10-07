import { AppDialog } from '../../../components/ui/AppDialog'
import { AppButton } from '../../../components/ui/Controls'
import PresentationBoundary from '../../../components/PresentationBoundary'
import { ProofreadingPanel } from './ProofreadingPanel'
import { useProofreading } from './proofreadingState'
export function SavedProofreadingDialog(): React.JSX.Element {
  const p = useProofreading()
  return (
    <AppDialog
      opened={p.dialogOpen}
      onClose={p.closeDialog}
      title="Saved proofreading reviews"
      returnFocus={false}
      onExited={p.dialogExited}
    >
      <PresentationBoundary
        label="Saved proofreading reviews"
        render={() => <ProofreadingPanel />}
      />
      <AppButton variant="default" onClick={p.closeDialog}>
        Done
      </AppButton>
    </AppDialog>
  )
}
