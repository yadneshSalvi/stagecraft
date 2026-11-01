# Domain model and decision rules

STAGECRAFT joins performer-specific appearance decisions to physical inventory, a schedule and a frozen handoff. Source portraits, provider results, creative approvals, fittings and supplier confirmations remain separate evidence. None creates another implicitly.

The pure browser-safe engine in `src/lib/domain/` performs no network, database or paid-provider operations. `applyCommand` returns a new serializable graph, exactly one production revision and one audit event. Rejection throws an actionable `DomainError` without changing the input. The server persists prior revisions separately.

## Identity, time and the example

A character is a story role; a performer is an image subject. A look partitions that character's scene appearances. A scene has story chronology and exact source ranges; an occurrence has independent production order, times and location. `storyDaySource` distinguishes script facts, unspecified provisional chronology and reviewed days. A numeric placeholder is not a script fact.

Physical units have distinct identities and fact versions. Sharing a catalogue image does not make two records one physical instance. Prices are integer minor currency units. A zero-cost item needs an explicit quote source; unknown price cannot count as free stock. Availability windows include a UTC offset; the production timezone defines same-day continuous wear.

New **THE LAST LIGHT** examples contain seven scenes, three story days, five fictional adult roles, six synthetic performers and nine synthetic garment units. Eight looks partition the appearances:

| Character | Story days 1–2                                     | Story day 3                                                             |
| --------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| Nora      | C-014 coat, `look-nora`                            | Same physical coat, `look-nora-finale`; separate stronger makeup recipe |
| Mae       | S-009 ivory rehearsal blouse, `look-mae-rehearsal` | D-008 midnight dress, `look-mae`                                        |
| Julian    | T-011 olive jacket on day 2, `look-julian`         | J-031 rust jacket, `look-julian-finale`                                 |
| Ruth      | S-004 ivory blouse                                 | Same physical blouse                                                    |
| Elias     | S-003 work shirt on day 2                          | Same physical shirt                                                     |

Nora, Mae and Ruth have appearances on all three story days. Nora's variants share `continuity-nora-coat`; the allocator cannot select different coats for those variants. Mae and Ruth have distinct physical blouse IDs. New shoots fall nine and ten days after creation, with explicit estimated dressing transitions before the finale. The selected baseline garment quotes total £500, charged once per physical unit.

The factory creates two immutable, unapproved Nora candidate recipes, C-021 charcoal and C-033 burgundy. It seeds no output or approval. The backend can attach genuine matching recordings without creating a decision. Hair-colour and necklace plans are optional independent details. All inventory quotes, availability and fit records in the example are visibly synthetic and do not establish an external outcome.

Old serialized productions keep their original script, IDs, dates, five-look layout and evidence. Optional new fields default safely when absent; no read operation migrates or relabels saved source truth. The original authored JSON from baseline `a5f1284` is included as a regression fixture.

## Source review and custom planning

Script adoption verifies permission, checksum, source bounds and mappings. Reimport reconciles stable scene/requirement IDs, preserves reviewed corrections, rebases evidence ranges and flags changed source. Referenced scene removal is rejected until dependencies are remapped. Script text cannot invoke commands.

`edit_direction` saves intent as unapproved and clears its previous author approval. Relevant appearance/detail decisions require review; unchanged provider pixels remain reusable. A garment impact flags direction text, essential items and palette entries that still reference the removed unit's name, colour, material or code. Controlled garment changes retain server-derived removed references, so the flag is checked against current direction after adoption and after later allocation recomputes. Restoring the referenced garment or correcting its current direction clears the flag. The system does not silently rewrite artistic intent.

`draft_schedule` creates missing calls in script order from explicit start, scene duration, gap and location inputs. It preserves already edited calls and story chronology. A character's explicit reversible `ownClothes` flag excludes that role from managed wardrobe demands and missing-cast/look readiness checks. Initial casting of a role with no looks remains possible while other roles are incomplete; it grants no appearance approval.

Explicit example-library imports create project-local identities with trusted source associations. Private source replacement clears the replaced association and inherited synthetic/public-demo image labels. Arbitrary client IDs or paths do not authorize recorded-input reuse; the server verifies library association and exact transport inputs separately.

## Exact candidate decisions

An `AppearanceCandidate` stores immutable ID, performer/capture, complete continuity-group look/scene scope and garment recipe snapshot. Its provider-input fingerprint covers actual source and garment references/category. It excludes working look revision, creative direction and independent face details.

A candidate preview must match that exact candidate recipe, permitted source capture and scope. Its approval additionally binds the exact stored output fingerprint, preview ID, current creative-intent hash, reviewer, rationale and time. A new output inherits no decision. A direction edit can therefore require reapproval of existing genuine pixels without a paid rerender.

