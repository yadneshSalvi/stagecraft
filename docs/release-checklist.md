# Release verification

This checklist separates current review-round checks from the preceding deployed release. Synthetic decisions, provider images and software checks do not establish practitioner approval, physical fitting or supplier outcomes.

The current review round starts from `a5f128467e72e9fdfa37ddfc5f0649278eda3129`. Its local application-wide gate is complete; deployment and production acceptance remain separate steps. The canonical application is [stagecraft-swart.vercel.app](https://stagecraft-swart.vercel.app).

## Review-round evidence already observed

- [x] Root verified all 18 public source-asset hashes, preserving the original 14. New sources are two garment references, Mina’s independently versioned face source and one brass pendant.
- [x] Eleven newly authorized YouCam tasks completed exactly once: five Clothes V4, two Makeup VTO, two hair-colour and two necklace outputs. Shared balance moved from 981 to 965: **16 observed units**, zero failed/ambiguous submissions and no automatic retries. The full recording library now has 20 outputs representing 32 recorded units.
- [x] Root independently reconciled the new recordings against 29 output/source/reference hashes and visually inspected all eleven images. Brown-to-plum hair drift is recorded in inspection notes without changing the submitted preset or provider pixels.
- [x] Original recording manifests and frozen transport hashes remain intact. Four additional frozen JPEG transports support the new synthetic references; private input ownership and normalization remain separate.
- [x] Full public-domain Wilde Act I import exercised the actual Gemini model twice. Both attempts are retained: initial 6/9 grounded cues in 12.268 seconds; revised prompt 8/8 in 11.473 seconds. Original source spans validate; neither run made production decisions or YouCam calls. [Complete observations](evidence/script-import-review.json).
- [x] Focused domain gate: 77 tests across four files, including a separate 192-case brute-force oracle. Exact candidate approval, coherent physical allocation, revocation after adoption, direction edits, per-day variants, independent details and old-production compatibility are covered. [Domain evidence](evaluation.md).
- [x] Ten measured pure-engine runs after one warm-up recorded real software durations; they exclude provider/database/UI/human time. [Raw benchmark](evidence/domain-benchmark.json).
- [x] Supplier hire-order helper: 4 tests passed. Focused browser export journey: 1 test passed, covering CSV, PDF, mobile layout and no revision mutation. Root inspected the actual one-page A4 PDF and desktop/390px views.
- [x] Protected-deployment browser context helper: 4 tests passed. Only the exact deployment host’s Vercel protection cookie can be shared with an isolated app-user context; app authentication is not copied.
- [x] Additive migrations 005–006 applied to the production database. This does not deploy the changed application.

## Current application-wide gate

The following items are updated only after running against the integrated source. Earlier release counts do not count as verification of the new continuity, candidate or independent-detail flows.

- [x] Full formatting, lint and TypeScript validation. The final documentation pass is checked again before handoff.
- [x] Complete serial unit/domain/backend suite: **188 tests across 19 files passed in 13.71 seconds**, including 17 session-recovery cases preserving browser identity on rate limits, network/server failures and malformed replies.
- [x] Optimized production build with all four provider operations traced correctly. Root independently verified the additional manifests, sources and frozen transport files in both creation and preview route traces.
- [x] Full serial Chromium suite against the optimized local build: **16 passed, zero failed, zero skipped**, in **3.2 minutes** as reported by Playwright. It covers approval-derived physical choices, same-production coat repair/recast, actual Gemini own-script library/calls, independent details, request recovery, owner-cookie preservation, upload ownership and frozen handoff. [Local verification record](evidence/review-local-verification.json).
- [x] Automated accessibility and overflow checks on 11 production surfaces at desktop and 390px, plus landing/evidence; focus restoration and result focus verified.
- [x] Integrated frozen crew PDF: 19 A4 pages, 27 loaded images, seven calls and seventeen look occurrences. Three separate makeup sections, four hair-colour sections and three necklace sections retain exact frozen approvals. Lead and root inspected makeup, hair and necklace pages without clipping; normal-resolution Poppler and MuPDF renders agree.
- [x] Independent local full-act own-script browser acceptance: 7/7 grounded cues, explicit own-clothes roles, trusted library reuse, approved look, editable call and adopted FEASIBLE £125 assignment. Observed agent-operated upper bound 273 seconds. [Evidence](evidence/own-script-browser-review.json).
- [ ] Independent final example browser acceptance and measured change-impact counts.
- [ ] Final source/staged/client secret scans and ignored-path review. The preceding build scan passed 268 text files, including 32 client chunks, against 27 configured secret values; rerun after the session-recovery build before publication.
- [ ] Production deployment and canonical browser checks; deliberately authorized fresh provider smoke tests only.
- [ ] Elevated-floor protected-deployment verification proves friendly fresh refusal while exact recorded replay remains usable.

## Previous release — historical scope

The October 31, 2026 deployed application commit was `0a4e656d1c25c6b3ebaaa23154429f374cff1dc1`, Vercel deployment `dpl_92UN3JArCP5shREhodUEhfWCoJCF`. [Production evidence](evidence/production-review.json) records owner isolation, separate private body/face uploads, one live garment and one live makeup result, durable reload recovery and later recorded reuse. Those production renders consumed three observed units. All results remained accessible to the owning browser after deployment.

The preceding release passed 111 tests across 11 files and 9 Chromium tests in 1.1 minutes. A follow-up fixture-transport correction verified 13 exact JPEG inputs and 16 original recording-input references, then repeated the full unit suite and build. The final example attached five recorded garment results and one makeup result, with zero approvals. Recorded charcoal repair and a separate Celeste recast were inspected without new provider units.

The earlier crew PDF check covered 16 A4 pages, seven calls, sixteen look occurrences, nineteen loaded images and three makeup sections. It predates the review-round day variants and independent hair/necklace evidence. Source and public client scans found zero matches against 24 configured secret values. [Manual browser observations](evidence/browser-review.json) and [live script review](evidence/live-script-review.json) preserve their own limited scopes.

## Limits

The production allocator exposes an honest Constraint check; it shares interval construction with search. The separate test oracle does not become an independent production validator. Unknown physical facts remain unresolved. A generated preset or garment can differ visibly from its reference. No human study, fitting, real supplier transaction, saved production time or environmental outcome was measured.

Anonymous ownership has no email recovery or organization sharing. Printed documents cannot be recalled. Automated WCAG checks and 390px Chromium inspection do not establish comprehensive assistive-technology or cross-browser certification. No 200% browser-zoom claim is made without an observed check.
