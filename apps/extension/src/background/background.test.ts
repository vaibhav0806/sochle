import { extensionSessionSchema } from "@sochle/contracts/browser";
import { describe, expect, it, vi } from "vitest";

import { createApiClient } from "./api-client";
import { createBackgroundMessageHandler } from "./messages";
import { createPairingCoordinator } from "./pairing";

const apiOrigin = "http://localhost:3000";
const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const callbackUrl = `https://${extensionId}.chromiumapp.org/pair`;
const requestId = "00000000-0000-4000-8000-000000000001";
const pairingId = "00000000-0000-4000-8000-000000000002";

function memoryCredential(initial: string | null = null) {
  let value = initial;
  return {
    get: vi.fn(async () => value),
    remove: vi.fn(async () => {
      value = null;
    }),
    set: vi.fn(async (next: string) => {
      value = next;
    }),
    value: () => value,
  };
}

describe("background pairing", () => {
  it("generates, approves, verifies, and only then persists a credential", async () => {
    const credential = memoryCredential();
    const fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = input.toString();
      if (url.endsWith("/api/extension/pairing-requests")) {
        const body = JSON.parse(init?.body as string);
        expect(body).toEqual({
          callbackUrl,
          credentialHash: "ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0",
        });
        return Response.json(
          {
            approvalUrl: `${apiOrigin}/extension/pair?request=${requestId}`,
            expiresAt: "2026-08-18T08:10:00.000Z",
            requestId,
          },
          { status: 201 }
        );
      }
      expect(new Headers(init?.headers).get("Authorization")).toMatch(/^Bearer /);
      return Response.json(
        {
          appUrl: apiOrigin,
          kind: "paired",
          pairingId,
          ready: true,
          thresholdMinor: 10_000_00,
        },
        { status: 200 }
      );
    });
    const launchWebAuthFlow = vi.fn(async () => `${callbackUrl}?requestId=${requestId}`);
    const coordinator = createPairingCoordinator({
      apiOrigin,
      credential,
      fetch,
      identity: {
        getRedirectURL: vi.fn(() => callbackUrl),
        launchWebAuthFlow,
      },
      randomFill(bytes) {
        bytes.forEach((_, index) => {
          bytes[index] = index;
        });
      },
    });

    const session = await coordinator.pair();

    expect(extensionSessionSchema.parse(session).kind).toBe("paired");
    expect(launchWebAuthFlow).toHaveBeenCalledWith({
      interactive: true,
      url: `${apiOrigin}/extension/pair?request=${requestId}`,
    });
    expect(credential.set).toHaveBeenCalledOnce();
    expect(credential.value()).not.toBeNull();
  });

  it("rejects a callback request mismatch without persisting", async () => {
    const credential = memoryCredential();
    const fetch = vi.fn(async () =>
      Response.json({
        approvalUrl: `${apiOrigin}/extension/pair?request=${requestId}`,
        expiresAt: "2026-08-18T08:10:00.000Z",
        requestId,
      })
    );
    const coordinator = createPairingCoordinator({
      apiOrigin,
      credential,
      fetch,
      identity: {
        getRedirectURL: () => callbackUrl,
        launchWebAuthFlow: async () =>
          `${callbackUrl}?requestId=00000000-0000-4000-8000-000000000099`,
      },
      randomFill: (bytes) => bytes.fill(7),
    });

    await expect(coordinator.pair()).rejects.toThrow("Pairing callback did not match");
    expect(credential.set).not.toHaveBeenCalled();
  });
});

describe("background API client", () => {
  it("attaches bearer auth, parses strict responses, and clears a rejected credential", async () => {
    const credential = memoryCredential("raw-extension-secret");
    const fetch = vi
      .fn()
      .mockImplementationOnce(async (_input: string | URL, init?: RequestInit) => {
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer raw-extension-secret");
        return Response.json({
          appUrl: apiOrigin,
          kind: "paired",
          pairingId,
          ready: true,
          thresholdMinor: 10_000_00,
        });
      })
      .mockImplementationOnce(async () =>
        Response.json({ appUrl: apiOrigin, kind: "unpaired" }, { status: 401 })
      );
    const client = createApiClient({ apiOrigin, credential, fetch });

    await expect(client.getSession()).resolves.toMatchObject({ kind: "paired" });
    await expect(client.getSession()).resolves.toEqual({ appUrl: apiOrigin, kind: "unpaired" });
    expect(credential.remove).toHaveBeenCalledOnce();
  });

  it("rejects a session response with extra financial fields", async () => {
    const client = createApiClient({
      apiOrigin,
      credential: memoryCredential("raw-extension-secret"),
      fetch: async () =>
        Response.json({
          appUrl: apiOrigin,
          auditBundle: {},
          kind: "paired",
          pairingId,
          ready: true,
          thresholdMinor: 10_000_00,
        }),
    });
    await expect(client.getSession()).rejects.toThrow();
  });

  it("clears credentials when a decision is revoked and after disconnect", async () => {
    const rejectedCredential = memoryCredential("revoked-extension-secret");
    const rejected = createApiClient({
      apiOrigin,
      credential: rejectedCredential,
      fetch: async () =>
        Response.json(
          { error: { code: "unpaired", message: "Pair the extension to continue" } },
          { status: 401 }
        ),
    });
    await expect(
      rejected.createDecision({
        correctedPrice: { currency: "INR", minor: 10_000_00 },
        correctedTitle: "Synthetic headphones",
        extracted: {
          canonicalUrl: "https://www.amazon.in/dp/SYNTHETIC",
          confidence: "high",
          merchant: "amazon.in",
          price: { currency: "INR", minor: 10_000_00 },
          title: "Synthetic headphones",
        },
        idempotencyKey: requestId,
      })
    ).rejects.toThrow("Pair the extension to continue");
    expect(rejectedCredential.remove).toHaveBeenCalledOnce();

    const connectedCredential = memoryCredential("connected-extension-secret");
    const connected = createApiClient({
      apiOrigin,
      credential: connectedCredential,
      fetch: async () => new Response(null, { status: 204 }),
    });
    await expect(connected.disconnect()).resolves.toEqual({ disconnected: true });
    expect(connectedCredential.remove).toHaveBeenCalledOnce();
  });
});

describe("background message boundary", () => {
  it("accepts named operations and rejects arbitrary proxy messages", async () => {
    const sendMessage = vi.fn(async () => undefined);
    const handler = createBackgroundMessageHandler({
      api: {
        createDecision: vi.fn(),
        disconnect: vi.fn(),
        getSession: vi.fn(async () => ({ appUrl: apiOrigin, kind: "unpaired" as const })),
        setOutcome: vi.fn(),
      },
      pair: vi.fn(),
      tabs: {
        queryActive: async () => ({ id: 42, url: "https://www.amazon.in/dp/SYNTHETIC" }),
        sendMessage,
      },
    });

    await expect(handler({ operation: "getSession" })).resolves.toMatchObject({
      kind: "unpaired",
    });
    await expect(handler({ operation: "openCurrentProductCheck" })).resolves.toEqual({
      opened: true,
    });
    expect(sendMessage).toHaveBeenCalledWith(42, { operation: "showManualCheck" });
    await expect(
      handler({ body: { steal: true }, method: "POST", operation: "proxy", url: "https://x" })
    ).rejects.toThrow();
  });
});