`approve_candidate` does not change the working recipe or casting. Controlled adoption preserves the reviewed preview and approval IDs and retains `activeCandidateId` on every scoped look. Revocation or source/intent staleness cannot turn an adopted candidate into an eligible unapproved base recipe. Aggregate selectors verify current registry evidence; inline copies are kept in sync for simple frozen display.

The original recipe also needs an exact current approval. `approvedSubstituteIds` is legacy descriptive metadata, not approval permission. Allocator eligibility comes only from exact approved active looks or approved candidate records for the current performer and complete continuity scope.

`recordingEvidence` preserves the original recording ID, provider input hash and original subject/recipe identifiers when the server deliberately binds verified identical library inputs to a new look or physical unit. A fresh project-specific approval is still required; original manifests are not rewritten.

The example-only `set_example_decisions` command is explicit and reversible. It attributes each available exact current output decision to **Example reviewer (sample decision)**, tags its source, and never manufactures missing output. Disabling it revokes tagged current sample decisions while preserving manual decisions. Default examples have no approvals.

## Independent face details

Face captures have separate pixels, versions, provenance and permission. A body image or automatic crop is never silently substituted. Makeup, hair colour and necklace each have independent recipe versions, outputs and approvals. Notes remain unrendered until actual matching output exists.

Makeup exposes lip/blush colour and intensity; smoothing is fixed to zero and lip morphology is unchanged. Hair colour exposes documented full-colour presets, not a claim of hair cut, length or physical wig. Necklace uses a registered reference and background-removal setting; output does not establish jewellery fit.

| Change                           | Garment decision                                                                   | Makeup / hair / necklace decisions                                         |
| -------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Garment candidate adoption       | Preserves the candidate's exact reviewed identity                                  | Preserved for the same actor                                               |
| One independent detail recipe    | Preserved                                                                          | Only that detail requires new output/approval                              |
| Body source                      | Requires matching body output/approval                                             | Preserved                                                                  |
| Face source                      | Preserved                                                                          | Requires matching face output/approval                                     |
| Recast                           | Prospective candidate can be reviewed first; old-actor evidence becomes historical | Old-actor evidence invalidated; replacement needs separate output/approval |
| Whole-performer withdrawal       | Blocked                                                                            | Blocked                                                                    |
| Face-only withdrawal             | Preserved                                                                          | Blocked                                                                    |
| Relevant direction / story scope | Approval needs review; unchanged pixels can remain                                 | Approval needs review                                                      |
| Production schedule              | Operations rechecked                                                               | Appearance retained                                                        |

Configured unapproved details prevent readiness and add separate working-pack warnings. New packs after face withdrawal omit face sources and derived detail pixels from both selected handoff content and full approval context. Historical snapshots remain immutable; online access remains subject to current permission.

## Allocation and constraint checking

`stagecraft-bounded-exact/2-approved-choices` is bounded exact TypeScript search, not CP-SAT. It chooses one approved recipe per continuity group across every call. Hard constraints include demand completeness, exact approval lineage, physical-unit identity, availability/status, category, alteration requirements, overlapping unit/preparation use, performer attendance and budget.

Among admissible approved choices, the objective minimizes production-window quote cost, charged once per physical unit, then performer garment changeovers. It does not silently change the working book: allocation adoption is an explicit command that also adopts any selected reviewed candidates while retaining their evidence identities. The input hash includes admissible exact approval/output identities and current intent, as well as inventory fact versions and schedule.

A proposal that changes garments lists the exact original and selected physical units, scoped looks, scenes, calls and candidate approval identity. `adopt_allocation` requires a confirmation containing the exact proposal ID, input hash, source revision and review hash. The review hash also binds the current revision, candidate/scope changes, swaps and current creative-reference flags. Recomputing an identical plan creates a new proposal; an old confirmation cannot authorize it. A plan without garment changes remains compatible with input-hash-only adoption.

Saved choice comparisons retain the original recipe, selected recipe, individual unit quotes and the difference in the whole-production unique-unit quote. Counterfactual checks hold other saved assignments fixed and report actual overlap, availability or hard-budget findings, or the implemented cost/changeover tie-break. They do not claim a losing choice is globally infeasible. Comparisons remain evidence for the saved proposal after adoption; later facts require a new solve.

The assignment checker verifies coverage, exact intervals, evidence IDs, group coherence, physical facts, unique-unit costs and pairwise overlaps. It shares interval/demand construction with search, so the product honestly calls this a **Constraint check**. New results set `constraintChecked`, with `independentlyChecked:false`. A separate brute-force test oracle covers 192 small resource/budget cases; that is test evidence, not an independently implemented production checker.

