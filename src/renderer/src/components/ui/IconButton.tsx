import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import { Tooltip } from '@mantine/core'
import { AppButton } from './Controls'
import { useVisualPreferences } from '../../theme/visualPreferencesContext'
import styles from './IconButton.module.css'

type Props = Omit<ComponentPropsWithoutRef<typeof AppButton>, 'aria-label'> & {
  label: string
  description?: string
  tooltipDisabled?: boolean
}

/** Keep unavailable commands focusable so their names/reasons remain discoverable. */
export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  {
    label,
    description,
    tooltipDisabled,
    disabled,
    pending = false,
    className,
    onClick,
    onKeyDown,
    children,
    ...props
  },
  ref
) {
  const { reducedMotion } = useVisualPreferences()
  const unavailable = disabled || pending
  return (
    <Tooltip
      label={description ?? label}
      openDelay={1500}
      closeDelay={100}
      events={{ hover: true, focus: true, touch: false }}
      disabled={tooltipDisabled}
      withinPortal
      multiline
      classNames={{ tooltip: styles['icon-description'] }}
      transitionProps={{ transition: 'fade', duration: reducedMotion ? 0 : 100 }}
    >
      <AppButton
        {...props}
        ref={ref}
        className={[styles['icon-button'], className].filter(Boolean).join(' ')}
        aria-label={label}
        aria-busy={pending || undefined}
        aria-disabled={unavailable || undefined}
        data-disabled={unavailable || undefined}
        onClick={(event) => {
          if (unavailable) {
            event.preventDefault()
            event.stopPropagation()
            return
          }
          onClick?.(event)
        }}
        onKeyDown={(event) => {
          if (unavailable && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            event.stopPropagation()
            return
          }
          onKeyDown?.(event)
        }}
      >
        {children}
      </AppButton>
    </Tooltip>
  )
})
