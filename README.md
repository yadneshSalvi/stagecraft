# STAGECRAFT

**A story in every look.** The working book for costume, makeup and the physical details a crew needs.

For community theatre, student and indie film, and costume hire houses keeping creative decisions, scarce garments and crew instructions together.

[Open STAGECRAFT](https://stagecraft-swart.vercel.app) · [Guided walkthrough](docs/judging.md) · [Evidence & limits](https://stagecraft-swart.vercel.app/evidence)

Follow a permitted script through a reviewed breakdown, a visual continuity wall, actor-specific YouCam previews, exact appearance decisions, approved physical-unit allocation, sourcing and frozen crew documents. When the recurring coat becomes unavailable, compare two real alternatives on the actor. Approving a different coat changes what the allocator can choose. Recast that same production and review the replacement performer’s own evidence.

## Step inside the production

**THE LAST LIGHT** opens as a private example with five characters, seven scenes, three story days and eight distinct looks. Mae moves from an ivory rehearsal blouse to midnight; Julian changes from olive to rust; Nora keeps the coat motif while her finale makeup intensifies. The wall shows the actual day-specific wardrobe and independent face detail.

No decision is preapproved. Inspect Nora and Mae first, then either continue individual reviews or explicitly **Record example decisions**. That reversible action records exact-output approvals attributed to **Example reviewer (sample decision)**; unseen alternatives still need their own review. The same book supports coat repair, creative-direction reconciliation, Celeste’s recast and a frozen handoff.

Exploring **Schedule** first is supported: the fresh example shows amber **DECISIONS NEEDED**, with the exact scheduled-look count, **Review looks** and **Record example decisions**. Recording those decisions rechecks the allocation. Physical conflicts remain red and distinct from decisions awaiting review.

The public library contains **20 genuine recorded YouCam outputs across four operations**: 12 garments, 4 makeup details, 2 hair-colour studies and 2 necklaces. Original and replacement body/face sources are synthetic. Exact matching makes recorded reuse available without another provider submission; it also works for compatible library sources in a custom production.

The **Example library** marks verified performer–garment pairs **Ready preview**. Its 18 physical-unit bindings reuse the 12 garment recordings; separate ivory units share identical submitted reference artwork. An unsupported pair suggests recorded garments for the selected performer first. You can import, approve and allocate a supported library pairing without a fresh generation.

## What the book does

- **Script to calls:** import permitted text or Fountain, inspect grounded source spans, review chronology, assign performers and draft editable calls in script order. Characters managing their own clothes remain visible without creating missing-department-look errors.
- **Continuity you can see:** character × story-day cells connect real wardrobe outputs to separately reviewed makeup or hair. One look cannot silently cover contradictory day variants.
- **Four independent views:** Clothes V4, zero-smoothing lip/blush Makeup VTO, hair colour and necklace VTO retain separate inputs, recipes, outputs and approvals. No body/face composite is fabricated.
- **Approved alternatives that matter:** a candidate binds actor, capture, physical unit/reference, exact output, scene scope and creative intent. Changing an approval changes admissibility. Revoking an adopted candidate cannot turn it into an unreviewed base recipe.
- **Physical allocation:** one coherent choice per continuity look across calls; each physical unit is costed once. Budget, overlaps, prep, changeovers and crew limits constrain the bounded search. A proposal lists any garment swaps and removed-item direction references before adoption. Explicit confirmation belongs to that exact solution and revision; recomputing requires a new confirmation. Losing choices show their recorded quote and constraint tradeoffs.
- **Repair without starting over:** garment changes preserve independent face evidence; recasts invalidate actor-specific decisions. Creative references to removed items are flagged. Editing direction requires reapproval while unchanged provider pixels remain reusable.
- **Crew handoff:** record supplier stages with evidence, export quotation-level hire-order CSV/PDF, and freeze exact costume/makeup/hair/accessory evidence into source-revision packs. Later changes mark online copies superseded.

## Run locally

Use Node **22.x** (pinned 22.22.3), pnpm **10.15.0** and an isolated PostgreSQL database. The application uses Next.js 16.4.3 and React 19.3.1.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Add your isolated PostgreSQL URL, auth secret and private Blob credentials.
# Add server-only YouCam and Gemini/OpenAI keys for live generation/extraction.
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3001` and use that origin for `BETTER_AUTH_URL` and `APP_URL`. Migrations 001–006 are additive. Recorded results can be inspected without a new provider submission. Fresh rendering needs configured private storage and provider credentials.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
pnpm test:e2e
```

Database tests accept only explicitly configured local `stagecraft_dev` or `stagecraft_test` databases. Unit/integration suites replace paid provider calls; recorded browser journeys reject live YouCam requests before the application. The own-script browser journey performs one actual short Gemini extraction. Private-upload checks use the configured private Blob store. Live YouCam smoke tests are separate deliberate operations.

The second review passed **226 unit/integration tests across 21 files** and **18/18 browser tests against the optimized local build**, with no failures, skips or retries. The browser gate took 199.939 seconds and used no paid YouCam tasks. It regenerated the 19-page crew PDF with all 27 images and complete printed requirements. [Current local verification](docs/evidence/review-round2-local-verification.json) records exact scope and attempts; the [release checklist](docs/release-checklist.md) tracks deployment separately. The [preceding production verification](docs/evidence/review-production-verification.json) preserves its protected/canonical browser checks and two bounded fresh workflow smokes.

## Saved work and provider limits

PostgreSQL holds owner-scoped productions, immutable revisions, idempotent commands, private upload intents and quota reservations. Better Auth supplies anonymous ownership, private Vercel Blob stores normalized inputs/results, and Vercel Workflow persists asynchronous generation. Refreshing or leaving a page does not discard a saved job.

Fresh and recorded requests have independent recovery state. A failed browser receipt first checks the saved command with GET. Deterministic refusals clear the pending intent; uncertain submissions retain their original identifier. An ambiguous paid submission is never silently repeated. Recorded inspection remains available while fresh generation rests.

The defaults permit **8 fresh jobs per app/day and 4 per browser/day**, with a **200-unit shared-account floor** checked through a five-minute database cache and again before submission. Garments reserve 2 units; makeup, hair colour and necklace reserve 1 each. A terminal failure releases a reservation only if no submission started and no provider task exists. STAGECRAFT and STEADY have independent repositories, deployments, databases, stores and ledgers but share an upstream YouCam credential; app caps do not isolate that balance.

Private records/images expire after 30 days. Body and face permissions are separate; withdrawal blocks dependent derivations. Settings provides export and deletion. This anonymous edition has no email recovery or shared organization accounts. A copied private URL still requires its owning browser.

## Evidence and practical limits

Synthetic inputs, actual provider outputs, manual decisions, AI critiques and software checks are labelled separately. No participant study, physical fitting, supplier reservation, time saving or environmental benefit is claimed. The full public-domain Act I import recorded both its initial **6/9** grounded cues and the revised **8/8** result; source offsets and denominators are published rather than selecting only the successful attempt.

Clothes V4 handles one garment reference per output. Makeup renders lip/blush with smoothing and reshaping fixed at zero. Hair colour renders a requested preset, not a physical dye or wig specification; one requested brown result visibly reads plum. Necklace VTO is appearance evidence, not a fit measurement. Every output needs inspection.

Allocation uses bounded exact TypeScript search. Its production **Constraint check** shares interval construction with the solver; a separate brute-force oracle checks small synthetic problems in tests. `DECISIONS_NEEDED` identifies missing exact appearance approvals; it does not assign unapproved garments. `FEASIBLE` means a valid available choice was found; `OPTIMAL` requires an exhausted search with genuine alternatives under the implemented objective. Actual physical conflicts remain `INFEASIBLE`. Missing physical evidence remains unresolved. Printed documents cannot update themselves.

## Documentation

- [Guided judging journey](docs/judging.md)
- [Architecture and API boundaries](docs/architecture.md)
- [Domain rules and precise invalidation](docs/domain-model.md)
- [Software evaluation and measured engine timings](docs/evaluation.md)
- [AI inspection of actual garment outputs](docs/evaluation-ai.md)
- [Full Act I import observations](docs/evidence/script-import-review.json)
- [Observed full-act browser-to-allocation journey](docs/evidence/own-script-browser-review.json)
- [Original live script review](docs/evidence/live-script-review.json)
- [Original manual browser observations](docs/evidence/browser-review.json)
- [Original production release observations](docs/evidence/production-review.json)
- [Operations and deployment](docs/operations.md)
- [Current release checks](docs/release-checklist.md)
- [Current integrated local verification](docs/evidence/review-round2-local-verification.json)
- [Preceding local verification](docs/evidence/review-local-verification.json)
- [Asset provenance and licenses](docs/asset-licenses.md)

Private plans, credentials, provider task IDs, private uploads and execution artifacts are excluded from publication and deployment.
