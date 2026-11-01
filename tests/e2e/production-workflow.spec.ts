import { expect, test, type Page, type Response } from "@playwright/test";
import type {
  AppearanceCandidate,
  Production,
  ProductionCommand,
} from "../../src/lib/types";
import {
  getCurrentApproval,
  getCurrentPreview,
} from "../../src/lib/domain/lineage";
import { authenticate } from "./helpers";
import { getReadiness } from "../../src/lib/domain/selectors";
import { getAllocationAdoptionReview } from "../../src/lib/domain/allocation-review";

// Real browser → authenticated API → database. All provider requests are recorded
// replays; a guard rejects every fresh request before it reaches the application.
test.use({
  viewport: { width: 1440, height: 1000 },
  actionTimeout: 15_000,
  navigationTimeout: 60_000,
});
test.setTimeout(300_000);
let projectIds: string[] = [];
let liveRequests: string[] = [];
const path = (response: Response) => new URL(response.url()).pathname;
async function persisted(page: Page, id: string): Promise<Production> {
  const response = await page.request.get(`/api/projects/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).project;
}
async function command(
  page: Page,
  type: ProductionCommand["type"],
  action: () => Promise<unknown>,
): Promise<Production> {
  const response = page.waitForResponse(
    (item) =>
      /\/api\/projects\/[^/]+\/commands$/.test(path(item)) &&
      item.request().method() === "POST" &&
      item.request().postDataJSON()?.command?.type === type,
  );
  await action();
  const result = await response;
  const body = await result.json();
  expect(result.ok(), JSON.stringify(body)).toBe(true);
  await expect(
    page.getByText("All changes saved", { exact: true }),
  ).toBeVisible();
  return body.project;
}
async function example(page: Page): Promise<Production> {
  await page.goto("/");
  const response = page.waitForResponse(
    (item) =>
      path(item) === "/api/projects" && item.request().method() === "POST",
    { timeout: 75_000 },
  );
  await page
    .getByRole("button", { name: "Step inside the production", exact: true })
    .click();
  const created = await response;
  expect(created.status()).toBe(201);
  const project: Production = (await created.json()).project;
  projectIds.push(project.id);
  await expect(
    page.getByRole("heading", { name: "THE LAST LIGHT", exact: true }),
  ).toBeVisible();
  expect(project.revision).toBe(17);
  expect(project.looks).toHaveLength(8);
  expect(project.scenes).toHaveLength(7);
  for (const look of project.looks) {
    expect(
      getCurrentPreview(look, project),
      `${look.id} has a real recorded garment`,
    ).toBeTruthy();
    expect(look.approvals).toEqual([]);
    expect(look.beauty?.approvals || []).toEqual([]);
    if (look.beauty)
      expect(
        look.beauty.previews,
        `${look.id} has its exact makeup recording`,
      ).toHaveLength(1);
    for (const detail of look.details || []) {
      expect(
        detail.previews,
        `${look.id} has its exact ${detail.kind} recording`,
      ).toHaveLength(1);
      expect(detail.approvals).toEqual([]);
    }
  }
  expect(project.appearanceCandidates).toHaveLength(2);
  for (const candidate of project.appearanceCandidates!) {
    expect(candidate.previews).toHaveLength(1);
    expect(candidate.previews[0].provenance).toBe("recorded_provider");
    expect(candidate.approvals).toEqual([]);
  }
  await expect(
    page.getByRole("region", {
      name: "Visual continuity across story days",
      exact: true,
    }),
  ).toBeVisible();
  return project;
}
async function visit(page: Page, id: string, suffix = "") {
  await page.goto(`/production/${id}${suffix}`);
  await expect(page.locator("h1")).toBeVisible();
}
async function approveLook(page: Page): Promise<Production> {
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
      "This exact recorded appearance supports the stated direction. Physical fitting remains unverified.",
    );
  const result = await command(page, "approve_look", () =>
    dialog
      .getByRole("button", { name: "Record appearance approval", exact: true })
      .click(),
  );
  await expect(dialog).not.toBeVisible();
  return result;
}
async function exampleDecisions(page: Page, id: string): Promise<Production> {
  await visit(page, id);
  await page
    .getByRole("button", {
      name: /^(Record example decisions|Manage example decisions)$/,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Rehearse the decisions.",
    exact: true,
  });
  const result = await command(page, "set_example_decisions", () =>
    dialog
      .getByRole("button", { name: "Record example decisions", exact: true })
      .click(),
  );
  await expect(dialog).not.toBeVisible();
  return result;
}
async function candidateDecision(
  page: Page,
  id: string,
  unitName: string,
): Promise<Production> {
  const card = page.locator(".candidate-card").filter({
    has: page.getByRole("heading", { name: unitName, exact: true }),
  });
  await expect(card).toHaveCount(1);
  const approve = card.getByRole("button", {
    name: "Approve this alternative",
    exact: true,
  });
  if (await approve.isDisabled()) {
    const response = page.waitForResponse(
      (item) =>
        path(item) === `/api/projects/${id}/previews` &&
        item.request().method() === "POST",
    );
    await card
      .getByRole("button", {
        name: "Use matching recorded alternative",
        exact: true,
      })
      .click();
    const result = await response;
    const body = await result.json();
    expect(result.ok(), JSON.stringify(body)).toBe(true);
    expect(body.job.state).toBe("succeeded");
  }
  await approve.click();
  const dialog = page.getByRole("dialog", {
    name: "Approve this exact alternative",
    exact: true,
  });
  await dialog
    .getByLabel("Alternative reviewer name or role")
    .fill("Synthetic alternative reviewer");
  await dialog
    .getByLabel("Why does this alternative carry the character?")
    .fill(
      "The exact source, garment and output preserve the character’s current intent in this synthetic rehearsal.",
    );
  const result = await command(page, "approve_candidate", () =>
    dialog
      .getByRole("button", { name: "Record alternative approval", exact: true })
      .click(),
  );
  await expect(dialog).not.toBeVisible();
  return result;
}
async function allocate(
  page: Page,
  id: string,
  adopt = true,
): Promise<Production> {
  await visit(page, id, "/schedule");
  const solved = await command(page, "solve_allocation", () =>
    page
      .getByRole("button", { name: "Check the allocation", exact: true })
      .click(),
  );
  expect(["FEASIBLE", "OPTIMAL"]).toContain(solved.allocationResult?.status);
  expect(solved.allocationResult).toMatchObject({
    constraintChecked: true,
    independentlyChecked: false,
  });
  expect(solved.allocationResult!.assignments).toHaveLength(17);
  await expect(
    page.getByRole("region", { name: "Allocation result", exact: true }),
  ).toBeFocused();
  if (!adopt) return solved;
  const confirmation = page.getByRole("checkbox", {
    name: "I have reviewed these exact garment changes and direction references. Adopt this proposal.",
    exact: true,
  });
  if (await confirmation.count()) {
    await expect(
      page.getByRole("button", {
        name: "Adopt these assignments",
        exact: true,
      }),
    ).toBeDisabled();
    await confirmation.check();
  }
  return command(page, "adopt_allocation", () =>
    page
      .getByRole("button", { name: "Adopt these assignments", exact: true })
      .click(),
  );
}
async function pack(page: Page, id: string): Promise<Production> {
  await visit(page, id, "/handoff");
  await page
    .getByRole("button", { name: "Create a crew pack", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Freeze a clear crew handoff",
    exact: true,
  });
  await dialog
    .getByLabel("Pack title")
    .fill("Recorded review-round continuity call");
  const result = await command(page, "create_pack", () =>
    dialog
      .getByRole("button", { name: "Create frozen pack", exact: true })
      .click(),
  );
  await expect(page).toHaveURL(
    new RegExp(`/handoff/${result.packs.at(-1)!.id}$`),
  );
  await expect(
    page.getByText("WORKING PACK — EVIDENCE PENDING", { exact: true }),
  ).toBeVisible();
  return result;
}
async function impact(page: Page): Promise<Production> {
  const dialog = page.getByRole("dialog");
  return command(page, "propose_change", () =>
    dialog
      .getByRole("button", { name: "Preview the impact", exact: true })
      .click(),
  );
}
async function returnToImpact(page: Page): Promise<Production> {
  const result = await command(page, "propose_change", () =>
    page
      .getByRole("link", { name: "Return to change review", exact: true })
      .click(),
  );
  await expect(
    page.getByRole("dialog", { name: "Follow the change.", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Which physical unit is unavailable?"),
  ).not.toBeVisible();
  return result;
}
async function adoptRepair(page: Page, code?: string): Promise<Production> {
  const dialog = page.getByRole("dialog", {
    name: "Follow the change.",
    exact: true,
  });
  if (code)
    await dialog.getByRole("button", { name: new RegExp(code) }).click();
  return command(page, "adopt_repair", () =>
    dialog
      .getByRole("button", { name: "Adopt this revision", exact: true })
      .click(),
  );
}
async function recordedMakeup(
  page: Page,
  id: string,
  lookId = "look-nora",
): Promise<Production> {
  await visit(page, id, `/looks?look=${lookId}&detail=makeup`);
  const response = page.waitForResponse(
    (item) =>
      path(item) === `/api/projects/${id}/previews` &&
      item.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Use matching recorded makeup", exact: true })
    .click();
  const result = await response;
  expect(result.ok()).toBe(true);
  expect((await result.json()).job).toMatchObject({
    kind: "beauty",
    state: "succeeded",
  });
  await page
    .getByRole("button", { name: "Approve makeup detail", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Approve this exact makeup detail",
    exact: true,
  });
  await dialog
    .getByLabel("Makeup reviewer name or role")
    .fill("Synthetic face reviewer");
  await dialog
    .getByLabel("What did you approve in the makeup detail?")
    .fill(
      "Inspected the exact new performer face source, lip and blush result for this synthetic continuity state.",
    );
  return command(page, "approve_beauty", () =>
    dialog
      .getByRole("button", { name: "Record makeup approval", exact: true })
      .click(),
  );
}
async function recordedNecklace(page: Page, id: string): Promise<Production> {
  await visit(page, id, "/looks?look=look-nora&detail=necklace");
  const response = page.waitForResponse(
    (item) =>
      path(item) === `/api/projects/${id}/previews` &&
      item.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: "Use matching recorded necklace",
      exact: true,
    })
    .click();
  const result = await response;
  expect(result.ok()).toBe(true);
  expect((await result.json()).job).toMatchObject({
    kind: "necklace",
    state: "succeeded",
  });
  await page
    .getByRole("button", { name: "Approve necklace detail", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Approve this exact necklace detail",
    exact: true,
  });
  await dialog
    .getByLabel("Necklace reviewer name or role")
    .fill("Synthetic accessory reviewer");
  await dialog
    .getByLabel("What did you approve in the necklace detail?")
    .fill(
      "Inspected the exact Celeste source and brass pendant output; physical placement still needs a fitting.",
    );
  return command(page, "approve_detail", () =>
    dialog
      .getByRole("button", { name: "Record necklace approval", exact: true })
      .click(),
  );
}

test.beforeEach(async ({ page }) => {
  projectIds = [];
  liveRequests = [];
  await authenticate(page.request);
  await page.route("**/api/projects/*/previews", async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.mode !== "recorded"
    ) {
      liveRequests.push(route.request().url());
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
});
test.afterEach(async ({ page }, info) => {
  expect
    .soft(liveRequests, "No fresh provider call is allowed in this suite")
    .toEqual([]);
  if (info.status !== info.expectedStatus && !page.isClosed())
    await info.attach("review-journey-failure", {
      body: await page.screenshot({ fullPage: true }),
      contentType: "image/png",
    });
  if (info.status === info.expectedStatus)
    for (const id of projectIds)
      expect((await page.request.delete(`/api/projects/${id}`)).status()).toBe(
        202,
      );
});

test("one production carries approved coat repair through recast, independent details, sourcing and frozen handoff", async ({
  page,
}, testInfo) => {
  let p = await example(page);
  const id = p.id;
  await visit(page, id, "/looks?look=look-nora");
  p = await approveLook(page);
  const originalNora = getCurrentApproval(
    p.looks.find((look) => look.id === "look-nora")!,
    p,
  )!;
  await visit(page, id, "/looks?look=look-mae");
  p = await approveLook(page);
  const originalMae = getCurrentApproval(
    p.looks.find((look) => look.id === "look-mae")!,
    p,
  )!;
  p = await exampleDecisions(page, id);
  expect(
    getCurrentApproval(
      p.looks.find((look) => look.id === "look-mae")!,
      p,
    )!.id,
  ).toBe(originalMae.id);
  expect(p.appearanceCandidates!.every((item) => !item.approvals.length)).toBe(
    true,
  );
  expect(getReadiness(p)).toMatchObject({
    appearanceApproved: 8,
    beautyApproved: 2,
    detailsApproved: 4,
  });
  const oldMakeup = structuredClone(
    p.looks.find((look) => look.id === "look-nora")!.beauty!.approvals,
  );
  const oldNecklace = structuredClone(
    p.looks
      .find((look) => look.id === "look-nora")!
      .details!.find((detail) => detail.kind === "necklace")!.approvals,
  );
  const oldMaeHair = structuredClone(
    p.looks.find((look) => look.id === "look-mae")!.details,
  );
  p = await allocate(page, id);
  expect(p.allocationResult!.status).toBe("FEASIBLE");
  expect(p.allocationResult!.totalCostCents).toBe(50_000);
  p = await pack(page, id);
  const frozen = structuredClone(p.packs.at(-1)!);
  const requirements = page.getByRole("region", {
    name: "Unresolved crew requirements",
    exact: true,
  });
  const requirementsToggle = requirements.getByRole("button");
  const requirementDetails = requirements.locator(".crew-warnings-details");
  expect(frozen.warnings.length).toBeGreaterThan(0);
  await expect(requirements).toContainText(
    `${frozen.warnings.length} unresolved requirements`,
  );
  await expect(requirementsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(requirementsToggle).toHaveAttribute(
    "aria-controls",
    (await requirementDetails.getAttribute("id"))!,
  );
  await expect(requirementDetails).not.toBeVisible();
  await expect(
    page.getByText("WORKING PACK — EVIDENCE PENDING", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".crew-look > figure img").first(),
  ).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("crew-readiness-collapsed.png"),
  });
  await requirementsToggle.focus();
  await page.keyboard.press("Enter");
  await expect(requirementsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(requirementDetails).toBeVisible();
  await expect(requirementDetails.locator("li")).toHaveText(frozen.warnings);
  await page.keyboard.press("Space");
  await expect(requirementsToggle).toHaveAttribute("aria-expanded", "false");
  await expect(requirementDetails).not.toBeVisible();
  expect((await persisted(page, id)).revision).toBe(p.revision);
  await expect(
    page.getByRole("region", { name: "Separate makeup evidence", exact: true }),
  ).toHaveCount(3);
  await expect(
    page.getByRole("region", {
      name: "Separate hair colour evidence",
      exact: true,
    }),
  ).toHaveCount(4);
  await expect(
    page.getByRole("region", {
      name: "Separate necklace evidence",
      exact: true,
    }),
  ).toHaveCount(3);
  await page.emulateMedia({ media: "print" });
  await expect(requirementDetails).toHaveAttribute("hidden", "");
  await expect(requirementDetails).toBeVisible();
  await expect(requirementDetails.locator("li")).toHaveText(frozen.warnings);
  await expect(requirementDetails.locator("li").first()).toBeVisible();
  await expect(requirementDetails.locator("li").last()).toBeVisible();
  await expect(requirementsToggle).not.toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect
    .poll(() =>
      page.locator(".crew-document img").evaluateAll((images) => ({
        count: images.length,
        loaded: images.filter(
          (image) =>
            (image as HTMLImageElement).complete &&
            (image as HTMLImageElement).naturalWidth > 0,
        ).length,
      })),
    )
    .toEqual({ count: 27, loaded: 27 });
  const crewPdf = await page.pdf({
    path: testInfo.outputPath("frozen-crew-pack.pdf"),
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });
  expect(crewPdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(crewPdf.length).toBeGreaterThan(10_000);
  await page.emulateMedia({ media: "screen" });
  await expect(requirementDetails).not.toBeVisible();
  await expect(requirementsToggle).toHaveAttribute("aria-expanded", "false");

  await test.step("Inspect actual alternatives before authorizing the replacement", async () => {
    await visit(page, id);
    await page
      .getByRole("button", { name: "Review a change", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Which physical unit is unavailable?")
      .selectOption("unit-coat-oxblood");
    p = await impact(page);
    const proposal = p.proposals.at(-1)!;
    expect(proposal.impact.sceneIds).toEqual([
      "scene-01",
      "scene-04",
      "scene-07",
    ]);
    expect(proposal.impact.lookIds).toHaveLength(2);
    expect(proposal.impact.invalidatedApprovalIds).toContain(originalNora.id);
    expect(proposal.impact.preservedApprovalIds).toContain(originalMae.id);
    expect(proposal.impact.invalidatedBeautyApprovalIds).toEqual([]);
    expect(proposal.impact.creativeFlags?.length).toBeGreaterThan(0);
    const dialog = page.getByRole("dialog", {
      name: "Follow the change.",
      exact: true,
    });
    await expect(
      dialog.getByRole("img", { name: /Actual YouCam performer preview/ }),
    ).toHaveCount(2);
    await expect(
      dialog.getByRole("button", { name: "Adopt this revision", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("link", { name: "Compare & review alternatives", exact: true })
      .click();
    const burgundy = p.units.find((unit) => unit.id === "unit-coat-burgundy")!;
    p = await candidateDecision(page, id, burgundy.name);
    p = await returnToImpact(page);
    const reviewed = p.appearanceCandidates!.find(
      (item) => item.id === "candidate-nora-burgundy",
    )!;
    const approvedId = reviewed.approvals.at(-1)!.id;
    const exactPreviewId = reviewed.previews.at(-1)!.id;
    p = await adoptRepair(page, "C-033");
    for (const look of p.looks.filter(
      (item) => item.characterId === "char-nora",
    )) {
      expect(look.unitIds).toEqual(["unit-coat-burgundy"]);
      expect(look.activeCandidateId).toBe(reviewed.id);
      expect(getCurrentApproval(look, p)?.id).toBe(approvedId);
    }
    expect(
      p.looks.find((look) => look.id === "look-nora")!.beauty!.approvals,
    ).toEqual(oldMakeup);
    expect(
      p.looks
        .find((look) => look.id === "look-nora")!
        .details!.find((detail) => detail.kind === "necklace")!.approvals,
    ).toEqual(oldNecklace);
    expect(
      getCurrentApproval(
        p.looks.find((look) => look.id === "look-mae")!,
        p,
      )!.id,
    ).toBe(originalMae.id);
    const adoptedDialog = page.getByRole("dialog", {
      name: "A considered new revision.",
      exact: true,
    });
    await adoptedDialog
      .getByLabel("Nora Vale character direction")
      .fill(
        "The burgundy wool coat keeps Nora’s ceremonial silhouette and the recurring long line through the final bow.",
      );
    await adoptedDialog
      .getByLabel("Nora Vale essential details")
      .fill("Long coat silhouette\nA recurring single physical coat");
    p = await command(page, "edit_direction", () =>
      adoptedDialog
        .getByRole("button", { name: "Save direction for review", exact: true })
        .click(),
    );
    expect(
      p.characters.find((character) => character.id === "char-nora")!.direction
        .approvedBy,
    ).toBeNull();
    expect(
      getCurrentApproval(
        p.looks.find((look) => look.id === "look-nora")!,
        p,
      ),
    ).toBeUndefined();
    expect(
      getCurrentPreview(
        p.looks.find((look) => look.id === "look-nora")!,
        p,
      )?.id,
    ).toBe(exactPreviewId);
    await adoptedDialog
      .getByRole("link", { name: "Review affected looks", exact: true })
      .click();
    p = await approveLook(page);
    expect(
      getCurrentPreview(
        p.looks.find((look) => look.id === "look-nora")!,
        p,
      )?.id,
    ).toBe(exactPreviewId);
    expect(
      getCurrentApproval(
        p.looks.find((look) => look.id === "look-nora")!,
        p,
      )?.id,
    ).not.toBe(approvedId);
  });
  p = await exampleDecisions(page, id);
  p = await allocate(page, id);
  expect(
    p.allocations
      .filter(
        (assignment) =>
          assignment.state === "allocated" &&
          assignment.lookId.startsWith("look-nora"),
      )
      .every((assignment) => assignment.unitId === "unit-coat-burgundy"),
  ).toBe(true);
  expect(p.allocationResult!.totalCostCents).toBeLessThan(50_000);

  await test.step("Keep supplier stages explicitly synthetic and evidence-bearing", async () => {
    await visit(page, id, "/handoff");
    await page
      .getByRole("button", { name: "Prepare sourcing request", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Prepare a sourcing request",
      exact: true,
    });
    const unit = p.units.find((item) => item.id === "unit-coat-burgundy")!;
    await dialog
      .getByLabel("Recorded supplier / custodian")
      .selectOption(unit.supplier);
    await dialog.getByLabel(new RegExp(unit.code)).check();
    await dialog
      .getByLabel("Pickup, return, measurement, and preparation notes")
      .fill(
        "Synthetic sourcing rehearsal only. No supplier message or reservation is sent.",
      );
    p = await command(page, "create_sourcing", () =>
      dialog
        .getByRole("button", { name: "Create request draft", exact: true })
        .click(),
    );
    const request = p.sourcing.at(-1)!;
    expect(request).toMatchObject({
      status: "draft",
      provenance: "synthetic",
      operator: null,
    });
    await page.getByRole("button", { name: new RegExp(unit.name) }).click();
    const responseDialog = page.getByRole("dialog", {
      name: unit.supplier,
      exact: true,
    });
    await expect(
      responseDialog.getByRole("combobox", { name: "Provenance", exact: true }),
    ).toHaveValue("synthetic");
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
          `Synthetic ${status} rehearsal. No real supplier response or custody transfer occurred.`,
        );
      await responseDialog
        .getByLabel("External reference / evidence reference")
        .fill(`SYNTHETIC-${status}`);
      p = await command(page, "update_sourcing", () =>
        responseDialog
          .getByRole("button", { name: "Record this stage", exact: true })
          .click(),
      );
      expect(p.sourcing.find((item) => item.id === request.id)).toMatchObject({
        status,
        provenance: "synthetic",
        operator: "Synthetic browser operator",
      });
    }
    await responseDialog
      .getByRole("button", { name: "Close dialog", exact: true })
      .click();
  });

  await test.step("Recast the repaired production using Celeste's own exact reviewed garment", async () => {
    const adaMakeup = p.looks
      .find((look) => look.id === "look-nora")!
      .beauty!.approvals.filter((entry) => entry.state === "current")
      .map((entry) => entry.id);
    expect(adaMakeup).toHaveLength(1);
    const adaNecklace = p.looks
      .find((look) => look.id === "look-nora")!
      .details!.find((detail) => detail.kind === "necklace")!
      .approvals.filter((entry) => entry.state === "current")
      .map((entry) => entry.id);
    expect(adaNecklace).toHaveLength(1);
    await visit(page, id);
    await page
      .getByRole("button", { name: "Review a change", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /A character is recast/ }).click();
    await dialog
      .getByRole("combobox", { name: "Character", exact: true })
      .selectOption("char-nora");
    await dialog
      .getByRole("combobox", { name: "Replacement performer", exact: true })
      .selectOption("performer-celeste");
    p = await impact(page);
    expect(p.proposals.at(-1)!.impact.invalidatedBeautyApprovalIds).toEqual(
      expect.arrayContaining(adaMakeup),
    );
    expect(
      p.characters.find((character) => character.id === "char-nora")!
        .performerId,
    ).toBe("performer-ada");
    dialog = page.getByRole("dialog", {
      name: "Follow the change.",
      exact: true,
    });
    await expect(
      dialog.getByRole("button", { name: "Adopt this revision", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("link", { name: "Compare & review alternatives", exact: true })
      .click();
    await expect(
      page.getByText("Recast study · Celeste Rowan", { exact: true }),
    ).toBeVisible();
    p = await candidateDecision(
      page,
      id,
      p.units.find((unit) => unit.id === "unit-coat-burgundy")!.name,
    );
    const prospective = p.appearanceCandidates!.find(
      (candidate) =>
        candidate.performerId === "performer-celeste" &&
        candidate.recipe.unitIds.includes("unit-coat-burgundy"),
    )!;
    const prospectiveApproval = prospective.approvals.at(-1)!;
    expect(
      p.characters.find((character) => character.id === "char-nora")!
        .performerId,
    ).toBe("performer-ada");
    p = await returnToImpact(page);
    p = await adoptRepair(page);
    expect(
      p.characters.find((character) => character.id === "char-nora")!
        .performerId,
    ).toBe("performer-celeste");
    for (const look of p.looks.filter(
      (item) => item.characterId === "char-nora",
    )) {
      expect(look.unitIds).toEqual(["unit-coat-burgundy"]);
      expect(getCurrentApproval(look, p)?.id).toBe(prospectiveApproval.id);
    }
    const nora = p.looks.find((look) => look.id === "look-nora")!;
    for (const id of adaMakeup)
      expect(
        nora.beauty!.approvals.find((entry) => entry.id === id)!.state,
      ).toBe("stale");
    for (const id of adaNecklace)
      expect(
        nora
          .details!.find((detail) => detail.kind === "necklace")!
          .approvals.find((entry) => entry.id === id)!.state,
      ).toBe("stale");
    expect(
      getCurrentApproval(
        p.looks.find((look) => look.id === "look-mae")!,
        p,
      )?.id,
    ).toBe(originalMae.id);
    expect(p.looks.find((look) => look.id === "look-mae")!.details).toEqual(
      oldMaeHair,
    );
    p = await recordedMakeup(page, id);
    p = await recordedMakeup(page, id, "look-nora-finale");
    p = await recordedNecklace(page, id);
    expect(
      getCurrentApproval(
        p.looks.find((look) => look.id === "look-nora")!,
        p,
      )?.id,
    ).toBe(prospectiveApproval.id);
  });

  await test.step("Reopening the change dialog starts from current production facts", async () => {
    await visit(page, id);
    await page
      .getByRole("button", { name: "Review a change", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "The show changes. The story stays.",
      exact: true,
    });
    await expect(
      dialog.getByRole("button", { name: /A garment is unavailable/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await dialog.getByRole("button", { name: /A character is recast/ }).click();
    await expect(
      dialog.getByRole("combobox", {
        name: "Replacement performer",
        exact: true,
      }),
    ).toHaveValue("performer-ada");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  });

  const stored = await persisted(page, id);
  expect(stored.packs.find((item) => item.id === frozen.id)!.state).toBe(
    "superseded",
  );
  expect(stored.packs.find((item) => item.id === frozen.id)!.snapshot).toEqual(
    frozen.snapshot,
  );
  await visit(page, id, `/handoff/${frozen.id}`);
  await expect(
    page.getByText("This pack has been superseded.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("SUPERSEDED COPY", { exact: true }),
  ).toBeVisible();
  expect(
    stored.units.find((unit) => unit.id === "unit-coat-burgundy")!.fitting
      .status,
  ).toBe("not_measured");
});

test("approval changes solver admissibility and revocation cannot become an adopted-base loophole", async ({
  page,
}) => {
  let p = await example(page);
  const id = p.id;
  p = await exampleDecisions(page, id);
  const unitName = (id: string) => p.units.find((unit) => unit.id === id)!.name;
  await visit(page, id, "/looks?look=look-nora&detail=alternatives");
  p = await candidateDecision(page, id, unitName("unit-coat-burgundy"));
  p = await allocate(page, id, false);
  const review = page.getByRole("region", {
    name: "Garment changes in this allocation",
    exact: true,
  });
  await expect(review).toContainText("C-014 Oxblood velvet coat");
  await expect(review).toContainText("C-033 Burgundy wool coat");
  await expect(review).toContainText("SC 01 / 04 / 07");
  await expect(review).toContainText(
    "The old garment is still in the direction.",
  );
  expect(p.units.find((unit) => unit.id === "unit-coat-oxblood")!.status).toBe(
    "available",
  );
  const adoption = page.getByRole("button", {
    name: "Adopt these assignments",
    exact: true,
  });
  const confirmation = review.getByRole("checkbox", {
    name: "I have reviewed these exact garment changes and direction references. Adopt this proposal.",
    exact: true,
  });
  await expect(confirmation).not.toBeChecked();
  await expect(adoption).toBeDisabled();
  await page.getByText("Why these physical units?", { exact: true }).click();
  const originalChoice = page
    .locator(".choice-comparisons > li")
    .filter({ hasText: "Original recipe · C-014" });
  await expect(originalChoice).toContainText("Production total: +£15");
  await expect(originalChoice).toContainText("Same garment changeovers");
  const staleConfirmation = getAllocationAdoptionReview(p, p.allocationResult!);
  await confirmation.check();
  await expect(adoption).toBeEnabled();
  p = await command(page, "solve_allocation", () =>
    page
      .getByRole("button", { name: "Check the allocation", exact: true })
      .click(),
  );
  expect(p.allocationResult!.inputHash).toBe(staleConfirmation.inputHash);
  expect(p.allocationResult!.proposalId).not.toBe(staleConfirmation.proposalId);
  await expect(confirmation).not.toBeChecked();
  await expect(adoption).toBeDisabled();
  const rejected = await page.request.post(`/api/projects/${id}/commands`, {
    data: {
      expectedRevision: p.revision,
      commandId: crypto.randomUUID(),
      command: {
        type: "adopt_allocation",
        inputHash: p.allocationResult!.inputHash,
        confirmation: {
          proposalId: staleConfirmation.proposalId,
          inputHash: staleConfirmation.inputHash,
          sourceRevision: staleConfirmation.sourceRevision,
          reviewHash: staleConfirmation.reviewHash,
        },
      },
    },
  });
  expect(rejected.status()).toBe(409);
  expect((await persisted(page, id)).revision).toBe(p.revision);
  await confirmation.check();
  p = await command(page, "adopt_allocation", () => adoption.click());
  await expect(review).toContainText("The garment changes you adopted");
  await expect(review).toContainText(
    "The old garment is still in the direction.",
  );
  expect(p.allocationResult!.acceptedConfirmation?.sourceRevision).toBe(
    p.revision - 1,
  );
  expect(p.allocationResult!.status).toBe("OPTIMAL");
  expect(p.allocationResult!.totalCostCents).toBe(48_500);
  expect(
    p.allocations
      .filter(
        (assignment) =>
          assignment.state === "allocated" &&
          assignment.lookId.startsWith("look-nora"),
      )
      .every((assignment) => assignment.unitId === "unit-coat-burgundy"),
  ).toBe(true);
  expect(
    p.allocations.some(
      (assignment) =>
        assignment.state === "allocated" &&
        assignment.unitId === "unit-coat-charcoal",
    ),
  ).toBe(false);
  await visit(page, id, "/looks?look=look-nora&detail=alternatives");
  p = await candidateDecision(page, id, unitName("unit-coat-charcoal"));
  p = await allocate(page, id);
  expect(p.allocationResult!.status).toBe("OPTIMAL");
  expect(p.allocationResult!.totalCostCents).toBe(46_500);
  const previousHash = p.allocationResult!.inputHash;
  const charcoal = p.appearanceCandidates!.find(
    (candidate) => candidate.id === "candidate-nora-charcoal",
  ) as AppearanceCandidate;
  const previousApproval = charcoal.approvals.at(-1)!;
  for (const look of p.looks.filter((item) => item.characterId === "char-nora"))
    expect(look.activeCandidateId).toBe(charcoal.id);
  await visit(page, id, "/looks?look=look-nora&detail=alternatives");
  const card = page.locator(".candidate-card").filter({
    has: page.getByRole("heading", {
      name: unitName("unit-coat-charcoal"),
      exact: true,
    }),
  });
  await card
    .getByRole("button", { name: "Review this decision", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "This exact alternative is approved.",
    exact: true,
  });
  p = await command(page, "revoke_candidate_approval", () =>
    dialog
      .getByRole("button", { name: "Revoke this decision", exact: true })
      .click(),
  );
  for (const look of p.looks.filter(
    (item) => item.characterId === "char-nora",
  )) {
    expect(look.activeCandidateId).toBe(charcoal.id);
    expect(getCurrentApproval(look, p)).toBeUndefined();
  }
  expect(
    p
      .appearanceCandidates!.find((candidate) => candidate.id === charcoal.id)!
      .approvals.find((entry) => entry.id === previousApproval.id)!.state,
  ).not.toBe("current");
  await visit(page, id);
  await expect(
    page
      .locator(".continuity-wall tbody tr")
      .filter({ has: page.getByRole("rowheader", { name: /Nora Vale/ }) })
      .locator(".continuity-cell.approved"),
  ).toHaveCount(0);
  p = await allocate(page, id, false);
  expect(p.allocationResult!.inputHash).not.toBe(previousHash);
  expect(
    p
      .allocationResult!.assignments.filter((assignment) =>
        assignment.lookId.startsWith("look-nora"),
      )
      .every((assignment) => assignment.unitId === "unit-coat-burgundy"),
  ).toBe(true);
});

test("Schedule first explains missing decisions and records explicit example decisions before allocation", async ({
  page,
}, info) => {
  let p = await example(page);
  const id = p.id;
  await visit(page, id, "/schedule");
  const actions = page.locator(".schedule-heading");
  await expect(
    actions.getByRole("link", { name: "Review looks", exact: true }),
  ).toBeVisible();
  await expect(
    actions.getByRole("button", {
      name: "Record example decisions",
      exact: true,
    }),
  ).toBeVisible();
  p = await command(page, "solve_allocation", () =>
    actions
      .getByRole("button", { name: "Check the allocation", exact: true })
      .click(),
  );
  expect(p.allocationResult).toMatchObject({
    status: "DECISIONS_NEEDED",
    decisions: { looksTotal: 8, approvedLooks: 0 },
  });
  expect(p.allocationResult!.assignments).toEqual([]);
  expect(p.allocationResult!.decisions!.missingLookIds).toHaveLength(8);
  const result = page.getByRole("region", {
    name: "Allocation result",
    exact: true,
  });
  await expect(result).toBeFocused();
  await expect(
    result.getByText("DECISIONS NEEDED", { exact: true }),
  ).toHaveClass(/badge-warning/);
  await expect(result).toContainText(
    "8 of 8 looks need an approved appearance before allocation.",
  );
  await expect(result.getByText("INFEASIBLE", { exact: true })).toHaveCount(0);
  await expect(result.locator(".allocation-policy")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.screenshot({ path: info.outputPath("decisions-needed.png") });
  await result.getByRole("link", { name: "Review looks", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/production/${id}/looks\\?look=`));
  await expect(
    page.getByRole("button", { name: "Approve appearance", exact: true }),
  ).toBeVisible();
  await visit(page, id, "/schedule");
  await result
    .getByRole("button", { name: "Record example decisions", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Rehearse the decisions.",
    exact: true,
  });
  await expect(dialog).toContainText("Example reviewer (sample decision)");
  const refreshed = page.waitForResponse(
    (response) =>
      /\/api\/projects\/[^/]+\/commands$/.test(path(response)) &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.command?.type === "solve_allocation",
  );
  await command(page, "set_example_decisions", () =>
    dialog
      .getByRole("button", { name: "Record example decisions", exact: true })
      .click(),
  );
  const response = await refreshed;
  expect(response.ok()).toBe(true);
  p = (await response.json()).project;
  expect(p.allocationResult).toMatchObject({
    status: "FEASIBLE",
    totalCostCents: 50_000,
    decisions: { looksTotal: 8, approvedLooks: 8, missingLookIds: [] },
  });
  await expect(dialog).not.toBeVisible();
  await expect(result.getByText("FEASIBLE", { exact: true })).toBeVisible();
  await expect(
    result.getByRole("button", {
      name: "Adopt these assignments",
      exact: true,
    }),
  ).toBeEnabled();
  expect(
    p.looks.every(
      (look) =>
        getCurrentApproval(look, p)?.approvedBy ===
        "Example reviewer (sample decision)",
    ),
  ).toBe(true);
  p = await command(page, "adopt_allocation", () =>
    result
      .getByRole("button", { name: "Adopt these assignments", exact: true })
      .click(),
  );
  expect(p.allocations).toHaveLength(17);
  expect(liveRequests).toEqual([]);
});

