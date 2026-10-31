import {
  expect,
  test,
  type APIResponse,
  type Page,
  type Response,
} from "@playwright/test";
import type {
  AppearanceApproval,
  BeautyApproval,
  Production,
  ProductionCommand,
} from "../../src/lib/types";
import { authenticate } from "./helpers";

// These journeys use the real local UI, authentication, API and database.
// Only existing recorded outputs are requested. A route guard blocks a paid job
// before it can reach the server, and every resulting preview is checked again.
test.use({
  viewport: { width: 1440, height: 1000 },
  actionTimeout: 15_000,
  navigationTimeout: 60_000,
});
test.setTimeout(240_000);

let createdProjectIds: string[] = [];
let attemptedLiveJobs: string[] = [];

function path(response: Response): string {
  return new URL(response.url()).pathname;
}

async function assertProjectResponse(
  response: Response | APIResponse,
): Promise<Production> {
  const body = await response.json();
  expect(response.ok(), JSON.stringify(body).slice(0, 1800)).toBe(true);
  expect(body.project?.id).toBeTruthy();
  return body.project as Production;
}

async function saved(page: Page): Promise<void> {
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
}

async function command(
  page: Page,
  type: ProductionCommand["type"],
  action: () => Promise<unknown>,
): Promise<Production> {
  const response = page.waitForResponse(
    (candidate) => {
      if (
        !/\/api\/projects\/[^/]+\/commands$/.test(path(candidate)) ||
        candidate.request().method() !== "POST"
      )
        return false;
      return candidate.request().postDataJSON()?.command?.type === type;
    },
    { timeout: 60_000 },
  );
  await action();
  const production = await assertProjectResponse(await response);
  await saved(page);
  return production;
}

async function persisted(page: Page, id: string): Promise<Production> {
  return assertProjectResponse(
    await page.request.get(`/api/projects/${id}`, { timeout: 60_000 }),
  );
}

async function openExample(page: Page): Promise<Production> {
  await page.goto("/");
  const response = page.waitForResponse(
    (candidate) =>
      path(candidate) === "/api/projects" &&
      candidate.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page
    .getByRole("button", { name: "Step inside the production", exact: true })
    .click();
  const production = await assertProjectResponse(await response);
  createdProjectIds.push(production.id);
  await expect(page).toHaveURL(new RegExp(`/production/${production.id}$`));
  await expect(
    page.getByRole("heading", {
      name: "THE LAST LIGHT",
      level: 1,
      exact: true,
    }),
  ).toBeVisible();
  await saved(page);
  expect(production.fixture).toBe(true);
  expect(production.looks).toHaveLength(5);
  for (const look of production.looks) {
    expect(look.previews.length).toBeGreaterThan(0);
    expect(
      look.previews.every(
        (preview) => preview.provenance === "recorded_provider",
      ),
    ).toBe(true);
    expect(look.approvals).toEqual([]);
  }
  const beauty = production.looks.find(
    (look) => look.id === "look-nora",
  )!.beauty!;
  expect(beauty.previews.length).toBeGreaterThan(0);
  expect(
    beauty.previews.every(
      (preview) => preview.provenance === "recorded_provider",
    ),
  ).toBe(true);
  expect(beauty.approvals).toEqual([]);
  return production;
}

async function navigate(
  page: Page,
  name: "Production" | "Looks" | "Schedule" | "Wardrobe" | "Handoff",
): Promise<void> {
  await page
    .getByRole("navigation", { name: "Production navigation" })
    .getByRole("link", { name, exact: true })
    .click();
}

async function selectLook(
  page: Page,
  name: "Nora Vale" | "Mae Lin",
): Promise<void> {
  const costume = page.getByRole("button", { name: "Costume", exact: true });
  await costume.click();
  await expect(costume).toHaveAttribute("aria-pressed", "true");
  await expect(page).not.toHaveURL(/[?&]detail=makeup/);
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(
    page.getByRole("heading", { name, level: 1, exact: true }),
  ).toBeVisible();
}

async function approveMakeup(page: Page): Promise<Production> {
  await page
    .getByRole("button", { name: "Makeup detail", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Approve makeup detail", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Approve this exact makeup detail",
    exact: true,
  });
  await dialog
    .getByLabel("Makeup reviewer name or role")
    .fill("Synthetic makeup evaluator");
  await dialog
    .getByLabel("What did you approve in the makeup detail?")
    .fill(
      "Synthetic evaluation of this exact recorded lip and blush detail. Skin smoothing and morphology are requested off; no physical application or participant outcome is claimed.",
    );
  const production = await command(page, "approve_beauty", () =>
    dialog
      .getByRole("button", { name: "Record makeup approval", exact: true })
      .click(),
  );
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review makeup approval", exact: true }),
  ).toBeVisible();
  return production;
}

