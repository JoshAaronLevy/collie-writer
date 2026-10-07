import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Menu } from '@mantine/core'
import { IconChevronDown } from '@tabler/icons-react'
import { IconButton } from './IconButton'
import { useVisualPreferences } from '../../theme/visualPreferencesContext'
import { AppButton } from './Controls'

export type MenuAction = {
  id: string
  label: string
  icon?: ReactNode
  onSelect: () => void
  disabled?: boolean
}

export function ActionMenu({
  label,
  accessibleLabel,
  actions,
  onOpen,
  icon,
  triggerClassName,
  disabled = false
}: {
  label: string
  accessibleLabel?: string
  actions: MenuAction[]
  onOpen?: () => void
  icon?: ReactNode
  triggerClassName?: string
  disabled?: boolean
}): React.JSX.Element {
  const [opened, setOpened] = useState(false)
  const [selectionMade, setSelectionMade] = useState(false)
  const selectedAction = useRef<(() => void) | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const { reducedMotion } = useVisualPreferences()
  const firstEnabled = actions.findIndex((action) => !action.disabled)
  useEffect(() => {
    if (!opened && selectedAction.current) {
      const action = selectedAction.current
      selectedAction.current = null
      // Release the menu focus trap first; navigation may then focus its destination.
      trigger.current?.focus({ preventScroll: true })
      action()
    }
  }, [opened])

  return (
    <Menu
      opened={opened}
      onChange={(next) => {
        if (next && disabled) return
        if (next) {
          setSelectionMade(false)
          onOpen?.()
        }
        setOpened(next)
      }}
      withinPortal
      position="bottom-end"
      loop
      returnFocus={!selectionMade}
      withInitialFocusPlaceholder={false}
      transitionProps={{ transition: 'fade', duration: reducedMotion ? 0 : 120 }}
    >
      <Menu.Target>
        {icon ? (
          <IconButton
            ref={trigger}
            variant="subtle"
            label={accessibleLabel ?? label}
            className={triggerClassName}
            disabled={disabled}
            tooltipDisabled={opened}
          >
            {icon}
          </IconButton>
        ) : (
          <AppButton
            ref={trigger}
            variant="default"
            disabled={disabled}
            className={triggerClassName}
            aria-label={accessibleLabel ?? label}
            rightSection={<IconChevronDown size={16} aria-hidden="true" />}
          >
            {label}
          </AppButton>
        )}
      </Menu.Target>
      <Menu.Dropdown>
        {actions.map((action, index) => (
          <Menu.Item
            key={action.id}
            leftSection={action.icon}
            data-autofocus={index === firstEnabled || undefined}
            disabled={action.disabled}
            onClick={() => {
              selectedAction.current = action.onSelect
              setSelectionMade(true)
            }}
          >
            {action.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )
}
