import { expect, test } from "@playwright/test";
import type { Production } from "../../src/lib/types";
import { authenticate } from "./helpers";

test("concurrent revision shows an in-dialog error, preserves approval notes, and permits an explicit retry", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const origin = process.env.TEST_BASE_URL || "http://localhost:3001";
  await authenticate(page.request, origin);
  const created = await page.request.post("/api/projects", {
    data: { mode: "example" },
  });
  expect(created.status()).toBe(201);
  const project: Production = (await created.json()).project;
  try {
    await page.goto(`/production/${project.id}/looks?look=look-mae`);
    await page
      .getByRole("button", { name: "Approve appearance", exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Approve this exact appearance",
    });
    await dialog
      .getByLabel("Reviewer name or role")
      .fill("Synthetic concurrency review");
    const rationale =
      "Appearance reviewed for the synthetic scenario. No physical fitting is claimed.";
    await dialog.getByLabel("What did you approve?").fill(rationale);
    const concurrent = await page.request.post(
      `/api/projects/${project.id}/commands`,
      {
        data: {
          expectedRevision: project.revision,
          commandId: crypto.randomUUID(),
          command: {
            type: "update_production",
            subtitle: "A concurrently edited synthetic working book",
          },
        },
      },
    );
    expect(concurrent.status()).toBe(200);
    await dialog
      .getByRole("button", { name: "Record appearance approval", exact: true })
      .click();
    await expect(dialog.getByRole("alert")).toContainText(
      "The working book changed while this page was open",
    );
    await expect(dialog.getByLabel("What did you approve?")).toHaveValue(
      rationale,
    );
    await expect(dialog.getByLabel("Reviewer name or role")).toHaveValue(
      "Synthetic concurrency review",
    );
    await dialog
      .getByRole("button", { name: "Record appearance approval", exact: true })
      .click();
    await expect(dialog).not.toBeVisible();
    const current: Production = (
      await (await page.request.get(`/api/projects/${project.id}`)).json()
    ).project;
    expect(
      current.looks
        .find((look) => look.id === "look-mae")
        ?.approvals.filter((a) => a.state === "current"),
    ).toHaveLength(1);
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});
