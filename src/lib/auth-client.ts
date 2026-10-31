"use client";
import { createAuthClient } from "better-auth/react";
import { anonymousClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({ plugins: [anonymousClient()] });
let pending: Promise<void> | null = null;
export async function ensureAuthenticated() {
  if (!pending) {
    pending = (async () => {
      const session = await authClient.getSession();
      if (session.data?.user) return;
      const result = await authClient.signIn.anonymous();
      if (result.error)
        throw new Error(
          result.error.status === 429
            ? "Several productions are opening at once. Please wait a moment and try again."
            : "Your private production could not be opened. Please try again.",
        );
    })().catch((error) => {
      pending = null;
      throw error;
    });
  }
  await pending;
}
