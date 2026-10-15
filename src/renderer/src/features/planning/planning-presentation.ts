import type { PlanningItem } from '../../../../shared/planning'
export const materialLabel = { note: 'Note', source: 'Source', excerpt: 'Excerpt', chat: 'Chat' }
export const itemKey = (item: PlanningItem): string => `${item.material.kind}:${item.material.id}`
