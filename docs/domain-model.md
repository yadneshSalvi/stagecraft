# Domain model and decision rules

STAGECRAFT connects an exact, performer-specific appearance decision to physical inventory, a schedule and a crew handoff. Source portraits, provider previews, appearance approvals, fittings and supplier confirmations are separate evidence. None creates the others implicitly.

The pure domain engine lives in `src/lib/domain/`. It performs no network, database or paid provider operations. `applyCommand` returns a new serializable graph, one new production revision and one audit event, leaving its input unchanged. The server persists revisions separately. Rejected commands throw a `DomainError` with a code, HTTP status and actionable message before returning any changed graph.

## Identity and time

A character is a story role; a performer is the consenting image subject. A look binds an exact recipe revision to a character, performer and scene scope. A scene has a story day and exact script source ranges. A scheduled occurrence has independent production order, times and location. Shooting order never rewrites story chronology.

A physical unit has its own identity and fact version. Two garments sharing a catalogue image remain separate physical instances. Windows include a UTC offset, and the production's IANA timezone defines same-day continuous wear.

The authored synthetic example, **THE LAST LIGHT**, has seven scenes, three story days, five adult fictional roles, a replacement performer and six synthetic units. Nora's C-014 coat repeats in scenes 01, 04 and 07. New examples schedule shoots nine through eleven days after creation; saved productions retain their dates. The fixture seeds no approvals, fittings or invented provider results. The backend can attach separately recorded, genuine provider outputs.

## Script and appearance lineage

Script adoption verifies permission, SHA-256, source bounds and mappings. Reimport reconciles stable scene and requirement IDs. Reviewed titles, story days and requirement wording survive extraction. Source ranges rebase to incoming text; changed evidence requests review. An unmatched reviewed cue remains an unreviewed suggestion with an empty evidence range instead of claiming support from the new script. Removing a referenced scene is blocked until its dependencies are remapped. Script text is data and cannot invoke commands.

A preview identifies its exact look revision, performer, capture version, units, source and input fingerprint. The browser-safe SHA-256 covers recipe/source inputs. Price and availability changes do not rewrite pictured evidence; source-asset changes advance affected recipes. An approval names one exact preview, its scene scope, reviewer, rationale and time. A new output inherits no approval. Recast and recipe edits invalidate related actor evidence while preserving unrelated approvals.

Private photo attachment marks the performer as user-provided, removes inherited public-demo permission and requires scoped processing consent. Withdrawal blocks new previews, approvals and image-bearing packs. The server enforces stored-asset access and deletion. A preview never confirms physical fit or preparation duration.

## Separate beauty detail

An optional face capture has its own image, asset, version, provenance and consent. It is never silently substituted for a body image or recomposed into it. An optional beauty recipe has separate versions, previews and approvals. If no beauty recipe is configured, makeup/hair remains unrendered crew direction; the garment output does not imply those effects were generated.

Editable beauty parameters are lip colour/intensity and blush colour/intensity. The render policy fixes both skin-smoothing settings to zero and preserves lip morphology. The beauty fingerprint covers the exact face source and beauty parameters, excluding body source, garments and garment revision. An approval identifies one exact beauty output, performer, face version, beauty revision and scene scope. Another output inherits no approval.

| Change                               | Garment evidence                        | Beauty evidence               |
| ------------------------------------ | --------------------------------------- | ----------------------------- |
| Garment substitution                 | New output/approval required            | Preserved                     |
| Beauty recipe                        | Preserved                               | New output/approval required  |
| Body capture                         | New output/approval required            | Preserved                     |
| Face capture                         | Preserved                               | New output/approval required  |
| Recast                               | Invalidated for the old actor           | Invalidated for the old actor |
| Whole-performer consent withdrawal   | Blocked                                 | Blocked                       |
| Face-only consent withdrawal         | Preserved                               | Blocked                       |
| Relevant direction/story requirement | Approval needs review                   | Approval needs review         |
| Production schedule                  | Appearance retained; operations checked | Appearance retained           |

Beauty evidence is frozen separately within a look and its face-source snapshot. Configured but unapproved beauty prevents readiness and adds a working-pack warning. New packs after face-only withdrawal retain permitted garment images and omit revoked face/beauty pixels. Historical snapshots remain reproducible; online images still require current source-specific permission.

`Scene.storyDaySource` separately distinguishes days stated by the script, unspecified provisional chronology and reviewed days. A numeric placeholder does not establish a story fact. Review records the day source; a changed explicit day requests review while retaining the prior correction.

## Allocation and checking