function makeupApproval(production: Production): BeautyApproval {
  const look = production.looks.find(
    (candidate) => candidate.id === "look-nora",
  )!;
  const current = look.beauty?.approvals.find(
    (candidate) =>
      candidate.state === "current" &&
      candidate.beautyRevision === look.beauty!.revision &&
      candidate.performerId === look.performerId,
  );
  expect(current).toBeTruthy();
  return current!;
}

async function useRecordedMakeup(page: Page, id: string): Promise<Production> {
  await page
    .getByRole("button", { name: "Makeup detail", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve makeup detail", exact: true }),
  ).toBeDisabled();
  const response = page.waitForResponse(
    (candidate) =>
      /\/api\/projects\/[^/]+\/previews$/.test(path(candidate)) &&
      candidate.request().method() === "POST" &&
      candidate.request().postDataJSON()?.kind === "beauty",
    { timeout: 60_000 },
  );
  await page
    .getByRole("button", { name: "Use matching recorded makeup", exact: true })
    .click();
  const result = await response,
    body = await result.json();
  expect(result.request().postDataJSON().mode).toBe("recorded");
  expect(result.ok(), JSON.stringify(body)).toBe(true);
  expect(body.job).toMatchObject({ state: "succeeded", kind: "beauty" });
  await expect(
    page.getByRole("img", {
      name: "Nora Vale, actual YouCam Makeup VTO result",
      exact: true,
    }),
  ).toHaveAttribute("src", "/examples/beauty/nora-celeste-berry.webp");
  const production = await persisted(page, id);
  const look = production.looks.find(
    (candidate) => candidate.id === "look-nora",
  )!;
  expect(look.beauty!.previews.at(-1)).toMatchObject({
    performerId: "performer-celeste",
    sourceImageUrl: "/assets/cast/celeste-face.webp",
    provenance: "recorded_provider",
    faceCaptureVersion: production.performers.find(
      (performer) => performer.id === "performer-celeste",
    )!.faceCapture!.version,
    beautyRevision: look.beauty!.revision,
  });
  expect(
    look.beauty!.approvals.some(
      (approval) =>
        approval.state === "current" &&
        approval.beautyRevision === look.beauty!.revision,
    ),
  ).toBe(false);
  return production;
}

async function approveAppearance(page: Page): Promise<Production> {
  await page
    .getByRole("button", { name: "Approve appearance", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Approve this exact appearance",
    exact: true,
  });
  await dialog
    .getByLabel("Reviewer name or role")
    .fill("Synthetic browser evaluator");
  await dialog
    .getByLabel("What did you approve?")
    .fill(
      "Synthetic evaluation: approve only this exact recorded garment appearance. Physical fit, hair, makeup and supplier outcomes remain unverified.",
    );
  const production = await command(page, "approve_look", () =>
    dialog
      .getByRole("button", { name: "Record appearance approval", exact: true })
      .click(),
  );
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review approval", exact: true }),
  ).toBeVisible();
  return production;
}

function approval(production: Production, lookId: string): AppearanceApproval {
  const look = production.looks.find((candidate) => candidate.id === lookId)!;
  const current = look.approvals.find(
    (candidate) =>
      candidate.state === "current" &&
      candidate.recipeRevision === look.revision &&
      candidate.performerId === look.performerId,
  );
  expect(current).toBeTruthy();
  return current!;
}

async function allocateInUi(page: Page): Promise<Production> {
  await navigate(page, "Schedule");
  const solved = await command(page, "solve_allocation", () =>
    page
      .getByRole("button", { name: "Check the allocation", exact: true })
      .click(),
  );
  expect(solved.allocationResult).toMatchObject({
    status: "OPTIMAL",
    independentlyChecked: true,
  });
  await expect(
    page.getByText("Independent checker passed", { exact: true }),
  ).toBeVisible();
  const allocated = await command(page, "adopt_allocation", () =>
    page
      .getByRole("button", { name: "Adopt these assignments", exact: true })
      .click(),
  );
  expect(allocated.allocations).toHaveLength(16);
  expect(
    allocated.allocations.every(
      (assignment) => assignment.state === "allocated",
    ),
  ).toBe(true);
  return allocated;
}

