// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import App from '../../src/renderer/src/App'
import ErrorBoundary from '../../src/renderer/src/components/ErrorBoundary'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const container = document.createElement('div')
document.body.append(container)
const root = createRoot(container)
afterEach(async () => {
  await act(() => root.render(null))
  vi.restoreAllMocks()
})
it('renders truthful shell status and selectable content with a narrow bridge', async () => {
  window.collie = {
    getInfo: async () => ({
      ok: true,
      requestId: 'fixture',
      value: { name: 'Collie Writer', version: '1.0.0', channel: 'development', platform: 'darwin' }
    })
  }
  await act(async () => root.render(<App />))
  expect(container.querySelector('h1')?.textContent).toBe('Room for your next idea.')
  expect(container.querySelector('[role=status]')?.textContent).toContain('1.0.0')
  expect(container.querySelector('main')?.id).toBe('workspace')
})
it('shows an actionable bridge failure without raw exception details', async () => {
  window.collie = {
    getInfo: async () => {
      throw new Error('/private/secret')
    }
  }
  await act(async () => root.render(<App />))
  expect(container.textContent).toContain('Reopen this window')
  expect(container.textContent).not.toContain('/private')
})
it('catches rendering failures with a reload action', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  function Broken(): never {
    throw new Error('SYNTHETIC_RENDER_FAILURE')
  }
  await act(async () =>
    root.render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>
    )
  )
  expect(container.querySelector('button')?.textContent).toBe('Reload window')
  expect(container.textContent).not.toContain('SYNTHETIC_RENDER_FAILURE')
})
