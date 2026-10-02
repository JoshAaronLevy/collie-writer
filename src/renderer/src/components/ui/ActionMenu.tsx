import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Menu } from '@mantine/core'
import { ChevronDown } from 'lucide-react'
import { useVisualPreferences } from '../../theme/VisualPreferencesProvider'
import { AppButton } from './Controls'

type MenuAction = { id: string; label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean }

export function ActionMenu({ label, accessibleLabel, actions, onOpen }: { label: string; accessibleLabel?: string; actions: MenuAction[]; onOpen?: () => void }): React.JSX.Element {
  const [opened, setOpened] = useState(false)
  const selectedAction = useRef<(() => void) | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const { reducedMotion } = useVisualPreferences()
  const firstEnabled = actions.findIndex(action => !action.disabled)
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
    <Menu opened={opened} onChange={next => { if (next) onOpen?.(); setOpened(next) }} withinPortal position="bottom-end" loop
      returnFocus={selectedAction.current === null} withInitialFocusPlaceholder={false}
      transitionProps={{ transition: 'fade', duration: reducedMotion ? 0 : 120 }}>
      <Menu.Target>
        <AppButton ref={trigger} variant="default" aria-label={accessibleLabel ?? label} rightSection={<ChevronDown size={16} aria-hidden="true" />}>
          {label}
        </AppButton>
      </Menu.Target>
      <Menu.Dropdown>
        {actions.map((action, index) => <Menu.Item key={action.id} leftSection={action.icon}
          data-autofocus={index === firstEnabled || undefined}
          disabled={action.disabled} onClick={() => { selectedAction.current = action.onSelect }}>
          {action.label}
        </Menu.Item>)}
      </Menu.Dropdown>
    </Menu>
  )
}
