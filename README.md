# STAGECRAFT

**A story in every look.** A costume, hair and makeup workspace connecting creative decisions to the physical things a crew needs.

[Open STAGECRAFT](https://stagecraft-swart.vercel.app) · [Judge walkthrough](docs/judging.md) · [Evidence book](https://stagecraft-swart.vercel.app/evidence)

Follow a permitted script through reviewed breakdown, actor-specific YouCam previews, explicit appearance decisions, physical-unit allocation, sourcing and frozen crew documents. Remove a recurring coat or recast a character, inspect the exact impact, and preserve decisions that remain valid.

## Start with the example

Open a private copy of **THE LAST LIGHT**: seven scenes, five characters, three story days and a different shooting order. Five genuine recorded garment results and Nora’s genuine recorded makeup detail are attached when their exact inputs match. **No approval is seeded.** Inspect Nora and Mae and record decisions before the missing-coat disruption. Use another new example for Celeste’s recast to inspect the prepared matching results without spending provider units.

Cast sources, script and inventory are synthetic. No real participant, physical fitting, supplier stock, time saving or production readiness is claimed. [Provenance](docs/asset-licenses.md) and [evaluation](docs/evaluation.md) distinguish synthetic sources, actual provider results, software tests, AI critiques and manual records.

## Product

- Import permitted text or Fountain scripts, review grounded AI cues, and explicitly resolve uncertain chronology.
- Add performers, assign uncast characters, upload separate private body and face sources, and record physical garment units.
- Generate Clothes V4 garment previews and independent Makeup VTO lip/blush details with smoothing and lip reshaping set to zero. No body/face composite is fabricated.
- Approve exact outputs separately. Garment replacement preserves valid beauty evidence; recast invalidates both actor-specific decisions.
- Allocate physical units under recorded budget, overlap, preparation, transition and crew constraints. An independent checker validates assignments; fitting and supplier gaps remain explicit.
- Record sourcing requests, external responses, receipt and return with an operator and evidence. No messages are sent automatically.
- Freeze both appearance views, unit facts and crew directions into source-revision packs for print/PDF. Online copies display supersession.

## Local setup

Use Node **22.x** (pinned 22.22.3) and pnpm **10.15.0**. Local verification uses PostgreSQL 18. The application uses Next.js 16.4.3 and React 19.3.1.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Add your isolated PostgreSQL URL, auth secret and private Blob credentials.
# Add server-side YouCam and Gemini/OpenAI keys for live rendering/extraction.
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3001` and use that value for `BETTER_AUTH_URL`. `.env.example` describes provider limits and test configuration. Recorded results can be inspected without a new provider submission. Fresh generation requires configured private storage and provider credentials.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
pnpm test:e2e
```

Database integration tests accept only an explicitly configured local `stagecraft_dev` or `stagecraft_test` database and mock paid provider/storage calls. Browser tests use a running server, actual anonymous ownership and persistence; private-upload checks use the configured private Blob store. Recorded workflow tests make no fresh YouCam submissions. Live provider smoke tests are separate, deliberate operations.

## Architecture and boundaries

PostgreSQL holds owner-scoped aggregates, immutable revisions, idempotent commands, upload intents and quota reservations. Better Auth provides anonymous ownership, private Vercel Blob stores normalized images, and Vercel Workflow persists the provider lifecycle. Ambiguous paid submissions are never silently repeated. Browser recovery reuses the original app request identifier.

Private records and images expire after 30 days. Performer permission withdrawal blocks both derivation scopes; face-only withdrawal preserves garment evidence. Settings provides export and deletion. This anonymous edition has no email recovery or shared organization accounts. A copied private URL still needs the owning browser; deliberately export frozen pages for crew.

Clothes V4 renders one garment reference per output. Makeup VTO renders matte lip and blush; hair, liner, accessories and other application text remain crew notes. Generated appearance does not establish physical fit, exact reproduction, cosmetic application, comfort or dressing time. The allocator is bounded exact TypeScript search with independent checking, not a deployed CP-SAT service.

STAGECRAFT and STEADY have independent repositories, deployments, databases, stores and ledgers. They share an upstream YouCam credential; app limits do not imply quota isolation.

## Documentation

- [Guided judging journey](docs/judging.md)
- [Architecture and API boundaries](docs/architecture.md)
- [Domain model and precise invalidation](docs/domain-model.md)
- [Reproducible domain evaluation](docs/evaluation.md)
- [Independent AI review of actual garment outputs](docs/evaluation-ai.md)
- [Observed live script extraction](docs/evidence/live-script-review.json)
- [Observed manual browser review](docs/evidence/browser-review.json)
- [Verified production release](docs/evidence/production-review.json)
- [Operations and deployment](docs/operations.md)
- [Release checks](docs/release-checklist.md)
- [Asset provenance and font licenses](docs/asset-licenses.md)

Private plans, credentials, test artifacts and provider task identifiers are excluded from publication and deployment.
