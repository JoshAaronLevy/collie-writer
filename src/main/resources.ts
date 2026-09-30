import { app } from 'electron'
import { join } from 'node:path'

export function bundledResources(): string {
  return app.isPackaged ? join(process.resourcesPath, 'collie') : join(app.getAppPath(), 'resources')
}
