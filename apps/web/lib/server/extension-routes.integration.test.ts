import {
  createSochleDatabase,
  DecisionRepository,
  ExtensionRepository,
  FinancialRepository,
  extensionPairingRequests,
} from "@sochle/db";
import { extensionSessionSchema, pairingRequestOutputSchema } from "@sochle/contracts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createPairingCsrfToken } from "./extension-auth";
import { createExtensionPairingService } from "./extension-pairing-service";
import {
  handleApprovePairingRequest,
  handleCreatePairingRequest,
  handleDeleteExtensionSession,
  handleExtensionPreflight,
  handleExtensionSession,
  handleRevokeOwnerPairing,
} from "./extension-route-handlers";

const database = createSochleDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://sochle:sochle@localhost:65432/sochle_verify"
);
const extensionRepository = new ExtensionRepository(database.db);
const financialRepository = new FinancialRepository(database.db);
const decisionRepository = new DecisionRepository(database.db);

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const extensionOrigin = `chrome-extension://${extensionId}`;
const callbackUrl = `https://${extensionId}.chromiumapp.org/pair`;
const credentialHash = "2a4c311c1053063576886c945ae72c6b0899885b1b66ad8f1fe54d9245e01cef";
const now = new Date("2026-08-18T08:00:00.000Z");
const sessionSecret = "synthetic-session-secret-at-least-32-characters";

beforeEach(async () => {
  const connection = await financialRepository.getConnection("fold");
  if (connection !== null) await decisionRepository.deleteOwnerData(connection.id);
  await database.db.delete(extensionPairingRequests);
});

afterAll(async () => {
  await database.close();
});

function service() {
  return createExtensionPairingService({
    appUrl: "http://localhost:3000",
    extensionRepository,
    financialRepository,
    now: () => now,
    sessionSecret,
  });
}

function createRequest(body: unknown) {
  return new Request("http://localhost:3000/api/extension/pairing-requests", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", Origin: extensionOrigin },
    method: "POST",
  });
}

async function createPending() {
  const response = await handleCreatePairingRequest(
    createRequest({ callbackUrl, credentialHash }),
    service()
  );
  return pairingRequestOutputSchema.parse(await response.json());
}

async function approvePending(existingPending?: Awaited<ReturnType<typeof createPending>>) {
  const connection = await financialRepository.ensureConnection("fold");
  const pending = existingPending ?? (await createPending());
  const approval = await service().getApprovalContext(pending.requestId);
  const form = new FormData();
  form.set("csrfToken", approval.csrfToken);
  const response = await handleApprovePairingRequest(
    new Request(
      `http://localhost:3000/api/extension/pairing-requests/${pending.requestId}/approve`,
      {
        body: form,
        method: "POST",
      }
    ),
    pending.requestId,
    { connectionId: connection.id, ownerAuthenticated: true, service: service() }
  );
  return { connection, pending, response };
}

describe("extension route handlers", () => {
  it("creates a strict request with exact-origin CORS and no hash response", async () => {
    const response = await handleCreatePairingRequest(
      createRequest({ callbackUrl, credentialHash }),
      service()
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(extensionOrigin);
    const body = pairingRequestOutputSchema.parse(await response.json());
    expect(body.expiresAt).toBe("2026-08-18T08:10:00.000Z");
    expect(JSON.stringify(body)).not.toMatch(/credential|hash/i);

    const invalid = await handleCreatePairingRequest(
      createRequest({ callbackUrl, credentialHash, rawCredential: "leak" }),
      service()
    );
    expect(invalid.status).toBe(400);
  });

  it("answers preflight for a validated extension origin only", () => {
    const response = handleExtensionPreflight(
      new Request("http://localhost:3000/api/extension/session", {
        headers: { Origin: extensionOrigin },
        method: "OPTIONS",
      })
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(extensionOrigin);
    expect(() =>
      handleExtensionPreflight(
        new Request("http://localhost:3000/api/extension/session", {
          headers: { Origin: "https://attacker.example" },
          method: "OPTIONS",
        })
      )
    ).toThrow("Invalid extension origin");
  });

  it("requires owner approval and redirects only to the bound identity callback", async () => {
    const pending = await createPending();
    const approval = await service().getApprovalContext(pending.requestId);
    const form = new FormData();
    form.set("csrfToken", approval.csrfToken);
    const request = new Request(
      `http://localhost:3000/api/extension/pairing-requests/${pending.requestId}/approve`,
      { body: form, method: "POST" }
    );
    const unauthorized = await handleApprovePairingRequest(request, pending.requestId, {
      connectionId: null,
      ownerAuthenticated: false,
      service: service(),
    });
    expect(unauthorized.status).toBe(401);

    const { response } = await approvePending(pending);
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toMatch(
      new RegExp(`^${callbackUrl.replaceAll(".", "\\.")}\\?requestId=`)
    );
  });

  it("returns minimized session state and revokes current and owner pairings", async () => {
    const { connection } = await approvePending();
    const request = new Request("http://localhost:3000/api/extension/session", {
      headers: {
        Authorization: "Bearer raw-extension-secret",
        Origin: extensionOrigin,
      },
    });
    const response = await handleExtensionSession(request, service(), async () => ({
      appUrl: "http://localhost:3000",
      ready: true,
      thresholdMinor: 10_000_00,
    }));
    expect(response.status).toBe(200);
    const session = extensionSessionSchema.parse(await response.json());
    expect(session).toMatchObject({ kind: "paired", ready: true, thresholdMinor: 10_000_00 });

    const pairings = await service().listOwnerPairings(connection.id);
    const pairing = pairings[0]!;
    const csrfToken = createPairingCsrfToken(
      sessionSecret,
      pairing.id,
      new Date("2026-08-18T09:00:00.000Z")
    );
    const revokeForm = new FormData();
    revokeForm.set("csrfToken", csrfToken);
    const revokeResponse = await handleRevokeOwnerPairing(
      new Request(`http://localhost:3000/api/extension/pairings/${pairing.id}/revoke`, {
        body: revokeForm,
        method: "POST",
      }),
      pairing.id,
      {
        connectionId: connection.id,
        csrfSecret: sessionSecret,
        now,
        ownerAuthenticated: true,
        service: service(),
      }
    );
    expect(revokeResponse.status).toBe(303);
    expect(revokeResponse.headers.get("Location")).toBe(
      "http://localhost:3000/connections?result=extension_revoked"
    );
    const after = await handleExtensionSession(request, service(), async () => ({
      appUrl: "http://localhost:3000",
      ready: true,
      thresholdMinor: 10_000_00,
    }));
    expect(after.status).toBe(401);
    expect(extensionSessionSchema.parse(await after.json())).toEqual({
      appUrl: "http://localhost:3000",
      kind: "unpaired",
    });
  });

  it("lets an authenticated extension revoke only its current pairing", async () => {
    await approvePending();
    const request = new Request("http://localhost:3000/api/extension/session", {
      headers: {
        Authorization: "Bearer raw-extension-secret",
        Origin: extensionOrigin,
      },
      method: "DELETE",
    });
    const response = await handleDeleteExtensionSession(request, service());
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(extensionOrigin);

    const after = await handleExtensionSession(request, service(), async () => ({
      appUrl: "http://localhost:3000",
      ready: true,
      thresholdMinor: 10_000_00,
    }));
    expect(after.status).toBe(401);
  });
});
