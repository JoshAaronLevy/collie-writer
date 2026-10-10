import type { ReactNode } from 'react'
import { Modal, type ModalProps } from '@mantine/core'
import { useVisualPreferences } from '../../theme/visualPreferencesContext'

export function AppDialog({
  opened,
  onClose,
  title,
  children,
  dismissible = true,
  returnFocus = true,
  onExited,
  size = 'lg',
  classNames
}: {
  opened: boolean
  onClose: () => void
  title: string
  children: ReactNode
  dismissible?: boolean
  returnFocus?: boolean
  onExited?: () => void
  size?: ModalProps['size']
  classNames?: ModalProps['classNames']
}): React.JSX.Element {
  const { reducedMotion } = useVisualPreferences()
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size={size}
      classNames={classNames}
      closeButtonProps={{ 'aria-label': `Close ${title.toLowerCase()}` }}
      closeOnEscape={dismissible}
      closeOnClickOutside={dismissible}
      withCloseButton={dismissible}
      trapFocus
      returnFocus={returnFocus}
      onExitTransitionEnd={onExited}
      withinPortal
      lockScroll={false}
      transitionProps={{ transition: 'fade', duration: reducedMotion ? 0 : 120 }}
    >
      {children}
    </Modal>
  )
}