async function useRecordedResult(
  page: Page,
  id: string,
  expectedPath: string,
  expectedPerformerId: string,
  expectedUnitId: string,
): Promise<Production> {
  const response = page.waitForResponse(
    (candidate) =>
      /\/api\/projects\/[^/]+\/previews$/.test(path(candidate)) &&
      candidate.request().method() === "POST",
    { timeout: 60_000 },
  );
  await page
    .getByRole("button", { name: "Use matching recorded result", exact: true })
    .click();
  const result = await response;
  expect(result.request().postDataJSON().mode).toBe("recorded");
  const body = await result.json();
  expect(result.ok(), JSON.stringify(body)).toBe(true);
  expect(body.job.state).toBe("succeeded");
  await expect(
    page.getByRole("img", {
      name: "Nora Vale, YouCam generated garment preview",
      exact: true,
    }),
  ).toHaveAttribute("src", expectedPath);
  const production = await persisted(page, id);
  const look = production.looks.find(
    (candidate) => candidate.id === "look-nora",
  )!;
  const preview = look.previews.at(-1)!;
  expect(preview).toMatchObject({
    imageUrl: expectedPath,
    provenance: "recorded_provider",
    performerId: expectedPerformerId,
    unitIds: [expectedUnitId],
    recipeRevision: look.revision,
  });
  expect(preview.captureVersion).toBe(
    production.performers.find(
      (performer) => performer.id === expectedPerformerId,
    )!.captureVersion,
  );
  expect(
    look.approvals.some(
      (candidate) =>
        candidate.state === "current" &&
        candidate.recipeRevision === look.revision,
    ),
  ).toBe(false);
  return production;
}

