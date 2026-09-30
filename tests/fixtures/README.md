# Fixture policy

Every fixture in this stage is synthetic and authored for this repository. No personal project, reference-workspace data, downloaded manuscript or account is used.

`roots.ts` creates an unpredictable temporary directory and ownership token; startup and cleanup use `src/main/test-root.ts`. Never use a normal application profile. Node fixture transport mocks fail closed; the Electron fixture also denies Node transports and Electron session network access.

`attack-preload.cjs` deliberately exposes generic IPC **only in the separate integration fixture process**. It is not a production preload and is excluded from application builds and the positive package allowlist. That fixture permits child frames to exercise sender validation independently of the production frame/navigation defenses. Desktop tests use the actual production preload and CSP.

Integration runs use Electron's native runtime. Stage 1 has no database or worker tests: Stage 2 will populate that harness. Playwright debug access is test-runner authority, not renderer authority. Assertions using main-process evaluation must not be confused with renderer capabilities.
