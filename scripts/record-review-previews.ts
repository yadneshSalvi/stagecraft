/** Exact approved matrix only. Durable intents; no ambiguous task is resubmitted. */
import nextEnv from "@next/env";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { z } from "zod";
import type {
  BeautyRecipe,
  DetailRecipe,
  GarmentCategory,
} from "../src/lib/types";
import { readFixtureTransport } from "../src/lib/server/fixture-transports";
import { sha256Bytes } from "../src/lib/server/images";
import { readLimited } from "../src/lib/server/assets";
import {
  registerFile,
  uploadRegisteredFile,
  submitClothesTask,
  submitMakeupTask,
  submitHairColorTask,
  submitNecklaceTask,
  getClothesTask,
  getMakeupTask,
  getHairColorTask,
  getNecklaceTask,
  downloadOutput,
  getCreditBalance,
  readFeatureCosts,
  YouCamError,
  type YouCamOptions,
} from "../src/lib/youcam";
import { clothesPayload } from "../src/lib/youcam/recipes";
import { makeupPayload, makeBeautyEffects } from "../src/lib/youcam/beauty";
import { hairColorPayload, necklacePayload } from "../src/lib/youcam/details";
import {
  RecordingManifestSchema,
  type Recording,
} from "../src/lib/youcam/recorded";
import {
  BeautyRecordingManifestSchema,
  type BeautyRecording,
} from "../src/lib/youcam/recorded-beauty";
import {
  DetailRecordingManifestSchema,
  type DetailRecording,
} from "../src/lib/youcam/recorded-details";
import {
  parseRecordingLedger,
  RecordingLedgerSchema,
  maySubmitRecording,
  type RecordingLedger,
} from "../src/lib/youcam/recording-ledger";
const APPROVED =
  "d2d1aa574fb3772f8bb5cff4c3edf377a284f64b3ed1820e2179de067f28a497";
const root = resolve(import.meta.dirname, "..");
nextEnv.loadEnvConfig(root);
const args = process.argv.slice(2);
if (
  args.some(
    (argument) =>
      !["--confirm-live", "--after-necklace-inspection"].includes(argument),
  )
)
  throw new Error("Unsupported recording option.");
const live = args.includes("--confirm-live");
type Image = {
  path: string;
  profile: "garment" | "face";
  sourceSha256: string;
  transportSha256: string;
  width: number;
  height: number;
  bytes: number;
};
type Task = {
  id: string;
  kind: "garment" | "beauty" | "hair_color" | "necklace";
  lookIds: string[];
  storyDays: number[];
  performerId: string;
  unitIds?: string[];
  category?: GarmentCategory;
  recipe?: BeautyRecipe | DetailRecipe;
  source: Image;
  reference?: Image;
  payloadTemplate: unknown;
  providerInputHash: string;
  estimatedUnits: number;
};
const matrix = JSON.parse(
  await readFile(
    join(root, "artifacts/private/review/recording-matrix.json"),
    "utf8",
  ),
);
const { matrixSha256, taskCount, estimatedUnits, providerCalls, ...plan } =
  matrix;
if (
  matrixSha256 !== APPROVED ||
  sha256Bytes(Buffer.from(JSON.stringify(plan))) !== APPROVED ||
  taskCount !== 11 ||
  estimatedUnits !== 16 ||
  providerCalls !== 0
)
  throw new Error("Recording matrix differs from the exact authorized plan.");
