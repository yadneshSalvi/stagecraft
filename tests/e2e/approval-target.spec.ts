import { expect, test } from "@playwright/test";
import type { Production } from "../../src/lib/types";
import { authenticate } from "./helpers";

test("an approval cannot silently switch to an output that arrived after the dialog opened", async ({
  page,
}) => {
  const origin = process.env.TEST_BASE_URL || "http://localhost:3001";
  await authenticate(page.request, origin);
  const project: Production = (
    await (
      await page.request.post("/api/projects", { data: { mode: "example" } })
    ).json()
  ).project;
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
      .fill("Synthetic output race review");
    const rationale =
      "Review of the inspected synthetic output; a later result must be inspected independently.";
    await dialog.getByLabel("What did you approve?").fill(rationale);
    const newer = await page.request.post(
      `/api/projects/${project.id}/previews`,
      {
        data: {
          expectedRevision: project.revision,
          commandId: crypto.randomUUID(),
          lookId: "look-mae",
          mode: "recorded",
          kind: "garment",
        },
      },
    );
    expect(newer.ok()).toBeTruthy();
    expect((await newer.json()).job.state).toBe("succeeded");
    await dialog
      .getByRole("button", { name: "Record appearance approval", exact: true })
      .click();
    await expect(
      dialog.getByText(/A different output is now current/),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", {
        name: "Record appearance approval",
        exact: true,
      }),
    ).toBeDisabled();
    await expect(dialog.getByLabel("What did you approve?")).toHaveValue(
      rationale,
    );
    const current: Production = (
      await (await page.request.get(`/api/projects/${project.id}`)).json()
    ).project;
    expect(
      current.looks.find((look) => look.id === "look-mae")!.approvals,
    ).toHaveLength(0);
    await dialog
      .getByRole("button", { name: "Keep reviewing", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Approve appearance", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", {
        name: "Record appearance approval",
        exact: true,
      }),
    ).toBeEnabled();
  } finally {
    await page.request.delete(`/api/projects/${project.id}`);
  }
});
