import type { CollieAPI } from '../shared/commands'
declare global {
  interface Window {
    collie: CollieAPI
  }
}