const tasks: Task[] = matrix.tasks;
const photos = new Map<string, Buffer>();
for (const task of tasks) {
  for (const image of [task.source, task.reference].filter(
    (item): item is Image => !!item,
  )) {
    const raw = await readFile(join(root, "public", image.path));
    const photo = await readFixtureTransport(
      image.path,
      raw,
      image.profile,
      root,
    );
    if (
      sha256Bytes(raw) !== image.sourceSha256 ||
      photo.sha256 !== image.transportSha256 ||
      photo.width !== image.width ||
      photo.height !== image.height ||
      photo.bytes.length !== image.bytes
    )
      throw new Error(
        "A recording input differs from the approved frozen transport.",
      );
    photos.set(`${image.profile}:${image.path}`, photo.bytes);
  }
  const payload =
    task.kind === "garment"
      ? clothesPayload("SOURCE_FILE", "REFERENCE_FILE", task.category!)
      : task.kind === "beauty"
        ? makeupPayload("SOURCE_FILE", task.recipe as BeautyRecipe)
        : task.kind === "hair_color"
          ? hairColorPayload("SOURCE_FILE", task.recipe as DetailRecipe)
          : necklacePayload(
              "SOURCE_FILE",
              "REFERENCE_FILE",
              task.recipe as DetailRecipe,
            );
  if (JSON.stringify(payload) !== JSON.stringify(task.payloadTemplate))
    throw new Error("Provider payload differs from the authorized recipe.");
}
if (!live) {
  console.log(
    JSON.stringify({
      mode: "dry_run",
      matrixSha256: APPROVED,
      tasks: tasks.length,
      estimatedUnits: 16,
      providerCalls: 0,
    }),
  );
  process.exit(0);
}
const dir = join(root, "artifacts/private/recorded-review");
await mkdir(dir, { recursive: true, mode: 0o700 });
const ledgerPath = join(dir, "run.json");
let ledger: RecordingLedger;
try {
  ledger = parseRecordingLedger(
    await readFile(ledgerPath, "utf8"),
    APPROVED,
    tasks.map((task) => ({ id: task.id, inputHash: task.providerInputHash })),
  );
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  ledger = {
    version: 1,
    matrixSha256: APPROVED,
    costsVerified: false,
    items: tasks.map((task) => ({
      id: task.id,
      inputHash: task.providerInputHash,
      state: "planned",
      files: {},
    })),
  };
}
async function save() {
  RecordingLedgerSchema.parse(ledger);
  await writeFile(ledgerPath + ".next", JSON.stringify(ledger, null, 2), {
    mode: 0o600,
  });
  await rename(ledgerPath + ".next", ledgerPath);
}
async function publish() {
  for (const [filename, schema, operation] of [
    ["recorded-review-previews.json", RecordingManifestSchema, "ai_clothes_v4"],
    [
      "recorded-review-beauty-previews.json",
      BeautyRecordingManifestSchema,
      "makeup_vto_v1",
    ],
    ["recorded-detail-previews.json", DetailRecordingManifestSchema, "detail"],
  ] as const) {
    const records = ledger.items
      .flatMap((item) => (item.record ? [item.record] : []))
      .filter((record) =>
        operation === "detail"
          ? ["hair_color_v2", "necklace_v2"].includes(
              (record as { operation: string }).operation,
            )
          : (record as { operation: string }).operation === operation,
      );
    const manifest = schema.parse({ version: 1, previews: records });
    try {
      const previous = schema.parse(
        JSON.parse(
          await readFile(join(root, "public/examples", filename), "utf8"),
        ),
      );
      for (const record of manifest.previews) {
        const reviewed = previous.previews.find(
          (item) =>
            item.id === record.id &&
            item.inputHash === record.inputHash &&
            item.outputSha256 === record.outputSha256,
        );
        if (reviewed) record.inspectionNotes = reviewed.inspectionNotes;
      }
    } catch {
      /* New files only; original recording manifests are never rewritten. */
    }
    await writeFile(
      join(root, "public/examples", filename) + ".next",
      JSON.stringify(manifest, null, 2) + "\n",
    );
    await rename(
      join(root, "public/examples", filename) + ".next",
      join(root, "public/examples", filename),
    );
  }
}
const currentBalance = await getCreditBalance({ timeoutMs: 5000 });
if (ledger.balanceBefore === undefined) {
  ledger.balanceBefore = currentBalance;
  await save();
}
const remainingUnits = ledger.items.reduce(
  (sum, item, index) =>
    sum + (maySubmitRecording(item) ? tasks[index].estimatedUnits : 0),
  0,
);
if (currentBalance < 200 + remainingUnits)
  throw new Error(
    "The authorized matrix would cross the protected balance floor.",
  );
