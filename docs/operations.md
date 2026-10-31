# Operating STAGECRAFT

Use Node.js 22.22.3 and pnpm 10.15.0. Start from the checked-in lockfile:

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm db:migrate
pnpm dev
```

The development server uses port 3001. Fill the placeholders before migration or startup. Keep all real environment files ignored and preserve existing credentials. Migration and runtime initialization load this project's Next.js environment files; `.env.local` takes precedence over `.env`. Never print a connection string, token or provider response while diagnosing configuration.

## Environment

| Variable                                | Purpose                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                          | This application's PostgreSQL database; use an isolated local `stagecraft_dev` or `stagecraft_test` for integration tests |
| `BETTER_AUTH_URL`                       | Actual origin, `http://localhost:3001` locally                                                                            |
| `BETTER_AUTH_SECRET`                    | Strong private session secret; use different values across environments                                                   |
| `CRON_SECRET`                           | Private bearer credential for scheduled cleanup                                                                           |
| `BLOB_READ_WRITE_TOKEN`                 | This application's private Blob store, required for local/direct client token issuance                                    |
| `BLOB_STORE_ID`                         | Optional linked deployment storage configuration with Vercel OIDC                                                         |
| `YOUCAM_API_KEY`, `YOUCAM_API_BASE_URL` | Server-only API-key bearer configuration                                                                                  |
| `YOUCAM_API_KEY_EXPIRES_AT`             | Operator reference; the app does not renew or refill the account                                                          |
| `GEMINI_API_KEY`, `AI_MODEL_GEMINI`     | Structured extraction; configured `gemini-4-argon`                                                                        |
| `OPENAI_API_KEY`, `AI_MODEL_OPENAI`     | Extraction when Gemini is not configured; configured `gpt-6-astra`                                                        |
| `GENERATION_PAUSED`                     | `true` rejects new live jobs and pauses queued paid submissions; saved/recorded work remains usable                       |
| `YOUCAM_DAILY_JOB_LIMIT`                | Default 16 paid job reservations per UTC day                                                                              |
| `YOUCAM_OWNER_DAILY_JOB_LIMIT`          | Default 4 paid reservations per browser owner per UTC day                                                                 |
| `YOUCAM_REQUEST_LIMIT_PER_5_MIN`        | Default 40 provider API requests in the application's sliding five-minute window                                          |
| `TEST_DATABASE_URL`                     | Optional local-only integration-test override                                                                             |

