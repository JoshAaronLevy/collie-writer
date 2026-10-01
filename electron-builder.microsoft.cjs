// Microsoft Store EXE listing preparation uses the direct-production artifact.
// This is a guarded alias, not a separate app identity, commerce channel or build.
if (process.platform !== 'win32') {
  throw new Error('Prepare the Microsoft Store EXE candidate natively on Windows')
}
if (process.env.COLLIE_RELEASE_CHANNEL !== 'production') {
  throw new Error('The Microsoft Store EXE listing requires the production release channel')
}

// Inherits exactly the direct NSIS/x64 target, signing, metadata, name and feed.
// Publish the same signed EXE bytes through both routes; do not rebuild for Store.
module.exports = require('./electron-builder.direct.cjs')
