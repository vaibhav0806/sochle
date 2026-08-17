import { and, desc, eq, gt, isNull } from "drizzle-orm";

import type { SochleDatabase } from "./database";
import { auditEvents, extensionPairingRequests, extensionPairings } from "./schema";

export type CreatePairingRequestInput = {
  callbackUrl: string;
  createdAt: Date;
  credentialHash: string;
  expiresAt: Date;
  extensionOrigin: string;
};

export class ExtensionRepository {
  constructor(private readonly db: SochleDatabase) {}

  async createPairingRequest(input: CreatePairingRequestInput) {
    const [created] = await this.db.insert(extensionPairingRequests).values(input).returning();
    if (created === undefined) throw new Error("Unable to create pairing request");
    return created;
  }

  async getPairingRequest(requestId: string) {
    const [request] = await this.db
      .select()
      .from(extensionPairingRequests)
      .where(eq(extensionPairingRequests.id, requestId))
      .limit(1);
    return request ?? null;
  }

  async approvePairingRequest(requestId: string, connectionId: string, approvedAt: Date) {
    return this.db.transaction(async (transaction) => {
      const [request] = await transaction
        .update(extensionPairingRequests)
        .set({ approvedAt, consumedAt: approvedAt })
        .where(
          and(
            eq(extensionPairingRequests.id, requestId),
            isNull(extensionPairingRequests.consumedAt),
            gt(extensionPairingRequests.expiresAt, approvedAt)
          )
        )
        .returning();
      if (request === undefined) throw new Error("Pairing request is no longer pending");

      const [pairing] = await transaction
        .insert(extensionPairings)
        .values({
          connectionId,
          credentialHash: request.credentialHash,
          extensionOrigin: request.extensionOrigin,
        })
        .returning();
      if (pairing === undefined) throw new Error("Unable to create extension pairing");

      await transaction.insert(auditEvents).values({
        connectionId,
        details: { extensionOrigin: pairing.extensionOrigin },
        entityId: pairing.id,
        entityType: "extension_pairing",
        type: "extension_paired",
      });
      return pairing;
    });
  }

  async authenticatePairing(credentialHash: string, extensionOrigin: string, usedAt: Date) {
    const [pairing] = await this.db
      .update(extensionPairings)
      .set({ lastUsedAt: usedAt })
      .where(
        and(
          eq(extensionPairings.credentialHash, credentialHash),
          eq(extensionPairings.extensionOrigin, extensionOrigin),
          isNull(extensionPairings.revokedAt)
        )
      )
      .returning();
    return pairing ?? null;
  }

  async listPairings(connectionId: string) {
    return this.db
      .select()
      .from(extensionPairings)
      .where(eq(extensionPairings.connectionId, connectionId))
      .orderBy(desc(extensionPairings.createdAt), desc(extensionPairings.id));
  }

  async revokePairing(connectionId: string, pairingId: string, revokedAt: Date): Promise<void> {
    const [pairing] = await this.db
      .update(extensionPairings)
      .set({ revokedAt })
      .where(
        and(
          eq(extensionPairings.id, pairingId),
          eq(extensionPairings.connectionId, connectionId),
          isNull(extensionPairings.revokedAt)
        )
      )
      .returning();
    if (pairing === undefined) throw new Error("Extension pairing not found");
    await this.db.insert(auditEvents).values({
      connectionId,
      details: { extensionOrigin: pairing.extensionOrigin },
      entityId: pairing.id,
      entityType: "extension_pairing",
      type: "extension_revoked",
    });
  }

  async revokeCurrentPairing(pairingId: string, revokedAt: Date): Promise<void> {
    const [pairing] = await this.db
      .update(extensionPairings)
      .set({ revokedAt })
      .where(and(eq(extensionPairings.id, pairingId), isNull(extensionPairings.revokedAt)))
      .returning();
    if (pairing === undefined) throw new Error("Extension pairing not found");
    await this.db.insert(auditEvents).values({
      connectionId: pairing.connectionId,
      details: { extensionOrigin: pairing.extensionOrigin },
      entityId: pairing.id,
      entityType: "extension_pairing",
      type: "extension_revoked",
    });
  }
}
