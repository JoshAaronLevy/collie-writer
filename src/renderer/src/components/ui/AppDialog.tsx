import type { ReactNode } from 'react'
import { Modal } from '@mantine/core'
import { useVisualPreferences } from '../../theme/VisualPreferencesProvider'

export function AppDialog({ opened, onClose, title, children, dismissible = true }: {
  opened: boolean
  onClose: () => void
  title: string
  children: ReactNode
  dismissible?: boolean
}): React.JSX.Element {
  const { reducedMotion } = useVisualPreferences()
  return <Modal opened={opened} onClose={onClose} title={title} size="lg"
    closeButtonProps={{ 'aria-label': `Close ${title.toLowerCase()}` }}
    closeOnEscape={dismissible} closeOnClickOutside={dismissible} withCloseButton={dismissible}
    trapFocus returnFocus withinPortal lockScroll={false}
    transitionProps={{ transition: 'fade', duration: reducedMotion ? 0 : 120 }}>
    {children}
  </Modal>
}
