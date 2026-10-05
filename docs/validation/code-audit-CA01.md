# CA01 — Export publication and required-check cleanup

Date: October 5, 2026. **Implementation complete — awaiting user testing.** No runtime acceptance or release approval is claimed. Release remains **NO-GO**.

Josh requested review of the complete [audit plan](../../code-audit.md) and implementation of CA01. The full plan was reviewed. No subsequent audit stage is declared implemented or accepted by this record.

## Export correction

`src/worker/exports/jobs.ts` still creates a private, exclusive temporary file, writes and synchronizes its contents, and uses a hard link to publish without replacing an existing destination. It now removes its owned temporary link before synchronizing the directory and calling `fileHash`. This allows its own publication to satisfy the existing single-link requirement. `fileHash` and its protections against untrusted paths/files were not weakened.

Temporary cleanup only runs after this operation successfully created the temporary file. A destination collision at the final link operation becomes `DESTINATION_EXISTS`, including a collision occurring after the preliminary check. No existing destination is deleted or overwritten by this path.

Each batch file tracks whether its destination was linked, whether a Markdown sidecar directory was created, and how many image files were linked and verified. A later failure or cancellation retains these artifacts and records them in the existing per-file losses and aggregate report. The UI already displays those fields. A partially created sidecar is reported even when no image reached publication. A cancellation arriving after every file completed no longer changes that successful batch into a cancelled batch.

This does not make the batch transactional. Earlier completed files and partial files can remain after a later failure. Report-write recovery, interrupted-job reconstruction and exact start retries remain CA07–CA08 work. No compiler, portable project, archive, database, or export-report version changed.

## Why this change includes more than export code

The October 5 standing instruction requires fixing all issues surfaced by the repository's format, lint and typecheck scripts, including pre-existing findings. The first required lint run reported **478 errors and 60 warnings**; typecheck also failed. This explicit requirement took precedence over the plan's usual preference for keeping each stage to one owner.

The resulting working tree includes repository-wide formatting and these functional or structural corrections:

- **Tool scope:** `.prettierignore` and `eslint.config.mjs` protect bundled upstream files, generated output and historical test infrastructure. Authored product code remains in scope. TypeScript-specific lint configuration applies to TypeScript; authored JavaScript and CommonJS retain the base JavaScript rules. No diagnostic suppressions or relaxed application-code rules were added; an obsolete suppression in `storage/digest.ts` was removed.
- **Boundary types and concrete errors:** clipboard text is awaited before its length is checked. Object guards retain additional validated fields when narrowing; numeric/array boundaries are explicit; asynchronous PDF cleanup captures a validated ID. Template maps, archive stream chunks, portable evidence discrimination and owned snapshot cleanup use accurate types.
- **Validation and identities:** `shared/control-characters.ts` expresses the existing control-character rules using code points, including the original multiline and DEL/C1 distinctions. `shared/objects.ts` copies fields while omitting identity-excluded metadata. Existing canonical digest inputs and frozen contracts are preserved. Unused Grok launch plumbing was removed without activating that route.
- **Rendered operation state:** `hooks/useSynchronousState.ts` pairs visible state with immediate refs used by async guards. Notes, source operations, evidence, citation styles, import/export recipe forms and outline submission now render reactive state while retaining exact pending requests. Project details separately render their baseline and pending request. These changes do not resolve every lifecycle concern identified in later audit stages.
- **Hooks and editor lifetime:** live callback refs update on commit. Manuscript editor creation belongs to the mounted DOM host and retains its initial document/owner instead of recreating the editor when callbacks change. Subscriptions and protection timers read current handlers; dependency lists include their reactive inputs. Navigation presentation runs after the retained regions commit, with pending animation-frame work cancelled on superseding navigation or cleanup. The 900 ms and five-second local protection intervals remain; destination autosave was not introduced.
- **State transitions and module ownership:** changes of project, selected review, export options, source/page, document and appearance update/reset their associated state explicitly. Contexts and controller hooks are separated from component exports for Fast Refresh. No provider was reparented or automatically activated. Export polling keeps the captured job IDs/scopes independent of progress snapshots. Purchase-session expiration is driven by a clock update instead of reading the clock during render. Writing preferences persist from the update action.

The use of effect events is limited to subscription/timer callbacks and committed navigation actions; relevant project, request, readiness and visibility dependencies remain explicit. See React's [effect-event reference](https://react.dev/reference/react/useEffectEvent). Formatting-only changes and behavioral corrections are both present in the uncommitted working tree; no commit was created.

## Command evidence

Commands ran with the repository's local Node **24.21.0** and npm **11.19.0** toolchain. The final sequence completed successfully:

1. `npm run format` — exit 0.
2. `npm run lint` — exit 0, zero errors and zero warnings.
3. `npm run typecheck` — exit 0; both `typecheck:node` and `typecheck:web` passed.

Intermediate failures were corrected and affected commands rerun. The scripts were inspected; no tests, dependency audits, builds, packages, app launches, browser automation, provider logins or inference were run. No test code or test infrastructure was added or maintained. Source inspection and these checks do not prove native execution, output fidelity, resource cleanup, retry behavior or migration safety.

## Acceptance and remaining limits

Follow the [CA01 manual guide](../manual-testing/code-audit-CA01.md) using disposable projects and outputs. Its broader continuity steps are necessary because required-check cleanup touched multiple state owners. Josh has not supplied results for this implementation. Inaccessible provider/commerce routes and failure cases not safely reproducible through ordinary use remain unobserved. All other audit findings retain their own work and acceptance requirements; do not auto-advance to CA02.
