import "server-only";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins";
import { getPool } from "./db";
import { ApiError } from "./errors";
export { ApiError } from "./errors";

function buildAuth() {
  if (!process.env.BETTER_AUTH_SECRET) throw new Error("AUTH_UNAVAILABLE");
  const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:3001";
  return betterAuth({
    appName: "STAGECRAFT",
    database: getPool(),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL,
    trustedOrigins: [
      baseURL,
      ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ],
    advanced: { cookiePrefix: "stagecraft" },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    plugins: [anonymous({ disableDeleteAnonymousUser: true })],
  });
}

let auth: ReturnType<typeof buildAuth> | undefined;
export const getAuth = () => (auth ??= buildAuth());

export async function requireOwner(request: Request): Promise<string> {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session)
    throw new ApiError(
      401,
      "SESSION_REQUIRED",
      "Reopen your production workspace to continue in this browser.",
    );
  return session.user.id;
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const allowed = new Set([
    new URL(request.url).origin,
    process.env.BETTER_AUTH_URL,
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ]);
  if (origin && !allowed.has(origin))
    throw new ApiError(
      403,
      "ORIGIN_REJECTED",
      "This request must come from your production workspace.",
    );
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(
      403,
      "ORIGIN_REJECTED",
      "This request must come from your production workspace.",
    );
}
