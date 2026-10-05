# Store listing and review preparation

October 1, 2026. **Internal drafts only; neither channel is submitted or approved.** The [D8 decision](../decisions/D8-store-channels.md) records current effective policy dates and the separate implementation/external gates. Source preparation is not evidence that a store artifact runs, a purchase works or an output meets the required fidelity. Do not copy these drafts into a live listing until the applicable release gates and user authorization are recorded.

| Item               | Microsoft Store EXE listing                                                          | Mac App Store                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Current status     | Prepared for a future owner submission; direct commerce/signing/native gates pending | Blocked on native entitlement, bookmark and coordinated-write implementation, then external/native gates |
| Territory/language | United States; English UI/listing                                                    | United States; English UI/listing                                                                        |
| Candidate          | Exact accepted direct-production Windows 11 x64 NSIS EXE                             | None; MAS packaging/startup deliberately blocked                                                         |
| Purchases          | Direct Paddle flow, once configured and accepted; disclose third-party purchases     | Apple IAP only, after native implementation and acceptance                                               |
| Updates            | Explicit app-owned direct-production update flow                                     | Apple Store updates only, after implementation                                                           |
| Restore            | Direct purchase recovery flow; no Microsoft account-based unlock                     | Apple native restore; no direct purchase-key import or cross-store promise                               |
| Submission/review  | Not submitted                                                                        | Not submitted; not ready to submit                                                                       |

## Proposed public description

Use only for a candidate whose stated capabilities have user-supplied acceptance. Correct or remove any claim that remains unobserved for that release.

> Collie Writer is a desktop writing workspace for nonfiction authors and independent researchers. Organize a manuscript, keep notes and local source material with the project, connect evidence to sections, and add citations as you write.
>
> Write and organize offline. Choose where to save each project, and create separate backups for safekeeping. Export your selected sections as DOCX, PDF, Markdown or text. Supported citation profiles include APA 7 and Chicago notes and bibliography.
>
> Untimed free access lets you edit one designated personal project at a time, alongside the separate tutorial. You can read, export, back up and recover your other projects. Paid nonfiction access adds unlimited editable projects, reusable compilation recipes and multi-format batch export.
>
> Collie Writer has no ads. Opening and working with local projects does not require an application or AI account. AI generation, collaborative editing and built-in cloud synchronization are not included.

This is factual capability copy, not permission to claim universal Word compatibility, identical DOCX/PDF pagination, arbitrary journal styles, OCR, DOCX import, cloud upload confirmation, encryption of portable archives or completed accessibility certification. Genuine PDF page-footnote fidelity remains a release gate. Do not sell future AI, an unimplemented store adapter or merely planned output support.

## Prices and purchase disclosures

The approved intended US base offers are **$9.99/month** and **$199 lifetime nonfiction access**, plus applicable taxes shown by the actual channel. Lifetime includes all future updates to the purchased edition; it is not restricted to one major version. There is no timed trial, automatic trial conversion, export watermark or damaged output. Reading, export, backup and recovery remain available when paid access ends. Do not publish prices as purchasable until the actual catalog, checkout totals and terms are configured and accepted.

For Microsoft, identify the verified legal seller and **Paddle** as the transaction provider in the approved purchase flow. Select the third-party-payment disclosure in Partner Center. The Store listing distributes the desktop installer; it does not supply a Microsoft purchase receipt, Microsoft subscription or Microsoft Restore Purchases action. Subscription management/refunds and purchase-recovery support follow the configured direct-provider process. Installing the same product through the listing does not create a second paid entitlement.

For MAS, map the same rights to owner-confirmed Apple product IDs and native localized product prices. Subscription duration, renewal/cancellation terms, privacy policy and applicable terms must be clearly available before purchase. A Lifetime offer is a non-consumable; do not convert it to a subscription or version-limited unlock. No MAS price, product or restore control is currently enabled. US external-link allowances are not selected as a substitute for the missing native implementation.

## Required owner-supplied resources

These are intentionally unset; the product name is not a verified legal seller name and a selected namespace is not domain ownership.

| Resource                 | Required value/evidence                                                                                                           | State                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Legal seller/publisher   | Actual verified entity/person and channel account identity                                                                        | Not supplied                       |
| Product identity         | Ownership/availability of `com.colliewriter.app`; exact Windows publisher subject and Apple team/profile when applicable          | Not supplied                       |
| Privacy policy           | Owned HTTPS page describing actual channel collection, providers and retention                                                    | Not supplied                       |
| Support                  | Owned HTTPS support page/contact and named incident-response owner                                                                | Not supplied                       |
| Terms and purchase terms | Approved US terms, edition rights, renewal/refund/restore explanations                                                            | Not supplied                       |
| Catalog                  | Confirmed US/USD products, displayed prices/taxes, no trial, correct lifetime rights                                              | Not supplied                       |
| Branding/screenshots     | Final icon rights and user-produced screenshots of the actual accepted channel candidate using disposable/public content          | Not supplied                       |
| Age/content rating       | Owner-completed questionnaire based on shipped functionality; do not invent a rating                                              | Not supplied                       |
| Accessibility claims     | Specific supported platforms/features backed by user observations, with known limitations                                         | Not supplied                       |
| Notices/resources        | Packaged dependency inventory, citeproc CPAL attribution/source, font/style/locale notices and resource allowlist evidence        | Native artifact inspection pending |
| Review access            | Approved instructions and, only when required, owner-provided sandbox access shared through the channel's secure review mechanism | Not supplied                       |

