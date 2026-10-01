import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppInfo } from '../shared/commands'

export type ReleaseChannel = AppInfo['channel']
export type Release = { channel: ReleaseChannel; appId: string; updateOrigin: string | null; publisherName: string | null }
const development: Release = { channel: 'development', appId: 'com.colliewriter.app.dev', updateOrigin: null, publisherName: null }

// The builder embeds this public metadata in the signed package. No runtime
// environment variable, renderer message, project or remote feed chooses identity.
export const RELEASE: Release = (() => {
  if (!app.isPackaged) return development
  const metadata: unknown = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8'))
  if (!metadata || typeof metadata !== 'object' || !('collieRelease' in metadata)) return development
  const value = metadata.collieRelease
  if (!value || typeof value !== 'object' || !('channel' in value) || !('appId' in value) || !('updateOrigin' in value) || !('publisherName' in value)) throw new Error('INVALID_RELEASE_METADATA')
  const channel = value.channel
  if (channel !== 'production' && channel !== 'beta') throw new Error('INVALID_RELEASE_CHANNEL')
  const appId = channel === 'production' ? 'com.colliewriter.app' : 'com.colliewriter.app.beta'
  if (value.appId !== appId || typeof value.updateOrigin !== 'string') throw new Error('INVALID_RELEASE_IDENTITY')
  if (value.publisherName !== null && (typeof value.publisherName !== 'string' || value.publisherName.length < 3 || value.publisherName.length > 200 || value.publisherName.trim() !== value.publisherName || /[\u0000-\u001f\u007f]/u.test(value.publisherName))) throw new Error('INVALID_RELEASE_PUBLISHER')
  const url = new URL(value.updateOrigin)
  if (url.protocol !== 'https:' || url.origin !== value.updateOrigin || url.username || url.password || url.search || url.hash || !url.hostname.includes('.') || url.hostname === 'localhost') throw new Error('INVALID_UPDATE_ORIGIN')
  return { channel, appId, updateOrigin: value.updateOrigin, publisherName: value.publisherName }
})()
