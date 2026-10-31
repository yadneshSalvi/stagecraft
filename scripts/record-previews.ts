/**
 * Dry run: NODE_OPTIONS=--conditions=react-server pnpm exec tsx scripts/record-previews.ts
 * Authorized seven-task run (maximum 14 estimated units): add --confirm-live.
 * Re-running resumes only persisted task IDs; an interrupted paid POST becomes
 * ambiguous and is never resubmitted. All transport secrets remain ignored.
 */
import nextEnv from "@next/env";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { z } from "zod";
import { normalizePhoto, sha256Bytes } from "../src/lib/server/images";
import {
  registerFile,
  uploadRegisteredFile,
  submitClothesTask,
  getClothesTask,
  downloadOutput,
  readUnitInfo,
  readFeatureCosts,
  YouCamError,
  type RegisteredFile,
} from "../src/lib/youcam";
import {
  clothesInputHash,
  RecordingManifestSchema,
  type Recording,
} from "../src/lib/youcam/recorded";
import type { GarmentCategory } from "../src/lib/types";

const ROOT = resolve(import.meta.dirname, "..");
nextEnv.loadEnvConfig(ROOT);
const live = process.argv.slice(2).includes("--confirm-live");
if (process.argv.slice(2).some((arg) => arg !== "--confirm-live"))
  throw new Error("Unsupported recording option.");
const privateRoot = join(ROOT, "artifacts/private/recorded-previews");
const statePath = join(privateRoot, "run.json");
type Spec = {
  id: string;
  lookId: string;
  performerId: string;
  unitId: string;
  source: string;
  garment: string;
  category: GarmentCategory;
};
const specs: Spec[] = [
  {
    id: "nora-oxblood",
    lookId: "look-nora",
    performerId: "performer-ada",
    unitId: "unit-coat-oxblood",
    source: "ada",
    garment: "oxblood-coat",
    category: "outerwear",
  },
  {
    id: "elias-ivory",
    lookId: "look-elias",
    performerId: "performer-theo",
    unitId: "unit-shirt-ivory",
    source: "theo",
    garment: "ivory-shirt",
    category: "upper_body",
  },
  {
    id: "mae-midnight",
    lookId: "look-mae",
    performerId: "performer-mina",
    unitId: "unit-dress-midnight",
    source: "mina",
    garment: "midnight-dress",
    category: "full_body",
  },
  {
    id: "julian-olive",
    lookId: "look-julian",
    performerId: "performer-jules",
    unitId: "unit-jacket-olive",
    source: "jules",
    garment: "olive-suit",
    category: "upper_body",
  },
  {
    id: "ruth-ivory",
    lookId: "look-ruth",
    performerId: "performer-ruth",
    unitId: "unit-blouse-ivory",
    source: "ruth",
    garment: "ivory-shirt",
    category: "upper_body",
  },
  {
    id: "nora-charcoal",
    lookId: "look-nora",
    performerId: "performer-ada",
    unitId: "unit-coat-charcoal",
    source: "ada",
    garment: "charcoal-coat",
    category: "outerwear",
  },
  {
    id: "nora-celeste",
    lookId: "look-nora",
    performerId: "performer-celeste",
    unitId: "unit-coat-oxblood",
    source: "celeste",
    garment: "oxblood-coat",
    category: "outerwear",
  },
];
type FileState = {
  state: "intent" | "registered" | "uploaded";
  registrationStartedAt?: string;
  file?: RegisteredFile;
};
type ItemState = {
  id: string;
  state:
    "planned" | "submitting" | "polling" | "succeeded" | "failed" | "ambiguous";
  source?: FileState;
  garment?: FileState;
  taskId?: string;
  submissionStartedAt?: string;
  errorCode?: string;
  inputHash?: string;
  record?: Recording;
};
type RunState = {
  version: 1;
  createdAt: string;
  balanceBefore?: number;
  balanceAfter?: number;
  costVerified?: boolean;
  items: ItemState[];
};
const sourceBytes = new Map<string, Buffer>();
const photos = new Map<string, Awaited<ReturnType<typeof normalizePhoto>>>();
for (const spec of specs) {
  for (const key of ["source", "garment"] as const) {
    const pathname =
      key === "source"
        ? `/assets/cast/${spec.source}.webp`
        : `/assets/garments/${spec.garment}.webp`;
    if (!photos.has(pathname)) {
      const bytes = await readFile(join(ROOT, "public", pathname));
      sourceBytes.set(pathname, bytes);
      photos.set(pathname, await normalizePhoto(bytes));
    }
  }
}
if (!live) {
  console.log(
    JSON.stringify({
      mode: "dry_run",
      tasks: specs.length,
      maximumEstimatedUnits: 14,
      inputsValidated: photos.size,
      instructions:
        "Explicit --confirm-live is required. No network calls were made.",
    }),
  );
  process.exit(0);
}
await mkdir(privateRoot, { recursive: true, mode: 0o700 });
let run: RunState;
try {
  run = JSON.parse(await readFile(statePath, "utf8")) as RunState;
} catch (error) {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error) ||
    error.code !== "ENOENT"
  )
    throw new Error(
      "The recording ledger cannot be read safely. Reconcile it before any new provider work; it will not be reset automatically.",
    );
  run = {
    version: 1,
    createdAt: new Date().toISOString(),
    items: specs.map((spec) => ({ id: spec.id, state: "planned" })),
  };
}
if (
  run.version !== 1 ||
  run.items.length !== 7 ||
  run.items.some((item, index) => item.id !== specs[index].id)
)
  throw new Error(
    "Recording ledger does not match this authorized seven-task plan.",
  );
