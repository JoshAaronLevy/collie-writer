# Developer tools loading correction — October 4, 2026

Status: **implementation complete — awaiting user testing**.

Josh reported that opening developer tools failed with `ERR_BLOCKED_BY_CLIENT` for Electron's `devtools://devtools/bundled/devtools_app.html` URL. Source inspection found that `protectSession` passed every request through the application allowlist, which rejects this scheme, and applied the application's CSP to every response.

`src/main/windows.ts` now recognizes only credential-free `devtools://devtools/bundled/` resources in unpackaged runs. These requests are allowed and retain their original response headers rather than receiving Collie's CSP. This covers the frontend URL including Electron's query parameters and its bundled scripts/styles. The exception is independent of the Vite origin so unpackaged preview can use it too.

The ordinary application request allowlist, application CSP, navigation/permission/download guards and development-only menu remain unchanged. Packaged runs receive no exception. A `remoteBase` query parameter does not authorize requests to its HTTPS destination or to `/remote/`; remote DevTools features remain subject to the existing network restrictions.

Electron documents request cancellation and optional response-header replacement in its [WebRequest API](https://www.electronjs.org/docs/latest/api/web-request). The correction handles both interception points using the same resource predicate.

No tests, checks, builds, launches or browser actions were performed. Native DevTools opening, console rendering and reopening remain unobserved. No persistent format or release gate changed; release remains NO-GO. Follow the [manual guide](../manual-testing/developer-tools.md).
