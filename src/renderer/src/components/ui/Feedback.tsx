import type { ReactNode } from 'react'
import { Alert, Paper } from '@mantine/core'
import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import styles from './feedback.module.css'

export function ContentSurface({
  id,
  labelledBy,
  className,
  children
}: {
  id?: string
  labelledBy: string
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <Paper
      component="section"
      id={id}
      aria-labelledby={labelledBy}
      withBorder
      className={[styles['content-section'], className].filter(Boolean).join(' ')}
    >
      {children}
    </Paper>
  )
}

export function StatusBanner({
  title,
  children,
  tone = 'info'
}: {
  title: string
  children: ReactNode
  tone?: 'info' | 'warning' | 'error'
}): React.JSX.Element {
  const Icon = tone === 'error' ? CircleAlert : tone === 'warning' ? TriangleAlert : Info
  return (
    <Alert
      title={title}
      icon={<Icon size={20} aria-hidden="true" />}
      data-tone={tone}
      role={tone === 'error' ? 'alert' : 'status'}
      classNames={{
        root: styles['status-banner'],
        title: styles['status-title'],
        message: styles['status-message'],
        icon: styles['status-icon']
      }}
    >
      {children}
    </Alert>
  )
}

export function EmptyState({
  title,
  children,
  action
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}): React.JSX.Element {
  return (
    <Paper className={styles['empty-state']}>
      <h3 className={styles['empty-state-title']}>{title}</h3>
      <p className={styles['empty-state-description']}>{children}</p>
      {action ? <div className={styles['empty-state-action']}>{action}</div> : null}
    </Paper>
  )
}
