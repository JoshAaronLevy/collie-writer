import { Checkbox } from '@mantine/core'
import { IconDots } from '@tabler/icons-react'
import { AppButton } from '../../components/ui/Controls'
import { ActionMenu, type MenuAction } from '../../components/ui/ActionMenu'
import { MATERIAL_PAGE_SIZE } from '../../../../shared/chapter-material'
import { itemKey, materialLabel } from './planning-presentation'
import type { PlanningItem } from '../../../../shared/planning'
import styles from './PlanWorkspace.module.css'

export function MaterialCard({
  item,
  selected,
  disabled,
  toggle,
  open,
  actions,
  drag,
  association
}: {
  item: PlanningItem
  selected: boolean
  disabled: boolean
  toggle: () => void
  open: () => void
  actions: MenuAction[]
  drag: (event: React.DragEvent) => void
  association?: string
}): React.JSX.Element {
  const material = item.material
  return (
    <li
      className={styles['material-card']}
      data-material-key={itemKey(item)}
      data-selected={selected}
      draggable={!disabled && material.state === 'active'}
      onDragStart={drag}
    >
      <div className={styles['card-heading']}>
        <Checkbox
          checked={selected}
          disabled={disabled}
          onChange={toggle}
          aria-label={`Select ${material.title || materialLabel[material.kind]}`}
        />
        <AppButton variant="subtle" className={styles['card-title']} onClick={open}>
          {material.title || 'Untitled material'}
        </AppButton>
        <ActionMenu
          label="Material actions"
          accessibleLabel={`Actions for ${material.title || 'material'}`}
          icon={<IconDots aria-hidden="true" />}
          disabled={disabled}
          actions={actions}
        />
      </div>
      <p className={styles['card-state']}>
        {materialLabel[material.kind]}
        {material.state !== 'active' ? ` · ${material.state}` : ''}
        {item.disposition === 'develop'
          ? ' · Needs development'
          : item.disposition === 'aside'
            ? ' · Set aside'
            : ''}
      </p>
      {association ? <p className={styles['card-state']}>{association}</p> : null}
      {material.preview ? <p className={styles['card-preview']}>{material.preview}</p> : null}
      {item.reason ? <p className={styles['card-preview']}>{item.reason}</p> : null}
    </li>
  )
}
export function PlanningPager({
  offset,
  total,
  change,
  label
}: {
  offset: number
  total: number
  change: (offset: number) => void
  label: string
}): React.JSX.Element | null {
  if (total <= MATERIAL_PAGE_SIZE && !offset) return null
  return (
    <nav className={styles['plan-actions']} aria-label={`${label} pages`}>
      <AppButton
        variant="subtle"
        disabled={offset === 0}
        onClick={() => change(Math.max(0, offset - MATERIAL_PAGE_SIZE))}
      >
        Previous
      </AppButton>
      <span>
        {total ? Math.min(offset + 1, total) : 0}–{Math.min(offset + MATERIAL_PAGE_SIZE, total)} of{' '}
        {total}
      </span>
      <AppButton
        variant="subtle"
        disabled={offset + MATERIAL_PAGE_SIZE >= total}
        onClick={() => change(offset + MATERIAL_PAGE_SIZE)}
      >
        Next
      </AppButton>
    </nav>
  )
}
