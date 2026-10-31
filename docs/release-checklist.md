# Release verification

This checklist reports actual software and provider observations. Synthetic approvals and supplier exercises are not real practitioner reviews or supplier transactions.

Production was verified on October 31, 2026 at [stagecraft-swart.vercel.app](https://stagecraft-swart.vercel.app). The deployed application commit is `0a4e656d1c25c6b3ebaaa23154429f374cff1dc1`; Vercel deployment `dpl_92UN3JArCP5shREhodUEhfWCoJCF` reached `READY` on Node 22.x. Subsequent documentation-only commits do not change that application record. [Production observations](evidence/production-review.json) distinguish the initial live-provider checks from the final deployment verification.

## Confirmed before the final production build

- [x] Independent project, private Blob store and PostgreSQL database; migrations 001–004 applied locally and in production.
- [x] Seven actual Clothes V4 recordings: 7 successes, 14 observed units. Two actual Makeup VTO recordings: 2 successes, 2 observed units. Public manifests contain hashes/provenance, not credentials or raw provider task IDs.
- [x] One local live garment workflow completed with a persisted task, durable run and private output: 2 observed units.
- [x] One local live makeup workflow survived browser reload and completed once with private output: 1 observed unit. No inherited approval.
- [x] Live Gemini extraction/adoption exercised a synthetic seven-scene script containing hostile dialogue instructions. Source spans validated, operational injection ignored, unknown chronology marked, and scene review still required.
- [x] Private body upload, cross-owner denial and withdrawal verified through browser/API/database.
- [x] Desktop and 390px automated WCAG checks across production, costume, makeup, script, schedule, wardrobe and handoff; landing/evidence checked separately. Scene-list scrolling, dialog Escape/focus restoration and concurrent revision recovery passed.
- [x] Manual browser review inspected recorded/live images, precise garment replacement, independent beauty preservation, recast invalidation, matching rejection, sourcing and superseded frozen packs.

[Observed manual browser review](evidence/browser-review.json) and [live script evidence](evidence/live-script-review.json) preserve scoped outcomes. [Domain evaluation](evaluation.md) and [AI garment review](evaluation-ai.md) describe separate denominators.

## Final release gate

The final results are recorded below after running lint, typecheck, formatting, the complete serial test suite, production build and browser checks against that build. A deployed private upload plus live garment/makeup smoke and final staged/client secret scan belong to the deployment gate. Do not treat an unchecked step as completed.

- [x] Final lint, typecheck and formatting. Scoped lint and full formatting passed again after the print-only correction; the rebuild includes TypeScript validation.
- [x] Complete serial unit/domain/backend suite after the fixture-transport correction: 11 files, 111 tests passed in 11.46 seconds.
- [x] Local production build, including 25 durable steps, 2 workflows and all application/API routes; rebuilt successfully after the print-only correction.
- [x] Complete production-server browser suite: 9 tests passed in 1.1 minutes, including expanded independent beauty lineage and request recovery.
- [x] Both affected garment-repair/handoff and recast journeys passed again after the print-only correction: 2 tests, 31.6 seconds.
- [x] Frozen crew PDF rendered and visually inspected: 16 A4 pages, 7 scheduled calls, 16 look occurrences, all 19 images loaded, 3 separate makeup evidence sections and 29 explicit unresolved warnings. White margins and per-look call/revision/working status were checked. The inspection fixture's approvals are labelled automated synthetic layout checks, not practitioner decisions.
- [x] Production deployment, owner isolation and private upload/render smoke checks. Separate private body and face uploads produced genuine live garment and makeup outputs; the makeup workflow survived refresh. Each completed exactly one live attempt with persisted provider task, Workflow run and private output. Both images remained accessible to their owner after the final deployment.
- [x] Source and rebuilt public client bundles scanned against 24 configured secret values, with zero matches: 196 initial changed files, 26 patch files and 31 built client files. No private planning, environment, capture or execution-artifact paths were published.
- [x] Final staged-file review and secret scan completed before both application commits.

## Fixture-transport correction

The first deployed example attached its beauty recording but rejected the five garment recordings despite matching public source and output files. The underlying runtime cause was not established. The correction ships the exact recorded JPEG transports for the thirteen synthetic source/profile pairs; it preserves the original recording manifests and every exact-match requirement. Private uploads retain their existing normalization and ownership checks.

- [x] All 13 frozen files and 16 original recording input references independently verified against their existing SHA-256 values; no provider calls or recording changes.
- [x] Focused transport/recording suite: 4 files, 15 tests passed in 13.69 seconds. With runtime normalization disabled, a fresh example still reaches R07 with five garment recordings, one makeup recording and zero approvals.
- [x] Full serial 111-test suite, lint, formatting and production rebuild passed. Project-create, preview and Workflow function traces each include all 13 JPEGs and their manifest.
- [x] Rebuilt client scan repeated: 31 files against 24 configured secret values, zero matches.
- [x] Fresh deployed R07 example verified in the in-app browser: all five garment images loaded, one makeup recording attached and zero approvals seeded. Recorded charcoal replacement loaded at 1024×1536. A separate Celeste recast loaded its own 1024×1536 garment recording and independent 800×1000 makeup recording. No fresh provider calls were needed for these replays.

Production Gemini extraction also returned three scenes, two characters and four exact source-linked costume cues from a synthetic script containing instruction-like dialogue. Scene 02 remained explicitly uncertain in chronology, all cues were unreviewed and the draft was left unadopted. The two deliberate production renders consumed three observed provider units; the recorded replays consumed none.

## Limits that remain explicit

No human participant/practitioner study, physical fitting, real supplier transaction, time-saving measure or environmental outcome was conducted. Visual output may change garment details, identity cues or texture despite fixed smoothing settings. Makeup renders lip/blush only. The allocation engine searches a bounded problem and checks assignments independently; missing physical evidence remains unresolved. Printed documents cannot be recalled. Browser ownership has no email recovery or multi-user sharing. Automated WCAG checks and 390px Chromium inspection do not establish comprehensive assistive-technology or cross-browser certification; 200% browser zoom has not been claimed.
