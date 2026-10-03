# CD02 implementation record

October 2, 2026. **Implementation complete — awaiting user testing.** User acceptance: not supplied. Release: **NO-GO**.

The complete Codex plan and CD01 records were reviewed. Its account-only milestone is implemented through the existing I10/I11 owners, with no parallel inference path or later-stage advancement. The [decision](../decisions/codex-CD02.md) records the published-source findings and design limitations; the [format record](../formats/codex-local-v2.md) specifies local compatibility.

The repeated CD02 request prompted another full-plan/source review. The existing implementation was retained, with two lifecycle corrections: system-browser launch acknowledgment now has a 20-second, cancellation-aware/runtime-exit-aware bound, and cancellation captures its original work instead of looking up a potentially newer action after awaiting the runtime reply. A stale completion notice cannot overwrite a later attempt's status. These are source changes, not observed results; no additional stage, format or provider operation was introduced.

| Owner | Delivered source changes |
| --- | --- |
| `main/ai/codex-account-runtime.ts` | Exact installed runtime resolution, contained isolated profiles, credential-free configuration gate followed by actual configuration read, strict namespaced keyring/ChatGPT-only settings, allowlisted environment, bounded private account RPC, browser URL validation/open, login correlation, cancellation, account read, logout and child shutdown. |
| `main/ai/local-codex-session.ts` | One account owner, explicit connect/resume/replacement/disconnect, candidate retirement, local metadata protection retry, visible cleanup, startup metadata-only read, idle-child close/suspend and sanitized issues. |
| `main/ai/storage.ts`, `local-session-metadata.ts` | Exact encrypted local v2 lifecycle record and preserved v1 read compatibility; original/candidate retention. |
| `main/ai/service.ts`, shared/main IPC/preload | Trusted route delegation and named account methods, exact status validation, feature refusals, existing main lifecycle integration and old operational journal preservation. |
| Existing renderer account owners and `App.tsx` | Global Connect Codex before project selection; Continue with ChatGPT, Resume, single-account change, disconnect, cleanup/protection actions, actual account label, local-development/funding copy and globally visible progress. |

No test code, harness, test-only UI, scripts or fixtures were added or maintained. No tests, typechecks, lint, formatting/audit/build/package checks, application/dev-server/runtime/browser launches, account access, login or inference were performed. Source/Git inspection is not a passed test. No dependency installation, secret collection, registration, provider outreach, release change or publication occurred.

Still unobserved: the native optional binary on Josh's actual architecture; OS keyring availability/isolation; effective runtime layers; account access and browser completion; denied/cancelled/timed-out/offline flows; late callback ordering; secure metadata recovery; process shutdown; returning resume; account replacement/logout; keyboard/focus/IME/retained editor behavior; Windows. The callback-port handover is not atomic against another process, external administrator policy can change between reads, and account email is not execution identity. Runtime-owned diagnostics/cache files are retained under the isolated profile and excluded from Collie support output; full execution/log isolation is CD03 work.

Conversations and proofreading still cannot dispatch on this route. Signed in means the matching managed account was established, not model readiness, commercial approval, included-only funding or a working AI feature. Provider classification remains unresolved; null registrations, commercial refusals, packaged refusal, SQL12/AST1/archive1/compilation3 and 64-operation capacity remain. CD03–CD09 are not started.

Use the [manual guide](../manual-testing/codex-CD02.md). Record only non-secret user observations; never request tokens, auth URLs, raw runtime logs or private writing.
