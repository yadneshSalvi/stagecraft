import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page, type Response } from "@playwright/test";
import type {
  Character,
  Production,
  ProductionCommand,
  Scene,
} from "../../src/lib/types";
import type { LibraryCatalog } from "../../src/lib/library-types";
import {
  getCurrentApproval,
  getCurrentPreview,
  previewInputHash,
} from "../../src/lib/domain/lineage";
import { getReadiness } from "../../src/lib/domain/selectors";
import { authenticate } from "./helpers";

const scriptPath = fileURLToPath(
  new URL("./fixtures/own-script.txt", import.meta.url),
);
const scriptText = readFileSync(scriptPath, "utf8");
const path = (response: Response) => new URL(response.url()).pathname;
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
interface ExtractedDraft {
  id: string;
  status: string;
  script: NonNullable<Production["script"]>;
  scenes: Scene[];
  characters: Character[];
  grounding?: { groundedSceneCount: number; groundedCueCount: number };
}
let projectId: string | undefined;
let blockedFresh: string[] = [];
let previewRequests: Array<{ lookId: string; mode: string; kind: string }> = [];
test.use({
  viewport: { width: 1440, height: 1000 },
  actionTimeout: 20_000,
  navigationTimeout: 60_000,
});
test.setTimeout(300_000);
async function persisted(page: Page): Promise<Production> {
  const response = await page.request.get(`/api/projects/${projectId}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).project;
}
async function command(
  page: Page,
  type: ProductionCommand["type"],
  action: () => Promise<unknown>,
): Promise<Production> {
  const pending = page.waitForResponse(
    (response) =>
      path(response) === `/api/projects/${projectId}/commands` &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.command?.type === type,
  );
  await action();
  const response = await pending,
    body = await response.json();
  expect(response.ok(), JSON.stringify(body)).toBe(true);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  return body.project;
}
async function visit(page: Page, suffix = "") {
  await page.goto(`/production/${projectId}${suffix}`);
  await expect(page.getByRole("main")).toBeVisible();
}
async function approve(page: Page): Promise<Production> {
  await page
    .getByRole("button", { name: "Approve appearance", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Approve this exact appearance",
    exact: true,
  });
  await dialog
    .getByLabel("Reviewer name or role")
    .fill("Synthetic browser reviewer");
  await dialog
    .getByLabel("What did you approve?")
    .fill(
      "A software-test decision on this exact recorded output for the fictional script. Physical fit and supplier availability remain unverified.",
    );
  const result = await command(page, "approve_look", () =>
    dialog
      .getByRole("button", { name: "Record appearance approval", exact: true })
      .click(),
  );
  await expect(dialog).not.toBeVisible();
  return result;
}
test.beforeEach(async ({ page }) => {
  projectId = undefined;
  blockedFresh = [];
  previewRequests = [];
  await authenticate(page.request);
  await page.route(
    /\/api\/projects\/[^/]+\/previews(?:\?.*)?$/,
    async (route) => {
      const request = route.request();
      if (request.method() === "POST") {
        const input = request.postDataJSON() as {
          lookId: string;
          mode?: string;
          kind?: string;
        };
        if (input.mode !== "recorded") {
          blockedFresh.push(request.url());
          await route.abort("blockedbyclient");
          return;
        }
        previewRequests.push({
          lookId: input.lookId,
          mode: input.mode,
          kind: input.kind ?? "garment",
        });
      }
      await route.continue();
    },
  );
});
test.afterEach(async ({ page }, info) => {
  expect
    .soft(
      blockedFresh,
      "Fresh YouCam requests must be blocked before reaching the server",
    )
    .toEqual([]);
  if (info.status !== info.expectedStatus && !page.isClosed()) {
    await info.attach("own-script-failure", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
    if (projectId) {
      const response = await page.request.get(`/api/projects/${projectId}`);
      if (response.ok())
        await info.attach("own-script-persisted-state", {
          body: JSON.stringify((await response.json()).project, null, 2),
          contentType: "application/json",
        });
    }
  }
  if (projectId)
    expect
      .soft(
        (await page.request.delete(`/api/projects/${projectId}`)).status(),
        "Delete only this test's isolated production",
      )
      .toBe(202);
});

test("a grounded own script reaches exact recorded approvals and a checked physical allocation", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Start your own", exact: true })
    .first()
    .click();
  const creation = page.getByRole("dialog", {
    name: "A new production",
    exact: true,
  });
  await creation
    .getByLabel("Production title")
    .fill("The Tide Signal · synthetic browser rehearsal");
  const created = page.waitForResponse(
    (response) =>
      path(response) === "/api/projects" &&
      response.request().method() === "POST",
    { timeout: 75_000 },
  );
  await creation
    .getByRole("button", { name: "Create production", exact: true })
    .click();
  const createdResponse = await created;
  expect(createdResponse.status()).toBe(201);
  let p: Production = (await createdResponse.json()).project;
  let performerSpecificBadgesVerified = false;
  let unsupportedPairSuggestionVerified = false;
  projectId = p.id;
  expect(p).toMatchObject({
    fixture: false,
    script: null,
    looks: [],
    scenes: [],
    performers: [],
    units: [],
  });
  await expect(page).toHaveURL(new RegExp(`/production/${projectId}$`));
  await test.step("Use actual Gemini extraction and review only grounded source", async () => {
    await page
      .getByRole("link", { name: "Import your script", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Bring in the script.",
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Script title").fill("THE TIDE SIGNAL");
    await dialog
      .getByLabel("Revision label")
      .fill("Original synthetic verification extract");
    await dialog
      .getByLabel("Upload plain text or Fountain (optional)")
      .setInputFiles(scriptPath);
    await expect(dialog.getByLabel("Script text")).toHaveValue(scriptText);
    await dialog
      .getByRole("checkbox", {
        name: /I have permission to use and process this script/,
      })
      .check();
    const extracting = page.waitForResponse(
      (response) =>
        path(response) === `/api/projects/${projectId}/script` &&
        response.request().method() === "POST",
      { timeout: 120_000 },
    );
    await dialog
      .getByRole("button", { name: "Prepare a breakdown", exact: true })
      .click();
    const extracted = await extracting,
      body = await extracted.json();
    expect(extracted.ok(), JSON.stringify(body)).toBe(true);
    const draft = body.draft as ExtractedDraft;
    expect(draft.status).toBe("review");
    expect(draft.script.model).toMatch(/gemini/i);
    expect(draft.script.provenance).toBe("ai_suggestion");
    expect(draft.script.text).toBe(scriptText);
    expect(draft.scenes).toHaveLength(2);
    expect(draft.characters).toHaveLength(2);
    expect(draft.grounding?.groundedSceneCount).toBe(2);
    for (const scene of draft.scenes) {
      expect(scriptText.slice(scene.sourceStart, scene.sourceEnd)).toContain(
        scene.heading,
      );
      expect(scene.reviewed).toBe(false);
      for (const cue of scene.requirements) {
        expect(cue.sourceStart).toBeGreaterThanOrEqual(scene.sourceStart);
        expect(cue.sourceEnd).toBeLessThanOrEqual(scene.sourceEnd);
        expect(
          scriptText.slice(cue.sourceStart, cue.sourceEnd).trim().length,
        ).toBeGreaterThan(0);
      }
    }
    expect(
      draft.scenes
        .flatMap((scene) => scene.requirements)
        .some((cue) =>
          /coat/i.test(scriptText.slice(cue.sourceStart, cue.sourceEnd)),
        ),
    ).toBe(true);
    await info.attach("actual-gemini-grounding", {
      body: JSON.stringify(
        {
          model: draft.script.model,
          grounding: draft.grounding,
          sceneCount: draft.scenes.length,
          characterCount: draft.characters.length,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    const adoption = page.waitForResponse(
      (response) =>
        path(response) === `/api/projects/${projectId}/script/adopt` &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("dialog", {
        name: "The script, ready for your review.",
        exact: true,
      })
      .getByRole("button", {
        name: "Adopt as unreviewed breakdown",
        exact: true,
      })
      .click();
    const adopted = await adoption,
      adoptedBody = await adopted.json();
    expect(adopted.ok(), JSON.stringify(adoptedBody)).toBe(true);
    p = adoptedBody.project;
    expect(p.scenes.every((scene) => !scene.reviewed)).toBe(true);
    expect(p.looks).toEqual([]);
    for (const [index] of p.scenes.entries()) {
      await page
        .getByRole("navigation", { name: "Script scenes", exact: true })
        .getByRole("button")
        .nth(index)
        .click();
      await page
        .getByRole("spinbutton", { name: /^(Proposed story day|Story day)/ })
        .fill(String(index + 1));
      p = await command(page, "review_scene", () =>
        page
          .getByRole("button", {
            name: "Confirm this scene & its cues",
            exact: true,
          })
          .click(),
      );
    }
    expect(p.scenes.map((scene) => scene.storyDay)).toEqual([1, 2]);
    expect(
      p.scenes.every(
        (scene) =>
          scene.reviewed && scene.requirements.every((cue) => cue.reviewed),
      ),
    ).toBe(true);
  });
  const nora = p.characters.find((character) => /^nora$/i.test(character.name)),
    runner = p.characters.find((character) => /^runner$/i.test(character.name));
  expect(nora).toBeDefined();
  expect(runner).toBeDefined();
  const actorCharacter = nora!,
    ownClothesCharacter = runner!;
  await test.step("Exempt the own-clothes role and import permitted library references", async () => {
    const scope = page.locator(".scope-rows > div").filter({
      has: page.getByText(ownClothesCharacter.name, { exact: true }),
    });
    p = await command(page, "set_own_clothes", () =>
      scope
        .getByRole("button", { name: "Managed wardrobe", exact: true })
        .click(),
    );
    expect(
      p.characters.find((character) => character.id === ownClothesCharacter.id)
        ?.ownClothes,
    ).toBe(true);
    await visit(page, "/looks");
    await page
      .getByRole("button", { name: "Example library", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "A small company. A considered wardrobe.",
      exact: true,
    });
    const cast = dialog.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Ada Mercer", exact: true }),
    });
    p = await command(page, "import_example_performer", () =>
      cast.getByRole("button", { name: "Add to cast", exact: true }).click(),
    );
    const actor = p.performers[0];
    expect(actor.id).not.toBe("performer-ada");
    expect(actor.librarySourceId).toBe("performer-ada");
    expect(actor.synthetic).toBe(true);
    await dialog
      .getByRole("combobox", {
        name: "Assign this performer to an uncast character",
        exact: true,
      })
      .selectOption(actorCharacter.id);
    p = await command(page, "adopt_repair", () =>
      dialog
        .getByRole("button", { name: "Record initial casting", exact: true })
        .click(),
    );
    expect(
      p.characters.find((character) => character.id === actorCharacter.id)
        ?.performerId,
    ).toBe(actor.id);
    expect(
      p.characters.find((character) => character.id === ownClothesCharacter.id)
        ?.performerId,
    ).toBe("");
    await dialog
      .getByRole("button", { name: "Garment references", exact: true })
      .click();
    const coat = dialog.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "Oxblood velvet coat",
        exact: true,
      }),
    });
    const olive = dialog.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "Olive tailored jacket",
        exact: true,
      }),
    });
    const previewPerformer = dialog.getByRole("combobox", {
      name: "Preview with performer",
      exact: true,
    });
    await expect(previewPerformer).toHaveValue("performer-ada");
    await expect(
      coat.getByText("Ready preview", { exact: true }),
    ).toBeVisible();
    await expect(olive.getByText("Ready preview", { exact: true })).toHaveCount(
      0,
    );
    await previewPerformer.selectOption("performer-jules");
    await expect(
      olive.getByText("Ready preview", { exact: true }),
    ).toBeVisible();
    await expect(coat.getByText("Ready preview", { exact: true })).toHaveCount(
      0,
    );
    await previewPerformer.selectOption("performer-ada");
    await expect(
      coat.getByText("Ready preview", { exact: true }),
    ).toBeVisible();
    await expect(olive.getByText("Ready preview", { exact: true })).toHaveCount(
      0,
    );
    expect(
      (await persisted(page)).characters.find(
        (character) => character.id === actorCharacter.id,
      )?.performerId,
    ).toBe(actor.id);
    performerSpecificBadgesVerified = true;
    p = await command(page, "import_example_unit", () =>
      coat
        .getByRole("button", { name: "Add to wardrobe", exact: true })
        .click(),
    );
    expect(p.units).toHaveLength(1);
    expect(p.units[0].id).not.toBe("unit-coat-oxblood");
    expect(p.units[0].librarySourceId).toBe("unit-coat-oxblood");
    p = await command(page, "import_example_unit", () =>
      olive
        .getByRole("button", { name: "Add to wardrobe", exact: true })
        .click(),
    );
    expect(p.units).toHaveLength(2);
    expect(p.units[0].librarySourceId).toBe("unit-coat-oxblood");
    expect(p.units[1].librarySourceId).toBe("unit-jacket-olive");
    await dialog
      .getByRole("button", { name: "Return to production", exact: true })
      .click();
  });
  await test.step("Create separate day looks with real recorded reuse across new identities", async () => {
    for (const [index, scene] of p.scenes.entries()) {
      await page.getByRole("button", { name: "New look", exact: true }).click();
      const dialog = page.getByRole("dialog", {
        name: "A look for a story state",
        exact: true,
      });
      await dialog
        .getByLabel("Look title")
        .fill(`The recurring coat · story day ${index + 1}`);
      await dialog.getByLabel("Character").selectOption(actorCharacter.id);
      const garmentSelect = dialog.getByLabel("Physical garment unit");
      if (index === 0) {
        const actorId = p.performers[0].id,
          coatId = p.units[0].id,
          oliveId = p.units[1].id;
        const pairResponse = (unitId: string) => (response: Response) => {
          const url = new URL(response.url());
          return (
            url.pathname === "/api/library" &&
            response.request().method() === "GET" &&
            url.searchParams.get("projectId") === projectId &&
            url.searchParams.get("performerId") === actorId &&
            url.searchParams.get("unitId") === unitId
          );
        };
        const unsupportedPending = page.waitForResponse(pairResponse(oliveId));
        await garmentSelect.selectOption(oliveId);
        const unsupportedResponse = await unsupportedPending;
        expect(unsupportedResponse.ok()).toBe(true);
        const unsupported =
          (await unsupportedResponse.json()) as LibraryCatalog;
        expect(unsupported.project?.revision).toBe(p.revision);
        expect(unsupported.selection).toMatchObject({
          performerId: actorId,
          unitId: oliveId,
          category: "upper_body",
          ready: false,
          reason: "no_recording",
        });
        const suggestedCoat = unsupported.selection!.suggestions.find(
          (item) => item.unitId === "unit-coat-oxblood",
        );
        expect(suggestedCoat).toMatchObject({
          performerId: "performer-ada",
          change: "garment",
          projectPerformerId: actorId,
          projectUnitId: coatId,
          category: "outerwear",
        });
        const options = dialog.getByRole("region", {
          name: "Recorded preview options",
          exact: true,
        });
        await expect(
          options.getByText("No recording for this pairing", { exact: true }),
        ).toBeVisible();
        await expect(
          options.getByText(
            "Keep this performer and choose one of these recorded garments.",
            { exact: true },
          ),
        ).toBeVisible();
        const suggested = options.getByRole("article").filter({
          has: page.getByRole("button", {
            name: "Use C-014",
            exact: true,
          }),
        });
        const recordedThumbnail = suggested.getByRole("img", {
          name: "Recorded YouCam pairing: Ada Mercer, Oxblood velvet coat",
          exact: true,
        });
        await expect(recordedThumbnail).toBeVisible();
        await recordedThumbnail.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            recordedThumbnail.evaluate(
              (image) =>
                (image as HTMLImageElement).complete &&
                (image as HTMLImageElement).naturalWidth > 0,
            ),
          )
          .toBe(true);
        const readyPending = page.waitForResponse(pairResponse(coatId));
        await suggested
          .getByRole("button", { name: "Use C-014", exact: true })
          .click();
        await expect(garmentSelect).toHaveValue(coatId);
        const readyResponse = await readyPending;
        expect(readyResponse.ok()).toBe(true);
        const ready = (await readyResponse.json()) as LibraryCatalog;
        expect(ready.selection).toMatchObject({
          performerId: actorId,
          unitId: coatId,
          category: "outerwear",
          ready: true,
          reason: "ready",
        });
        expect((await persisted(page)).looks).toHaveLength(0);
        unsupportedPairSuggestionVerified = true;
      } else {
        await garmentSelect.selectOption(p.units[0].id);
      }
      // Automatic recorded attachment is gated by this resolved server check.
      await expect(
        dialog.getByText("Ready preview", { exact: true }),
      ).toBeVisible();
      expect(previewRequests).toHaveLength(index);
      await dialog
        .getByRole("checkbox", {
          name: new RegExp(`^SC\\s+${escaped(scene.number)}\\s`),
        })
        .check();
      const recorded = page.waitForResponse(
        (response) =>
          path(response) === `/api/projects/${projectId}/previews` &&
          response.request().method() === "POST",
      );
      const created = await command(page, "create_look", () =>
        dialog
          .getByRole("button", { name: "Create look", exact: true })
          .click(),
      );
      const lookId = created.looks.at(-1)!.id;
      const recordResponse = await recorded,
        recordBody = await recordResponse.json();
      expect(recordResponse.ok(), JSON.stringify(recordBody)).toBe(true);
      expect(recordBody.job).toMatchObject({
        state: "succeeded",
        estimatedUnits: 0,
      });
      await expect(dialog).not.toBeVisible();
      await expect(page).toHaveURL(
        new RegExp(`/looks\\?look=${escaped(lookId)}$`),
      );
      p = await persisted(page);
      const look = p.looks.find((item) => item.id === lookId)!,
        preview = getCurrentPreview(look, p)!;
      expect(preview).toBeDefined();
      expect(look.approvals).toEqual([]);
      expect(preview).toMatchObject({
        lookId,
        performerId: p.performers[0].id,
        unitIds: [p.units[0].id],
        provenance: "recorded_provider",
      });
      expect(preview.inputHash).toBe(previewInputHash(p, look));
      expect(preview.recordingEvidence).toMatchObject({
        binding: "verified_library_inputs",
        originalPerformerId: "performer-ada",
        originalUnitIds: ["unit-coat-oxblood"],
      });
      expect(preview.recordingEvidence?.recordingId).toBeTruthy();
      expect(preview.recordingEvidence?.providerInputHash).toMatch(
        /^[a-f0-9]{64}$/,
      );
      expect(preview.recordingEvidence?.originalLookId).not.toBe(lookId);
      await expect(
        page.getByRole("img", {
          name: new RegExp(
            `${escaped(actorCharacter.name)}, YouCam generated garment preview`,
          ),
        }),
      ).toBeVisible();
      await page
        .getByText("03 / Accessories & preparation", { exact: true })
        .click();
      await page.getByLabel("Preparation estimate (minutes)").fill("20");
      p = await command(page, "update_look", () =>
        page
          .getByRole("button", { name: "Save recipe revision", exact: true })
          .click(),
      );
      expect(
        getCurrentPreview(
          p.looks.find((item) => item.id === lookId)!,
          p,
        )?.id,
      ).toBe(preview.id);
      p = await approve(page);
      expect(
        getCurrentApproval(
          p.looks.find((item) => item.id === lookId)!,
          p,
        )?.previewId,
      ).toBe(preview.id);
    }
    expect(p.looks).toHaveLength(2);
    expect(p.looks.map((look) => look.sceneIds)).toEqual(
      p.scenes.map((scene) => [scene.id]),
    );
    expect(
      p.looks.every((look) => look.characterId === actorCharacter.id),
    ).toBe(true);
  });
  await test.step("Draft dated calls, edit one, and adopt the checked unique-unit budget plan", async () => {
    const storyDays = p.scenes.map((scene) => scene.storyDay),
      date = p.units[0].availability.from.slice(0, 10);
    await visit(page, "/schedule");
    await page
      .getByRole("button", { name: "Draft calls from script", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Give the script a first call sheet.",
      exact: true,
    });
    await dialog.getByLabel("First production call").fill(`${date}T10:00`);
    await dialog.getByLabel("Minutes per scene").fill("40");
    await dialog.getByLabel("Minutes between scenes").fill("20");
    await dialog.getByLabel("Initial location").fill(p.units[0].location);
    p = await command(page, "draft_schedule", () =>
      dialog
        .getByRole("button", { name: "Draft 2 calls", exact: true })
        .click(),
    );
    expect(p.occurrences.map((call) => call.sceneId)).toEqual(
      p.scenes.map((scene) => scene.id),
    );
    expect(p.scenes.map((scene) => scene.storyDay)).toEqual(storyDays);
    const first = structuredClone(p.occurrences[0]),
      second = p.occurrences[1],
      secondScene = p.scenes.find((scene) => scene.id === second.sceneId)!;
    await page
      .getByRole("button", {
        name: `Edit ${secondScene.title} call`,
        exact: true,
      })
      .click();
    const edit = page.getByRole("dialog", {
      name: "Revise the call",
      exact: true,
    });
    await edit.getByLabel("Starts").fill(`${date}T11:30`);
    await edit.getByLabel("Ends").fill(`${date}T12:10`);
    p = await command(page, "update_occurrence", () =>
      edit
        .getByRole("button", { name: "Save scheduled call", exact: true })
        .click(),
    );
    expect(p.occurrences[0]).toEqual(first);
    expect(p.occurrences[1].start).not.toBe(second.start);
    expect(p.scenes.map((scene) => scene.storyDay)).toEqual(storyDays);
    p = await command(page, "solve_allocation", () =>
      page
        .getByRole("button", { name: "Check the allocation", exact: true })
        .click(),
    );
    expect(p.allocationResult).toMatchObject({
      status: "FEASIBLE",
      constraintChecked: true,
      independentlyChecked: false,
      totalCostCents: p.units[0].priceCents,
    });
    expect(p.allocationResult!.totalCostCents).toBeLessThanOrEqual(
      p.budgetCents,
    );
    expect(p.allocationResult!.assignments).toHaveLength(2);
    expect(
      p.allocationResult!.findings.filter(
        (finding) => finding.severity === "conflict",
      ),
    ).toEqual([]);
    expect(
      p.allocationResult!.findings.some(
        (finding) => finding.code === "FITTING_UNVERIFIED",
      ),
    ).toBe(true);
    await expect(
      page.getByRole("region", { name: "Allocation result", exact: true }),
    ).toBeFocused();
    p = await command(page, "adopt_allocation", () =>
      page
        .getByRole("button", { name: "Adopt these assignments", exact: true })
        .click(),
    );
    expect(p.allocations).toHaveLength(2);
    expect(
      p.allocations.every(
        (allocation) =>
          allocation.state === "allocated" &&
          allocation.unitId === p.units[0].id &&
          allocation.performerId === p.performers[0].id &&
          !!allocation.approvalId,
      ),
    ).toBe(true);
    expect(
      p.characters.find((character) => character.id === ownClothesCharacter.id)
        ?.ownClothes,
    ).toBe(true);
    expect(p.units[0].fitting.status).toBe("not_measured");
    expect(p.sourcing).toEqual([]);
    expect(getReadiness(p).ready).toBe(false);
  });
  const saved = await persisted(page);
  expect(saved.allocations).toEqual(p.allocations);
  expect(saved.script?.text).toBe(scriptText);
  expect(previewRequests).toHaveLength(2);
  expect(
    previewRequests.every(
      (request) => request.mode === "recorded" && request.kind === "garment",
    ),
  ).toBe(true);
  expect(blockedFresh).toEqual([]);
  expect(performerSpecificBadgesVerified).toBe(true);
  expect(unsupportedPairSuggestionVerified).toBe(true);
  await info.attach("own-script-outcome", {
    body: JSON.stringify(
      {
        model: saved.script?.model,
        scenes: saved.scenes.length,
        looks: saved.looks.length,
        ownClothes: saved.characters.filter((character) => character.ownClothes)
          .length,
        allocations: saved.allocations.length,
        quoteCents: saved.allocationResult?.totalCostCents,
        recordedRequests: previewRequests.length,
        freshRequests: blockedFresh.length,
        performerSpecificBadgesVerified,
        unsupportedPairSuggestionVerified,
        physicallyReady: getReadiness(saved).ready,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
