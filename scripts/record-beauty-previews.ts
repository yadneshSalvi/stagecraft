/** Dry run by default. --confirm-live is the coordinated Ada/Celeste two-task,
 * two-estimated-unit plan. An unreadable ledger or ambiguous POST never resets. */
import nextEnv from "@next/env";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { z } from "zod";
import { normalizeFacePhoto, sha256Bytes } from "../src/lib/server/images";
import {
  registerFile,
  uploadRegisteredFile,
  submitMakeupTask,
  getMakeupTask,
  downloadOutput,
  readUnitInfo,
  readFeatureCosts,
  YouCamError,
  type RegisteredFile,
} from "../src/lib/youcam";
import {
  BeautyRecordingManifestSchema,
  beautyProviderInputHash,
  type BeautyRecording,
} from "../src/lib/youcam/recorded-beauty";
import { makeBeautyEffects } from "../src/lib/youcam/beauty";
import type { BeautyRecipe } from "../src/lib/types";

const ROOT = resolve(import.meta.dirname, "..");
nextEnv.loadEnvConfig(ROOT);
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--confirm-live"))
  throw new Error("Unsupported recording option.");
const live = args.includes("--confirm-live");
const recipe: BeautyRecipe = {
  lipColor: "#853E5D",
  lipIntensity: 40,
  blushColor: "#9D526C",
  blushIntensity: 30,
};
const specs = [
  {
    id: "nora-ada-berry",
    performerId: "performer-ada",
    sourceImagePath: "/assets/cast/ada-face.webp",
    sha256: "193c0221c36458bb275dcb27c240d6dfd07b8ba0e444cabbba6a024cbd03d03f",
  },
  {
    id: "nora-celeste-berry",
    performerId: "performer-celeste",
    sourceImagePath: "/assets/cast/celeste-face.webp",
    sha256: "1e3d3775c2fa758ccd2def4acec30d81414056d066946e31537658212bcd3277",
  },
];
const photos = await Promise.all(
  specs.map(async (spec) => {
    const raw = await readFile(join(ROOT, "public", spec.sourceImagePath));
    if (sha256Bytes(raw) !== spec.sha256)
      throw new Error(
        "The face artwork differs from the inspected source. Reconcile it before provider work.",
      );
    const photo = await normalizeFacePhoto(raw);
    if (photo.width >= 1920 || photo.height >= 1080)
      throw new Error(
        "Face transport dimensions exceed the validated Makeup VTO profile.",
      );
    return { ...photo, rawSha256: sha256Bytes(raw) };
  }),
);
if (!live) {
  console.log(
    JSON.stringify({
      mode: "dry_run",
      tasks: 2,
      maximumEstimatedUnits: 2,
      effects: makeBeautyEffects(recipe),
      dimensions: photos.map(({ width, height }) => ({ width, height })),
      networkCalls: 0,
    }),
  );
  process.exit(0);
}

const dir = join(ROOT, "artifacts/private/recorded-beauty");
const statePath = join(dir, "run.json");
await mkdir(dir, { recursive: true, mode: 0o700 });
type Item = {
  id: string;
  inputHash: string;
  state:
    "planned" | "submitting" | "polling" | "success" | "failed" | "ambiguous";
  registrationStartedAt?: string;
  file?: RegisteredFile;
  uploaded?: boolean;
  submissionStartedAt?: string;
  taskId?: string;
  errorCode?: string;
  record?: BeautyRecording;
};
type State = {
  version: 1;
  items: Item[];
  balanceBefore?: number;
  balanceAfter?: number;
};
let state: State;
try {
  state = JSON.parse(await readFile(statePath, "utf8")) as State;
} catch (error) {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error) ||
    error.code !== "ENOENT"
  )
    throw new Error(
      "The private beauty ledger is unreadable. It will not be reset or resubmitted automatically.",
    );
  state = {
    version: 1,
    items: specs.map((spec, index) => ({
      id: spec.id,
      inputHash: beautyProviderInputHash(photos[index].sha256, recipe),
      state: "planned",
    })),
  };
}
if (
  state.version !== 1 ||
  state.items.length !== 2 ||
  state.items.some(
    (item, index) =>
      item.id !== specs[index].id ||
      item.inputHash !== beautyProviderInputHash(photos[index].sha256, recipe),
  )
)
  throw new Error(
    "The persisted task plan does not match these exact face inputs and effects.",
  );
