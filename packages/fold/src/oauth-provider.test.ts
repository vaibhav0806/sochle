import type { StoredOAuthTokens } from "@modelcontextprotocol/client";
import { describe, expect, it } from "vitest";

import { FoldOAuthProvider } from "./oauth-provider";
import type { FoldOAuthState, FoldOAuthStateStore } from "./oauth-provider";

function memoryStore(): FoldOAuthStateStore {
  let value: FoldOAuthState | null = null;
  return {
    async load() {
      return value;
    },
    async save(next) {
      value = structuredClone(next);
    },
  };
}

describe("FoldOAuthProvider", () => {
  it("persists PKCE, state, and tokens across provider instances", async () => {
    const store = memoryStore();
    const provider = new FoldOAuthProvider({
      onRedirect() {},
      redirectUrl: "http://localhost:3000/api/fold/callback",
      store,
    });
    const tokens: StoredOAuthTokens = {
      access_token: "demo-access",
      refresh_token: "demo-refresh",
      token_type: "Bearer",
    };

    const state = await provider.state();
    await provider.saveCodeVerifier("demo-verifier");
    await provider.saveTokens(tokens, { issuer: "https://auth.fold.money" });

    const restored = new FoldOAuthProvider({
      onRedirect() {},
      redirectUrl: "http://localhost:3000/api/fold/callback",
      store,
    });
    expect(await restored.codeVerifier()).toBe("demo-verifier");
    expect(await restored.tokens()).toEqual(tokens);
    await expect(restored.consumeState(state)).resolves.toBeUndefined();
    await expect(restored.consumeState(state)).rejects.toThrow("OAuth state mismatch");
  });

  it("hands the authorization URL to the application", async () => {
    let redirectedTo: string | null = null;
    const provider = new FoldOAuthProvider({
      onRedirect(url) {
        redirectedTo = url.toString();
      },
      redirectUrl: "http://localhost:3000/api/fold/callback",
      store: memoryStore(),
    });

    await provider.redirectToAuthorization(
      new URL("https://auth.fold.money/authorize?client=demo")
    );

    expect(redirectedTo).toBe("https://auth.fold.money/authorize?client=demo");
  });
});