| Status             | Meaning                                                                                                                                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DECISIONS_NEEDED` | Scheduled dressed looks lack exact current appearance decisions, while a permission-free diagnostic of working recipes and already-approved alternatives found no hard conflict. No assignments are exposed or adoptable. |
| `FEASIBLE`         | A checked fixed plan exists, or a bounded search found a checked plan without proving the objective.                                                                                                                      |
| `OPTIMAL`          | At least one group had multiple usable approved physical recipes and exhaustive search proved the declared objective.                                                                                                     |
| `INFEASIBLE`       | Current physical hard constraints or exhaustive admissible combinations rule out a plan. Missing decisions do not conceal an overlap, unavailable unit or hard-budget conflict. No constraint is relaxed.                 |
| `UNKNOWN`          | Missing facts, unknown price, incomplete scope or a search bound prevent a checked conclusion.                                                                                                                            |
| `INVALID_INPUT`    | Missing/malformed scheduling or inventory facts prevent a valid solve.                                                                                                                                                    |

The default bound is 50,000 nodes and 100 demands. `TIME_LIMIT` remains reserved in the shared contract. Only feasible/optimal results that passed the constraint check can be adopted. Missing approval is an unverified, actionable finding. Decision counts use unique scheduled dressed look IDs, excluding own-clothes roles and unscheduled or empty recipes; a full-scope candidate can satisfy multiple looks. Legacy results with only approval-required conflicts are presented as decisions-needed without rewriting saved JSON. Genuine mixed physical conflicts retain their status.

Recorded preparation occupies a unit before use. Consecutive same-performer use of the exact same look on one local day/location retains custody through gaps and prepares once unless a reset transition is recorded. Earlier end-time changes invalidate dependent continuous-wear intervals. Unknown preparation remains explicitly unverified and never establishes actual zero-duration preparation.

Live changes are directional and tied to exact performer/occurrence pairs; reverse timing is not inferred. A bounded nonpreemptive crew check verifies shared capacity, including staggered changes, up to twelve tasks per resource and 30,000 nodes. It proves schedule existence without persisting detailed crew call times. Unknown travel, measurements, preparation, fit and supplier evidence remain unverified; no allowance or alteration is invented.

## Repairs, sourcing and frozen handoffs

A repair proposal includes immutable candidate comparisons, exact affected work, preserved evidence and creative-reference flags. It binds a base revision and canonical fact/evidence hash. Candidate review or any other accepted command stales the old proposal: refresh impact before adoption. Adoption rechecks the current exact reviewed choice. Earlier production snapshots remain reproducible.

Repair feasibility fixes only the affected continuity groups to the explicitly selected candidate. The internal `fixedCandidateIds` filter narrows already approved choices; it cannot authorize an unapproved, stale or missing candidate. Unknown or conflicting fixed identities fail closed. Proposal comparison and adoption use one evaluator, resolving candidate scope before a recast can replace the old performer. Unrelated groups may still optimize. This constrained result is used only for repair validation and findings, never persisted as the ordinary allocation result. When both coats are approved, a valid burgundy repair stays feasible even though an unrestricted Schedule solve prefers cheaper charcoal.

Garment repair blocks dependent allocations, flags removed-unit sourcing and supersedes relevant packs while preserving unrelated approvals and independent face details. Recast retains story direction and item/date supplier reservations. It resets only relevant old-performer fitting evidence; another performer's fitting on a shared unit remains recorded but cannot establish replacement fit.

Sourcing records `draft → requested → held → confirmed → received → returned`, with supported direct confirmation, decline and cancellation branches. Each transition needs named operator, evidence and external reference. Current quotes and covering availability are required where applicable. Confirmation, receipt and return are separate; none manufactures a fitting. Synthetic requests cannot become real supplier outcomes. Domain commands record evidence and send no external messages.

Readiness uses the current clock, so quotes can expire without a production edit. It requires reviewed source, managed cast/looks, exact garment and configured detail decisions, a checked adopted allocation, fitting/source evidence, no unresolved operational findings and current handoff coverage. Synthetic/provisional evidence cannot establish physical readiness.

Packs freeze selected scene content plus full active-candidate `appearanceContext`, so a one-occurrence handoff can still verify a decision spanning multiple continuity looks. Snapshots include character direction, exact outputs/decisions, performer sources, units, calls, script, sourcing, allocations, transitions, currency, timezone and budget. Outstanding evidence produces a **Working pack**. `current` means not superseded, not physically ready. Relevant changes supersede packs without rewriting them.

The engine does not verify externally asserted events, book suppliers, optimize transport, reserve across unrelated productions or implement payments. Software and AI evaluation remains separate from participant research, physical fitting or commercial impact.
