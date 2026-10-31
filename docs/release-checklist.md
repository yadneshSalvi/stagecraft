# Release verification

This checklist reports actual software and provider observations. Synthetic approvals and supplier exercises are not real practitioner reviews or supplier transactions.

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
- [x] Complete serial unit/domain/backend suite: 10 files, 108 tests passed in 20.43 seconds.
- [x] Local production build, including 25 durable steps, 2 workflows and all application/API routes; rebuilt successfully after the print-only correction.
- [x] Complete production-server browser suite: 9 tests passed in 1.1 minutes, including expanded independent beauty lineage and request recovery.
- [x] Both affected garment-repair/handoff and recast journeys passed again after the print-only correction: 2 tests, 31.6 seconds.
- [x] Frozen crew PDF rendered and visually inspected: 16 A4 pages, 7 scheduled calls, 16 look occurrences, all 19 images loaded, 3 separate makeup evidence sections and 29 explicit unresolved warnings. White margins and per-look call/revision/working status were checked. The inspection fixture's approvals are labelled automated synthetic layout checks, not practitioner decisions.
- [ ] Production deployment, owner isolation and private upload/render smoke checks.
- [x] Source and rebuilt public client bundles scanned for configured secrets: 195 candidate source files and 31 built client files checked against 24 configured secret values, with zero matches. The source scan also found zero forbidden paths.
- [ ] Final staged-file review and secret scan immediately before publication.

## Limits that remain explicit

No human participant/practitioner study, physical fitting, real supplier transaction, time-saving measure or environmental outcome was conducted. Visual output may change garment details, identity cues or texture despite fixed smoothing settings. Makeup renders lip/blush only. The allocation engine searches a bounded problem and checks assignments independently; missing physical evidence remains unresolved. Printed documents cannot be recalled. Browser ownership has no email recovery or multi-user sharing. Automated WCAG checks and 390px Chromium inspection do not establish comprehensive assistive-technology or cross-browser certification; 200% browser zoom has not been claimed.