const save = async () => {
  const pendingPath = `${statePath}.next`;
  await writeFile(pendingPath, JSON.stringify(run, null, 2), { mode: 0o600 });
  await rename(pendingPath, statePath);
};
for (let index = 0; index < specs.length; index++) {
  const spec = specs[index];
  const item = run.items[index];
  const expectedHash = clothesInputHash(
    photos.get(`/assets/cast/${spec.source}.webp`)!.sha256,
    photos.get(`/assets/garments/${spec.garment}.webp`)!.sha256,
    spec.category,
  );
  const savedHash = item.inputHash || item.record?.inputHash;
  if (
    (savedHash && savedHash !== expectedHash) ||
    (!savedHash && (item.taskId || item.source?.file || item.garment?.file))
  )
    throw new Error(
      "The persisted file/task inputs cannot be verified against the current artwork. Reconcile the ledger without resubmitting.",
    );
  item.inputHash = expectedHash;
}
await save();
const publish = async () => {
  const manifest = RecordingManifestSchema.parse({
    version: 1,
    previews: run.items.flatMap((item) => (item.record ? [item.record] : [])),
  });
  // A reviewed public note is retained when it describes the exact same result.
  try {
    const previous = RecordingManifestSchema.parse(
      JSON.parse(
        await readFile(
          join(ROOT, "public/examples/recorded-previews.json"),
          "utf8",
        ),
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
    /* A first run has no public manifest. */
  }
  await mkdir(join(ROOT, "public/examples/previews"), { recursive: true });
  await writeFile(
    join(ROOT, "public/examples/recorded-previews.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
};
const balanceSchema = z.object({
  status: z.literal(200),
  results: z.array(
    z.object({
      amount_dec: z.number().finite(),
      expiry: z.number().optional(),
    }),
  ),
});
async function balance() {
  const parsed = balanceSchema.safeParse(await readUnitInfo());
  if (!parsed.success)
    throw new Error(
      "The balance response could not be verified. No paid tasks will be started.",
    );
  return parsed.data.results.reduce(
    (sum, item) =>
      sum + (item.expiry && item.expiry < Date.now() ? 0 : item.amount_dec),
    0,
  );
}
if (run.balanceBefore === undefined) {
  run.balanceBefore = await balance();
  await save();
  console.log(
    JSON.stringify({
      balanceBefore: run.balanceBefore,
      maximumEstimatedUnits: 14,
    }),
  );
  if (run.balanceBefore < 14)
    throw new Error("Insufficient balance for the authorized sample plan.");
}
if (
  !run.costVerified ||
  run.items.some(
    (item) =>
      item.state === "planned" && !item.submissionStartedAt && !item.taskId,
  )
) {
  let token: string | undefined;
  let verified = false;
  for (let page = 0; page < 20; page++) {
    const parsed = z
      .object({
        status: z.literal(200),
        result: z.object({
          next_token: z.string().nullable().optional(),
          skus: z.array(
            z.object({
              run_task_url: z.string(),
              amount: z.number(),
              proc_unit: z.number(),
              unit: z.string(),
            }),
          ),
        }),
      })
      .parse(await readFeatureCosts(token));
    const sku = parsed.result.skus.find(
      (item) =>
        new URL(item.run_task_url).pathname === "/s2s/v2.0/task/cloth-v4",
    );
    if (sku) {
      if (sku.amount / sku.proc_unit !== 2 || sku.unit !== "result_image")
        throw new Error(
          "The observed Clothes V4 cost differs from the authorized 2-unit estimate.",
        );
      verified = true;
      break;
    }
    token = parsed.result.next_token || undefined;
    if (!token) break;
  }
  if (!verified)
    throw new Error(
      "Clothes V4 cost could not be verified. No paid tasks were started.",
    );
  run.costVerified = true;
  await save();
}

async function ensureFile(
  item: ItemState,
  role: "source" | "garment",
  photo: Awaited<ReturnType<typeof normalizePhoto>>,
) {
  const state = (item[role] ||= { state: "intent" });
  if (state.state === "uploaded" && state.file) return state.file.fileId;
  if (!state.file) {
    state.registrationStartedAt = new Date().toISOString();
    await save();
    state.file = await registerFile({
      contentType: "image/jpeg",
      byteLength: photo.bytes.length,
      fileName: `stagecraft-${item.id}-${role}.jpg`,
    });
    state.state = "registered";
    await save();
  }
  await uploadRegisteredFile(state.file, photo.bytes);
  state.state = "uploaded";
  await save();
  return state.file.fileId;
}

for (let index = 0; index < specs.length; index++) {
  const spec = specs[index];
  const item = run.items[index];
  if (item.taskId || ["succeeded", "failed", "ambiguous"].includes(item.state))
    continue;
  if (item.submissionStartedAt) {
    item.state = "ambiguous";
    item.errorCode = "unknown_submission";
    await save();
    console.log(
      JSON.stringify({
        item: spec.id,
        state: "ambiguous",
        action: "No repeat submission",
      }),
    );
    continue;
  }
  try {
    const source = photos.get(`/assets/cast/${spec.source}.webp`)!;
    const garment = photos.get(`/assets/garments/${spec.garment}.webp`)!;
    const sourceFileId = await ensureFile(item, "source", source);
    const garmentFileId = await ensureFile(item, "garment", garment);
    if (run.items.filter((entry) => entry.submissionStartedAt).length >= 7)
      throw new Error("Authorized task cap reached.");
    item.submissionStartedAt = new Date().toISOString();
    item.state = "submitting";
    await save();
    const result = await submitClothesTask({
      sourceFileId,
      garmentFileId,
      category: spec.category,
    });
    item.taskId = result.taskId;
    item.state = "polling";
    await save();
    console.log(
      JSON.stringify({ item: spec.id, state: "submitted", estimatedUnits: 2 }),
    );
  } catch (error) {
    item.state =
      item.submissionStartedAt &&
      (!(error instanceof YouCamError) || error.submissionUncertain)
        ? "ambiguous"
        : "failed";
    item.errorCode =
      error instanceof YouCamError ? error.code : "recording_failed";
    await save();
    console.log(
      JSON.stringify({
        item: spec.id,
        state: item.state,
        errorCode: item.errorCode,
      }),
    );
  }
}

await mkdir(join(ROOT, "public/examples/previews"), { recursive: true });
for (
  let round = 0;
  round < 40 &&
  run.items.some((item) => item.taskId && item.state === "polling");
  round++
) {
  await delay(10_000);
  for (let index = 0; index < specs.length; index++) {
    const spec = specs[index];
    const item = run.items[index];
    if (!item.taskId || item.state !== "polling") continue;
    try {
      const task = await getClothesTask(item.taskId);
      if (task.state === "running") continue;
      if (task.state === "error") {
        item.state = "failed";
        item.errorCode = task.code;
        await save();
        console.log(
          JSON.stringify({
            item: spec.id,
            state: "failed",
            errorCode: task.code,
          }),
        );
        continue;
      }
      const stream = await downloadOutput(task.outputUrl);
      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
        bytes += chunk.length;
        if (bytes > 9_999_999)
          throw new Error("Output exceeds supported size.");
        chunks.push(chunk);
      }
      const raw = Buffer.concat(chunks);
      const output = await sharp(raw, { limitInputPixels: 32_000_000 })
        .rotate()
        .webp({ quality: 92 })
        .toBuffer();
      await writeFile(
        join(privateRoot, `${spec.id}-provider-result.bin`),
        raw,
        { mode: 0o600 },
      );
      const imagePath = `/examples/previews/${spec.id}.webp`;
      await writeFile(join(ROOT, "public", imagePath), output);
      const sourceImagePath = `/assets/cast/${spec.source}.webp`;
      const garmentImagePath = `/assets/garments/${spec.garment}.webp`;
      const source = photos.get(sourceImagePath)!;
      const garment = photos.get(garmentImagePath)!;
      item.record = {
        id: `recorded-${spec.id}`,
        lookId: spec.lookId,
        performerId: spec.performerId,
        captureVersion: 1,
        recipeRevision: 1,
        unitIds: [spec.unitId],
        category: spec.category,
        imagePath,
        sourceImagePath,
        garmentImagePath,
        inputHash: clothesInputHash(
          source.sha256,
          garment.sha256,
          spec.category,
        ),
        sourceSha256: sha256Bytes(sourceBytes.get(sourceImagePath)!),
        garmentSha256: sha256Bytes(sourceBytes.get(garmentImagePath)!),
        sourceUploadSha256: source.sha256,
        garmentUploadSha256: garment.sha256,
        outputSha256: sha256Bytes(output),
        operation: "ai_clothes_v4",
        provider: "YouCam",
        recordedAt: new Date().toISOString(),
        estimatedUnits: 2,
        inspectionNotes:
          "Actual recorded YouCam Clothes V4 result using fictional, AI-generated adult source artwork. Awaiting operator inspection and explicit appearance approval. Makeup, hair, accessories, physical fit and supplier availability are not established by this garment preview.",
        taskEvidence: {
          taskIdHash: sha256Bytes(Buffer.from(item.taskId)),
          status: "success",
        },
        outputTransformation: "webp-reencode/q92;no-retouch",
      };
      item.state = "succeeded";
      await save();
      await publish();
      console.log(
        JSON.stringify({
          item: spec.id,
          state: "succeeded",
          outputSha256: item.record.outputSha256,
        }),
      );
    } catch (error) {
      if (error instanceof YouCamError && error.retryable) continue;
      item.errorCode =
        error instanceof YouCamError ? error.code : "result_storage_failed";
      await save();
      console.log(
        JSON.stringify({
          item: spec.id,
          state: "polling",
          errorCode: item.errorCode,
          action: "Will retain the original task; no repeat submission",
        }),
      );
    }
  }
}
run.balanceAfter = await balance();
await save();
await publish();
console.log(
  JSON.stringify({
    submitted: run.items.filter((item) => item.submissionStartedAt).length,
    succeeded: run.items.filter((item) => item.state === "succeeded").length,
    failed: run.items.filter((item) => item.state === "failed").length,
    ambiguous: run.items.filter((item) => item.state === "ambiguous").length,
    pending: run.items.filter((item) => item.state === "polling").length,
    balanceBefore: run.balanceBefore,
    balanceAfter: run.balanceAfter,
    observedUnitChange: run.balanceBefore! - run.balanceAfter,
    maximumEstimatedUnits: 14,
  }),
);
