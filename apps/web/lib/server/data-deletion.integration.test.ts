import { createSochleDatabase, DecisionRepository, FinancialRepository } from "@sochle/db";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { deleteOwnerData, type AuthorizationRevoker } from "./data-deletion";

const database = createSochleDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://sochle:sochle@localhost:65432/sochle_verify"
);
const financialRepository = new FinancialRepository(database.db);
const decisionRepository = new DecisionRepository(database.db);

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
    const events: string[] = [];
    const revoker: AuthorizationRevoker = {
      revoke: async (connectionId) => {
        events.push(`revoke:${connectionId}`);
      },
    };

    await deleteOwnerData({ connectionId: connection.id, decisionRepository, revoker });

    expect(events).toEqual([`revoke:${connection.id}`]);
    await expect(financialRepository.getConnection("fold")).resolves.toBeNull();
  });
});
