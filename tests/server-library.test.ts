import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Look, Production } from "@/lib/types";
import {
  applyCommand,
  createExampleProduction,
  getCurrentApproval,
} from "@/lib/domain";
import { libraryCatalog, LibraryQuerySchema } from "@/lib/server/library";
import { recordedPreviews } from "@/lib/youcam/recorded";
import { getCreditBalance, submitClothesTask } from "@/lib/youcam";
import { GET } from "@/app/api/library/route";
import { getPool, transaction } from "@/lib/server/db";
import {
  createProject,
  hash,
  ownedProject,
  persistProject,
  runCommand,
} from "@/lib/server/projects";
import { createPreviewJob } from "@/lib/server/jobs";
import legacy from "./fixtures/pre-review-production.json";

const faults = vi.hoisted(() => ({
  paths: new Set<string>(),
  rawManifest: false,
}));
vi.mock("node:fs/promises", async (original) => {
  const actual = await original<typeof import("node:fs/promises")>();
  return {
    ...actual,
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      const result = await actual.readFile(...args),
        path = String(args[0]);
      if ([...faults.paths].some((suffix) => path.endsWith(suffix))) {
        return typeof result === "string"
          ? result + "!"
          : Buffer.concat([result, Buffer.from([0])]);
      }
      if (
        faults.rawManifest &&
        path.endsWith("recorded-previews.json") &&
        typeof result === "string"
      ) {
        const manifest = JSON.parse(result);
        for (const record of manifest.previews)
          if (record.performerId === "performer-ada")
            record.sourceSha256 = "0".repeat(64);
        return JSON.stringify(manifest);
      }
      return result;
    },
  };
});
vi.mock("@/lib/server/auth", async () => {
  const { ApiError } = await import("@/lib/server/errors");
  return {
    requireOwner: async (request: Request) => {
      const owner = request.headers.get("x-test-owner");
      if (!owner)
        throw new ApiError(401, "SESSION_REQUIRED", "Sign in to continue.");
      return owner;
    },
  };
});
vi.mock("@/lib/youcam", async (original) => ({
  ...(await original<typeof import("@/lib/youcam")>()),
  youcamConfigured: () => false,
  getCreditBalance: vi
    .fn()
    .mockRejectedValue(new Error("No provider access is permitted.")),
  submitClothesTask: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({
  get: vi.fn(),
  head: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  faults.paths.clear();
  faults.rawManifest = false;
  vi.stubEnv("GENERATION_PAUSED", "true");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("No network request is permitted.")),
  );
});
afterEach(() => {
  expect(getCreditBalance).not.toHaveBeenCalled();
  expect(submitClothesTask).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("verified recorded-ready library projection", () => {
  it("lists only real exact-input pairs and exposes no private/provider metadata", async () => {
    const catalog = await libraryCatalog();
    expect(catalog.readyPairs).toHaveLength(18);
    expect(
      new Set(
        catalog.readyPairs.map((pair) => `${pair.performerId}:${pair.unitId}`),
      ).size,
    ).toBe(18);
    expect(catalog.readyPairs).toContainEqual({
      performerId: "performer-mina",
      unitId: "unit-blouse-mae",
      category: "upper_body",
      previewImageUrl: "/examples/previews/review-mae-ivory.webp",
    });
    expect(
      catalog.readyPairs.some(
        (pair) =>
          pair.performerId === "performer-mina" &&
          pair.unitId === "unit-coat-oxblood",
      ),
    ).toBe(false);
    const projected = JSON.stringify(catalog);
    expect(projected).not.toMatch(
      /sha256|taskEvidence|provider_task|workflow|assetId|consent|librarySourceId|https?:/,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("offers only verified alternatives and preserves the selected performer first", async () => {
    const project = createExampleProduction("example");
    const catalog = await libraryCatalog(project, {
      performerId: "performer-mina",
      unitId: "unit-coat-oxblood",
    });
    expect(catalog.selection).toMatchObject({
      ready: false,
      reason: "no_recording",
      category: "outerwear",
    });
    expect(catalog.selection!.message).toContain("selected current capture");
    expect(catalog.selection!.suggestions.length).toBeGreaterThan(0);
    expect(catalog.selection!.suggestions[0]).toMatchObject({
      performerId: "performer-mina",
      change: "garment",
      projectPerformerId: "performer-mina",
    });
    for (const suggestion of catalog.selection!.suggestions) {
      expect(catalog.readyPairs).toContainEqual({
        performerId: suggestion.performerId,
        unitId: suggestion.unitId,
        category: suggestion.category,
        previewImageUrl: suggestion.previewImageUrl,
      });
    }
  });

  it("checks the submitted category even when source and reference are recorded", async () => {
    const project = createExampleProduction("example");
    const ready = await libraryCatalog(project, {
      performerId: "performer-ada",
      unitId: "unit-coat-oxblood",
    });
    expect(ready.selection).toMatchObject({
      ready: true,
      reason: "ready",
      category: "outerwear",
      suggestions: [],
    });
    const wrong = await libraryCatalog(project, {
      performerId: "performer-ada",
      unitId: "unit-coat-oxblood",
      category: "upper_body",
    });
    expect(wrong.selection).toMatchObject({
      ready: false,
      reason: "no_recording",
      category: "upper_body",
    });
  });

  it("preserves compatible old fixture productions without trusted alias fields", async () => {
    const old = structuredClone(legacy.example) as Production;
    for (const actor of old.performers) delete actor.librarySourceId;
    for (const unit of old.units) delete unit.librarySourceId;
    const catalog = await libraryCatalog(old, {
      performerId: "performer-ada",
      unitId: "unit-coat-oxblood",
    });
    expect(catalog.project?.revision).toBe(old.revision);
    expect(catalog.selection?.ready).toBe(true);
  });

  it.each(["missing", "unknown", "wrong_capture", "private_capture"] as const)(
    "rejects %s performer lineage despite a canonical ID/name",
    async (fault) => {
      const project = createExampleProduction("forged");
      project.fixture = false;
      const performer = project.performers[0];
      if (fault === "missing") delete performer.librarySourceId;
      if (fault === "unknown") performer.librarySourceId = "performer-invented";
      if (fault === "wrong_capture")
        performer.imageUrl = "/assets/cast/theo.webp";
      if (fault === "private_capture") performer.assetId = randomUUID();
      const catalog = await libraryCatalog(project, {
        performerId: performer.id,
        unitId: "unit-coat-oxblood",
      });
      expect(catalog.selection).toMatchObject({
        ready: false,
        reason: "unverified_lineage",
      });
      expect(
        catalog.project!.performerBindings.some(
          (item) => item.performerId === performer.id,
        ),
      ).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it.each(["unknown", "changed_reference", "wrong_category"] as const)(
    "rejects %s garment lineage",
    async (fault) => {
      const project = createExampleProduction("forged");
      project.fixture = false;
      const unit = project.units[0];
      if (fault === "unknown") unit.librarySourceId = "unit-invented";
      if (fault === "changed_reference")
        unit.imageUrl = "/assets/garments/charcoal-coat.webp";
      if (fault === "wrong_category") unit.category = "upper_body";
      const catalog = await libraryCatalog(project, {
        performerId: "performer-ada",
        unitId: unit.id,
      });
      expect(catalog.selection).toMatchObject({
        ready: false,
        reason: "unverified_lineage",
      });
      expect(
        catalog.project!.unitBindings.some((item) => item.unitId === unit.id),
      ).toBe(false);
    },
  );

  it.each(["/assets/cast/ada.webp", "/examples/transports/ada-garment.jpg"])(
    "fails closed after raw or frozen source corruption: %s",
    async (path) => {
      faults.paths.add(path);
      const catalog = await libraryCatalog(createExampleProduction("example"), {
        performerId: "performer-ada",
        unitId: "unit-coat-oxblood",
      });
      expect(catalog.selection).toMatchObject({
        ready: false,
        reason: "source_unavailable",
      });
      expect(
        catalog.readyPairs.some((pair) => pair.performerId === "performer-ada"),
      ).toBe(false);
      expect(
        catalog.readyPairs.some(
          (pair) => pair.performerId === "performer-mina",
        ),
      ).toBe(true);
    },
  );

  it("requires original raw-source evidence as well as the transport fingerprint", async () => {
    faults.rawManifest = true;
    const catalog = await libraryCatalog();
    expect(
      catalog.readyPairs.some(
        (pair) =>
          pair.performerId === "performer-ada" &&
          pair.unitId === "unit-coat-oxblood",
      ),
    ).toBe(false);
    expect(
      catalog.readyPairs.some(
        (pair) =>
          pair.performerId === "performer-ada" &&
          pair.unitId === "unit-coat-burgundy",
      ),
    ).toBe(true);
  });

  it("does not advertise a corrupt recorded output", async () => {
    const record = (await recordedPreviews()).find(
      (item) =>
        item.performerId === "performer-ada" &&
        item.unitIds[0] === "unit-coat-oxblood",
    )!;
    faults.paths.add(record.imagePath);
    const catalog = await libraryCatalog();
    expect(
      catalog.readyPairs.some(
        (pair) =>
          pair.performerId === "performer-ada" &&
          pair.unitId === "unit-coat-oxblood",
      ),
    ).toBe(false);
  });

  it("withdraws current-capture eligibility without affecting canonical recordings", async () => {
    const project = createExampleProduction("withdrawn");
    project.performers[0].consent.granted = false;
    const catalog = await libraryCatalog(project, {
      performerId: "performer-ada",
      unitId: "unit-coat-oxblood",
    });
    expect(catalog.selection).toMatchObject({
      ready: false,
      reason: "permission_required",
    });
    expect(
      catalog.selection!.suggestions.every(
        (item) => item.projectPerformerId !== "performer-ada",
      ),
    ).toBe(true);
    expect(
      catalog.readyPairs.some((item) => item.performerId === "performer-ada"),
    ).toBe(true);
  });

  it("bounds the selected project query and rejects caller-supplied trust/provenance", () => {
    const input = {
      projectId: randomUUID(),
      performerId: "performer-local",
      unitId: "unit-local",
      category: "upper_body",
    };
    expect(LibraryQuerySchema.safeParse(input).success).toBe(true);
    for (const invalid of [
      { ...input, projectId: undefined },
      { ...input, unitId: undefined },
      { ...input, category: "invented" },
      { ...input, performerId: "x".repeat(121) },
      { ...input, librarySourceId: "performer-ada" },
      { category: "upper_body" },
    ])
      expect(LibraryQuerySchema.safeParse(invalid).success).toBe(false);
  });
});

if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (process.env.TEST_DATABASE_URL)
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const database = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL)
  : null;
const local = Boolean(
  database &&
  ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) &&
  /stagecraft_(?:dev|test)/.test(database.pathname),
);
let owner: string, stranger: string;
describe.runIf(local)("owner-scoped free library path", () => {
  beforeEach(async () => {
    owner = `library-test-${randomUUID()}`;
    stranger = `library-test-${randomUUID()}`;
    await getPool().query(
      "INSERT INTO \"user\"(id,name,email,\"isAnonymous\") VALUES($1,'Library test',$2,true),($3,'Other test',$4,true)",
      [owner, `${owner}@test.invalid`, stranger, `${stranger}@test.invalid`],
    );
  });
  afterEach(async () => {
    await getPool().query('DELETE FROM "user" WHERE id=ANY($1::text[])', [
      [owner, stranger],
    ]);
    await getPool().query(
      "DELETE FROM sc_quota_reservations WHERE owner_id=ANY($1::text[])",
      [[owner, stranger]],
    );
  });
  const request = (
    projectId: string,
    performerId: string,
    unitId: string,
    actor = owner,
  ) =>
    GET(
      new Request(
        `http://localhost:3001/api/library?${new URLSearchParams({ projectId, performerId, unitId })}`,
        { headers: { "x-test-owner": actor } },
      ),
    );

  it("reports a real custom imported pair as ready and denies another owner", async () => {
    let project = await createProject(owner, "blank", "Library eligibility");
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      { type: "import_example_performer", sourcePerformerId: "performer-ada" },
    );
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      { type: "import_example_unit", sourceUnitId: "unit-coat-oxblood" },
    );
    const response = await request(
      project.id,
      project.performers[0].id,
      project.units[0].id,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const catalog = await response.json();
    expect(catalog.selection).toMatchObject({
      ready: true,
      reason: "ready",
      category: "outerwear",
    });
    expect(catalog.project).toMatchObject({
      revision: project.revision,
      performerBindings: [
        {
          performerId: project.performers[0].id,
          libraryPerformerId: "performer-ada",
        },
      ],
      unitBindings: [
        { unitId: project.units[0].id, libraryUnitId: "unit-coat-oxblood" },
      ],
    });
    expect(
      (
        await request(
          project.id,
          project.performers[0].id,
          project.units[0].id,
          stranger,
        )
      ).status,
    ).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("follows a no-recording suggestion to an approved adopted allocation while fresh work rests", async () => {
    let project = await createProject(owner, "blank", "Free recorded planning");
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      { type: "import_example_performer", sourcePerformerId: "performer-mina" },
    );
    const performer = project.performers[0];
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      { type: "import_example_unit", sourceUnitId: "unit-coat-oxblood" },
    );
    const unsupported = await (
      await request(project.id, performer.id, project.units[0].id)
    ).json();
    expect(unsupported.selection.ready).toBe(false);
    const suggestion = unsupported.selection.suggestions[0];
    expect(suggestion).toMatchObject({
      performerId: "performer-mina",
      change: "garment",
      projectPerformerId: performer.id,
    });
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      { type: "import_example_unit", sourceUnitId: suggestion.unitId },
    );
    const unit = project.units.at(-1)!;
    expect(
      (await (await request(project.id, performer.id, unit.id)).json())
        .selection.ready,
    ).toBe(true);

    // Manual test-only scene setup; no model call or human outcome is claimed.
    const text = "INT. SOFTWARE TEST STAGE - DAY\nA performer waits.\n",
      now = new Date().toISOString();
    const character = {
      id: "char-library-test",
      name: "Library test role",
      description: "Software fixture",
      performerId: performer.id,
      direction: {
        revision: 1,
        text: "A library costume study",
        palette: [],
        essential: [],
        approvedBy: "Software test operator",
      },
    };
    const seeded = applyCommand(
      project,
      {
        type: "adopt_script",
        script: {
          id: "script-library-test",
          label: "Manual software fixture",
          title: "Library test scene",
          text,
          sha256: createHash("sha256").update(text).digest("hex"),
          rightsConfirmed: true,
          createdAt: now,
          model: "No model call; manual test fixture",
          provenance: "manual",
        },
        scenes: [
          {
            id: "scene-library-test",
            number: "01",
            title: "Library test",
            heading: "INT. SOFTWARE TEST STAGE - DAY",
            storyDay: 1,
            characterIds: [character.id],
            lookIds: [],
            requirements: [],
            sourceStart: 0,
            sourceEnd: text.length,
            reviewed: true,
          },
        ],
        characters: [character],
      },
      { actor: owner, now, id: randomUUID },
    );
    await transaction((client) =>
      persistProject(
        client,
        project,
        seeded,
        "manual-test-scene",
        hash({ scene: "manual-test-scene" }),
      ),
    );
    project = await ownedProject(owner, project.id);
    const look: Look = {
      ...structuredClone(createExampleProduction("look-template").looks[0]),
      id: "look-library-test",
      title: "Verified recorded study",
      characterId: character.id,
      performerId: performer.id,
      sceneIds: ["scene-library-test"],
      storyDays: [1],
      unitIds: [unit.id],
      category: unit.category,
      preparationMinutes: 0,
      preparationEvidence: "estimate",
      details: [],
    };
    delete look.beauty;
    delete look.continuityGroupId;
    delete look.activeCandidateId;
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      { type: "create_look", look },
    );
    await expect(
      createPreviewJob(owner, project.id, {
        lookId: look.id,
        mode: "live",
        commandId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "GENERATION_PAUSED" });
    const recorded = await createPreviewJob(owner, project.id, {
      lookId: look.id,
      mode: "recorded",
      commandId: randomUUID(),
      expectedRevision: project.revision,
    });
    expect(recorded).toMatchObject({ state: "succeeded", estimated_units: 0 });
    project = await ownedProject(owner, project.id);
    expect(getCurrentApproval(project.looks[0], project)).toBeUndefined();
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      {
        type: "approve_look",
        lookId: look.id,
        previewId: recorded.result_preview_id!,
        approvedBy: "Software test operator",
        rationale: "Explicit test decision on the verified recorded output.",
      },
    );
    const start = new Date(
      new Date(unit.availability.from).getTime() + 12 * 3600_000,
    ).toISOString();
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      {
        type: "draft_schedule",
        start,
        sceneMinutes: 30,
        gapMinutes: 5,
        location: unit.location,
      },
    );
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      { type: "solve_allocation" },
    );
    expect(project.allocationResult?.status).toBe("FEASIBLE");
    project = await runCommand(
      owner,
      project.id,
      project.revision,
      randomUUID(),
      {
        type: "adopt_allocation",
        inputHash: project.allocationResult!.inputHash,
      },
    );
    expect(project.allocations).toHaveLength(1);
    expect(project.allocations[0]).toMatchObject({
      unitId: unit.id,
      state: "allocated",
    });
    expect(
      Number(
        (
          await getPool().query(
            "SELECT count(*) AS n FROM sc_jobs WHERE project_id=$1 AND mode='live'",
            [project.id],
          )
        ).rows[0].n,
      ),
    ).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  }, 20000);
});
