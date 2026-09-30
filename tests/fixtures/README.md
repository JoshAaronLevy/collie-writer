# Fixture policy

**Historical fixtures only.** Josh's September 29, 2026 instruction prohibits the assistant from creating, modifying, extending or running test code or test infrastructure. Do not use this directory as a template for new work. Follow [AGENTS.md](../../AGENTS.md); provide user-owned manual guides instead.

Every fixture in this stage is synthetic and authored for this repository. No personal project, reference-workspace data, downloaded manuscript or account is used.

`roots.ts` creates an unpredictable temporary directory and ownership token; startup and cleanup use `src/main/test-root.ts`. Never use a normal application profile. Node fixture transport mocks fail closed; the Electron fixture also denies Node transports and Electron session network access.

`attack-preload.cjs` deliberately exposes generic IPC **only in the separate integration fixture process**. It is not a production preload and is excluded from application builds and the positive package allowlist. That fixture permits child frames to exercise sender validation independently of the production frame/navigation defenses. Desktop tests use the actual production preload and CSP.

Integration runs use Electron's native runtime. Stage 1 has no database or worker tests: The former plan for Stage 2 to populate that harness is superseded by P7; do not add tests. Playwright debug access is test-runner authority, not renderer authority. Assertions using main-process evaluation must not be confused with renderer capabilities.
