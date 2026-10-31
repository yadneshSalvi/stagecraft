import { expect, type APIRequestContext } from "@playwright/test";

// Isolated browser contexts share one local IP. Respect BetterAuth's real
// sign-in window rather than disabling production limits for a test run.
export async function authenticate(
  request: APIRequestContext,
  origin = process.env.TEST_BASE_URL || "http://localhost:3001",
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await request.post("/api/auth/sign-in/anonymous", {
      data: {},
      headers: { origin },
    });
    if (response.status() !== 429 || attempt === 2) {
      expect(response.status(), "An isolated test browser must sign in").toBe(
        200,
      );
      return;
    }
    const seconds = Number(response.headers()["x-retry-after"]);
    expect(Number.isFinite(seconds)).toBe(true);
    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(seconds).toBeLessThanOrEqual(10);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000 + 100));
  }
}
