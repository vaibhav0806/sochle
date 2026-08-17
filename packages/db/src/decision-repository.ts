import type { DecisionResult, PlannedPurchase, RuleSet } from "@sochle/domain";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";

import type { SochleDatabase } from "./database";
import {
  auditEvents,
  connections,
  corrections,
  dataIssues,
  decisions,
  extensionPairings,
  financialAccounts,
  financialSnapshots,
  normalizedTransactions,
  purchaseIntents,
  ruleSets,
} from "./schema";
import type { DecisionAuditBundle } from "./schema";

export type RuleSetRow = typeof ruleSets.$inferSelect;
export type PurchaseIntentRow = typeof purchaseIntents.$inferSelect;
export type DecisionRow = typeof decisions.$inferSelect;
export type PurchaseIntentStatus = PurchaseIntentRow["status"];

export type CreatePurchaseDecisionInput = {
  auditBundle: DecisionAuditBundle;
  connectionId: string;
  description: string;
  extensionContext?: {
    canonicalUrl: string;
    extractedPriceMinor: number | null;
    extractedTitle: string;
    extractionConfidence: "high" | "medium" | "low";
    idempotencyKey: string;
    merchant: "amazon.in" | "flipkart.com" | "myntra.com";
    pairingId: string;
  };
  priceMinor: number;
  result: DecisionResult;
  ruleSetId: string;
  snapshotId: string;
};

export type AppendDecisionInput = {
  auditBundle: DecisionAuditBundle;
  connectionId: string;
  previousDecisionId: string;
  purchaseIntentId: string;
  result: DecisionResult;
  ruleSetId: string;
  snapshotId: string;
};

export type NewAuditEvent = {
  connectionId: string;
  details: Record<string, unknown>;
  entityId?: string;
  entityType?: string;
  type: (typeof auditEvents.$inferInsert)["type"];
};

export type OwnerExport = {
  auditEvents: Array<typeof auditEvents.$inferSelect>;
  corrections: Array<typeof corrections.$inferSelect>;
  dataIssues: Array<typeof dataIssues.$inferSelect>;
  decisions: DecisionRow[];
  exportedAt: string;
  financialAccounts: Array<typeof financialAccounts.$inferSelect>;
  normalizedTransactions: Array<typeof normalizedTransactions.$inferSelect>;
  purchaseIntents: PurchaseIntentRow[];
  ruleSets: RuleSetRow[];
  schemaVersion: 1;
  snapshots: Array<typeof financialSnapshots.$inferSelect>;
};

export class DecisionRepository {
  constructor(private readonly db: SochleDatabase) {}

  async createRuleSet(connectionId: string, rules: RuleSet): Promise<RuleSetRow> {
    const [created] = await this.db
      .insert(ruleSets)
      .values({ connectionId, rules, version: rules.version })
      .returning();
    if (created === undefined) throw new Error("Unable to create rule set");
    return created;
  }

  async getActiveRuleSet(connectionId: string): Promise<RuleSetRow | null> {
    const [ruleSet] = await this.db
      .select()
      .from(ruleSets)
      .where(eq(ruleSets.connectionId, connectionId))
      .orderBy(desc(ruleSets.version))
      .limit(1);
    return ruleSet ?? null;
  }

