import { createContext, useContext } from 'react'
import type { InventoryReport } from '../../../../shared/storage-inventory'
import type { StorageCondition } from '../../../../shared/storage-advice'
export type NoticePreference = {
  key: string
  active: boolean
  dismissed: boolean
  until: number
  seen: number
}
export type StorageReview = { id: string; scanId: string; condition: StorageCondition }
export type StorageNotices = {
  report: InventoryReport | null
  visible: StorageCondition[]
  preferences: NoticePreference[]
  now: number
  issue: string
  review: StorageReview | null
  publish: (report: InventoryReport) => void
  dismiss: (key: string, snooze: boolean) => void
  restore: () => void
  select: (condition: StorageCondition) => void
}
export const StorageNoticeContext = createContext<StorageNotices | null>(null)
export function useStorageNotices(): StorageNotices {
  const value = useContext(StorageNoticeContext)
  if (!value) throw new Error('Storage notices owner is missing')
  return value
}
