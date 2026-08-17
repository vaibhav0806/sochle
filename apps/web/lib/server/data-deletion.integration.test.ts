import {
  createSochleDatabase,
  DecisionRepository,
  ExtensionRepository,
  FinancialRepository,
  extensionPairingRequests,
  extensionPairings,
} from "@sochle/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { deleteOwnerData, type AuthorizationRevoker } from "./data-deletion";

const database = createSochleDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://sochle:sochle@localhost:65432/sochle_verify"
);
const financialRepository = new FinancialRepository(database.db);
const decisionRepository = new DecisionRepository(database.db);
const extensionRepository = new ExtensionRepository(database.db);

beforeEach(async () => {
  const connection = await financialRepository.getConnection("fold");
  if (connection !== null) await decisionRepository.deleteOwnerData(connection.id);
});

afterAll(async () => {
  await database.close();
});

describe("deleteOwnerData", () => {
  it("preserves local data when supported remote revocation fails", async () => {
    const connection = await financialRepository.ensureConnection("fold");
    const revoker: AuthorizationRevoker = {
      revoke: async () => {
        throw new Error("Synthetic provider failure");
      },
    };

    await expect(
      deleteOwnerData({ connectionId: connection.id, decisionRepository, revoker })
    ).rejects.toThrow("Synthetic provider failure");
    await expect(financialRepository.getConnection("fold")).resolves.not.toBeNull();
  });

  it("revokes first and deletes local data only after success", async () => {
    const connection = await financialRepository.ensureConnection("fold");
    const request = await extensionRepository.createPairingRequest({
      callbackUrl: "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pair",
      createdAt: new Date("2026-08-18T08:00:00.000Z"),
      credentialHash: "a".repeat(64),
      expiresAt: new Date("2026-08-18T08:10:00.000Z"),
      extensionOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    });
    await extensionRepository.approvePairingRequest(
      request.id,
      connection.id,
      new Date("2026-08-18T08:05:00.000Z")
    );
    const events: string[] = [];
    const revoker: AuthorizationRevoker = {
      revoke: async (connectionId) => {
        events.push(`revoke:${connectionId}`);
      },
    };

    await deleteOwnerData({ connectionId: connection.id, decisionRepository, revoker });

    expect(events).toEqual([`revoke:${connection.id}`]);
    await expect(financialRepository.getConnection("fold")).resolves.toBeNull();
    await expect(database.db.select().from(extensionPairingRequests)).resolves.toEqual([]);
    await expect(database.db.select().from(extensionPairings)).resolves.toEqual([]);
  });
});
