# STAGECRAFT implementation guidance

- This is an independent project repository. Keep all application changes inside this repository unless a task explicitly requests otherwise.
- Read the local `plans/` documents when available before beginning implementation. They describe the approved product direction and proposed implementation. Planning material is intentionally untracked; public builds and deployment must never require it.
- Preserve `.env` and any existing credentials. Do not print secret values, embed them in client bundles, or commit them. `.env.example` contains placeholders only.
- Keep `plans/`, `.env`, and environment overrides ignored. Stage explicit files and verify the staged paths before commits or pushes.
- Treat proposed capabilities and validation targets as unverified until demonstrated. Keep precise provenance in stored data, alt text, public evidence and documentation; never claim participant outcomes from synthetic or software checks.
- Follow the Round 3 minimal disclosure policy: one plain Example marker per example production screen; no per-image or per-record provenance chips. Evidence & limits is the disclosure home, linked from the landing footer, Settings and help rail. Keep the single sponsor credit. Preserve short purpose-specific consent checkboxes, errors and accessible labels. The two appearance approval dialogs may retain “Appearance only — fit is checked at fitting.” Do not reintroduce repeated provenance notices.
- Working screens use plain titles, one primary action and concise functional copy. Results must stay beside the action that produced them. Preserve image aspect ratios and an 8 px spacing rhythm; test the judge path at 1440×900 and 1366×768.
- Follow official YouCam endpoint schemas, asynchronous task behavior, and observed API responses. Do not infer physical fit, clinical efficacy, or other unsupported measurements from generated appearance previews.
- Build a coherent, accessible experience with deliberate typography, spacing, motion, and complete loading, recovery, empty, and error states. Follow this project's own art direction rather than a generic dashboard template.
- Keep server credentials, private uploads, and provider operations behind appropriate server boundaries. Verify current framework and deployment limits before implementation.
- Use meaningful integration, accessibility, and end-to-end verification for the workflows being built. Document actual commands and results as the application takes shape.
- Maintain public setup, operating, and judge-access instructions alongside the implemented application. The repository started from an empty bootstrap; package scripts and public documentation now describe the runnable product.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