if (!ledger.costsVerified || remainingUnits > 0) {
  const required = new Map([
    ["cloth-v4", 2],
    ["makeup-vto", 1],
    ["hair-color", 1],
    ["2d-vto/necklace", 1],
  ]);
  const verified = new Set<string>();
  let token: string | undefined;
  for (let page = 0; page < 20; page++) {
    const costs = z
      .object({
        status: z.literal(200),
        result: z.object({
          next_token: z.string().nullable().optional(),
          skus: z.array(
            z.object({ amount: z.number(), run_task_url: z.string() }),
          ),
        }),
      })
      .parse(await readFeatureCosts(token));
    for (const [operation, expected] of required)
      for (const sku of costs.result.skus)
        if (sku.run_task_url.includes(operation)) {
          if (sku.amount !== expected)
            throw new Error(
              "Provider cost differs from the authorized matrix.",
            );
          verified.add(operation);
        }
    token = costs.result.next_token || undefined;
    if (!token) break;
  }
  if (verified.size !== required.size)
    throw new Error(
      "All authorized feature costs must be verified before submission.",
    );
  ledger.costsVerified = true;
  await save();
}
async function prepareFiles(
  item: RecordingLedger["items"][number],
  task: Task,
) {
  for (const role of ["source", "reference"] as const) {
    const image = role === "source" ? task.source : task.reference;
    if (!image) continue;
    const file = (item.files[role] ||= { uploaded: false });
    if (!file.registration) {
      if (file.intentAt)
        throw new Error(
          "File registration was interrupted; reconcile its saved intent before continuing.",
        );
      file.intentAt = new Date().toISOString();
      await save();
      file.registration = await registerFile({
        contentType: "image/jpeg",
        byteLength: image.bytes,
        fileName: `${task.id}-${role}.jpg`,
      });
      await save();
    }
    if (!file.uploaded) {
      await uploadRegisteredFile(
        file.registration,
        photos.get(`${image.profile}:${image.path}`)!,
      );
      file.uploaded = true;
      await save();
    }
  }
}
function necklaceOptions(task: Task): YouCamOptions {
  return {
    fetch: async (input, init) => {
      const response = await globalThis.fetch(input, init);
      const body: unknown = await response
        .clone()
        .json()
        .catch(() => null);
      const object =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as Record<string, unknown>)
          : {};
      const data =
        object.data &&
        typeof object.data === "object" &&
        !Array.isArray(object.data)
          ? (object.data as Record<string, unknown>)
          : {};
      const results = data.results;
      const shape = {
        httpStatus: response.status,
        topKeys: Object.keys(object),
        dataKeys: Object.keys(data),
        taskStatus: [
          "running",
          "queued",
          "processing",
          "success",
          "error",
        ].includes(String(data.task_status))
          ? data.task_status
          : "unknown",
        resultsType:
          results === null
            ? "null"
            : Array.isArray(results)
              ? "array"
              : typeof results,
        resultsKeys:
          results && typeof results === "object" && !Array.isArray(results)
            ? Object.keys(results)
            : [],
        urlPresent: !!(
          results &&
          typeof results === "object" &&
          "url" in results &&
          typeof results.url === "string"
        ),
      };
      await writeFile(
        join(dir, `${task.id}.poll-shape.json`),
        JSON.stringify(shape, null, 2) + "\n",
        { mode: 0o600 },
      );
      return response;
    },
  };
}
async function storeResult(
  task: Task,
  item: RecordingLedger["items"][number],
  outputUrl: string,
) {
  const raw = await readLimited(await downloadOutput(outputUrl), 20_000_000);
  const metadata = await sharp(raw, {
    limitInputPixels: 32_000_000,
  }).metadata();
  if (
    !["jpeg", "png", "webp"].includes(metadata.format || "") ||
    (metadata.width || 0) < 384 ||
    (metadata.height || 0) < 384 ||
    (metadata.pages || 1) !== 1
  )
    throw new Error("The provider output is not an inspectable still image.");
  await writeFile(join(dir, `${task.id}.original`), raw, { mode: 0o600 });
  await writeFile(
    join(dir, `${task.id}.original.json`),
    JSON.stringify({
      sha256: sha256Bytes(raw),
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
    }),
    { mode: 0o600 },
  );
  const output = await sharp(raw, { limitInputPixels: 32_000_000 })
    .webp({ quality: 92 })
    .toBuffer();
  const folder =
    task.kind === "garment"
      ? "previews"
      : task.kind === "beauty"
        ? "beauty"
        : "details";
  const imagePath = `/examples/${folder}/${task.id}.webp`;
  await mkdir(join(root, "public/examples", folder), { recursive: true });
  await writeFile(join(root, "public", imagePath), output);
  const common = {
    id: `recorded-${task.id}`,
    lookId: task.lookIds[0],
    performerId: task.performerId,
    imagePath,
    sourceImagePath: task.source.path,
    inputHash: task.providerInputHash,
    sourceSha256: task.source.sourceSha256,
    sourceUploadSha256: task.source.transportSha256,
    outputSha256: sha256Bytes(output),
    provider: "YouCam",
    recordedAt: new Date().toISOString(),
    taskEvidence: {
      taskIdHash: sha256Bytes(Buffer.from(item.taskId!)),
      status: "success",
    },
    outputTransformation: "webp-reencode/q92;no-retouch",
  };
  let record: Recording | BeautyRecording | DetailRecording;
  if (task.kind === "garment")
    record = RecordingManifestSchema.parse({
      version: 1,
      previews: [
        {
          ...common,
          captureVersion: 1,
          recipeRevision: 1,
          unitIds: task.unitIds,
          category: task.category,
          garmentImagePath: task.reference!.path,
          garmentSha256: task.reference!.sourceSha256,
          garmentUploadSha256: task.reference!.transportSha256,
          operation: "ai_clothes_v4",
          estimatedUnits: 2,
          inspectionNotes:
            "Recorded YouCam garment render. Inspect drape, cuffs and closure against the reference before appearance approval.",
        },
      ],
    }).previews[0];
  else if (task.kind === "beauty")
    record = BeautyRecordingManifestSchema.parse({
      version: 1,
      previews: [
        {
          ...common,
          faceCaptureVersion: 1,
          beautyRevision: 1,
          recipe: task.recipe,
          effects: makeBeautyEffects(task.recipe as BeautyRecipe),
          operation: "makeup_vto_v1",
          estimatedUnits: 1,
          inspectionNotes:
            "Recorded YouCam finale lip and blush detail. Both smoothing fields and lip morphology were set to zero; inspect the actual result before approval.",
        },
      ],
    }).previews[0];
  else
    record = DetailRecordingManifestSchema.parse({
      version: 1,
      previews: [
        {
          ...common,
          kind: task.kind,
          faceCaptureVersion: 1,
          detailRevision: 1,
          recipe: task.recipe,
          ...(task.reference
            ? {
                referenceImagePath: task.reference.path,
                referenceSha256: task.reference.sourceSha256,
                referenceUploadSha256: task.reference.transportSha256,
              }
            : {}),
          operation:
            task.kind === "hair_color" ? "hair_color_v2" : "necklace_v2",
          estimatedUnits: 1,
          inspectionNotes:
            task.kind === "hair_color"
              ? "Recorded YouCam hair-colour detail from the separate face source; inspect colour and facial/hair boundaries before approval."
              : "Recorded YouCam necklace detail with explicit background removal; inspect pendant shape, chain placement and neck edges before approval.",
        },
      ],
    }).previews[0];
  item.record = record;
  item.state = "success";
  delete item.errorCode;
  await save();
  await publish();
  console.log(
    JSON.stringify({
      id: task.id,
      state: "success",
      estimatedUnits: task.estimatedUnits,
      imagePath,
    }),
  );
}
let pausedForInspection = false;
taskLoop: for (const [index, task] of tasks.entries()) {
  const item = ledger.items[index];
  if (["success", "failed", "ambiguous"].includes(item.state)) continue;
  if (item.submissionStartedAt && !item.taskId) {
    item.state = "ambiguous";
    item.errorCode = "unknown_submission";
    await save();
    break;
  }
  if (
    task.id === "review-nora-celeste-necklace" &&
    maySubmitRecording(item) &&
    !args.includes("--after-necklace-inspection")
  ) {
    pausedForInspection = true;
    break;
  }
  if (maySubmitRecording(item)) {
    try {
      await prepareFiles(item, task);
    } catch (error) {
      item.state = "failed";
      item.errorCode =
        error instanceof YouCamError
          ? error.code
          : "file_preparation_interrupted";
      await save();
      break;
    }
    item.state = "submitting";
    item.submissionStartedAt = new Date().toISOString();
    await save();
    try {
      const sourceFileId = item.files.source!.registration!.fileId;
      const result =
        task.kind === "garment"
          ? await submitClothesTask({
              sourceFileId,
              garmentFileId: item.files.reference!.registration!.fileId,
              category: task.category!,
            })
          : task.kind === "beauty"
            ? await submitMakeupTask({
                sourceFileId,
                recipe: task.recipe as BeautyRecipe,
              })
            : task.kind === "hair_color"
              ? await submitHairColorTask({
                  sourceFileId,
                  recipe: task.recipe as DetailRecipe,
                })
              : await submitNecklaceTask({
                  sourceFileId,
                  referenceFileId: item.files.reference!.registration!.fileId,
                  recipe: task.recipe as DetailRecipe,
                });
      item.taskId = result.taskId;
      item.state = "polling";
      await save();
    } catch (error) {
      item.state =
        !(error instanceof YouCamError) || error.submissionUncertain
          ? "ambiguous"
          : "failed";
      item.errorCode =
        error instanceof YouCamError ? error.code : "unknown_submission";
      await save();
      break;
    }
  }
  for (let attempt = 0; attempt < 40 && item.taskId; attempt++) {
    await delay(attempt < 3 ? 10_000 : 15_000);
    try {
      const status =
        task.kind === "garment"
          ? await getClothesTask(item.taskId)
          : task.kind === "beauty"
            ? await getMakeupTask(item.taskId)
            : task.kind === "hair_color"
              ? await getHairColorTask(item.taskId)
              : await getNecklaceTask(item.taskId, necklaceOptions(task));
      if (status.state === "running") continue;
      if (status.state === "error") {
        item.state = "failed";
        item.errorCode = status.code;
        await save();
        break taskLoop;
      }
      await storeResult(task, item, status.outputUrl);
      break;
    } catch (error) {
      item.errorCode =
        error instanceof YouCamError ? error.code : "output_unavailable";
      await save();
      if (!(error instanceof YouCamError) || !error.retryable) break taskLoop;
    }
  }
  if (item.state !== "success") break;
}
ledger.balanceAfter = await getCreditBalance({ timeoutMs: 5000 });
await save();
await publish();
console.log(
  JSON.stringify({
    matrixSha256: APPROVED,
    submitted: ledger.items.filter((item) => item.submissionStartedAt).length,
    succeeded: ledger.items.filter((item) => item.state === "success").length,
    failed: ledger.items.filter((item) => item.state === "failed").length,
    ambiguous: ledger.items.filter((item) => item.state === "ambiguous").length,
    balanceBefore: ledger.balanceBefore,
    balanceAfter: ledger.balanceAfter,
    observedUnitChange: ledger.balanceBefore! - ledger.balanceAfter!,
    pausedForInspection,
  }),
);
