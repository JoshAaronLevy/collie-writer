import { vi } from 'vitest'
const denied = (): never => {
  throw new Error('Network is forbidden in fixtures')
}
vi.stubGlobal('fetch', denied)
vi.mock('node:http', () => ({ request: denied, get: denied }))
vi.mock('node:https', () => ({ request: denied, get: denied }))
vi.mock('node:net', () => ({ connect: denied, createConnection: denied }))
vi.mock('node:tls', () => ({ connect: denied }))
vi.mock('node:dgram', () => ({ createSocket: denied }))
