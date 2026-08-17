import { pairingRequestOutputSchema } from "@sochle/contracts/browser";

import { createApiClient, type CredentialStore, type FetchLike } from "./api-client";

type IdentityApi = {
  getRedirectURL(path: string): string;
  launchWebAuthFlow(options: { interactive: boolean; url: string }): Promise<string | undefined>;
};

function encodeBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function verifyCallback(returnedUrl: string | undefined, callbackUrl: string, requestId: string) {
  if (returnedUrl === undefined) throw new Error("Pairing was cancelled");
  const returned = new URL(returnedUrl);
  const expected = new URL(callbackUrl);
  if (
    returned.origin !== expected.origin ||
    returned.pathname !== expected.pathname ||
    returned.hash !== "" ||
    returned.searchParams.size !== 1 ||
    returned.searchParams.get("requestId") !== requestId
  ) {
    throw new Error("Pairing callback did not match");
  }
}

export function createPairingCoordinator(options: {
  apiOrigin: string;
  credential: CredentialStore;
  extensionOrigin?: string;
  fetch: FetchLike;
  identity: IdentityApi;
  randomFill(bytes: Uint8Array): void;
}) {
  const api = createApiClient(options);
  return {
    async pair() {
      const bytes = new Uint8Array(32);
      options.randomFill(bytes);
      const rawCredential = encodeBase64Url(bytes);
      const callbackUrl = options.identity.getRedirectURL("pair");
      const response = await options.fetch(
        new URL("/api/extension/pairing-requests", options.apiOrigin),
        {
          body: JSON.stringify({
            callbackUrl,
            credentialHash: await sha256(rawCredential),
          }),
          headers: {
            "Content-Type": "application/json",
            ...(options.extensionOrigin === undefined ? {} : { Origin: options.extensionOrigin }),
          },
          method: "POST",
        }
      );
      if (!response.ok) throw new Error("Unable to start pairing");
      const pending = pairingRequestOutputSchema.parse(await response.json());
      const returnedUrl = await options.identity.launchWebAuthFlow({
        interactive: true,
        url: pending.approvalUrl,
      });
      verifyCallback(returnedUrl, callbackUrl, pending.requestId);
      const session = await api.verifyCredential(rawCredential);
      await options.credential.set(rawCredential);
      return session;
    },
  };
}
