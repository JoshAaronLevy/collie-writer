import { useRef } from 'react'
import styles from './WritingWorkspace.module.css'

export function PaneResizeHandle({ label, value, min, max, direction = 1, change }: {
  label: string; value: number; min: number; max: number; direction?: 1 | -1; change: (value: number) => void
}): React.JSX.Element {
  const drag = useRef<{ x: number; value: number } | null>(null)
  const apply = (next: number): void => change(Math.max(min, Math.min(max, Math.round(next))))
  return <div className={styles['workspace-pane-resizer']} role="separator" tabIndex={0} aria-label={label}
    aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={`${value} pixels`}
    onPointerDown={event => { if (event.button !== 0) return; drag.current = {x:event.clientX,value}; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
    onPointerMove={event => { if (drag.current) apply(drag.current.value + (event.clientX-drag.current.x)*direction) }}
    onPointerUp={event => { drag.current=null; if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId) }}
    onLostPointerCapture={() => {drag.current=null}}
    onKeyDown={event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
      event.preventDefault()
      apply(event.key === 'Home' ? min : event.key === 'End' ? max : value + (event.key === 'ArrowRight' ? 16 : -16)*direction)
    }} />
}