The implemented solver is `stagecraft-bounded-exact/1`, a bounded deterministic exact TypeScript search. It does not run CP-SAT. Its lexicographic objective satisfies hard constraints, minimizes explicitly approved unit substitutions, then minimizes the production-window quote total. Each selected physical unit is charged once in integer minor currency units. This is a planning quote total, not actual spend or a payment/tax ledger.

Hard checks cover demand completeness, physical-unit identity, availability, unavailable/maintenance stock, category, recorded alteration requirements, overlapping use/preparation, overlapping performer attendance and hard budget. Allowed alternatives are explicit unit IDs. An allocation containing an alternative cannot be adopted into the existing pictured recipe: the user must explicitly revise or repair the recipe. The solver never silently chooses an artistic replacement.

A separate checker reconstructs coverage, exact intervals, facts, costs and pairwise unit overlaps before adoption. Demand normalization and transition definitions are shared domain rules; a separate brute-force test oracle also verifies 192 small problems.

Recorded preparation occupies a unit before use. Consecutive same-performer appearances in the exact same look, on one local day and at one location, retain custody through gaps and prepare once unless a reset transition is recorded. The unit cannot be borrowed during that gap. An earlier scene edit invalidates a later continuous-wear interval when its boundary changes. Unknown preparation remains an evidence gap and is never asserted to take zero minutes.

Live changes are directional and tied to exact performer/occurrence pairs. Reverse timing is not reused. Recorded durations must fit the actual gap. A bounded nonpreemptive crew checker tests shared dresser/station capacity, including staggered changes. It handles at most twelve tasks per resource and 30,000 nodes; it proves existence without persisting a detailed crew call-time schedule.

The allocation engine reviews at most 100 demands with a default 50,000-node bound:

| Status          | Meaning                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `OPTIMAL`       | Exhaustive search proved the declared objective under recorded constraints; the assignment passed checking. |
| `FEASIBLE`      | A checked assignment exists, but the bound prevents an optimality claim.                                    |
| `INFEASIBLE`    | Recorded hard constraints or exhaustive permitted combinations rule out a plan. No constraint is relaxed.   |
| `UNKNOWN`       | Scope, incomplete demand or the search bound prevents a checked conclusion.                                 |
| `INVALID_INPUT` | Missing or malformed facts prevent a valid solve.                                                           |

The shared contract reserves `TIME_LIMIT`; this node-bounded engine currently uses the statuses above. An optimal quote plan can remain operationally provisional. Missing travel, measurements, preparation, fitting and supplier evidence remain `unverified`. Transport is not optimized or assumed instantaneous. Measurement comparisons are provisional screens; the engine invents no allowance or alteration.

## Proposals, sourcing and packs

Repairs bind a base revision and canonical input fingerprint containing inventory fact versions. Adoption requires the exact current revision and facts, then rechecks feasibility. Any intervening accepted command stales a proposal; there is no silent rebase.

A garment repair changes affected recipes, blocks dependent assignments, flags its sourcing and supersedes relevant packs. Historical renders remain comparisons. A recast retains direction, story requirements and item/date reservations while invalidating actor-specific appearance and fitting evidence. Another performer's fitting on a shared unit is retained but does not establish fit for the replacement.

Repair adoption creates an unapproved recipe revision. Fresh exact output and explicit approval follow. The present schema does not store a separately rendered candidate recipe before adoption; the interface must show the outstanding review.

Sourcing progresses through `draft → requested → held → confirmed → received → returned`, with optional direct requested-to-confirmed, decline and cancellation paths. Each recorded transition needs a named operator, evidence and external reference. Holds/confirmations require current sourced quotes and covering availability. Missing price is not free stock. Confirmation, receipt and return are separate stages; none manufactures a fitting. Synthetic requests cannot become real supplier outcomes. These commands record evidence and do not send external messages.

Readiness evaluates the current clock, so a quote can expire without a production edit. It requires reviewed source requirements, complete cast/looks, exact approvals, a checked adopted allocation, fitting/supplier evidence, no unresolved operational findings and current handoff coverage. Provisional or synthetic evidence cannot establish physical readiness.

A pack freezes relevant character names/directions, looks and exact evidence, performer sources, units, occurrences, scenes, sourcing, allocations, transitions, currency, timezone, budget and script. It records source revision/time. Outstanding work produces an explicit **Working pack** with warnings. `current` means not superseded; it does not mean ready. Relevant changes supersede online packs without rewriting their snapshots. Printed/downloaded files retain their frozen revision.

The model does not independently verify manually asserted external events, book suppliers, calculate cancellation fees, optimize transport, reserve stock across unrelated productions or implement payments. Synthetic and AI evaluation is software evidence, not participant research, physical fitting or commercial impact.
