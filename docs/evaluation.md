# Evaluation and reproducible checks

This reports software verification on an explicitly synthetic production. No practitioner study, real-performer fitting, physical realization or real-supplier reservation is claimed. Recorded provider-image review is documented separately in `evaluation-ai.md` when available.

## Observed domain verification

The following command was run locally on 31 October 2026:

```sh
pnpm exec vitest run tests/domain.test.ts tests/domain-beauty.test.ts tests/allocation.test.ts
```

Observed result: **3 test files passed, 53 tests passed**. One test contains **192 generated allocation problems**, compared with a separate brute-force oracle. These are software cases, not participants or real productions. The oracle independently enumerates assignments, rejects overlapping physical use and budget violations, and compares the substitution/cost optimum with the production engine.

Targeted ESLint also completed with exit code 0. Prettier's check of the domain modules, test files and these domain documents reported that all matched files use Prettier code style. These checks are narrower than application release verification.

| Consequence               | Verification                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Truthful fixtures         | Exact script spans, separate shoot order, synthetic inventory, no seeded approvals or invented provider previews                      |
| Exact appearance approval | Wrong actor/capture/recipe/hash rejected; a new output inherits no approval; rendering changes no fitting facts                       |
| Immutable revisions       | One revision/event per command; deeply frozen prior graph unchanged; rejection returns no changed graph                               |
| Precise garment repair    | Three Nora dependencies change; four unrelated approvals survive; unrelated handoff remains current                                   |
| Recast                    | Direction/reservations retained; old actor output remains historical; replacement fit is unverified; another actor's fitting survives |
| Stale adoption            | Intervening revisions and changed inventory versions both prevent adoption                                                            |
| Physical feasibility      | Distinct simultaneous units, recorded preparation, hard budget/category and explicit substitution constraints                         |
| Independent checking      | Forged intervals, omitted demand, duplicate IDs, wrong actors and unapproved units fail                                               |
| Live changes              | Continuous wear prepares once and holds custody; boundary changes propagate; directional duration and cumulative crew limits hold     |
| Search bounds             | No candidate at the bound is unknown; a checked candidate without proof is feasible                                                   |
| Reimport                  | Human corrections retained, source ranges rebased, changed cues flagged, referenced removals blocked                                  |
| Sourcing                  | Named evidence required; confirmation/receipt/return separate; expired or missing quotes cannot become confirmation                   |
| Consent                   | Private images lose inherited sample-public/synthetic status; withdrawal blocks new derivation and image-bearing packs                |
| Frozen packs              | Working warnings explicit; snapshots retain original unit facts and character direction                                               |
| Clock and fixture dates   | Quotes expire without editing production; new examples use future-relative dates; saved dates remain fixed                            |

Lineage tests use schema-valid provider doubles with `/test-only/` paths. They are not seeded into production and are not evidence of a provider call. Passing assertions establish behavior under their test inputs, not an external event.

The separate beauty suite verifies exact face-source lineage, independent body/face and garment/beauty invalidation, unchanged smoothing/morphology policy, recast, both consent scopes, face-pixel omission from new working packs, independent readiness, frozen beauty evidence and story-day provenance.

## Reproduction

Install the pinned dependencies, then run:

```sh
pnpm exec vitest run tests/domain.test.ts tests/domain-beauty.test.ts tests/allocation.test.ts
pnpm exec eslint src/lib/domain tests/domain.test.ts tests/domain-beauty.test.ts tests/allocation.test.ts
pnpm exec tsc --noEmit --pretty false
```

The domain tests need no provider credentials, network, database, private script or ignored planning files. They use an explicit fixed clock except for the controlled fake-clock expiry case. [domain-model.md](domain-model.md) describes the implemented contract and limits.

The browser workflow specification is `tests/e2e/production-workflow.spec.ts`. It operates the actual UI and checks persisted API state in fresh isolated browser contexts. It blocks all fresh-generation requests, uses matching recorded garment/makeup results, and retains screenshots/traces on failure:

```sh
pnpm exec playwright test tests/e2e/production-workflow.spec.ts --project=chromium --workers=1 --reporter=line --output=artifacts/private/e2e-domain
```

The complete browser suite passed against the optimized local production build: **9 tests passed in 1.1 minutes**, using one Chromium worker. The two production journeys include separate makeup approval, preservation through garment repair, replacement-face reapproval and frozen makeup evidence. The other tests cover desktop/mobile automated accessibility, private upload and owner isolation, consent withdrawal, stale revision recovery, exact-output approval races and recovery of the same interrupted request. Test sign-in respects the real authentication rate limit; it does not disable that protection.

The aggregate unit/domain/backend command, `pnpm test`, passed **10 files and 108 tests in 20.43 seconds**. Lint, TypeScript, formatting and the optimized production build also passed. [Release verification](release-checklist.md) records the final print check and separates deployment checks from these local observations.

## Interpretation and remaining evidence

The implemented allocator is bounded exact TypeScript search with a separate assignment checker, not a deployed CP-SAT service. Optimality concerns its declared objective under recorded constraints. Unknown transport, preparation, fit and supplier evidence remains provisional even for an optimal assignment.

These tests do not establish usability, time saved, physical fit, identity fidelity, supplier integration or commercial impact. Browser, database, authentication and provider recovery checks have their own artifacts. Real participant and physical outcomes require separate permitted observations.

Future evaluation can compare active replanning time, true/false conflicts, preserved approvals and stale artifacts on held-out productions. That remains a plan until observations, denominators and limitations are recorded. AI image review is auxiliary evidence and remains labelled AI review rather than human feedback.
