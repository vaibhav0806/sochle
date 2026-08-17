import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createSochleDatabase } from "./database";
import { ExtensionRepository } from "./extension-repository";
import { FinancialRepository } from "./repository";
import { connections, extensionPairingRequests, extensionPairings } from "./schema";

const database = createSochleDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://sochle:sochle@localhost:65432/sochle_verify"
);
const repository = new ExtensionRepository(database.db);
const financialRepository = new FinancialRepository(database.db);

const extensionOrigin = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const callbackUrl = "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pair";
const requestedAt = new Date("2026-08-18T08:00:00.000Z");
const expiresAt = new Date("2026-08-18T08:10:00.000Z");

beforeEach(async () => {
  await database.db.delete(connections);
  await database.db.delete(extensionPairingRequests);
});

afterAll(async () => {
  await database.close();
});

function createRequest(credentialHash = "a".repeat(64)) {
  return repository.createPairingRequest({
    callbackUrl,
    credentialHash,
    createdAt: requestedAt,
    expiresAt,
    extensionOrigin,
  });
}

describe("ExtensionRepository pairing lifecycle", () => {
  it("persists only the credential hash for a pending request", async () => {
    const request = await createRequest();

    expect(request).toMatchObject({
      callbackUrl,
      credentialHash: "a".repeat(64),
      extensionOrigin,
    });
    expect(JSON.stringify(request)).not.toContain("raw-extension-secret");
    await expect(repository.getPairingRequest(request.id)).resolves.toMatchObject({
      id: request.id,
    });
  });

  it("approves once and authenticates only the matching hash and origin", async () => {
    const connection = await financialRepository.ensureConnection("fold");
    const request = await createRequest();
    const approvedAt = new Date("2026-08-18T08:05:00.000Z");

    const pairing = await repository.approvePairingRequest(request.id, connection.id, approvedAt);

    await expect(
      repository.authenticatePairing(
        "a".repeat(64),
        extensionOrigin,
        new Date("2026-08-18T08:06:00.000Z")
      )
    ).resolves.toMatchObject({
      connectionId: connection.id,
      id: pairing.id,
      lastUsedAt: new Date("2026-08-18T08:06:00.000Z"),
    });
    await expect(
      repository.authenticatePairing("b".repeat(64), extensionOrigin, approvedAt)
    ).resolves.toBeNull();
    await expect(
      repository.authenticatePairing(
        "a".repeat(64),
        "chrome-extension://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        approvedAt
      )
    ).resolves.toBeNull();
    await expect(
      repository.approvePairingRequest(request.id, connection.id, approvedAt)
    ).rejects.toThrow("Pairing request is no longer pending");
  });

  it("rejects approval at and after the expiry boundary", async () => {
    const connection = await financialRepository.ensureConnection("fold");
    const atBoundary = await createRequest("b".repeat(64));

    await expect(
      repository.approvePairingRequest(atBoundary.id, connection.id, expiresAt)
    ).rejects.toThrow("Pairing request is no longer pending");

    const afterBoundary = await createRequest("c".repeat(64));
    await expect(
      repository.approvePairingRequest(
        afterBoundary.id,
        connection.id,
        new Date("2026-08-18T08:10:00.001Z")
      )
    ).rejects.toThrow("Pairing request is no longer pending");
  });

  it("scopes listing and revocation to the owner connection", async () => {
    const owner = await financialRepository.ensureConnection("fold");
    const other = await financialRepository.ensureConnection("other");
    const request = await createRequest();
    const pairing = await repository.approvePairingRequest(
      request.id,
      owner.id,
      new Date("2026-08-18T08:05:00.000Z")
    );

    await expect(repository.listPairings(owner.id)).resolves.toHaveLength(1);
    await expect(repository.listPairings(other.id)).resolves.toEqual([]);
    await expect(
      repository.revokePairing(other.id, pairing.id, new Date("2026-08-18T08:07:00.000Z"))
    ).rejects.toThrow("Extension pairing not found");

    await repository.revokePairing(owner.id, pairing.id, new Date("2026-08-18T08:07:00.000Z"));
    await expect(
      repository.authenticatePairing("a".repeat(64), extensionOrigin, requestedAt)
    ).resolves.toBeNull();
  });

  it("allows a pairing to revoke itself and cascades owner deletion", async () => {
    const connection = await financialRepository.ensureConnection("fold");
    const firstRequest = await createRequest();
    const first = await repository.approvePairingRequest(
      firstRequest.id,
      connection.id,
      new Date("2026-08-18T08:05:00.000Z")
    );

    await repository.revokeCurrentPairing(first.id, new Date("2026-08-18T08:06:00.000Z"));
    await expect(repository.listPairings(connection.id)).resolves.toMatchObject([
      { id: first.id, revokedAt: new Date("2026-08-18T08:06:00.000Z") },
    ]);

    const secondRequest = await createRequest("d".repeat(64));
    await repository.approvePairingRequest(
      secondRequest.id,
      connection.id,
      new Date("2026-08-18T08:07:00.000Z")
    );
    await database.db.delete(connections);
    await expect(database.db.select().from(extensionPairings)).resolves.toEqual([]);
  });
});