function localInput(instant: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}`;
}

test.beforeEach(async ({ page }) => {
  createdProjectIds = [];
  attemptedLiveJobs = [];
  await authenticate(page.request);
  await page.route("**/api/projects/*/previews", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.mode !== "recorded"
    ) {
      attemptedLiveJobs.push(route.request().url());
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
});

test.afterEach(async ({ page }, testInfo) => {
  expect
    .soft(
      attemptedLiveJobs,
      "A browser journey must never request a paid preview",
    )
    .toEqual([]);
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
    await testInfo.attach("production-workflow-failure", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  }
  if (testInfo.status === testInfo.expectedStatus) {
    const origin = new URL(page.url()).origin;
    for (const id of createdProjectIds) {
      const deleted = await page.request.delete(`/api/projects/${id}`, {
        headers: { Origin: origin },
      });
      expect
        .soft(
          deleted.status(),
          "Clean up only this test's private fixture copy",
        )
        .toBe(202);
    }
  }
});

test("recorded garment repair preserves Mae and supersedes the frozen working pack", async ({
  page,
}) => {
  let production =
    await test.step("Create an owned example and approve exact costume and makeup outputs", async () => {
      const example = await openExample(page);
      await navigate(page, "Looks");
      await expect(
        page.getByRole("heading", { name: "Nora Vale", level: 1, exact: true }),
      ).toBeVisible();
      await approveAppearance(page);
      await approveMakeup(page);
      await selectLook(page, "Mae Lin");
      const approved = await approveAppearance(page);
      expect(approved.id).toBe(example.id);
      return approved;
    });
  const id = production.id;
  const noraOriginal = approval(production, "look-nora");
  const maeOriginal = approval(production, "look-mae");
  const makeupOriginal = makeupApproval(production);
  let packId = "",
    frozenSnapshot: unknown;

  await test.step("Adopt a checked allocation and create a visibly provisional crew pack", async () => {
    production = await allocateInUi(page);
    await navigate(page, "Handoff");
    await page
      .getByRole("button", { name: "Create a crew pack", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Freeze a clear crew handoff",
      exact: true,
    });
    await dialog
      .getByLabel("Pack title")
      .fill("Recorded fixture continuity call");
    production = await command(page, "create_pack", () =>
      dialog
        .getByRole("button", { name: "Create frozen pack", exact: true })
        .click(),
    );
    const pack = production.packs.at(-1)!;
    packId = pack.id;
    frozenSnapshot = structuredClone(pack.snapshot);
    expect(pack.state).toBe("current");
    expect(pack.warnings.length).toBeGreaterThan(0);
    expect(
      pack.snapshot.looks.find((look) => look.id === "look-nora")!.beauty!
        .approvals[0],
    ).toEqual(makeupOriginal);
    await expect(page).toHaveURL(new RegExp(`/handoff/${packId}$`));
    await expect(
      page.getByText("WORKING PACK — EVIDENCE PENDING", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Before this can be called ready",
        exact: true,
      }),
    ).toBeVisible();
  });

  await expect(
    page.getByRole("region", { name: "Separate makeup evidence", exact: true }),
  ).toHaveCount(3);
  await expect(
    page
      .getByRole("region", { name: "Separate makeup evidence", exact: true })
      .first()
      .getByRole("img", {
        name: "The returning coat: separate generated makeup detail",
        exact: true,
      }),
  ).toHaveAttribute("src", /nora-ada-berry/);

  await test.step("Inspect the signature coat impact before adopting the charcoal repair", async () => {
    await navigate(page, "Production");
    await page
      .getByRole("button", { name: "Review a change", exact: true })
      .click();
    let dialog = page.getByRole("dialog", {
      name: "The show changes. The story stays.",
      exact: true,
    });
    await dialog
      .getByLabel("Which physical unit is unavailable?")
      .selectOption("unit-coat-oxblood");
    production = await command(page, "propose_change", () =>
      dialog
        .getByRole("button", { name: "Preview the impact", exact: true })
        .click(),
    );
    const proposal = production.proposals.at(-1)!;
    expect(proposal.impact.sceneIds).toEqual([
      "scene-01",
      "scene-04",
      "scene-07",
    ]);
    expect(proposal.impact.invalidatedApprovalIds).toEqual([noraOriginal.id]);
    expect(proposal.impact.preservedApprovalIds).toContain(maeOriginal.id);
    expect(proposal.impact.preservedBeautyApprovalIds).toContain(
      makeupOriginal.id,
    );
    expect(proposal.impact.invalidatedBeautyApprovalIds).toEqual([]);
    expect(proposal.impact.packIds).toContain(packId);
    expect(approval(production, "look-nora")).toEqual(noraOriginal);
    dialog = page.getByRole("dialog", {
      name: "Follow the change.",
      exact: true,
    });
    await expect(
      dialog.getByText("1 existing appearance approval preserved", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Scene 01, Scene 04, Scene 07", { exact: true }),
    ).toBeVisible();
    await dialog
      .getByRole("button", { name: /C-021 · Charcoal wool coat/ })
      .click();
    production = await command(page, "adopt_repair", () =>
      dialog
        .getByRole("button", { name: "Adopt this revision", exact: true })
        .click(),
    );
    expect(
      production.looks.find((look) => look.id === "look-nora")!.unitIds,
    ).toEqual(["unit-coat-charcoal"]);
    expect(
      production.looks
        .find((look) => look.id === "look-nora")!
        .approvals.find((entry) => entry.id === noraOriginal.id)!.state,
    ).toBe("stale");
    expect(approval(production, "look-mae")).toEqual(maeOriginal);
    expect(makeupApproval(production)).toEqual(makeupOriginal);
    expect(production.packs.find((pack) => pack.id === packId)!.state).toBe(
      "superseded",
    );
    expect(
      production.packs.find((pack) => pack.id === packId)!.snapshot,
    ).toEqual(frozenSnapshot);
    await page
      .getByRole("dialog", { name: "A considered new revision.", exact: true })
      .getByRole("link", { name: "Review affected looks", exact: true })
      .click();
  });

  await test.step("Load the exact recorded replacement, approve it and reallocate", async () => {
    await expect(
      page.getByRole("heading", { name: "Nora Vale", level: 1, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Approve appearance", exact: true }),
    ).toBeDisabled();
    production = await useRecordedResult(
      page,
      id,
      "/examples/previews/nora-charcoal.webp",
      "performer-ada",
      "unit-coat-charcoal",
    );
    production = await approveAppearance(page);
    expect(approval(production, "look-nora").id).not.toBe(noraOriginal.id);
    expect(approval(production, "look-mae")).toEqual(maeOriginal);
    expect(makeupApproval(production)).toEqual(makeupOriginal);
    await page
      .getByRole("button", { name: "Makeup detail", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Review makeup approval", exact: true }),
    ).toBeVisible();
    production = await allocateInUi(page);
    expect(
      production.allocations
        .filter((assignment) => assignment.lookId === "look-nora")
        .every((assignment) => assignment.unitId === "unit-coat-charcoal"),
    ).toBe(true);
  });

  await test.step("Record separately labelled synthetic request, confirmation, receipt and return", async () => {
    await navigate(page, "Handoff");
    await page
      .getByRole("button", { name: "Prepare sourcing request", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Prepare a sourcing request",
      exact: true,
    });
    const unit = production.units.find(
      (candidate) => candidate.id === "unit-coat-charcoal",
    )!;
    await dialog
      .getByRole("checkbox", { name: /C-021.*Charcoal wool coat/ })
      .check();
    await dialog
      .getByLabel(/^From \(/)
      .fill(localInput(unit.availability.from, production.timeZone));
    await dialog
      .getByLabel("Through", { exact: true })
      .fill(localInput(unit.availability.to, production.timeZone));
    await dialog
      .getByLabel("Pickup, return, measurement, and preparation notes")
      .fill(
        "Synthetic browser rehearsal only. No supplier communication, reservation, physical receipt or return actually occurs.",
      );
    production = await command(page, "create_sourcing", () =>
      dialog
        .getByRole("button", { name: "Create request draft", exact: true })
        .click(),
    );
    const requestId = production.sourcing.at(-1)!.id;
    expect(production.sourcing.at(-1)).toMatchObject({
      status: "draft",
      provenance: "synthetic",
      operator: null,
    });
    await page.getByRole("button", { name: /Charcoal wool coat/ }).click();
    const responseDialog = page.getByRole("dialog", {
      name: unit.supplier,
      exact: true,
    });
    await expect(
      responseDialog.getByText("SYNTHETIC EXERCISE / NO SUPPLIER TRANSACTION", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      responseDialog.getByRole("combobox", { name: "Provenance", exact: true }),
    ).toHaveValue("synthetic");
    await expect(
      responseDialog.getByRole("combobox", { name: "Provenance", exact: true }),
    ).toBeDisabled();
    for (const status of [
      "requested",
      "confirmed",
      "received",
      "returned",
    ] as const) {
      await responseDialog
        .getByLabel("Next recorded stage")
        .selectOption(status);
      await responseDialog
        .getByLabel("Operator name / role")
        .fill("Synthetic browser operator");
      await responseDialog
        .getByLabel("Response or custody evidence")
        .fill(
          `Synthetic ${status} rehearsal only. No real supplier response, receipt or return has occurred.`,
        );
      await responseDialog
        .getByLabel("External reference / evidence reference")
        .fill(`PLAYWRIGHT-SYNTHETIC-${status}`);
      production = await command(page, "update_sourcing", () =>
        responseDialog
          .getByRole("button", { name: "Record this stage", exact: true })
          .click(),
      );
      expect(
        production.sourcing.find((request) => request.id === requestId),
      ).toMatchObject({
        status,
        provenance: "synthetic",
        operator: "Synthetic browser operator",
        externalReference: `PLAYWRIGHT-SYNTHETIC-${status}`,
      });
      await expect(
        responseDialog.getByText(status, { exact: true }),
      ).toBeVisible();
    }
    await expect(
      responseDialog.getByText(/This record is closed\./),
    ).toBeVisible();
    await responseDialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
    expect(
      production.units.find(
        (candidate) => candidate.id === "unit-coat-charcoal",
      )!.fitting.status,
    ).toBe("not_measured");
    expect(approval(production, "look-mae")).toEqual(maeOriginal);
  });

  await test.step("Reopen the old frozen pack and expose its superseded source", async () => {
    await page
      .getByRole("link", { name: /Recorded fixture continuity call/ })
      .click();
    await expect(page).toHaveURL(new RegExp(`/handoff/${packId}$`));
    await expect(
      page.getByText("This pack has been superseded.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("SUPERSEDED COPY", { exact: true }),
    ).toBeVisible();
    const stored = await persisted(page, id);
    expect(stored.packs.find((pack) => pack.id === packId)!.snapshot).toEqual(
      frozenSnapshot,
    );
    expect(
      stored.packs
        .find((pack) => pack.id === packId)!
        .snapshot.looks.find((look) => look.id === "look-nora")!.unitIds,
    ).toEqual(["unit-coat-oxblood"]);
  });
});

test("recorded recast preserves character direction and requires Celeste's own approval", async ({
  page,
}) => {
  let production = await openExample(page);
  const id = production.id;
  await navigate(page, "Looks");
  await page
    .getByRole("button", { name: "Edit character direction", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "The character’s visual direction",
    exact: true,
  });
  await dialog
    .getByLabel("Designer name or role")
    .fill("Synthetic direction reviewer");
  production = await command(page, "update_direction", () =>
    dialog
      .getByRole("button", { name: "Record direction", exact: true })
      .click(),
  );
  const direction = structuredClone(
    production.characters.find((character) => character.id === "char-nora")!
      .direction,
  );
  production = await approveAppearance(page);
  production = await approveMakeup(page);
  const originalNora = approval(production, "look-nora");
  const originalMakeup = makeupApproval(production);
  await selectLook(page, "Mae Lin");
  production = await approveAppearance(page);
  const originalMae = approval(production, "look-mae");

  await navigate(page, "Production");
  await page
    .getByRole("button", { name: "Review a change", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "The show changes. The story stays.",
    exact: true,
  });
  await dialog.getByRole("button", { name: /A character is recast/ }).click();
  await dialog
    .getByRole("combobox", { name: "Character", exact: true })
    .selectOption("char-nora");
  await dialog
    .getByRole("combobox", { name: "Replacement performer", exact: true })
    .selectOption("performer-celeste");
  production = await command(page, "propose_change", () =>
    dialog
      .getByRole("button", { name: "Preview the impact", exact: true })
      .click(),
  );
  expect(production.proposals.at(-1)!.impact.preservedApprovalIds).toContain(
    originalMae.id,
  );
  expect(
    production.proposals.at(-1)!.impact.invalidatedBeautyApprovalIds,
  ).toContain(originalMakeup.id);
  dialog = page.getByRole("dialog", {
    name: "Follow the change.",
    exact: true,
  });
  production = await command(page, "adopt_repair", () =>
    dialog
      .getByRole("button", { name: "Adopt this revision", exact: true })
      .click(),
  );
  expect(
    production.characters.find((character) => character.id === "char-nora"),
  ).toMatchObject({ performerId: "performer-celeste", direction });
  const recastLook = production.looks.find((look) => look.id === "look-nora")!;
  expect(
    recastLook.beauty!.approvals.find(
      (entry) => entry.id === originalMakeup.id,
    )!.state,
  ).toBe("stale");
  expect(
    recastLook.beauty!.previews.every(
      (preview) => preview.performerId === "performer-ada",
    ),
  ).toBe(true);
  expect(
    recastLook.approvals.find((entry) => entry.id === originalNora.id)!.state,
  ).toBe("stale");
  expect(
    recastLook.previews.every(
      (preview) => preview.performerId === "performer-ada",
    ),
  ).toBe(true);
  expect(approval(production, "look-mae")).toEqual(originalMae);
  expect(
    production.units.find((unit) => unit.id === "unit-coat-oxblood")!.fitting,
  ).toMatchObject({ performerId: "performer-celeste", status: "not_measured" });
  await page
    .getByRole("dialog", { name: "A considered new revision.", exact: true })
    .getByRole("link", { name: "Review affected looks", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Approve appearance", exact: true }),
  ).toBeDisabled();
  production = await useRecordedResult(
    page,
    id,
    "/examples/previews/nora-celeste.webp",
    "performer-celeste",
    "unit-coat-oxblood",
  );
  expect(
    production.looks.find((look) => look.id === "look-nora")!.previews.at(-1)!
      .sourceImageUrl,
  ).toBe("/assets/cast/celeste.webp");
  production = await approveAppearance(page);
  expect(approval(production, "look-nora")).toMatchObject({
    performerId: "performer-celeste",
    recipeRevision: recastLook.revision,
  });
  expect(approval(production, "look-nora").id).not.toBe(originalNora.id);
  expect(approval(production, "look-mae")).toEqual(originalMae);
  const garmentApproval = structuredClone(approval(production, "look-nora"));
  production = await useRecordedMakeup(page, id);
  production = await approveMakeup(page);
  expect(makeupApproval(production)).toMatchObject({
    performerId: "performer-celeste",
    beautyRevision: recastLook.beauty!.revision,
    faceCaptureVersion: 1,
  });
  expect(makeupApproval(production).id).not.toBe(originalMakeup.id);
  expect(approval(production, "look-nora")).toEqual(garmentApproval);
  expect(approval(production, "look-mae")).toEqual(originalMae);
  const stored = await persisted(page, id);
  expect(
    stored.characters.find((character) => character.id === "char-nora")!
      .direction,
  ).toEqual(direction);
  expect(
    stored.units.find((unit) => unit.id === "unit-coat-oxblood")!.fitting
      .status,
  ).toBe("not_measured");
});
