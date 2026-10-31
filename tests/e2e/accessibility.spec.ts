import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Production } from "../../src/lib/types";
import { authenticate } from "./helpers";

const surfaces = [
  ["production", ""],
  ["costume", "/looks"],
  ["makeup", "/looks?look=look-nora&detail=makeup"],
  ["alternatives", "/looks?look=look-nora&detail=alternatives"],
  ["hair-colour", "/looks?look=look-mae&detail=hair_color"],
  ["necklace", "/looks?look=look-nora&detail=necklace"],
  ["script", "/script"],
  ["schedule", "/schedule"],
  ["wardrobe", "/wardrobe"],
  ["handoff", "/handoff"],
  ["supplier-orders", "/handoff/orders"],
] as const;

async function example(page: Page): Promise<Production> {
  await authenticate(page.request);
  const created = await page.request.post("/api/projects", {
    data: { mode: "example" },
  });
  expect(created.status()).toBe(201);
  return (await created.json()).project;
}

test("every primary surface is reachable and passes automated WCAG checks", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const project = await example(page);
  try {
    for (const [label, suffix] of surfaces) {
      await page.goto(`/production/${project.id}${suffix}`);
      await expect(page.locator("h1")).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Production navigation" }),
      ).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        result.violations,
        `${suffix || "board"}: ${JSON.stringify(result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })))}`,
      ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`${label}-desktop.png`),
        fullPage: true,
      });
    }
    expect(failures).toEqual([]);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

test("390px primary surfaces and scene list retain access without page overflow", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const project = await example(page);
  await page.setViewportSize({ width: 390, height: 844 });
  try {
    for (const [label, suffix] of surfaces) {
      await page.goto(`/production/${project.id}${suffix}`);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      expect(
        audit.violations,
        `${suffix || "board"}: mobile accessibility`,
      ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath(`${label}-mobile.png`),
        fullPage: true,
      });
    }
    await page.goto(`/production/${project.id}`);
    await page
      .getByRole("button", { name: "Show accessible scene list" })
      .click();
    await expect(
      page.getByRole("columnheader", { name: "Scene / story time" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    const table = page.locator(".scene-list-board");
    expect(
      await table.evaluate((node) => node.scrollWidth > node.clientWidth),
    ).toBe(true);
    await table.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });
    await expect(
      page.getByRole("link", { name: "Review scene 01" }),
    ).toBeInViewport();
    await page
      .getByRole("button", { name: "Review a change", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review a change", exact: true }),
    ).toBeFocused();
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

test("public landing and evidence are accessible at a narrow viewport", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of ["/", "/evidence"]) {
    await page.goto(path);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  }
});