Never commit account credentials, certificates, purchase recovery codes, review-account passwords or private project content in this document. No screenshots, examples or fixtures were generated for store review.

## Privacy statements to finalize per channel

Local manuscript/research content, managed attachments, history and backups stay in user-controlled files and device-local working storage. The vendor does not offer project hosting. When a user chooses a customer cloud folder, that customer's storage provider handles those files. A selected-file save is separate from cloud upload completion; portable archives are not password-encrypted by Collie.

The implemented support preview contains bounded runtime/storage status and known error codes, with no automatic upload. A user can review it before choosing to share it. The direct purchase/update routes can process necessary non-content metadata and transport information; do not label the whole product or its providers as collecting no data. The owner must reconcile the real service/provider setup with each store's privacy questionnaire. No advertising SDK or store-native purchase SDK is added by this stage.

MAS, once implemented, must retain bookmarks and native entitlement evidence locally and disclose any genuinely required purchase traffic. This draft does not assert Apple privacy-label answers or a working MAS network/data inventory. Both channels need a final owner review of controlled help, tutorial, purchase and support surfaces against the permanent no-ads/no-ad-tracking requirement.

## Microsoft owner submission packet

1. Complete the direct-release gates and retain the accepted Windows production artifact, exact version/name/size/hash, publisher/signature evidence and native observations. Use the existing [direct installer runbook](direct-installers-and-updates.md). The Microsoft wrapper selects that production NSIS configuration; it is not a separate build identity or a reason to rebuild the artifact for Store submission.
2. Host those same bytes at an owned immutable, versioned HTTPS URL. Keep the URL and artifact available; do not replace its contents with a later version. Record the exact URL and artifact identity here only when supplied. **Current URL/artifact: none.**
3. Specify x64 and the actual supported Windows version. Provide the NSIS silent-install parameter `/S`; obtain user observations that the full installer needs no downloads or installation UI beyond allowed UAC. Confirm every shipped PE, including native modules/helpers, has the required trusted signature. None of these outcomes has been supplied.
4. In review notes, explain: this is the same production desktop product as the direct download, with its own visible update mechanism and third-party purchase flow. No Microsoft IAP or Microsoft receipt-based restore is claimed. It runs locally without Node/npm/compiler installation, subject to native acceptance. Selected projects remain external to the installer; uninstall is configured to retain local app data, but OS/user deletion can still remove it.
5. Supply truthful description, pricing/purchase disclosures, privacy/support links, owner-made screenshots, notices, rating answers and review instructions. Revisit effective Microsoft policy at submission time, especially the October 22, 2026 transition to v7.20.
6. Prepare the Partner Center draft for an explicit submission decision. Record any reviewer issue precisely; do not infer approval from a build or silent-install observation. No upload or submission is authorized by this packet.

## MAS future review packet

Do not attempt signing, sandbox purchase work or review submission as a workaround for missing product code. Complete the native contracts in D8 before removing the deliberate build/startup gate.

After implementation, the owner supplies the Apple team/account, registered identifier, appropriate development/distribution signing and provisioning, product IDs and US availability. A runnable signed MAS development build and an Apple-distributed production build have different signing paths; a direct Developer ID build does not establish MAS acceptance.

Review notes must explain the no-destination initial state, native file selection, local recovery, document portability and independent Apple purchases. Include user-supplied outcomes for first Save/cancel, empty-placeholder handling, Open/reopen, moved/stale permissions, repeated coordinated replacement, cloud folder selection, exports/sidecars and native restore/refund/renewal/offline transitions. Direct updater, direct checkout and license import must be absent. Keep unfinished behavior visible as a blocker rather than asking review to accept it as completed.

Before a channel switch, removal or container reset, the user saves a portable project and independent backup and confirms the copy opens. MAS bookmarks and purchase evidence do not travel in `.collie` files. Deleting a sandbox container can remove local-only/unsaved recovery; no automatic recovery transfer is promised.

## Support and review-state record

Use the [support and incident runbook](support-and-incidents.md) for content-free incident handling, and the [direct commerce operator instructions](../../services/entitlements/README.md) for configured purchase issues. Initial support asks for app version/channel/OS, the visible error and the user's reviewed support preview or a description using invented labels. Do not request full manuscripts, raw purchase receipts, credentials or a workspace directory. Direct purchase support belongs to the configured seller/provider process; MAS purchase support will require its separately implemented Apple flow.

| Channel       | Submission ID/date | Review decision | Artifact/evidence | Next blocking step                                                   |
| ------------- | ------------------ | --------------- | ----------------- | -------------------------------------------------------------------- |
| Microsoft EXE | None               | Not submitted   | None              | Direct signed/commerce/native readiness and owner listing resources  |
| MAS           | None               | Not submitted   | None              | Implement native entitlement, bookmark and coordinated-file adapters |

The owner must supply real outcomes before these states change. Store delay does not block an independently accepted direct release; neither this draft nor Stage 23 authorizes publication. No tests, builds, launches, purchases, uploads or submissions were performed to prepare this document.
