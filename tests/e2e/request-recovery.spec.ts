import { expect, test } from "@playwright/test";
import type { Production } from "../../src/lib/types";
import { authenticate } from "./helpers";

test("an interrupted receipt recovers the same recorded request without creating another job", async ({
  page,
}) => {
  const origin = process.env.TEST_BASE_URL || "http://localhost:3001";
  await authenticate(page.request, origin);
  const project: Production = (
    await (
      await page.request.post("/api/projects", { data: { mode: "example" } })
    ).json()
  ).project;
  const requests: string[] = [];
  const jobs: string[] = [];
  try {
    await page.goto(`/production/${project.id}/looks?look=look-nora`);
    await page.route(
      `**/api/projects/${project.id}/previews`,
      async (route) => {
        const body = route.request().postDataJSON();
        expect(body.mode).toBe("recorded");
        requests.push(body.commandId);
        const response = await route.fetch();
        expect(response.ok()).toBeTruthy();
        jobs.push((await response.json()).job.id);
        if (requests.length === 1) await route.abort("failed");
        else await route.fulfill({ response });
      },
    );
    await page
      .getByRole("button", {
        name: "Use matching recorded result",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Recover saved request", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Generate a fresh preview",
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole("button", { name: "Recover saved request", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Recover saved request", exact: true }),
    ).not.toBeVisible();
    await expect(page.locator(".job-succeeded")).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[0]).toBe(requests[1]);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toBe(jobs[1]);
    const current: Production = (
      await (await page.request.get(`/api/projects/${project.id}`)).json()
    ).project;
    expect(
      current.looks.find((look) => look.id === "look-nora")!.previews,
    ).toHaveLength(
      project.looks.find((look) => look.id === "look-nora")!.previews.length +
        1,
    );
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.request.delete(`/api/projects/${project.id}`);
  }
});
