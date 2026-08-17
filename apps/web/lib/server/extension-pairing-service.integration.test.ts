import {
  createSochleDatabase,
  ExtensionRepository,
  FinancialRepository,
  extensionPairingRequests,
  type ExtensionPairingRow,
} from "@sochle/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createExtensionPairingService } from "./extension-pairing-service";

const database = createSochleDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://sochle:sochle@localhost:65432/sochle_verify"
);
const extensionRepository = new ExtensionRepository(database.db);
const financialRepository = new FinancialRepository(database.db);

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const extensionOrigin = `chrome-extension://${extensionId}`;
const callbackUrl = `https://${extensionId}.chromiumapp.org/pair`;
const rawCredential = "raw-extension-secret";
const now = new Date("2026-08-18T08:00:00.000Z");
const sessionSecret = "synthetic-session-secret-at-least-32-characters";

beforeEach(async () => {
  const connection = await financialRepository.getConnection("fold");
  if (connection !== null) {
    const { DecisionRepository } = await import("@sochle/db");
    await new DecisionRepository(database.db).deleteOwnerData(connection.id);
  }
  await database.db.delete(extensionPairingRequests);
});

afterAll(async () => {
  await database.close();
});

function service(at = now) {
  return createExtensionPairingService({
    appUrl: "http://localhost:3000",
    extensionRepository,
    financialRepository,
    now: () => at,
    sessionSecret,
  });
}

async function createAndApprove(
  credentialHash = "2a4c311c1053063576886c945ae72c6b0899885b1b66ad8f1fe54d9245e01cef"
) {
  const connection = await financialRepository.ensureConnection("fold");
  const pending = await service().createRequest({
    callbackUrl,
    credentialHash,
    extensionOrigin,
  });
  const approval = await service().getApprovalContext(pending.requestId);
  const redirect = await service().approveRequest({
    connectionId: connection.id,
    csrfToken: approval.csrfToken,
    requestId: pending.requestId,
  });
  return { approval, connection, pending, redirect };
}

function authenticatedRequest(origin = extensionOrigin, credential = rawCredential) {
  return new Request("http://localhost:3000/api/extension/session", {
    headers: { Authorization: `Bearer ${credential}`, Origin: origin },
  });
}

describe("extension pairing service", () => {
  it("creates a ten-minute hash-only request and safe approval context", async () => {
    const pending = await service().createRequest({
      callbackUrl,
      credentialHash: "2a4c311c1053063576886c945ae72c6b0899885b1b66ad8f1fe54d9245e01cef",
      extensionOrigin,
    });
    expect(pending).toEqual({
      approvalUrl: expect.stringMatching(/^http:\/\/localhost:3000\/extension\/pair\?request=/),
      expiresAt: "2026-08-18T08:10:00.000Z",
      requestId: expect.any(String),
    });
    const approval = await service().getApprovalContext(pending.requestId);
    expect(approval).toMatchObject({ extensionOrigin, requestId: pending.requestId });
    expect(JSON.stringify({ pending, approval })).not.toMatch(
      /credentialHash|raw-extension-secret/
    );
  });

  it("approves once, redirects to the bound callback, and authenticates", async () => {
    const { approval, connection, pending, redirect } = await createAndApprove();
    expect(redirect).toBe(`${callbackUrl}?requestId=${pending.requestId}`);

    const pairing = await service().authenticateRequest(authenticatedRequest());
    if (pairing === null) throw new Error("Expected an authenticated pairing");
    expect(pairing).toMatchObject({ connectionId: connection.id, extensionOrigin });
    await expect(service().listOwnerPairings(connection.id)).resolves.toMatchObject([
      { extensionOrigin, id: pairing.id },
    ]);
    expect(JSON.stringify(pairing)).not.toContain("credentialHash");
    await expect(
      service().approveRequest({
        connectionId: connection.id,
        csrfToken: approval.csrfToken,
        requestId: pending.requestId,
      })
    ).rejects.toThrow("Pairing request is no longer pending");
  });

  it("rejects an expired request and wrong-origin authentication", async () => {
    const connection = await financialRepository.ensureConnection("fold");
    const pending = await service().createRequest({
      callbackUrl,
      credentialHash: "2a4c311c1053063576886c945ae72c6b0899885b1b66ad8f1fe54d9245e01cef",
      extensionOrigin,
    });
    const approval = await service().getApprovalContext(pending.requestId);
    await expect(
      service(new Date("2026-08-18T08:10:00.000Z")).approveRequest({
        connectionId: connection.id,
        csrfToken: approval.csrfToken,
        requestId: pending.requestId,
      })
    ).rejects.toThrow("Invalid pairing approval");
    await expect(
      service().authenticateRequest(
        authenticatedRequest("chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
      )
    ).resolves.toBeNull();
  });

  it("supports owner and current-pairing revocation", async () => {
    const { connection } = await createAndApprove();
    const pairing = (await service().authenticateRequest(
      authenticatedRequest()
    )) as ExtensionPairingRow;

    await service().revokeCurrentPairing(pairing.id);
    await expect(service().authenticateRequest(authenticatedRequest())).resolves.toBeNull();

    const second = await createAndApprove(
      "bfa3468d694f4397844c0b214dba7ab0a5190cec9aafe6e2e7cad522ee1cf5ad"
    );
    const active = (await service().authenticateRequest(
      authenticatedRequest(extensionOrigin, "second-extension-secret")
    )) as ExtensionPairingRow;
    await service().revokeOwnerPairing(second.connection.id, active.id);
    await expect(
      service().authenticateRequest(
        authenticatedRequest(extensionOrigin, "second-extension-secret")
      )
    ).resolves.toBeNull();
  });
});