  async createPurchaseDecision(input: CreatePurchaseDecisionInput): Promise<{
    decision: DecisionRow;
    intent: PurchaseIntentRow;
  }> {
    return this.db.transaction(async (transaction) => {
      const [[snapshot], [ruleSet]] = await Promise.all([
        transaction
          .select({ id: financialSnapshots.id })
          .from(financialSnapshots)
          .where(
            and(
              eq(financialSnapshots.id, input.snapshotId),
              eq(financialSnapshots.connectionId, input.connectionId)
            )
          )
          .limit(1),
        transaction
          .select({ id: ruleSets.id })
          .from(ruleSets)
          .where(
            and(eq(ruleSets.id, input.ruleSetId), eq(ruleSets.connectionId, input.connectionId))
          )
          .limit(1),
      ]);
      if (snapshot === undefined || ruleSet === undefined) {
        throw new Error("Decision context does not belong to connection");
      }

      if (input.extensionContext !== undefined) {
        const [pairing] = await transaction
          .select({ id: extensionPairings.id })
          .from(extensionPairings)
          .where(
            and(
              eq(extensionPairings.id, input.extensionContext.pairingId),
              eq(extensionPairings.connectionId, input.connectionId),
              isNull(extensionPairings.revokedAt)
            )
          )
          .limit(1);
        if (pairing === undefined)
          throw new Error("Extension pairing does not belong to connection");
      }

      const intentValues = {
        canonicalUrl: input.extensionContext?.canonicalUrl,
        connectionId: input.connectionId,
        description: input.description,
        extractedPriceMinor: input.extensionContext?.extractedPriceMinor,
        extractedTitle: input.extensionContext?.extractedTitle,
        extractionConfidence: input.extensionContext?.extractionConfidence,
        idempotencyKey: input.extensionContext?.idempotencyKey,
        merchant: input.extensionContext?.merchant,
        pairingId: input.extensionContext?.pairingId,
        priceMinor: input.priceMinor,
        source: input.extensionContext === undefined ? ("manual" as const) : ("extension" as const),
      };
      const [intent] =
        input.extensionContext === undefined
          ? await transaction.insert(purchaseIntents).values(intentValues).returning()
          : await transaction
              .insert(purchaseIntents)
              .values(intentValues)
              .onConflictDoNothing({
                target: [purchaseIntents.pairingId, purchaseIntents.idempotencyKey],
              })
              .returning();
      if (intent === undefined && input.extensionContext !== undefined) {
        const [existing] = await transaction
          .select({ decision: decisions, intent: purchaseIntents })
          .from(purchaseIntents)
          .innerJoin(decisions, eq(decisions.purchaseIntentId, purchaseIntents.id))
          .where(
            and(
              eq(purchaseIntents.pairingId, input.extensionContext.pairingId),
              eq(purchaseIntents.idempotencyKey, input.extensionContext.idempotencyKey)
            )
          )
          .orderBy(desc(decisions.createdAt), desc(decisions.id))
          .limit(1);
        if (existing === undefined) throw new Error("Unable to load idempotent purchase decision");
        return existing;
      }
      if (intent === undefined) throw new Error("Unable to create purchase intent");

      const [decision] = await transaction
        .insert(decisions)
        .values({
          auditBundle: input.auditBundle,
          confidence: input.result.confidence.level,
          connectionId: input.connectionId,
          evaluatedAt: new Date(input.result.evaluatedAt),
          financialVerdict: input.result.financialVerdict,
          formulaVersion: input.result.formulaVersion,
          priceMinor: input.priceMinor,
          purchaseIntentId: intent.id,
          ruleSetId: input.ruleSetId,
          snapshotId: input.snapshotId,
          verdict: input.result.verdict,
        })
        .returning();
      if (decision === undefined) throw new Error("Unable to create decision");

      await transaction.insert(auditEvents).values({
        connectionId: input.connectionId,
        details: { purchaseIntentId: intent.id },
        entityId: decision.id,
        entityType: "decision",
        type: "decision_created",
      });
      return { decision, intent };
    });
  }

  async appendDecision(input: AppendDecisionInput): Promise<DecisionRow> {
    return this.db.transaction(async (transaction) => {
      const [[snapshot], [ruleSet]] = await Promise.all([
        transaction
          .select({ id: financialSnapshots.id })
          .from(financialSnapshots)
          .where(
            and(
              eq(financialSnapshots.id, input.snapshotId),
              eq(financialSnapshots.connectionId, input.connectionId)
            )
          )
          .limit(1),
        transaction
          .select({ id: ruleSets.id })
          .from(ruleSets)
          .where(
            and(eq(ruleSets.id, input.ruleSetId), eq(ruleSets.connectionId, input.connectionId))
          )
          .limit(1),
      ]);
      if (snapshot === undefined || ruleSet === undefined) {
        throw new Error("Decision context does not belong to connection");
      }

      const [previous] = await transaction
        .select()
        .from(decisions)
        .where(
          and(
            eq(decisions.id, input.previousDecisionId),
            eq(decisions.connectionId, input.connectionId),
            eq(decisions.purchaseIntentId, input.purchaseIntentId)
          )
        )
        .limit(1);
      if (previous === undefined) throw new Error("Previous decision not found");

      const [decision] = await transaction
        .insert(decisions)
        .values({
          auditBundle: input.auditBundle,
          confidence: input.result.confidence.level,
          connectionId: input.connectionId,
          evaluatedAt: new Date(input.result.evaluatedAt),
          financialVerdict: input.result.financialVerdict,
          formulaVersion: input.result.formulaVersion,
          previousDecisionId: previous.id,
          priceMinor: previous.priceMinor,
          purchaseIntentId: input.purchaseIntentId,
          ruleSetId: input.ruleSetId,
          snapshotId: input.snapshotId,
          verdict: input.result.verdict,
        })
        .returning();
      if (decision === undefined) throw new Error("Unable to append decision");

      await transaction.insert(auditEvents).values({
        connectionId: input.connectionId,
        details: { previousDecisionId: previous.id },
        entityId: decision.id,
        entityType: "decision",
        type: "decision_recalculated",
      });
      return decision;
    });
  }

