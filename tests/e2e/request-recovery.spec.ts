import { expect, test, type Page } from "@playwright/test";
import type { Production } from "../../src/lib/types";
import { authenticate } from "./helpers";

async function example(page: Page): Promise<Production> {
  await authenticate(page.request);
  const response = await page.request.post("/api/projects", {
    data: { mode: "example" },
  });
  expect(response.status()).toBe(201);
  return (await response.json()).project;
}
const recordedButton = (page: Page) =>
  page.getByRole("button", {
    name: "Use saved result",
    exact: true,
  });
const freshButton = (page: Page) =>
  page.getByRole("button", { name: "Generate preview", exact: true });
const statusButton = (page: Page) =>
  page.getByRole("button", { name: "Check saved request status", exact: true });
const intentKey = (id: string) => `stagecraft-job:${id}:look-nora:intent`;
async function exposeMockedFreshControl(page: Page) {
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    await route.fulfill({
      response,
      json: {
        ...data,
        youcam: true,
        storage: true,
        generationPaused: false,
        freshPreviewAvailability: {
          available: true,
          reason: "ready",
          message: "Ready",
        },
      },
    });
  });
}

test("an interrupted recorded receipt recovers through GET without a second POST", async ({
  page,
}) => {
  const project = await example(page);
  const posts: string[] = [];
  const checks: string[] = [];
  try {
    await page.goto(`/production/${project.id}/looks?look=look-nora`);
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        request.method() === "GET" &&
        url.pathname === `/api/projects/${project.id}/jobs`
      )
        checks.push(url.searchParams.get("commandId") || "");
    });
    await page.route(
      `**/api/projects/${project.id}/previews`,
      async (route) => {
        const body = route.request().postDataJSON();
        expect(body.mode).toBe("recorded");
        posts.push(body.commandId);
        const response = await route.fetch();
        expect(response.ok()).toBe(true);
        expect((await response.json()).job.state).toBe("succeeded");
        await route.abort("failed");
      },
    );
    await recordedButton(page).click();
    await expect(statusButton(page)).toBeVisible();
    await statusButton(page).click();
    await expect(statusButton(page)).not.toBeVisible();
    await expect(page.locator(".job-succeeded")).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(checks).toEqual([posts[0]]);
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        `${intentKey(project.id)}:recorded`,
      ),
    ).toBeNull();
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

test("a deterministic fresh refusal clears its intent and recorded replay remains usable", async ({
  page,
}) => {
  const project = await example(page);
  let freshPosts = 0;
  let recordedPosts = 0;
  try {
    await exposeMockedFreshControl(page);
    await page.route(
      `**/api/projects/${project.id}/previews`,
      async (route) => {
        const body = route.request().postDataJSON();
        if (body.mode === "live") {
          freshPosts++;
          // Deliberately never forwards a fresh provider request.
          await route.fulfill({
            status: 503,
            json: {
              error: {
                code: "LIVE_PREVIEWS_RESTING",
                message:
                  "Fresh previews are resting. Recorded results remain available.",
              },
            },
          });
        } else {
          expect(body.mode).toBe("recorded");
          recordedPosts++;
          await route.continue();
        }
      },
    );
    await page.goto(`/production/${project.id}/looks?look=look-nora`);
    await freshButton(page).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Fresh previews are resting" }),
    ).toBeVisible();
    await expect(freshButton(page)).toBeEnabled();
    await expect(statusButton(page)).not.toBeVisible();
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        intentKey(project.id),
      ),
    ).toBeNull();
    await recordedButton(page).click();
    await expect(page.locator(".job-succeeded")).toBeVisible();
    expect(freshPosts).toBe(1);
    expect(recordedPosts).toBe(1);
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

test("an uncertain fresh receipt keeps its identifier while recordings and status-only recovery stay independent", async ({
  page,
}) => {
  const project = await example(page);
  const freshIds: string[] = [];
  let recordedPosts = 0;
  try {
    await exposeMockedFreshControl(page);
    await page.route(
      `**/api/projects/${project.id}/previews`,
      async (route) => {
        const body = route.request().postDataJSON();
        if (body.mode === "live") {
          freshIds.push(body.commandId);
          // Both fresh responses are browser fixtures; no provider call is sent.
          await route.fulfill(
            freshIds.length === 1
              ? {
                  status: 504,
                  json: {
                    error: {
                      code: "GATEWAY_TIMEOUT",
                      message: "Receipt timed out.",
                    },
                  },
                }
              : {
                  status: 503,
                  json: {
                    error: {
                      code: "LIVE_PREVIEWS_RESTING",
                      message: "Fresh previews are resting.",
                    },
                  },
                },
          );
        } else {
          expect(body.mode).toBe("recorded");
          recordedPosts++;
          await route.continue();
        }
      },
    );
    await page.goto(`/production/${project.id}/looks?look=look-nora`);
    await freshButton(page).click();
    await expect(statusButton(page)).toBeVisible();
    await expect(freshButton(page)).toBeDisabled();
    await expect(recordedButton(page)).toBeEnabled();
    const saved = await page.evaluate(
      (key) => localStorage.getItem(key),
      intentKey(project.id),
    );
    expect(JSON.parse(saved!).commandId).toBe(freshIds[0]);
    await recordedButton(page).click();
    await expect(page.locator(".job-succeeded")).toBeVisible();
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        intentKey(project.id),
      ),
    ).toBe(saved);
    await statusButton(page).click();
    await expect(
      page.getByRole("button", {
        name: "Retry the same saved request",
        exact: true,
      }),
    ).toBeVisible();
    expect(freshIds).toHaveLength(1);
    await page
      .getByRole("button", {
        name: "Retry the same saved request",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("alert").filter({ hasText: "Fresh previews are resting" }),
    ).toBeVisible();
    await expect(freshButton(page)).toBeEnabled();
    await expect(statusButton(page)).not.toBeVisible();
    expect(freshIds).toEqual([freshIds[0], freshIds[0]]);
    expect(recordedPosts).toBe(1);
    expect(
      await page.evaluate(
        (key) => localStorage.getItem(key),
        intentKey(project.id),
      ),
    ).toBeNull();
    await expect(recordedButton(page)).toBeEnabled();
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.request.delete(`/api/projects/${project.id}`);
  }
});

test("a missing fresh-availability response does not hide recorded reuse", async ({
  page,
}) => {
  const project = await example(page);
  try {
    await page.route("**/api/config", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Availability could not be loaded." },
      }),
    );
    await page.route(
      `**/api/projects/${project.id}/previews`,
      async (route) => {
        expect(route.request().postDataJSON().mode).toBe("recorded");
        await route.continue();
      },
    );
    await page.goto(`/production/${project.id}/looks?look=look-nora`);
    await expect(freshButton(page)).toBeDisabled();
    await expect(recordedButton(page)).toBeEnabled();
    await recordedButton(page).click();
    await expect(page.locator(".job-succeeded")).toBeVisible();
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.request.delete(`/api/projects/${project.id}`);
  }
});
