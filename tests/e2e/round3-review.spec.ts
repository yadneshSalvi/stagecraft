import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  expect,
  test,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import type { Production, ProductionCommand } from "../../src/lib/types";
import {
  getCurrentApproval,
  getCurrentCandidateApproval,
  getCurrentPreview,
} from "../../src/lib/domain/lineage";
import { getCurrentCreativeReferenceFlags } from "../../src/lib/domain/direction";
import { authenticate } from "./helpers";

const path = (response: Response) => new URL(response.url()).pathname;
const evidence = join(process.cwd(), "docs/evidence/round3/after");
const screenshots = process.env.TEST_CAPTURE_PUBLIC_EVIDENCE === "1";

async function snapshot(page: Page, id: string): Promise<Production> {
  const response = await page.request.get(`/api/projects/${id}`);
  expect(response.ok()).toBe(true);
  return (await response.json()).project;
}
async function visitWorkspace(page: Page, url: string) {
  await page.goto(url);
  await expect(
    page.locator(".workspace-content").getByRole("heading", { level: 1 }),
  ).toBeVisible();
}
function nextCommand(page: Page, type: ProductionCommand["type"]) {
  return page.waitForResponse(
    (response) =>
      /\/api\/projects\/[^/]+\/commands$/.test(path(response)) &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.command?.type === type,
  );
}
async function result(response: Promise<Response>): Promise<Production> {
  const received = await response;
  const body = await received.json();
  expect(received.ok(), JSON.stringify(body)).toBe(true);
  return body.project;
}
async function command(
  page: Page,
  type: ProductionCommand["type"],
  action: () => Promise<unknown>,
) {
  const response = nextCommand(page, type);
  await action();
  return result(response);
}
async function approveLook(page: Page) {
  await page
    .getByRole("button", { name: "Approve appearance", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Approve appearance",
    exact: true,
  });
  await dialog
    .getByLabel("Reviewer", { exact: true })
    .fill("Round 3 software reviewer");
  await dialog
    .getByLabel("Note", { exact: true })
    .fill("The displayed output supports this character direction.");
  const project = await command(page, "approve_look", () =>
    dialog.getByRole("button", { name: "Approve", exact: true }).click(),
  );
  await expect(dialog).not.toBeVisible();
  return project;
}
async function aboveFold(
  locator: Locator,
  viewport: { width: number; height: number },
  label: string,
) {
  await expect(locator, label).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(bounds, label).not.toBeNull();
  expect(
    bounds!.y,
    `${label} begins inside the viewport`,
  ).toBeGreaterThanOrEqual(0);
  expect(
    bounds!.y + bounds!.height,
    `${label} ends above the fold`,
  ).toBeLessThanOrEqual(viewport.height + 1);
  return {
    label,
    x: Math.round(bounds!.x),
    y: Math.round(bounds!.y),
    width: Math.round(bounds!.width),
    height: Math.round(bounds!.height),
  };
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
]) {
  test.describe(`Round 3 at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, actionTimeout: 15_000, navigationTimeout: 60_000 });
    test("repair decisions, inline approvals, consumed return and deliberate wording stay usable above the fold", async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const freshRequests: string[] = [];
      const commands: string[] = [];
      let id: string | undefined;
      await page.route("**/api/projects/*/previews", async (route) => {
        if (
          route.request().method() === "POST" &&
          route.request().postDataJSON()?.source !== "recorded"
        ) {
          freshRequests.push(route.request().url());
          return route.fulfill({
            status: 503,
            json: {
              error:
                "Fresh provider requests are blocked in this software test.",
            },
          });
        }
        return route.continue();
      });
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          /\/commands$/.test(new URL(request.url()).pathname)
        )
          commands.push(request.postDataJSON()?.command?.type);
      });
      await authenticate(page.request);
      const measurements: Awaited<ReturnType<typeof aboveFold>>[] = [];
      const capture = async (name: string) => {
        if (!screenshots) return;
        mkdirSync(evidence, { recursive: true });
        await expect
          .poll(() =>
            page.locator("img:visible").evaluateAll((images) =>
              images
                .filter((image) => {
                  const bounds = image.getBoundingClientRect();
                  return (
                    bounds.bottom > 0 &&
                    bounds.right > 0 &&
                    bounds.top < window.innerHeight &&
                    bounds.left < window.innerWidth
                  );
                })
                .every(
                  (image) =>
                    image instanceof HTMLImageElement &&
                    image.complete &&
                    image.naturalWidth > 0,
                ),
            ),
          )
          .toBe(true);
        await page.screenshot({
          path: join(
            evidence,
            `${name}-${viewport.width}x${viewport.height}.png`,
          ),
        });
      };
      try {
        await page.goto("/");
        expect(
          await page.evaluate(() => ({
            width: window.innerWidth,
            height: window.innerHeight,
          })),
        ).toEqual(viewport);
        const created = page.waitForResponse(
          (response) =>
            path(response) === "/api/projects" &&
            response.request().method() === "POST",
        );
        await page
          .locator(".landing-hero")
          .getByRole("button", { name: "Open example", exact: true })
          .click();
        const createResponse = await created;
        expect(createResponse.status()).toBe(201);
        let project: Production = (await createResponse.json()).project;
        id = project.id;
        expect(
          project.looks.filter((look) => getCurrentApproval(look, project)),
        ).toHaveLength(0);
        await expect(
          page.getByRole("heading", { name: "THE LAST LIGHT", exact: true }),
        ).toBeVisible();
        await expect(page.locator(".sample-pill")).toHaveText("Example");
        await expect(page.locator(".provenance-chip")).toHaveCount(0);
        measurements.push(
          await aboveFold(
            page.locator(".continuity-wall tbody tr").first(),
            viewport,
            "First continuity row",
          ),
        );
        await capture("board");
        await page.locator(".continuity-cell").first().click();
        await expect(
          page.getByRole("heading", { name: "Looks", exact: true }),
        ).toBeVisible();
        measurements.push(
          await aboveFold(
            page.getByRole("button", {
              name: "Approve appearance",
              exact: true,
            }),
            viewport,
            "Appearance approval action",
          ),
        );
        const image = page.locator(".costume-image-stage > .photo img");
        await expect(image).toHaveJSProperty("complete", true);
        await expect
          .poll(() =>
            image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
          )
          .toBeGreaterThan(0);
        const ratios = await image.evaluate((node) => {
          const img = node as HTMLImageElement;
          const frame = img.parentElement!.getBoundingClientRect();
          return {
            original: img.naturalWidth / img.naturalHeight,
            frame: frame.width / frame.height,
          };
        });
        expect(ratios.frame).toBeCloseTo(ratios.original, 2);
        measurements.push(
          await aboveFold(
            page.locator(".costume-image-stage"),
            viewport,
            "Full costume inspection image",
          ),
        );
        await page
          .getByRole("button", { name: "Compare", exact: true })
          .click();
        const slider = page.getByRole("slider", {
          name: "Compare source and preview",
        });
        await slider.focus();
        await slider.press("ArrowRight");
        await expect(slider).toHaveValue("51");
        await expect(slider).toHaveAttribute(
          "aria-valuetext",
          "51% preview visible",
        );
        await page
          .getByRole("button", { name: "Preview", exact: true })
          .click();
        await capture("looks");
        // One case begins with no approvals; the other has only Nora and Mae.
        if (viewport.width === 1366) {
          project = await approveLook(page);
          await visitWorkspace(page, `/production/${id}/looks?look=look-mae`);
          project = await approveLook(page);
          expect(
            project.looks.filter((look) => getCurrentApproval(look, project)),
          ).toHaveLength(2);
        }
        await visitWorkspace(page, `/production/${id}`);
        await page
          .getByRole("button", { name: "Review a change", exact: true })
          .click();
        let dialog = page.getByRole("dialog", {
          name: "Review a change",
          exact: true,
        });
        await dialog
          .getByRole("combobox", { name: "Unavailable unit", exact: true })
          .selectOption("unit-coat-oxblood");
        project = await command(page, "propose_change", () =>
          dialog
            .getByRole("button", { name: "Preview the impact", exact: true })
            .click(),
        );
        dialog = page.getByRole("dialog", {
          name: "Change impact",
          exact: true,
        });
        measurements.push(
          await aboveFold(
            dialog.getByRole("button", {
              name: "Adopt this revision",
              exact: true,
            }),
            viewport,
            "Repair adoption action",
          ),
        );
        const burgundy = dialog
          .locator(".repair-choice")
          .filter({ has: page.getByRole("button", { name: /C-033/ }) });
        await expect(burgundy).toHaveCount(1);
        await expect(
          burgundy.getByRole("img", {
            name: /Actual YouCam performer preview/,
          }),
        ).toBeVisible();
        for (const stage of await dialog
          .locator(".repair-option-image")
          .all()) {
          await expect
            .poll(() =>
              stage
                .locator("img")
                .evaluateAll((images) =>
                  images.every(
                    (node) =>
                      (node as HTMLImageElement).complete &&
                      (node as HTMLImageElement).naturalWidth > 0,
                  ),
                ),
            )
            .toBe(true);
          const frames = await stage.evaluate((node) => {
            const images = [...node.querySelectorAll("img")];
            return images.map((image) => {
              const bounds = image.parentElement!.getBoundingClientRect();
              return {
                left: bounds.left,
                right: bounds.right,
                height: bounds.height,
                frameRatio: bounds.width / bounds.height,
                naturalRatio: image.naturalWidth / image.naturalHeight,
              };
            });
          });
          expect(frames).toHaveLength(2);
          expect(frames[1].left).toBeGreaterThan(frames[0].right);
          expect(frames[0].height).toBeLessThanOrEqual(160.5);
          expect(frames[1].height).toBeLessThanOrEqual(80.5);
          for (const frame of frames)
            expect(frame.frameRatio).toBeCloseTo(frame.naturalRatio, 2);
        }
        measurements.push(
          await aboveFold(
            burgundy.getByRole("button", {
              name: "Approve alternative",
              exact: true,
            }),
            viewport,
            "Inline alternative approval",
          ),
        );
        const candidateId = project.proposals
          .at(-1)!
          .options.find(
            (option) => option.replacementUnitId === "unit-coat-burgundy",
          )!.candidateId!;
        const exactPreview = project
          .appearanceCandidates!.find(
            (candidate) => candidate.id === candidateId,
          )!
          .previews.at(-1)!.id;
        await burgundy
          .getByRole("button", { name: "Approve alternative", exact: true })
          .click();
        const approval = page.getByRole("dialog", {
          name: "Approve alternative",
          exact: true,
        });
        await approval
          .getByLabel("Reviewer", { exact: true })
          .fill("Round 3 software reviewer");
        await approval
          .getByLabel("Note", { exact: true })
          .fill(
            "The exact wool coat output supports this character direction.",
          );
        const autoProposed = nextCommand(page, "propose_change");
        await command(page, "approve_candidate", () =>
          approval
            .getByRole("button", { name: "Approve", exact: true })
            .click(),
        );
        project = await result(autoProposed);
        const expectedMissing = viewport.width === 1366 ? 5 : 6;
        const option = project.proposals
          .at(-1)!
          .options.find(
            (item) => item.replacementUnitId === "unit-coat-burgundy",
          )!;
        expect(option).toMatchObject({
          feasible: false,
          requiresVisualApproval: false,
          allocationStatus: "DECISIONS_NEEDED",
          decisionsNeeded: { count: expectedMissing },
        });
        await expect(
          dialog.getByText(
            `${expectedMissing} other looks need decisions first.`,
            { exact: true },
          ),
        ).toBeVisible();
        await expect(dialog.getByText("Conflict", { exact: true })).toHaveCount(
          0,
        );
        await expect(
          dialog.getByRole("button", {
            name: "Adopt this revision",
            exact: true,
          }),
        ).toBeDisabled();
        measurements.push(
          await aboveFold(
            dialog.locator(".repair-decisions-needed"),
            viewport,
            "Unrelated-decision recovery actions",
          ),
        );
        await capture("repair-decisions-needed");
        // The manual decision route returns to this change and consumes its URL once.
        await dialog
          .getByRole("link", { name: "Review looks", exact: true })
          .click();
        await expect(page).toHaveURL(/returnChange=unit-coat-oxblood/);
        await approveLook(page);
        const returned = nextCommand(page, "propose_change");
        await page
          .getByRole("link", { name: "Return to change review", exact: true })
          .click();
        project = await result(returned);
        await expect(page).toHaveURL(new RegExp(`/production/${id}$`));
        dialog = page.getByRole("dialog", {
          name: "Change impact",
          exact: true,
        });
        await expect(
          dialog.getByText(
            `${expectedMissing - 1} other looks need decisions first.`,
            { exact: true },
          ),
        ).toBeVisible();
        await dialog
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        const savedRevision = project.revision;
        const previousProposals = commands.filter(
          (type) => type === "propose_change",
        ).length;
        await page.reload();
        await expect(
          page.getByRole("heading", { name: "THE LAST LIGHT", exact: true }),
        ).toBeVisible();
        expect((await snapshot(page, id)).revision).toBe(savedRevision);
        expect(
          commands.filter((type) => type === "propose_change"),
        ).toHaveLength(previousProposals);
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await page
          .getByRole("button", { name: "Review a change", exact: true })
          .click();
        dialog = page.getByRole("dialog", {
          name: "Review a change",
          exact: true,
        });
        await dialog
          .getByRole("combobox", { name: "Unavailable unit", exact: true })
          .selectOption("unit-coat-oxblood");
        await command(page, "propose_change", () =>
          dialog
            .getByRole("button", { name: "Preview the impact", exact: true })
            .click(),
        );
        dialog = page.getByRole("dialog", {
          name: "Change impact",
          exact: true,
        });
        await dialog
          .getByRole("button", { name: "Approve as example", exact: true })
          .click();
        const examples = page.getByRole("dialog", {
          name: "Example approvals",
          exact: true,
        });
        const refreshed = nextCommand(page, "propose_change");
        await command(page, "set_example_decisions", () =>
          examples
            .getByRole("button", { name: "Approve as example", exact: true })
            .click(),
        );
        project = await result(refreshed);
        const readyOption = project.proposals
          .at(-1)!
          .options.find(
            (item) => item.replacementUnitId === "unit-coat-burgundy",
          )!;
        expect(readyOption).toMatchObject({ feasible: true, candidateId });
        expect(readyOption.decisionsNeeded).toBeUndefined();
        expect(
          getCurrentCandidateApproval(project, candidateId)?.previewId,
        ).toBe(exactPreview);
        await expect(
          dialog.getByRole("button", {
            name: "Adopt this revision",
            exact: true,
          }),
        ).toBeEnabled();
        await capture("repair-ready");
        project = await command(page, "adopt_repair", () =>
          dialog
            .getByRole("button", { name: "Adopt this revision", exact: true })
            .click(),
        );
        const affected = project.looks.filter(
          (look) => look.characterId === "char-nora",
        );
        expect(affected).toHaveLength(2);
        for (const look of affected) {
          expect(look.unitIds).toEqual(["unit-coat-burgundy"]);
          expect(look.activeCandidateId).toBe(candidateId);
          expect(getCurrentApproval(look, project)).toBeTruthy();
          expect(getCurrentPreview(look, project)?.candidateId).toBe(
            candidateId,
          );
        }
        dialog = page.getByRole("dialog", {
          name: "Change adopted",
          exact: true,
        });
        await expect(
          dialog.getByRole("heading", {
            name: "Direction still names the old garment",
            exact: true,
          }),
        ).toBeVisible();
        const directionBefore = structuredClone(
          project.characters.find((item) => item.id === "char-nora")!.direction,
        );
        const approvalIds = affected.map(
          (look) => getCurrentApproval(look, project)!.id,
        );
        await dialog
          .getByRole("button", {
            name: "Keep these words deliberately",
            exact: true,
          })
          .click();
        const acknowledgement = page.getByRole("dialog", {
          name: "Keep direction wording",
          exact: true,
        });
        await acknowledgement
          .getByLabel("Reviewer", { exact: true })
          .fill("Round 3 software reviewer");
        await acknowledgement
          .getByLabel("Reason", { exact: true })
          .fill(
            "Keep velvet as the remembered motif; the worn garment is wool.",
          );
        project = await command(page, "acknowledge_direction_reference", () =>
          acknowledgement
            .getByRole("button", { name: "Keep these words", exact: true })
            .click(),
        );
        expect(
          project.characters.find((item) => item.id === "char-nora")!.direction,
        ).toEqual(directionBefore);
        expect(
          project.looks
            .filter((look) => look.characterId === "char-nora")
            .map((look) => getCurrentApproval(look, project)!.id),
        ).toEqual(approvalIds);
        expect(getCurrentCreativeReferenceFlags(project)).toEqual([]);
        await expect(
          dialog.getByRole("heading", {
            name: "Direction still names the old garment",
            exact: true,
          }),
        ).toHaveCount(0);
        await dialog
          .getByRole("button", { name: "Back to production", exact: true })
          .click();
        await expect(page.locator("body")).not.toHaveClass(/dialog-open/);
        // Manual reopening must not retain the consumed URL or replacement intent.
        await page
          .getByRole("button", { name: "Review a change", exact: true })
          .click();
        const reopened = page.getByRole("dialog", {
          name: "Review a change",
          exact: true,
        });
        await expect(
          reopened.getByRole("combobox", {
            name: "Unavailable unit",
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          reopened.getByRole("button", {
            name: "A garment is unavailable",
            exact: true,
          }),
        ).toHaveAttribute("aria-pressed", "true");
        await reopened
          .getByRole("button", { name: "Cancel", exact: true })
          .click();
        await visitWorkspace(page, `/production/${id}/schedule`);
        project = await command(page, "solve_allocation", () =>
          page
            .getByRole("button", { name: "Check allocation", exact: true })
            .click(),
        );
        expect(["FEASIBLE", "OPTIMAL"]).toContain(
          project.allocationResult!.status,
        );
        await expect(
          page.getByRole("region", { name: "Allocation result", exact: true }),
        ).toBeFocused();
        measurements.push(
          await aboveFold(
            page.getByRole("status", { name: /^Allocation status:/ }),
            viewport,
            "Allocation status and cost",
          ),
        );
        measurements.push(
          await aboveFold(
            page.getByRole("button", {
              name: "Adopt these assignments",
              exact: true,
            }),
            viewport,
            "Allocation adoption action",
          ),
        );
        expect(project.allocationResult!.assignments).toHaveLength(17);
        await capture("allocation");
        project = await command(page, "adopt_allocation", () =>
          page
            .getByRole("button", {
              name: "Adopt these assignments",
              exact: true,
            })
            .click(),
        );
        expect(project.allocations).toHaveLength(17);
        expect(freshRequests).toEqual([]);
        if (screenshots)
          writeFileSync(
            join(evidence, `layout-${viewport.width}x${viewport.height}.json`),
            JSON.stringify(
              {
                viewport,
                syntheticSoftwareCheck: true,
                freshProviderRequests: 0,
                measurements,
              },
              null,
              2,
            ) + "\n",
          );
      } finally {
        if (id) {
          const deleted = await page.request.delete(`/api/projects/${id}`);
          expect(deleted.ok()).toBe(true);
        }
      }
    });
  });
}
