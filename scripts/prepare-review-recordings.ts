/** Offline exact-input matrix. This command never contacts a provider. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type {
  BeautyRecipe,
  DetailRecipe,
  GarmentCategory,
} from "../src/lib/types";
import { readFixtureTransport } from "../src/lib/server/fixture-transports";
import { sha256Bytes } from "../src/lib/server/images";
import { clothesPayload } from "../src/lib/youcam/recipes";
import { makeupPayload } from "../src/lib/youcam/beauty";
import {
  hairColorPayload,
  necklacePayload,
  detailProviderInputHash,
} from "../src/lib/youcam/details";
import { clothesInputHash } from "../src/lib/youcam/recorded";
import { beautyProviderInputHash } from "../src/lib/youcam/recorded-beauty";
type Spec = {
  id: string;
  kind: "garment" | "beauty" | "hair_color" | "necklace";
  lookIds: string[];
  storyDays: number[];
  performerId: string;
  sourcePath: string;
  referencePath?: string;
  unitIds?: string[];
  category?: GarmentCategory;
  recipe?: BeautyRecipe | DetailRecipe;
};
const nora = ["look-nora", "look-nora-finale"];
const finale: BeautyRecipe = {
  lipColor: "#853E5D",
  lipIntensity: 65,
  blushColor: "#9D526C",
  blushIntensity: 45,
};
const necklace: DetailRecipe = {
  kind: "necklace",
  referenceId: "detail-brass-pendant",
  removeBackground: true,
};
const specs: Spec[] = [
  {
    id: "review-nora-celeste-charcoal",
    kind: "garment",
    lookIds: nora,
    storyDays: [1, 2, 3],
    performerId: "performer-celeste",
    sourcePath: "/assets/cast/celeste.webp",
    referencePath: "/assets/garments/charcoal-coat.webp",
    unitIds: ["unit-coat-charcoal"],
    category: "outerwear",
  },
  {
    id: "review-nora-ada-burgundy",
    kind: "garment",
    lookIds: nora,
    storyDays: [1, 2, 3],
    performerId: "performer-ada",
    sourcePath: "/assets/cast/ada.webp",
    referencePath: "/assets/garments/burgundy-coat.webp",
    unitIds: ["unit-coat-burgundy"],
    category: "outerwear",
  },
  {
    id: "review-nora-celeste-burgundy",
    kind: "garment",
    lookIds: nora,
    storyDays: [1, 2, 3],
    performerId: "performer-celeste",
    sourcePath: "/assets/cast/celeste.webp",
    referencePath: "/assets/garments/burgundy-coat.webp",
    unitIds: ["unit-coat-burgundy"],
    category: "outerwear",
  },
  {
    id: "review-mae-ivory",
    kind: "garment",
    lookIds: ["look-mae-rehearsal"],
    storyDays: [1, 2],
    performerId: "performer-mina",
    sourcePath: "/assets/cast/mina.webp",
    referencePath: "/assets/garments/ivory-shirt.webp",
    unitIds: ["unit-blouse-mae"],
    category: "upper_body",
  },
  {
    id: "review-julian-rust",
    kind: "garment",
    lookIds: ["look-julian-finale"],
    storyDays: [3],
    performerId: "performer-jules",
    sourcePath: "/assets/cast/jules.webp",
    referencePath: "/assets/garments/rust-jacket.webp",
    unitIds: ["unit-jacket-rust"],
    category: "upper_body",
  },
  {
    id: "review-nora-ada-finale",
    kind: "beauty",
    lookIds: ["look-nora-finale"],
    storyDays: [3],
    performerId: "performer-ada",
    sourcePath: "/assets/cast/ada-face.webp",
    recipe: finale,
  },
  {
    id: "review-nora-celeste-finale",
    kind: "beauty",
    lookIds: ["look-nora-finale"],
    storyDays: [3],
    performerId: "performer-celeste",
    sourcePath: "/assets/cast/celeste-face.webp",
    recipe: finale,
  },
  {
    id: "review-mae-hair-rehearsal",
    kind: "hair_color",
    lookIds: ["look-mae-rehearsal"],
    storyDays: [1, 2],
    performerId: "performer-mina",
    sourcePath: "/assets/cast/mina-face.webp",
    recipe: { kind: "hair_color", preset: "Chocolate Brown" },
  },
  {
    id: "review-mae-hair-finale",
    kind: "hair_color",
    lookIds: ["look-mae"],
    storyDays: [3],
    performerId: "performer-mina",
    sourcePath: "/assets/cast/mina-face.webp",
    recipe: { kind: "hair_color", preset: "Copper Red" },
  },
  {
    id: "review-nora-ada-necklace",
    kind: "necklace",
    lookIds: nora,
    storyDays: [1, 2, 3],
    performerId: "performer-ada",
    sourcePath: "/assets/cast/ada-face.webp",
    referencePath: "/assets/accessories/brass-pendant.webp",
    recipe: necklace,
  },
  {
    id: "review-nora-celeste-necklace",
    kind: "necklace",
    lookIds: nora,
    storyDays: [1, 2, 3],
    performerId: "performer-celeste",
    sourcePath: "/assets/cast/celeste-face.webp",
    referencePath: "/assets/accessories/brass-pendant.webp",
    recipe: necklace,
  },
];
async function image(path: string, profile: "garment" | "face") {
  const raw = await readFile(join("public", path));
  const photo = await readFixtureTransport(path, raw, profile);
  return {
    path,
    profile,
    sourceSha256: sha256Bytes(raw),
    transportSha256: photo.sha256,
    width: photo.width,
    height: photo.height,
    bytes: photo.bytes.length,
  };
}
const tasks = [];
for (const spec of specs) {
  const source = await image(
    spec.sourcePath,
    spec.kind === "garment" ? "garment" : "face",
  );
  const reference = spec.referencePath
    ? await image(spec.referencePath, "garment")
    : undefined;
  const payloadTemplate =
    spec.kind === "garment"
      ? clothesPayload("SOURCE_FILE", "REFERENCE_FILE", spec.category!)
      : spec.kind === "beauty"
        ? makeupPayload("SOURCE_FILE", spec.recipe as BeautyRecipe)
        : spec.kind === "hair_color"
          ? hairColorPayload("SOURCE_FILE", spec.recipe as DetailRecipe)
          : necklacePayload(
              "SOURCE_FILE",
              "REFERENCE_FILE",
              spec.recipe as DetailRecipe,
            );
  const providerInputHash =
    spec.kind === "garment"
      ? clothesInputHash(
          source.transportSha256,
          reference!.transportSha256,
          spec.category!,
        )
      : spec.kind === "beauty"
        ? beautyProviderInputHash(
            source.transportSha256,
            spec.recipe as BeautyRecipe,
          )
        : detailProviderInputHash(
            source.transportSha256,
            spec.recipe as DetailRecipe,
            reference?.transportSha256,
          );
  const endpoint =
    spec.kind === "garment"
      ? "/s2s/v2.0/task/cloth-v4"
      : spec.kind === "beauty"
        ? "/s2s/v2.0/task/makeup-vto"
        : spec.kind === "hair_color"
          ? "/s2s/v2.0/task/hair-color"
          : "/s2s/v2.0/task/2d-vto/necklace";
  tasks.push({
    ...spec,
    source,
    ...(reference ? { reference } : {}),
    endpoint,
    payloadTemplate,
    providerInputHash,
    estimatedUnits: spec.kind === "garment" ? 2 : 1,
  });
}
const plan = {
  version: 1,
  label: "STAGECRAFT review recording matrix",
  sourceBaseline: "a5f1284",
  outputTransformation: "webp-reencode/q92;no-retouch",
  tasks,
};
const matrixSha256 = createHash("sha256")
  .update(JSON.stringify(plan))
  .digest("hex");
const report = {
  ...plan,
  matrixSha256,
  taskCount: tasks.length,
  estimatedUnits: tasks.reduce((sum, task) => sum + task.estimatedUnits, 0),
  providerCalls: 0,
};
await mkdir("artifacts/private/review", { recursive: true });
await writeFile(
  "artifacts/private/review/recording-matrix.json",
  JSON.stringify(report, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    matrixSha256,
    taskCount: report.taskCount,
    estimatedUnits: report.estimatedUnits,
    providerCalls: 0,
    tasks: tasks.map((task) => ({
      id: task.id,
      kind: task.kind,
      lookIds: task.lookIds,
      storyDays: task.storyDays,
      providerInputHash: task.providerInputHash,
    })),
  }),
);
