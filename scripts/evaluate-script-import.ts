import nextEnv from "@next/env";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { createBlankProduction } from "../src/lib/domain";
import {
  compileExtraction,
  extractWithModel,
} from "../src/lib/server/script-extraction";
import {
  sourceComparisonKey,
  sourceQuoteCandidates,
} from "../src/lib/server/script-grounding";
import { ApiError } from "../src/lib/server/errors";
const root = resolve(import.meta.dirname, "..");
nextEnv.loadEnvConfig(root);
const confirmed = process.argv.slice(2).includes("--confirm-model");
if (process.argv.slice(2).some((argument) => argument !== "--confirm-model"))
  throw new Error("Unsupported evaluation option.");
const source = await readFile(
  join(root, "tests/fixtures/earnest-act-one.txt"),
  "utf8",
);
const sourceHash = createHash("sha256").update(source).digest("hex");
if (
  sourceHash !==
  "75cc014004823ef9742ec0517a4185496f90520602138401f543e39b45a99fef"
)
  throw new Error("Evaluation source differs from the published fixture.");
const sourceEvidence = {
  title: "The Importance of Being Earnest — First Act",
  sha256: sourceHash,
  unicodeCharacters: [...source].length,
  lfNormalizedUnicodeCharacters: [...source.replace(/\r\n/g, "\n")].length,
  utf16CodeUnits: source.length,
  utf8Bytes: Buffer.byteLength(source),
  words: source.trim().split(/\s+/u).length,
};
if (!confirmed) {
  console.log(
    JSON.stringify({
      mode: "dry_run",
      source: sourceEvidence,
      modelRequests: 0,
      youcamTasks: 0,
    }),
  );
  process.exit(0);
}
if (!process.env.GEMINI_API_KEY || !process.env.AI_MODEL_GEMINI)
  throw new Error("Configure Gemini before the explicit model evaluation.");
const privateDir = join(
  root,
  "artifacts/private/script-import-review",
  `attempt-${Date.now()}`,
);
await mkdir(privateDir, { recursive: true });
const started = performance.now();
try {
  const result = await extractWithModel(source);
  const compiled = compileExtraction(
    createBlankProduction("script-evaluation", "Earnest import evaluation"),
    source,
    result.raw,
  );
  const cues = compiled.scenes.flatMap((scene) => scene.requirements);
  const rawQuotes = new Set(
    (result.raw as { scenes: { requirements: { quote: string }[] }[] }).scenes
      .flatMap((scene) => scene.requirements)
      .flatMap((cue) =>
        sourceQuoteCandidates(cue.quote).map((candidate) =>
          sourceComparisonKey(candidate.quote),
        ),
      ),
  );
  const sceneSpansValid = compiled.scenes.every(
    (scene) =>
      scene.sourceStart >= 0 &&
      scene.sourceEnd <= source.length &&
      scene.sourceEnd > scene.sourceStart &&
      source
        .slice(scene.sourceStart, scene.sourceEnd)
        .startsWith(scene.heading),
  );
  const cueSpansValid = compiled.scenes.every((scene) =>
    scene.requirements.every(
      (cue) =>
        cue.sourceStart >= scene.sourceStart &&
        cue.sourceEnd <= scene.sourceEnd &&
        cue.sourceEnd > cue.sourceStart &&
        rawQuotes.has(
          sourceComparisonKey(source.slice(cue.sourceStart, cue.sourceEnd)),
        ) &&
        (!cue.explicit ||
          cue.text === source.slice(cue.sourceStart, cue.sourceEnd)),
    ),
  );
  const ratio = compiled.grounding.modelCueCount
    ? compiled.grounding.groundedCueCount / compiled.grounding.modelCueCount
    : null;
  const report = {
    observedAt: new Date().toISOString(),
    provider: "Gemini",
    model: result.model,
    modelAttempts: 1,
    youcamTasks: 0,
    productionMutations: 0,
    source: sourceEvidence,
    latencyMs: Math.round(performance.now() - started),
    characterCount: compiled.characters.length,
    ...compiled.grounding,
    groundedCueFraction: ratio,
    sceneSpansValid,
    cueSpansValid,
    allUnreviewed:
      compiled.scenes.every((scene) => !scene.reviewed) &&
      cues.every((cue) => !cue.reviewed),
    noticeCount: compiled.notices.length,
    passed: ratio !== null && ratio >= 0.9 && sceneSpansValid && cueSpansValid,
  };
  await writeFile(
    join(privateDir, "raw-model.json"),
    JSON.stringify(result, null, 2) + "\n",
    { mode: 0o600 },
  );
  await writeFile(
    join(privateDir, "compiled.json"),
    JSON.stringify(compiled, null, 2) + "\n",
    { mode: 0o600 },
  );
  await writeFile(
    join(privateDir, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  await mkdir(join(root, "docs/evidence"), { recursive: true });
  const evidencePath = join(root, "docs/evidence/script-import-review.json");
  let previous: { attempts: unknown[] } = { attempts: [] };
  try {
    previous = JSON.parse(await readFile(evidencePath, "utf8"));
  } catch {}
  const attempts = [
    ...(previous.attempts || []),
    { ...report, groundingPolicy: "contiguous-excerpt-repair-v2" },
  ];
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        source: sourceEvidence,
        modelAttempts: attempts.length,
        youcamTasks: 0,
        attempts,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify(report));
} catch (error) {
  const report = {
    observedAt: new Date().toISOString(),
    provider: "Gemini",
    modelAttempts: 1,
    youcamTasks: 0,
    source: sourceEvidence,
    latencyMs: Math.round(performance.now() - started),
    passed: false,
    errorCode: error instanceof ApiError ? error.code : "EVALUATION_FAILED",
  };
  await writeFile(
    join(privateDir, "failed-report.json"),
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
  console.log(JSON.stringify(report));
  process.exitCode = 1;
}
