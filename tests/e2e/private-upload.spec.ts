import { expect, test } from "@playwright/test";
import path from "node:path";
import type { Production } from "../../src/lib/types";
import { authenticate } from "./helpers";

test("private upload persists, invalidates its actor, rejects another browser and permits withdrawal", async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000);
  const origin = process.env.TEST_BASE_URL || "http://localhost:3001";
  await authenticate(page.request, origin);
  const created = await page.request.post("/api/projects", {
    data: { mode: "example" },
  });
  expect(created.status()).toBe(201);
  const production: Production = (await created.json()).project;
  try {
    await page.goto(`/production/${production.id}/looks?look=look-nora`);
    await page
      .getByRole("button", { name: "Cast & sources", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "The people behind the characters",
    });
    await expect(dialog).toBeVisible();
    await dialog
      .getByLabel("Replace source photograph")
      .setInputFiles(path.resolve("public/assets/cast/ada.webp"));
    await expect(
      dialog.getByRole("button", { name: "Save private source", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("checkbox", { name: /permission and image rights/ })
      .check();
    await dialog
      .getByRole("button", { name: "Save private source", exact: true })
      .click();
    await expect(
      dialog.getByText(
        "Source saved. Existing actor-specific evidence was reviewed for invalidation.",
      ),
    ).toBeVisible({ timeout: 90_000 });
    const response = await page.request.get(`/api/projects/${production.id}`);
    const updated: Production = (await response.json()).project;
    const ada = updated.performers.find((p) => p.id === "performer-ada")!;
    expect(ada.assetId).toBeTruthy();
    expect(ada.imageUrl).toMatch(/^\/api\/assets\//);
    expect(ada.captureVersion).toBe(2);
    expect(
      updated.looks.find((look) => look.id === "look-nora")?.revision,
    ).toBeGreaterThan(
      production.looks.find((look) => look.id === "look-nora")!.revision,
    );
    expect(updated.looks.find((look) => look.id === "look-mae")?.revision).toBe(
      production.looks.find((look) => look.id === "look-mae")!.revision,
    );
    const ownImage = await page.request.get(ada.imageUrl!);
    expect(ownImage.status()).toBe(200);
    expect(ownImage.headers()["content-type"]).toMatch(/^image\//);
    const stranger = await browser.newContext({ baseURL: origin });
    try {
      await authenticate(stranger.request, origin);
      expect(
        (await stranger.request.get(`/api/projects/${production.id}`)).status(),
      ).toBe(404);
      expect((await stranger.request.get(ada.imageUrl!)).status()).toBe(404);
    } finally {
      await stranger.close();
    }
    await dialog
      .getByText("Withdraw source permission", { exact: true })
      .click();
    await dialog
      .getByRole("checkbox", { name: "Withdraw permission for Ada Mercer." })
      .check();
    await dialog
      .getByRole("button", { name: "Withdraw permission", exact: true })
      .click();
    await expect(
      dialog.getByText(/Consent withdrawn\. New derivations are blocked/),
    ).toBeVisible();
    const withdrawn = await page.request.get(`/api/projects/${production.id}`);
    expect(
      (await withdrawn.json()).project.performers.find(
        (p: { id: string }) => p.id === "performer-ada",
      ).consent.granted,
    ).toBe(false);
  } finally {
    await page.request.delete(`/api/projects/${production.id}`);
  }
});