  async getDecision(connectionId: string, decisionId: string) {
    const [row] = await this.db
      .select({ decision: decisions, intent: purchaseIntents })
      .from(decisions)
      .innerJoin(purchaseIntents, eq(decisions.purchaseIntentId, purchaseIntents.id))
      .where(and(eq(decisions.connectionId, connectionId), eq(decisions.id, decisionId)))
      .limit(1);
    return row ?? null;
  }

  async getDecisionByExtensionRequest(pairingId: string, idempotencyKey: string) {
    const [row] = await this.db
      .select({ decision: decisions, intent: purchaseIntents })
      .from(purchaseIntents)
      .innerJoin(decisions, eq(decisions.purchaseIntentId, purchaseIntents.id))
      .where(
        and(
          eq(purchaseIntents.pairingId, pairingId),
          eq(purchaseIntents.idempotencyKey, idempotencyKey)
        )
      )
      .orderBy(desc(decisions.createdAt), desc(decisions.id))
      .limit(1);
    return row ?? null;
  }

  async listDecisions(connectionId: string) {
    const rows = await this.db
      .select({ decision: decisions, intent: purchaseIntents })
      .from(decisions)
      .innerJoin(purchaseIntents, eq(decisions.purchaseIntentId, purchaseIntents.id))
      .where(eq(decisions.connectionId, connectionId))
      .orderBy(desc(decisions.createdAt), desc(decisions.id));
    const latestByIntent = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByIntent.has(row.intent.id)) latestByIntent.set(row.intent.id, row);
    }
    return [...latestByIntent.values()];
  }

  async listPlannedPurchases(connectionId: string): Promise<PlannedPurchase[]> {
    const rows = await this.db
      .select()
      .from(purchaseIntents)
      .where(
        and(
          eq(purchaseIntents.connectionId, connectionId),
          eq(purchaseIntents.status, "planned"),
          isNotNull(purchaseIntents.plannedFor)
        )
      )
      .orderBy(asc(purchaseIntents.plannedFor));
    return rows.map((row) => ({
      amount: { currency: "INR", minor: row.priceMinor },
      dueOn: row.plannedFor!,
      id: row.id,
    }));
  }

  async updateIntentStatus(
    connectionId: string,
    intentId: string,
    status: PurchaseIntentStatus,
    plannedFor: string | null
  ): Promise<{ latestDecisionId: string }> {
    if (status === "planned" && plannedFor === null) {
      throw new Error("Planned purchases require a date");
    }
    return this.db.transaction(async (transaction) => {
      const [intent] = await transaction
        .select()
        .from(purchaseIntents)
        .where(
          and(eq(purchaseIntents.connectionId, connectionId), eq(purchaseIntents.id, intentId))
        )
        .limit(1);
      if (intent === undefined) throw new Error("Purchase intent not found");
      const [latestDecision] = await transaction
        .select({ id: decisions.id })
        .from(decisions)
        .where(
          and(eq(decisions.connectionId, connectionId), eq(decisions.purchaseIntentId, intentId))
        )
        .orderBy(desc(decisions.createdAt), desc(decisions.id))
        .limit(1);
      if (latestDecision === undefined) throw new Error("Purchase intent has no decision");

      await transaction
        .update(purchaseIntents)
        .set({ plannedFor: status === "planned" ? plannedFor : null, status })
        .where(eq(purchaseIntents.id, intentId));
      await transaction.insert(auditEvents).values({
        connectionId,
        details: { plannedFor: status === "planned" ? plannedFor : null, status },
        entityId: intentId,
        entityType: "purchase_intent",
        type: "intent_status_changed",
      });
      return { latestDecisionId: latestDecision.id };
    });
  }

  async updateExtensionIntentStatus(
    connectionId: string,
    pairingId: string,
    intentId: string,
    status: "waiting" | "purchased" | "skipped" | "not_relevant"
  ): Promise<{ latestDecisionId: string; status: typeof status }> {
    return this.db.transaction(async (transaction) => {
      const [intent] = await transaction
        .select({ id: purchaseIntents.id, status: purchaseIntents.status })
        .from(purchaseIntents)
        .where(
          and(
            eq(purchaseIntents.connectionId, connectionId),
            eq(purchaseIntents.id, intentId),
            eq(purchaseIntents.pairingId, pairingId),
            eq(purchaseIntents.source, "extension")
          )
        )
        .limit(1);
      if (intent === undefined) throw new Error("Purchase intent not found");
      const [latestDecision] = await transaction
        .select({ id: decisions.id })
        .from(decisions)
        .where(
          and(eq(decisions.connectionId, connectionId), eq(decisions.purchaseIntentId, intentId))
        )
        .orderBy(desc(decisions.createdAt), desc(decisions.id))
        .limit(1);
      if (latestDecision === undefined) throw new Error("Purchase intent has no decision");
      if (intent.status === status) return { latestDecisionId: latestDecision.id, status };

      await transaction
        .update(purchaseIntents)
        .set({ plannedFor: null, status })
        .where(eq(purchaseIntents.id, intentId));
      await transaction.insert(auditEvents).values({
        connectionId,
        details: { plannedFor: null, status },
        entityId: intentId,
        entityType: "purchase_intent",
        type: "intent_status_changed",
      });
      return { latestDecisionId: latestDecision.id, status };
    });
  }

  async createAuditEvent(input: NewAuditEvent): Promise<void> {
    await this.db.insert(auditEvents).values({
      connectionId: input.connectionId,
      details: input.details,
      entityId: input.entityId,
      entityType: input.entityType,
      type: input.type,
    });
  }

  async exportOwnerData(
    connectionId: string,
    exportedAt = new Date().toISOString()
  ): Promise<OwnerExport> {
    const [
      accountRows,
      transactionRows,
      snapshotRows,
      issueRows,
      correctionRows,
      ruleRows,
      intentRows,
      decisionRows,
      auditRows,
    ] = await Promise.all([
      this.db
        .select()
        .from(financialAccounts)
        .where(eq(financialAccounts.connectionId, connectionId)),
      this.db
        .select()
        .from(normalizedTransactions)
        .where(eq(normalizedTransactions.connectionId, connectionId)),
      this.db
        .select()
        .from(financialSnapshots)
        .where(eq(financialSnapshots.connectionId, connectionId)),
      this.db.select().from(dataIssues).where(eq(dataIssues.connectionId, connectionId)),
      this.db
        .select({ correction: corrections })
        .from(corrections)
        .innerJoin(dataIssues, eq(corrections.issueId, dataIssues.id))
        .where(eq(dataIssues.connectionId, connectionId)),
      this.db.select().from(ruleSets).where(eq(ruleSets.connectionId, connectionId)),
      this.db.select().from(purchaseIntents).where(eq(purchaseIntents.connectionId, connectionId)),
      this.db.select().from(decisions).where(eq(decisions.connectionId, connectionId)),
      this.db.select().from(auditEvents).where(eq(auditEvents.connectionId, connectionId)),
    ]);
    return {
      auditEvents: auditRows,
      corrections: correctionRows.map((row) => row.correction),
      dataIssues: issueRows,
      decisions: decisionRows,
      exportedAt,
      financialAccounts: accountRows,
      normalizedTransactions: transactionRows,
      purchaseIntents: intentRows,
      ruleSets: ruleRows,
      schemaVersion: 1,
      snapshots: snapshotRows,
    };
  }

  async deleteOwnerData(connectionId: string): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [connection] = await transaction
        .select({ id: connections.id })
        .from(connections)
        .where(eq(connections.id, connectionId))
        .limit(1);
      if (connection === undefined) throw new Error("Connection not found");
      await transaction.insert(auditEvents).values({
        connectionId,
        details: {},
        entityId: connectionId,
        entityType: "connection",
        type: "deletion_initiated",
      });
      await transaction.delete(connections).where(eq(connections.id, connectionId));
    });
  }
}