test("a recorded charcoal repair survives a refreshed impact and a Celeste recast in the same production", async ({
  page,
}) => {
  let p = await example(page);
  const id = p.id;
  p = await exampleDecisions(page, id);
  const maeApproval = getCurrentApproval(
    p.looks.find((look) => look.id === "look-mae")!,
    p,
  )!.id;
  const originalBeauty = structuredClone(
    p.looks.find((look) => look.id === "look-nora")!.beauty!.approvals,
  );
  await visit(page, id);
  await page
    .getByRole("button", { name: "Review a change", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Which physical unit is unavailable?")
    .selectOption("unit-coat-oxblood");
  p = await impact(page);
  await page
    .getByRole("dialog", { name: "Follow the change.", exact: true })
    .getByRole("link", { name: "Compare & review alternatives", exact: true })
    .click();
  p = await candidateDecision(
    page,
    id,
    p.units.find((unit) => unit.id === "unit-coat-charcoal")!.name,
  );
  const originalCandidate = p.appearanceCandidates!.find(
    (candidate) => candidate.id === "candidate-nora-charcoal",
  )!;
  const charcoalOutput = originalCandidate.previews.at(-1)!.id;
  const beforeRefresh = p.revision;
  const commandRoute = `**/api/projects/${id}/commands`;
  await page.route(commandRoute, async (route) => {
    if (
      route.request().method() === "POST" &&
      route.request().postDataJSON()?.command?.type === "propose_change"
    ) {
      await route.fulfill({
        status: 503,
        json: {
          error: {
            message: "The impact service is resting. Retry this same change.",
          },
        },
      });
    } else await route.continue();
  });
  await page
    .getByRole("link", { name: "Return to change review", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText(
    "Retry this same change",
  );
  await expect(
    dialog.getByLabel("Which physical unit is unavailable?"),
  ).not.toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Retry impact refresh", exact: true }),
  ).toBeEnabled();
  expect((await persisted(page, id)).revision).toBe(beforeRefresh);
  await page.unroute(commandRoute);
  p = await command(page, "propose_change", () =>
    dialog
      .getByRole("button", { name: "Retry impact refresh", exact: true })
      .click(),
  );
  expect(p.proposals.at(-1)).toMatchObject({
    kind: "garment_unavailable",
    subjectId: "unit-coat-oxblood",
    baseRevision: p.revision,
  });
  p = await adoptRepair(page, "C-021");
  dialog = page.getByRole("dialog", {
    name: "A considered new revision.",
    exact: true,
  });
  await expect(dialog.locator(".change-measured-impact")).toContainText(
    "Removing C-014: 2 looks, 3 scenes, 3 calls identified;",
  );
  await expect(dialog.locator(".change-measured-impact")).toContainText(
    "appearance and detail approvals preserved",
  );
  for (const look of p.looks.filter(
    (item) => item.characterId === "char-nora",
  )) {
    expect(look.unitIds).toEqual(["unit-coat-charcoal"]);
    expect(getCurrentPreview(look, p)?.id).toBe(charcoalOutput);
    expect(getCurrentApproval(look, p)).toBeTruthy();
  }
  expect(
    p.looks.find((look) => look.id === "look-nora")!.beauty!.approvals,
  ).toEqual(originalBeauty);
  await dialog
    .getByLabel("Nora Vale character direction")
    .fill(
      "The charcoal wool coat carries Nora’s long silhouette through the return and final bow.",
    );
  await dialog
    .getByLabel("Nora Vale essential details")
    .fill("Long coat silhouette\nA recurring single physical coat");
  await dialog.getByLabel("Nora Vale colour palette").fill("#34363C");
  p = await command(page, "edit_direction", () =>
    dialog
      .getByRole("button", { name: "Save direction for review", exact: true })
      .click(),
  );
  expect(
    getCurrentApproval(
      p.looks.find((look) => look.id === "look-nora")!,
      p,
    ),
  ).toBeUndefined();
  expect(
    getCurrentPreview(
      p.looks.find((look) => look.id === "look-nora")!,
      p,
    )?.id,
  ).toBe(charcoalOutput);
  await dialog
    .getByRole("link", { name: "Review affected looks", exact: true })
    .click();
  p = await approveLook(page);
  p = await allocate(page, id);
  expect(p.allocationResult!.totalCostCents).toBe(46_500);
  await visit(page, id);
  await page
    .getByRole("button", { name: "Review a change", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: /A character is recast/ }).click();
  await dialog
    .getByRole("combobox", { name: "Character", exact: true })
    .selectOption("char-nora");
  await dialog
    .getByRole("combobox", { name: "Replacement performer", exact: true })
    .selectOption("performer-celeste");
  p = await impact(page);
  await page
    .getByRole("dialog", { name: "Follow the change.", exact: true })
    .getByRole("link", { name: "Compare & review alternatives", exact: true })
    .click();
  p = await candidateDecision(
    page,
    id,
    p.units.find((unit) => unit.id === "unit-coat-charcoal")!.name,
  );
  const celesteCandidate = p.appearanceCandidates!.find(
    (candidate) =>
      candidate.performerId === "performer-celeste" &&
      candidate.recipe.unitIds.includes("unit-coat-charcoal"),
  )!;
  expect(celesteCandidate.previews.at(-1)!.provenance).toBe(
    "recorded_provider",
  );
  expect(celesteCandidate.previews.at(-1)!.performerId).toBe(
    "performer-celeste",
  );
  const celesteApproval = celesteCandidate.approvals.at(-1)!.id;
  p = await returnToImpact(page);
  expect(p.proposals.at(-1)).toMatchObject({
    kind: "recast",
    subjectId: "char-nora",
    replacementId: "performer-celeste",
    baseRevision: p.revision,
  });
  p = await adoptRepair(page);
  for (const look of p.looks.filter(
    (item) => item.characterId === "char-nora",
  )) {
    expect(look.performerId).toBe("performer-celeste");
    expect(look.unitIds).toEqual(["unit-coat-charcoal"]);
    expect(getCurrentApproval(look, p)?.id).toBe(celesteApproval);
    expect(getCurrentPreview(look, p)?.performerId).toBe("performer-celeste");
  }
  expect(
    getCurrentApproval(
      p.looks.find((look) => look.id === "look-mae")!,
      p,
    )?.id,
  ).toBe(maeApproval);
  expect(
    p.looks
      .find((look) => look.id === "look-nora")!
      .beauty!.approvals.every((approval) => approval.state !== "current"),
  ).toBe(true);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back to production", exact: true })
    .click();
  p = await allocate(page, id);
  expect(p.allocationResult!.totalCostCents).toBe(46_500);
  expect(
    p.allocations
      .filter((allocation) => allocation.lookId.startsWith("look-nora"))
      .every(
        (allocation) =>
          allocation.performerId === "performer-celeste" &&
          allocation.unitId === "unit-coat-charcoal",
      ),
  ).toBe(true);
  expect(liveRequests).toEqual([]);
});

test("both approved repair choices remain feasible and preserve the explicitly selected output", async ({
  page,
}) => {
  let p = await example(page);
  const id = p.id;
  p = await exampleDecisions(page, id);
  await visit(page, id, "/looks?look=look-nora&detail=alternatives");
  p = await candidateDecision(
    page,
    id,
    p.units.find((unit) => unit.id === "unit-coat-burgundy")!.name,
  );
  const burgundy = p.appearanceCandidates!.find(
    (candidate) => candidate.id === "candidate-nora-burgundy",
  )!;
  const selectedApprovalId = burgundy.approvals.at(-1)!.id;
  const selectedPreviewId = burgundy.previews.at(-1)!.id;
  p = await allocate(page, id, false);
  expect(p.allocationResult!.totalCostCents).toBe(48_500);
  expect(p.looks.find((look) => look.id === "look-nora")!.unitIds).toEqual([
    "unit-coat-oxblood",
  ]);
  expect(p.units.find((unit) => unit.id === "unit-coat-oxblood")!.status).toBe(
    "available",
  );
  await visit(page, id);
  await page
    .getByRole("button", { name: "Review a change", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByLabel("Which physical unit is unavailable?")
    .selectOption("unit-coat-oxblood");
  p = await impact(page);
  expect(
    p.proposals
      .at(-1)!
      .options.find(
        (option) => option.replacementUnitId === "unit-coat-burgundy",
      ),
  ).toMatchObject({ feasible: true, requiresVisualApproval: false });
  expect(
    p.proposals
      .at(-1)!
      .options.find(
        (option) => option.replacementUnitId === "unit-coat-charcoal",
      ),
  ).toMatchObject({ feasible: false, requiresVisualApproval: true });
  await page
    .getByRole("dialog", { name: "Follow the change.", exact: true })
    .getByRole("link", { name: "Compare & review alternatives", exact: true })
    .click();
  p = await candidateDecision(
    page,
    id,
    p.units.find((unit) => unit.id === "unit-coat-charcoal")!.name,
  );
  p = await returnToImpact(page);
  const options = p.proposals.at(-1)!.options;
  for (const unitId of ["unit-coat-burgundy", "unit-coat-charcoal"]) {
    const option = options.find((item) => item.replacementUnitId === unitId)!;
    expect(option).toMatchObject({
      feasible: true,
      requiresVisualApproval: false,
    });
    expect(
      option.findings.filter((finding) => finding.severity === "conflict"),
    ).toEqual([]);
  }
  const impactDialog = page.getByRole("dialog", {
    name: "Follow the change.",
    exact: true,
  });
  await expect(
    impactDialog.getByRole("button", { name: /C-033.*Reviewable proposal/ }),
  ).toBeVisible();
  await expect(
    impactDialog.getByRole("button", { name: /C-021.*Reviewable proposal/ }),
  ).toBeVisible();
  p = await adoptRepair(page, "C-033");
  for (const look of p.looks.filter(
    (item) => item.characterId === "char-nora",
  )) {
    expect(look.unitIds).toEqual(["unit-coat-burgundy"]);
    expect(look.activeCandidateId).toBe(burgundy.id);
    expect(getCurrentApproval(look, p)?.id).toBe(selectedApprovalId);
    expect(getCurrentPreview(look, p)?.id).toBe(selectedPreviewId);
  }
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back to production", exact: true })
    .click();
  p = await allocate(page, id, false);
  expect(p.allocationResult!.status).toBe("OPTIMAL");
  expect(p.allocationResult!.totalCostCents).toBe(46_500);
  expect(
    p
      .allocationResult!.assignments.filter((assignment) =>
        assignment.lookId.startsWith("look-nora"),
      )
      .every((assignment) => assignment.unitId === "unit-coat-charcoal"),
  ).toBe(true);
  expect(p.looks.find((look) => look.id === "look-nora")!.unitIds).toEqual([
    "unit-coat-burgundy",
  ]);
  const swaps = page.getByRole("region", {
    name: "Garment changes in this allocation",
    exact: true,
  });
  await expect(swaps).toContainText("C-033 Burgundy wool coat");
  await expect(swaps).toContainText("C-021 Charcoal wool coat");
  await expect(swaps.getByRole("checkbox")).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Adopt these assignments", exact: true }),
  ).toBeDisabled();
  expect(liveRequests).toEqual([]);
});
