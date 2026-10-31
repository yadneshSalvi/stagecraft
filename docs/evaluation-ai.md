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
