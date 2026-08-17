import type { OAuthDiscoveryState, StoredOAuthTokens } from "@modelcontextprotocol/client";
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

  it("persists OAuth discovery state across the redirect round trip", async () => {
    const store = memoryStore();
    const provider = new FoldOAuthProvider({
      onRedirect() {},
      redirectUrl: "http://localhost:3000/api/fold/callback",
      store,
    });
    const discoveryState: OAuthDiscoveryState = {
      authorizationServerUrl: "https://auth.fold.money",
      resourceMetadataUrl: "https://fold.money/.well-known/oauth-protected-resource",
    };

    await provider.saveDiscoveryState(discoveryState);

    const restored = new FoldOAuthProvider({
      onRedirect() {},
      redirectUrl: "http://localhost:3000/api/fold/callback",
      store,
    });
    await expect(restored.discoveryState()).resolves.toEqual(discoveryState);
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

  it("stores client registrations and tokens by issuer", async () => {
    const store = memoryStore();
    const provider = new FoldOAuthProvider({
      onRedirect() {},
      redirectUrl: "http://localhost:3000/api/fold/callback",
      store,
    });
    const issuer = { issuer: "https://auth.fold.money" };
    const client = { client_id: "synthetic-client" };
    const tokens: StoredOAuthTokens = { access_token: "synthetic-access", token_type: "Bearer" };

    await provider.saveClientInformation(client, issuer);
    await provider.saveTokens(tokens, issuer);

    await expect(provider.clientInformation(issuer)).resolves.toEqual(client);
    await expect(provider.clientInformation()).resolves.toEqual(client);
    await expect(provider.tokens(issuer)).resolves.toEqual(tokens);
  });

  it("rejects stateful values that cannot be safely restored", async () => {
    const provider = new FoldOAuthProvider({
      onRedirect() {},
      redirectUrl: "http://localhost:3000/api/fold/callback",
      store: memoryStore(),
    });

    await expect(provider.codeVerifier()).rejects.toThrow("OAuth code verifier is missing");
    await expect(provider.consumeState(null)).rejects.toThrow("OAuth state mismatch");
    await expect(provider.saveClientInformation({ client_id: "synthetic-client" })).rejects.toThrow(
      "OAuth issuer is required"
    );
    await expect(
      provider.saveTokens({ access_token: "synthetic-access", token_type: "Bearer" })
    ).rejects.toThrow("OAuth issuer is required");
  });
});
