// Direct-distribution configuration. Never use this file for development or store packages.
const channel = process.env.COLLIE_RELEASE_CHANNEL
const origin = process.env.COLLIE_UPDATE_ORIGIN
if (!['production', 'beta'].includes(channel))
  throw new Error('Choose production or beta release channel')
if (!origin) throw new Error('A verified HTTPS update origin is required')
const url = new URL(origin)
if (
  url.protocol !== 'https:' ||
  url.origin !== origin ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  !url.hostname.includes('.') ||
  url.hostname === 'localhost'
)
  throw new Error('Update origin must be an HTTPS origin without path, credentials or query')
const appId = channel === 'production' ? 'com.colliewriter.app' : 'com.colliewriter.app.beta'
const version = require('./package.json').version
if (
  channel === 'beta' ? !/^\d+\.\d+\.\d+-beta\.\d+$/.test(version) : !/^\d+\.\d+\.\d+$/.test(version)
)
  throw new Error('Package version does not match the selected release channel')
const name = channel === 'production' ? 'Collie Writer' : 'Collie Writer Beta'
const feed = `${origin}/direct/${channel}/`
const publisherName = process.env.COLLIE_WINDOWS_PUBLISHER || null
if (process.platform === 'darwin' && !process.env.COLLIE_MAC_IDENTITY)
  throw new Error('Developer ID Application identity is required for a Mac direct build')
if (process.platform === 'win32' && !publisherName)
  throw new Error(
    'Verified Windows certificate publisher name is required for a Windows direct build'
  )

module.exports = {
  extends: './electron-builder.yml',
  appId,
  productName: name,
  extraMetadata: {
    collieRelease: { channel, distribution: 'direct', appId, updateOrigin: origin, publisherName }
  },
  // Only production registers the default document association; beta can use Open.
  fileAssociations:
    channel === 'production'
      ? [{ ext: 'collie', name: 'Collie Writer project', role: 'Editor', rank: 'Owner' }]
      : [],
  publish: { provider: 'generic', url: feed },
  mac: {
    identity: process.env.COLLIE_MAC_IDENTITY || null,
    forceCodeSigning: true,
    hardenedRuntime: true,
    notarize: true,
    entitlements: 'build/entitlements.mac.plist',
    // Let osx-sign choose the narrow per-helper defaults.
    entitlementsInherit: null,
    binaries: ['Contents/Resources/native/better_sqlite3.node'],
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] }
    ],
    minimumSystemVersion: '15.0',
    artifactName: `collie-writer-${channel}-\${version}-\${arch}.\${ext}`,
    extraResources: [
      {
        from: 'node_modules/better-sqlite3/prebuilds/darwin-${arch}.node',
        to: 'native/better_sqlite3.node'
      }
    ]
  },
  win: {
    executableName: channel === 'production' ? 'collie-writer' : 'collie-writer-beta',
    forceCodeSigning: true,
    signAndEditExecutable: true,
    signExecutable: true,
    verifyUpdateCodeSignature: true,
    // EXEs are builder's default; Electron DLLs and the SQLite addon are also PE.
    signExts: ['.dll', '.node'],
    publisherName: publisherName || undefined,
    target: [{ target: 'nsis', arch: ['x64'] }],
    extraResources: [
      {
        from: 'node_modules/better-sqlite3/prebuilds/win32-${arch}.node',
        to: 'native/better_sqlite3.node'
      }
    ]
  },
  nsis: {
    artifactName: `collie-writer-${channel}-\${version}-\${arch}-setup.\${ext}`,
    shortcutName: name,
    uninstallDisplayName: name,
    perMachine: true,
    oneClick: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: false
  },
  dmg: { artifactName: `collie-writer-${channel}-\${version}-\${arch}.\${ext}` }
}