Legacy `YOUCAM_SECRET_KEY`, Deepgram and skin-analysis settings are not used. No provider credential belongs in `NEXT_PUBLIC_*`. Workflow selects the local world in development and the Vercel world on deployment automatically; do not set `WORKFLOW_TARGET_WORLD=vercel`. Keep `.workflow-data/` when testing recovery locally. [Workflow documentation](https://useworkflow.dev/docs/getting-started/next).

## Database and deployment

Apply `pnpm db:migrate` against the intended target before serving its code. Migrations are ordered, transactional and protected by an advisory lock; `stagecraft_migrations` records application. Four migrations create authentication/domain/job/media tables, upload revocation, a spend ledger independent of project deletion, and separate face/beauty asset purposes with job kinds. Legacy rows remain garment jobs. Runtime connections use a small pool and preserve strict TLS verification; `sslmode=require` is normalized to `verify-full`.

Use separate databases, private stores and auth secrets for development and production. Public fixture assets and recordings are traced into the deployment; ignored plans and private recording ledgers are not runtime inputs. The daily Vercel cron calls `GET /api/cron/cleanup` at 03:15 UTC with its configured `CRON_SECRET`. The same endpoint can be called through an authorized maintenance client for a deliberate catch-up pass.

## Spend and recovery

Each Clothes V4 job reserves two estimated units; a source-only Makeup VTO detail reserves one. Both share the same daily job allowance, active-job cap and spend ledger. Feature costs were checked before recording: seven garment results used 14 observed units, and two separate beauty details used two observed units. Application daily reservations are retained even if a project or browser's production is deleted. There are at most three active live jobs. Provider 429/transient reads back off; uncertain paid submissions never auto-repeat.

STAGECRAFT and STEADY use the same upstream account. The local ledgers do not combine their balances or make the accounts independent. Coordinate fresh test runs and operational budgets across both applications, inspect the shared balance, and pause new work when necessary. The application's 40-request window is deliberately below the provider's published 250 requests per 300 seconds; the other application still consumes the shared account's allowance. [Provider rate limits](https://docs.makeupar.com/develop/rate_limit).

| Job state              | Operator action                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `queued` / `preparing` | Allow file preparation; owner status reads and maintenance can redispatch an interrupted worker                           |
| `polling` / `storing`  | Resume the saved attempt to query/download the same provider task                                                         |
| `ambiguous`            | Reconcile the private intent ledger with provider usage/history; do not clear the submission timestamp or repeat the POST |
| `failed`               | Inspect the fixed error category and inputs; a new paid attempt requires a deliberate owner request                       |
| `cancelled`            | Local work stops; a provider task already accepted may still consume its reserved units                                   |
| `succeeded`            | Inspect the stored image; appearance approval is still explicit                                                           |

`POST /api/jobs/:id` resumes a saved nonterminal attempt; `DELETE` cancels locally. Neither operation is an upstream task-cancellation promise. A recovered task identity must be reconciled by an authorized operator using private records, never supplied as an arbitrary public command. Do not copy signed transport URLs or task identities into public issue reports.

## Privacy and housekeeping

Production and image access expire after at most 30 days. Face-only permission withdrawal revokes face/beauty input and output access while preserving garment evidence. Performer-wide withdrawal and project deletion revoke both groups immediately. Durable erasure retries storage failures and waits for already issued upload tokens to expire before its final cleanup. The daily maintenance pass handles batches of 20 deleted projects, 80 expired upload intents and interrupted jobs; run catch-up passes if a batch limit or storage failure leaves a backlog. Do not claim a strict physical-erasure deadline while a backlog exists. Upstream YouCam retention is independent and currently 30 days.

The owner can export current data with a named operator through `/api/projects/:id/export?owner=Name`. The export includes a hash manifest of frozen revisions and authenticated links to download each snapshot separately. Exported image references retain their access/retention requirements; the JSON does not make private photos public. Deleting a production removes its snapshots, drafts, events and asset records after erasure; daily spend reservations remain for 32 days to prevent quota resets.

## Verification and recordings

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

PostgreSQL integration tests run only when the configured URL points to localhost and a `stagecraft_dev`/`stagecraft_test` database. They create random test owners and remove only those fixtures. Provider/Blob calls are mocked. Without an isolated local database, that suite is skipped; unit tests and recording-integrity checks remain available.

The recording harness defaults to validation without network calls:

```sh
NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/record-previews.ts
```

Its explicit `--confirm-live` mode is a seven-task, 14-estimated-unit plan, with atomically written pre-submission state and task-ID recovery in ignored `artifacts/private/recorded-previews/`. Never rerun it as a casual test: fresh submissions require shared-budget authorization. Existing successful tasks are not resubmitted, ambiguous tasks remain stopped, and an unreadable ledger is never reset automatically. Current artwork must match the persisted input hashes. Publishing preserves reviewed public inspection notes when input and output hashes match. No further sample regeneration is required for setup or judging.

Use the shipped recordings for routine rehearsals. They are actual provider outputs over synthetic source artwork, with visible inspection caveats, and carry no automatic operator approvals, supplier confirmations or physical results.

The separate beauty harness validates the two inspected face inputs and fixed zero-smoothing/zero-morphology recipe without network calls by default:

```sh
NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/record-beauty-previews.ts
```

Its explicitly authorized `--confirm-live` plan contains only the Ada/Celeste pair, two estimated units, and a separate ignored recovery ledger. It never rewrites the garment recordings. The public beauty manifest includes exact submitted effects and input/output hashes. A face capture is independently versioned and permitted; a body image is never silently cropped into one. Makeup previews are separate images with separate approval. Zero values describe the submitted settings and do not guarantee unchanged texture or physical product matching.

Script extraction uses a Gemini-only provider schema simplifier after the original nested bounds were observed to fail with `INVALID_ARGUMENT`. Strict local parsing retains all limits, and OpenAI keeps the original provider schema. The request times out after 90 seconds within a 120-second route budget. Null chronology remains explicitly `unspecified` for review. No extraction timeout automatically repeats a model request.