async function save() {
  await writeFile(`${statePath}.next`, JSON.stringify(state, null, 2), {
    mode: 0o600,
  });
  await rename(`${statePath}.next`, statePath);
}
async function publish() {
  const manifest = BeautyRecordingManifestSchema.parse({
    version: 1,
    previews: state.items.flatMap((item) => (item.record ? [item.record] : [])),
  });
  try {
    const previous = BeautyRecordingManifestSchema.parse(
      JSON.parse(
        await readFile(
          join(ROOT, "public/examples/recorded-beauty-previews.json"),
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
    /* First publish. */
  }
  await mkdir(join(ROOT, "public/examples/beauty"), { recursive: true });
  const destination = join(
    ROOT,
    "public/examples/recorded-beauty-previews.json",
  );
  await writeFile(
    `${destination}.next`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await rename(`${destination}.next`, destination);
}
const balanceSchema = z.object({
  status: z.literal(200),
  results: z.array(
    z.object({ amount_dec: z.number(), expiry: z.number().optional() }),
  ),
});
async function balance() {
  return balanceSchema
    .parse(await readUnitInfo())
    .results.reduce(
      (sum, item) =>
        sum + (item.expiry && item.expiry < Date.now() ? 0 : item.amount_dec),
      0,
    );
}
if (state.balanceBefore === undefined) {
  state.balanceBefore = await balance();
  await save();
  console.log(
    JSON.stringify({
      balanceBefore: state.balanceBefore,
      maximumEstimatedUnits: 2,
    }),
  );
}
if (
  state.items.some(
    (item) => item.state === "planned" && !item.submissionStartedAt,
  )
) {
  let token: string | undefined;
  let verified = false;
  for (let page = 0; page < 20; page++) {
    const costs = z
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
    const sku = costs.result.skus.find(
      (item) =>
        new URL(item.run_task_url).pathname === "/s2s/v2.0/task/makeup-vto",
    );
    if (sku) {
      if (sku.amount / sku.proc_unit !== 1 || sku.unit !== "result_image")
        throw new Error(
          "The provider cost differs from the authorized one-unit Makeup VTO estimate.",
        );
      verified = true;
      break;
    }
    token = costs.result.next_token || undefined;
    if (!token) break;
  }
  if (!verified || state.balanceBefore < 2)
    throw new Error(
      "The Makeup VTO cost and sufficient balance must be verified before submission.",
    );
}
for (let index = 0; index < state.items.length; index++) {
  const item = state.items[index];
  if (item.taskId || ["success", "failed", "ambiguous"].includes(item.state))
    continue;
  if (item.submissionStartedAt) {
    item.state = "ambiguous";
    item.errorCode = "unknown_submission";
    await save();
    continue;
  }
  try {
    if (!item.file) {
      item.registrationStartedAt = new Date().toISOString();
      await save();
      item.file = await registerFile({
        contentType: "image/jpeg",
        byteLength: photos[index].bytes.length,
        fileName: `stagecraft-${item.id}.jpg`,
      });
      await save();
    }
    if (!item.uploaded) {
      await uploadRegisteredFile(item.file, photos[index].bytes);
      item.uploaded = true;
      await save();
    }
    item.state = "submitting";
    item.submissionStartedAt = new Date().toISOString();
    await save();
    item.taskId = (
      await submitMakeupTask({ sourceFileId: item.file.fileId, recipe })
    ).taskId;
    item.state = "polling";
    await save();
    console.log(
      JSON.stringify({ item: item.id, state: "submitted", estimatedUnits: 1 }),
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
        item: item.id,
        state: item.state,
        errorCode: item.errorCode,
      }),
    );
  }
}
await mkdir(join(ROOT, "public/examples/beauty"), { recursive: true });
for (
  let round = 0;
  round < 30 && state.items.some((item) => item.state === "polling");
  round++
) {
  await delay(10000);
  for (let index = 0; index < state.items.length; index++) {
    const item = state.items[index];
    if (!item.taskId || item.state !== "polling") continue;
    try {
      const task = await getMakeupTask(item.taskId);
      if (task.state === "running") continue;
      if (task.state === "error") {
        item.state = "failed";
        item.errorCode = task.code;
        await save();
        continue;
      }
      const reader = (await downloadOutput(task.outputUrl)).getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size >= 10000000) {
            await reader.cancel();
            throw new Error("Result exceeds supported size.");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const raw = Buffer.concat(chunks);
      const output = await sharp(raw, { limitInputPixels: 32000000 })
        .rotate()
        .webp({ quality: 92 })
        .toBuffer();
      await writeFile(join(dir, `${item.id}-provider-result.bin`), raw, {
        mode: 0o600,
      });
      const imagePath = `/examples/beauty/${item.id}.webp`;
      await writeFile(join(ROOT, "public", imagePath), output);
      item.record = {
        id: `recorded-${item.id}`,
        lookId: "look-nora",
        performerId: specs[index].performerId,
        faceCaptureVersion: 1,
        beautyRevision: 1,
        recipe,
        effects: makeBeautyEffects(recipe),
        imagePath,
        sourceImagePath: specs[index].sourceImagePath,
        inputHash: item.inputHash,
        sourceSha256: photos[index].rawSha256,
        sourceUploadSha256: photos[index].sha256,
        outputSha256: sha256Bytes(output),
        operation: "makeup_vto_v1",
        provider: "YouCam",
        recordedAt: new Date().toISOString(),
        estimatedUnits: 1,
        inspectionNotes:
          "Actual recorded YouCam Makeup VTO detail over separately generated fictional adult face artwork. Both skin smoothing fields and lip morphology are zero. Inspect face, lips, blush and texture before explicit beauty approval. This separate detail is not a composite, product match, physical application or fitting outcome.",
        taskEvidence: {
          taskIdHash: sha256Bytes(Buffer.from(item.taskId)),
          status: "success",
        },
        outputTransformation: "webp-reencode/q92;no-retouch",
      };
      item.state = "success";
      await save();
      await publish();
      console.log(
        JSON.stringify({
          item: item.id,
          state: "success",
          outputSha256: item.record.outputSha256,
        }),
      );
    } catch (error) {
      item.errorCode =
        error instanceof YouCamError ? error.code : "result_storage_failed";
      await save();
      console.log(
        JSON.stringify({
          item: item.id,
          state: "polling",
          errorCode: item.errorCode,
          action: "Retain the same task; no repeat paid submission",
        }),
      );
    }
  }
}
state.balanceAfter = await balance();
await save();
await publish();
console.log(
  JSON.stringify({
    submitted: state.items.filter((item) => item.submissionStartedAt).length,
    succeeded: state.items.filter((item) => item.state === "success").length,
    failed: state.items.filter((item) => item.state === "failed").length,
    ambiguous: state.items.filter((item) => item.state === "ambiguous").length,
    pending: state.items.filter((item) => item.state === "polling").length,
    balanceBefore: state.balanceBefore,
    balanceAfter: state.balanceAfter,
    observedUnitChange: state.balanceBefore! - state.balanceAfter,
  }),
);
