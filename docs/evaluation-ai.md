# Independent AI review of recorded costume previews

On October 31, 2026, Gemini `gemini-4-argon` and OpenAI `gpt-6-astra` each reviewed seven genuine YouCam Clothes V4 outputs and one deliberately unchanged source image. All cast and garment inputs were fictional AI-created artwork. These are qualitative model observations, not human ground truth, validated accuracy, or physical fitting results.

## Method and measured execution

For each case, the reviewer received three images in a fixed order: the original cast source, the intended garment reference, and the candidate preview. The harness verified each public file's SHA-256, normalized image orientation and dimensions, and requested constrained JSON about visible garment features, discrepancies, image artifacts, and limitations. OpenAI used high reasoning effort. Neither model could approve a look or modify production state.

All **16 of 16 model requests completed** with schema-valid responses. Request latency ranged from **8.410 to 26.805 seconds**, with a **14.510-second median** in this run. This measures these review requests only, not YouCam generation latency or representative application performance.

Both reviewers classified the unchanged-source control as `missing_intended_garment`. Across the fourteen critiques of actual provider outputs, eight recommended visual review with the garment present and six called for closer inspection of visible discrepancies. Those categories are suggestions, not pass/fail labels or an accuracy percentage. Two cases produced different recommendations between models.

## Case findings

| Preview                  | Gemini recommendation    | OpenAI recommendation    | What to inspect                                                       |
| ------------------------ | ------------------------ | ------------------------ | --------------------------------------------------------------------- |
| Nora / oxblood coat      | Usable for visual review | Usable for visual review | Worn hem, fitted waist, velvet highlights and creasing                |
| Elias / ivory shirt      | Review discrepancies     | Review discrepancies     | Open collar, turned-back cuffs, smoother weave, dark lower-torso band |
| Mae / midnight dress     | Usable for visual review | Usable for visual review | Neckline, sleeve extent, skirt folds and drape                        |
| Julian / olive jacket    | Usable for visual review | Review discrepancies     | Open jacket, mottled texture, changed T-shirt presentation            |
| Ruth / ivory shirt       | Review discrepancies     | Review discrepancies     | Tucked shirt, open collar, fuller sleeves, changed trouser waist      |
| Nora / charcoal coat     | Usable for visual review | Review discrepancies     | Open front, lapel presentation, fabric markings                       |
| Nora / replacement cast  | Usable for visual review | Usable for visual review | Velvet highlights, creasing, button detail                            |
| Unchanged source control | Missing intended garment | Missing intended garment | The original sweater remains; the coat is absent                      |

The orchestration agent also visually inspected the seven actual outputs as a contact sheet, alongside the source artwork. The recorded manifest now carries short inspection notes so the application can surface these differences before a person approves a look. No new YouCam task was purchased to conceal these variations.

## Reproduction and artifacts

- [Sanitized observations](evidence/ai-preview-review.json) include every model's structured response, model name, observation time, request duration, and the evaluated manifest hash.
- [Source artwork provenance](../public/assets/provenance.json) contains prompts, model, dimensions and hashes.
- [Recorded provider manifest](../public/examples/recorded-previews.json) links exact source, garment and output hashes to sanitized successful task evidence.
- [Review harness](../scripts/evaluate-recorded-previews.ts) runs with `pnpm exec tsx scripts/evaluate-recorded-previews.ts --confirm-live`. Without that flag it performs a dry run. `--case <recorded-id>` selects one case; `negative-unchanged-source` selects the control.

The evaluated manifest SHA-256 was `8f2f77436f12cace8813bee7ea5cd9e06ab0cd12f38881d30adb45f530954a71`. Its inspection-note text was updated after evaluation; source, garment and output image bytes were unchanged. Re-running model evaluation can produce different observations and consumes the configured Gemini/OpenAI API quota, but no YouCam credits.

## Limits

This is one small, curated synthetic scenario. The two models are not independent human annotators and their agreement does not establish truth. Clothing scale in an isolated garment photo cannot establish its physical length on a performer. No fit, comfort, movement, measurement accuracy, supplier confirmation, real performer outcome, adoption, or time savings were measured. The application preserves explicit approval and separate operational evidence for those decisions.

## Additional five-garment review — 1 November 2026 IST

The same two models and constrained review protocol evaluated the five additional Clothes V4 recordings and a second unchanged-source control. All **12 of 12 requests completed** with schema-valid responses: five Gemini critiques and five OpenAI critiques of actual renders, plus one control per model. Durations were **8.273–32.864 seconds**, median **12.738 seconds**. These are model-review request times, not provider generation or crew task times. No YouCam units were used by this evaluation.

Both models identified the missing coat in the unchanged-source control. Of the ten actual-output critiques, five recommended visual review and five recommended closer inspection of visible discrepancies. Three of the five garment cases produced different recommendations between models. No recommendation was applied as an appearance approval.

| Additional preview       | Gemini recommendation    | OpenAI recommendation    | Specific inspection point                                                  |
| ------------------------ | ------------------------ | ------------------------ | -------------------------------------------------------------------------- |
| Celeste / charcoal coat  | Usable for visual review | Review discrepancies     | Open front, more crosshatched texture, closure orientation                 |
| Ada / burgundy coat      | Usable for visual review | Review discrepancies     | Open front, coarser mottling, smaller glossy buttons, closure orientation  |
| Celeste / burgundy coat  | Usable for visual review | Usable for visual review | Open front, narrower-looking lapels, coarser mottling                      |
| Mae / ivory blouse       | Usable for visual review | Review discrepancies     | Open collar, tucked hem, smoother fabric and faint buttons                 |
| Julian / rust jacket     | Review discrepancies     | Review discrepancies     | White undershirt changes to tan with a lower neckline; softer jacket weave |
| Unchanged source control | Missing intended garment | Missing intended garment | Charcoal coat absent; original cream top remains                           |

The root agent separately inspected all eleven new garment, makeup, hair and necklace outputs. The new garment manifest now surfaces the specific observations above. The hair-colour result requested as Chocolate Brown reads plum; its manifest records that discrepancy without changing the requested recipe or output. The six face-detail outputs were visually inspected by the agent but were **not** included in this two-model garment evaluation.

- [All 12 new observations](evidence/ai-review-preview-review.json), including disagreements and limitations.
- [Additional garment manifest](../public/examples/recorded-review-previews.json), with inspection notes updated after evaluation and all image hashes unchanged.
- Reproduce with `pnpm exec tsx scripts/evaluate-recorded-previews.ts --review-matrix --confirm-live`; `--case` also works within this matrix. All original evaluation records remain intact.

Together, the two dated evaluations contain 28 model observations across twelve actual garment outputs and two unchanged-source controls. This is a small qualitative synthetic evaluation, not an accuracy score, human validation, or a reason to waive visual review.
