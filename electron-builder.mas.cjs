// This entry point deliberately cannot produce a release. D8 records the native
// entitlement, bookmark-resolution and coordinated-file adapters still needed.
// No environment switch may bypass these missing product implementations.
throw new Error(
  'MAS packaging is blocked: implement verified StoreKit entitlements and sandbox-safe coordinated file access first. See docs/decisions/D8-store-channels.md.'
)
