import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Production } from "../../src/lib/types";
import { authenticate } from "./helpers";

test("supplier export preserves hire evidence in a CSV and printable working order", async ({
  page,
}, testInfo) => {
  const origin = process.env.TEST_BASE_URL || "http://localhost:3001";
  await authenticate(page.request, origin);
  const response = await page.request.post("/api/projects", {
    data: { mode: "example" },
  });
  expect(response.status()).toBe(201);
  const project: Production = (await response.json()).project;
  try {
    await page.goto(`/production/${project.id}/handoff`);
    await page
      .getByRole("link", { name: "Export supplier orders", exact: true })
      .click();
    const supplier = project.sourcing
      .map((item) => item.supplier)
      .sort((a, b) => a.localeCompare(b))[0];
    await expect(
      page.getByRole("heading", { level: 1, name: supplier, exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Supplier", { exact: true })).toHaveValue(
      supplier,
    );
    const records = project.sourcing.filter(
      (item) => item.supplier === supplier,
    );
    await expect(
      page.getByRole("heading", { level: 2, name: /^Hire record / }),
    ).toHaveCount(records.length);
    const downloadPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download supplier CSV", exact: true })
      .click();
    const download = await downloadPromise;
    const file = testInfo.outputPath("supplier-order.csv");
    await download.saveAs(file);
    const text = await readFile(file, "utf8");
    expect(text).toContain("Quote amount (whole record)");
    for (const record of records) {
      expect(text).toContain(record.id);
      expect(text).toContain(record.from);
      expect(text).toContain(`"${record.status}"`);
    }
    await page.emulateMedia({ media: "print" });
    await expect(
      page.getByRole("button", { name: "Print / save PDF", exact: true }),
    ).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: supplier, exact: true }),
    ).toBeVisible();
    const pdf = await page.pdf({
      path: testInfo.outputPath("supplier-order.pdf"),
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
    await page.emulateMedia({ media: "screen" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const unchanged = await page.request.get(`/api/projects/${project.id}`);
    expect((await unchanged.json()).project.revision).toBe(project.revision);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});
