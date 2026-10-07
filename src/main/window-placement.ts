import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { exact, record } from '../shared/projects'

interface WindowState {
  version: 1
  bounds: Rectangle
  maximized: boolean
}

const MAX_STATE_BYTES = 4096
const MIN_WIDTH = 420
const MIN_HEIGHT = 400

function validBounds(value: unknown): value is Rectangle {
  if (!record(value) || !exact(value, ['x', 'y', 'width', 'height'])) return false
  return (
    [value.x, value.y].every(
      (number) =>
        typeof number === 'number' && Number.isInteger(number) && Math.abs(number) <= 1000000
    ) &&
    [value.width, value.height].every(
      (number) =>
        typeof number === 'number' && Number.isInteger(number) && number > 0 && number <= 100000
    )
  )
}

function readState(path: string): WindowState | undefined {
  try {
    const file = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const info = fstatSync(file)
      if (!info.isFile() || info.size > MAX_STATE_BYTES) return undefined
      const bytes = Buffer.alloc(MAX_STATE_BYTES + 1)
      const length = readSync(file, bytes, 0, bytes.length, 0)
      if (length > MAX_STATE_BYTES) return undefined
      const value: unknown = JSON.parse(bytes.toString('utf8', 0, length))
      if (
        record(value) &&
        exact(value, ['version', 'bounds', 'maximized']) &&
        value.version === 1 &&
        validBounds(value.bounds) &&
        typeof value.maximized === 'boolean'
      )
        return { version: 1, bounds: value.bounds, maximized: value.maximized }
    } finally {
      closeSync(file)
    }
  } catch {
    // Missing/unreadable presentation preferences never prevent opening the app.
  }
  return undefined
}

function overlaps(left: Rectangle, right: Rectangle): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  )
}

function fitBounds(bounds: Rectangle, area: Rectangle): Rectangle {
  const width = Math.min(area.width, Math.max(MIN_WIDTH, bounds.width))
  const height = Math.min(area.height, Math.max(MIN_HEIGHT, bounds.height))
  return {
    x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)),
    width,
    height
  }
}

/** Device-local shell presentation only; no project, draft or close authority. */
export class WindowPlacement {
  private readonly path = join(app.getPath('userData'), 'window-state-v1.json')
  private state: WindowState
  readonly options: Rectangle & { minWidth: number; minHeight: number }

  constructor() {
    const saved = readState(this.path)
    const display =
      saved && screen.getAllDisplays().some((item) => overlaps(saved.bounds, item.workArea))
        ? screen.getDisplayMatching(saved.bounds)
        : screen.getPrimaryDisplay()
    const area = display.workArea
    const bounds = saved ? fitBounds(saved.bounds, area) : { ...area }
    this.state = { version: 1, bounds, maximized: saved?.maximized ?? false }
    this.options = {
      ...bounds,
      minWidth: Math.min(MIN_WIDTH, area.width),
      minHeight: Math.min(MIN_HEIGHT, area.height)
    }
  }

  manage(window: BrowserWindow): void {
    let ready = false
    const capture = (): void => {
      if (!ready || window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return
      const bounds = window.getNormalBounds()
      if (validBounds(bounds)) this.state = { version: 1, bounds, maximized: window.isMaximized() }
    }
    window.once('ready-to-show', () => {
      if (this.state.maximized) window.maximize()
      window.show()
      ready = true
      capture()
    })
    window.on('move', capture)
    window.on('resize', capture)
    window.on('maximize', capture)
    window.on('unmaximize', capture)
    window.on('restore', capture)
    window.on('leave-full-screen', capture)
    // Capture before native destruction; a refused close does not write anything.
    window.on('close', capture)
    window.once('closed', () => {
      if (ready) this.save()
    })
  }

  private save(): void {
    const temporary = `${this.path}.${randomUUID()}.tmp`
    let created = false
    try {
      // This tiny synchronous replacement finishes before process exit. A failed
      // preference write must not participate in the project-protection handshake.
      const file = openSync(temporary, 'wx', 0o600)
      created = true
      try {
        writeFileSync(file, JSON.stringify(this.state))
      } finally {
        closeSync(file)
      }
      renameSync(temporary, this.path)
    } catch {
      console.warn('WINDOW_STATE_SAVE_FAILED')
    } finally {
      if (created) {
        try {
          unlinkSync(temporary)
        } catch {
          // A successful rename has already removed the temporary path.
        }
      }
    }
  }
}
