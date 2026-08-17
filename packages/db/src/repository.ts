import type { NormalizedFinancialState } from "@sochle/domain";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import type { SochleDatabase } from "./database";
import {
  connections,
  corrections,
  dataIssues,
  financialAccounts,
  financialSnapshots,
  normalizedTransactions,
  syncRuns,
} from "./schema";
import { decryptAuthorization, encryptAuthorization } from "./token-crypto";

export type NewDataIssue = {
  details: Record<string, unknown>;
  materialityMinor: number;
  relatedEntityId: string;
  relatedEntityType: string;
  severity: "info" | "warning" | "blocking";
  type: string;
};

type IssueResolution =
  | {
      action: "classify";
      classification: Exclude<
        NormalizedFinancialState["transactions"][number]["sochleClassification"],
        "unclassified"
      >;
    }
  | { action: "exclude" | "ignore_once"; classification?: never };

export class FinancialRepository {
  constructor(private readonly db: SochleDatabase) {}

  async ensureConnection(provider: string) {
    await this.db.insert(connections).values({ provider }).onConflictDoNothing();
    const [connection] = await this.db
      .select()
      .from(connections)
      .where(eq(connections.provider, provider))
      .limit(1);

    if (connection === undefined) {
      throw new Error(`Unable to create connection for provider ${provider}`);
    }

    return connection;
  }

  async saveAuthorizationState<T>(connectionId: string, state: T, key: Buffer): Promise<void> {
    const encrypted = encryptAuthorization(JSON.stringify(state), key);
    await this.db
      .update(connections)
      .set({
        authorizationIv: encrypted.iv,
        authorizationTag: encrypted.authTag,
        encryptedAuthorization: encrypted.ciphertext,
        updatedAt: new Date(),
      })
      .where(eq(connections.id, connectionId));
  }

  async loadAuthorizationState<T>(connectionId: string, key: Buffer): Promise<T | null> {
    const [connection] = await this.db
      .select({
        authorizationIv: connections.authorizationIv,
        authorizationTag: connections.authorizationTag,
        encryptedAuthorization: connections.encryptedAuthorization,
      })
      .from(connections)
      .where(eq(connections.id, connectionId))
      .limit(1);

    if (
      connection?.authorizationIv == null ||
      connection.authorizationTag == null ||
      connection.encryptedAuthorization == null
    ) {
      return null;
    }

    return JSON.parse(
      decryptAuthorization(
        {
          authTag: connection.authorizationTag,
          ciphertext: connection.encryptedAuthorization,
          iv: connection.authorizationIv,
        },
        key
      )
    ) as T;
  }

  async beginSync(connectionId: string, startedAt: Date, minimumIntervalMs: number) {
    const [connection] = await this.db
      .select()
      .from(connections)
      .where(eq(connections.id, connectionId))
      .limit(1);
    if (connection === undefined) throw new Error("Connection not found");

    const [running] = await this.db
      .select({ id: syncRuns.id })
      .from(syncRuns)
      .where(and(eq(syncRuns.connectionId, connectionId), eq(syncRuns.status, "running")))
      .limit(1);
    if (running !== undefined) return { kind: "running" as const, runId: running.id };

    if (connection.lastSuccessfulSyncAt !== null) {
      const nextAllowedAt = new Date(connection.lastSuccessfulSyncAt.getTime() + minimumIntervalMs);
      if (startedAt < nextAllowedAt) {
        return { kind: "throttled" as const, nextAllowedAt };
      }
    }

    if (connection.lastFailureAt !== null && connection.consecutiveFailures > 0) {
      const backoffMs = Math.min(
        6 * 60 * 60 * 1000,
        60 * 1000 * 2 ** (connection.consecutiveFailures - 1)
      );
      const nextAllowedAt = new Date(connection.lastFailureAt.getTime() + backoffMs);
      if (startedAt < nextAllowedAt) {
        return { kind: "backed_off" as const, nextAllowedAt };
      }
    }

    const [run] = await this.db
      .insert(syncRuns)
      .values({ connectionId, startedAt, status: "running" })
      .onConflictDoNothing()
      .returning({ id: syncRuns.id });
    return run === undefined
      ? { kind: "running" as const }
      : { kind: "started" as const, runId: run.id };
  }

  async completeSync(
    runId: string,
    connectionId: string,
    result:
      | { completedAt: Date; status: "succeeded" }
      | { completedAt: Date; failureMessage: string; status: "failed" }
  ): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction
        .update(syncRuns)
        .set({
          completedAt: result.completedAt,
          failureMessage: result.status === "failed" ? result.failureMessage : null,
          status: result.status,
        })
        .where(eq(syncRuns.id, runId));

      await transaction
        .update(connections)
        .set(
          result.status === "succeeded"
            ? {
                consecutiveFailures: 0,
                lastFailureMessage: null,
                lastSuccessfulSyncAt: result.completedAt,
                status: "connected",
                updatedAt: result.completedAt,
              }
            : {
                consecutiveFailures: sql`${connections.consecutiveFailures} + 1`,
                lastFailureAt: result.completedAt,
                lastFailureMessage: result.failureMessage,
                status: "error",
                updatedAt: result.completedAt,
              }
        )
        .where(eq(connections.id, connectionId));
    });
  }

  async persistProjection(connectionId: string, state: NormalizedFinancialState): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const persistedCorrections = await transaction
        .select({
          action: corrections.action,
          classification: corrections.classification,
          relatedEntityId: dataIssues.relatedEntityId,
        })
        .from(corrections)
        .innerJoin(dataIssues, eq(corrections.issueId, dataIssues.id))
        .where(
          and(
            eq(dataIssues.connectionId, connectionId),
            eq(dataIssues.relatedEntityType, "transaction")
          )
        )
        .orderBy(asc(corrections.createdAt));
      const correctionByTransaction = new Map(
        persistedCorrections.map((correction) => [correction.relatedEntityId, correction])
      );

      for (const account of state.accounts) {
        await transaction
          .insert(financialAccounts)
          .values({
            connectionId,
            currentBalanceMinor: account.balance?.minor ?? null,
            institution: account.institution,
            lastRefreshedAt:
              account.lastRefreshedAt === null ? null : new Date(account.lastRefreshedAt),
            maskedDisplayName: account.maskedDisplayName,
            sourceAccountId: account.sourceAccountId,
            status: account.status,
            type: account.type,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [financialAccounts.connectionId, financialAccounts.sourceAccountId],
            set: {
              currentBalanceMinor: account.balance?.minor ?? null,
              institution: account.institution,
              lastRefreshedAt:
                account.lastRefreshedAt === null ? null : new Date(account.lastRefreshedAt),
              maskedDisplayName: account.maskedDisplayName,
              status: account.status,
              type: account.type,
              updatedAt: new Date(),
            },
          });
      }

      const accountRows = await transaction
        .select({ id: financialAccounts.id, sourceAccountId: financialAccounts.sourceAccountId })
        .from(financialAccounts)
        .where(eq(financialAccounts.connectionId, connectionId));
      const accountIds = new Map(
        accountRows.map((account) => [account.sourceAccountId, account.id])
      );

      for (const normalizedTransaction of state.transactions) {
        const accountId = accountIds.get(normalizedTransaction.accountSourceId);
        if (accountId === undefined) {
          throw new Error(
            `Transaction ${normalizedTransaction.sourceTransactionId} references an unknown account`
          );
        }

        const correction = correctionByTransaction.get(normalizedTransaction.sourceTransactionId);
        const values = {
          accountId,
          amountMinor: normalizedTransaction.amount.minor,
          canonicalMerchant: normalizedTransaction.canonicalMerchant,
          cashFlowInclusion:
            correction?.action === "exclude"
              ? ("excluded" as const)
              : normalizedTransaction.cashFlowInclusion,
          confidence: normalizedTransaction.confidence,
          connectionId,
          direction: normalizedTransaction.direction,
          rawMerchant: normalizedTransaction.rawMerchant,
          sochleClassification:
            correction?.action === "classify" && correction.classification !== null
              ? correction.classification
              : normalizedTransaction.sochleClassification,
          sourceCategory: normalizedTransaction.sourceCategory,
          sourceTransactionId: normalizedTransaction.sourceTransactionId,
          transactionDate: normalizedTransaction.date,
          updatedAt: new Date(),
        } as const;

        await transaction
          .insert(normalizedTransactions)
          .values(values)
          .onConflictDoUpdate({
            target: [
              normalizedTransactions.connectionId,
              normalizedTransactions.sourceTransactionId,
            ],
            set: values,
          });
      }
    });
  }

  async saveSnapshot(
    connectionId: string,
    state: NormalizedFinancialState,
    sourceFingerprint: string
  ) {
    const [snapshot] = await this.db
      .insert(financialSnapshots)
      .values({
        capturedAt: new Date(state.asOf),
        connectionId,
        sourceFingerprint,
        state,
      })
      .returning();

    if (snapshot === undefined) {
      throw new Error("Unable to persist financial snapshot");
    }

    return snapshot;
  }

  async replaceOpenIssues(connectionId: string, snapshotId: string, issues: NewDataIssue[]) {
    return this.db.transaction(async (transaction) => {
      await transaction
        .update(dataIssues)
        .set({ resolvedAt: new Date(), status: "resolved" })
        .where(and(eq(dataIssues.connectionId, connectionId), eq(dataIssues.status, "open")));

      if (issues.length === 0) return [];
      return transaction
        .insert(dataIssues)
        .values(issues.map((issue) => ({ ...issue, connectionId, snapshotId })))
        .returning();
    });
  }

  listOpenIssues(connectionId: string) {
    return this.db
      .select()
      .from(dataIssues)
      .where(and(eq(dataIssues.connectionId, connectionId), eq(dataIssues.status, "open")))
      .orderBy(desc(dataIssues.createdAt));
  }

  async resolveIssue(issueId: string, resolution: IssueResolution): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const [issue] = await transaction
        .select()
        .from(dataIssues)
        .where(eq(dataIssues.id, issueId))
        .limit(1);
      if (issue === undefined || issue.status !== "open") throw new Error("Open issue not found");

      await transaction.insert(corrections).values({
        action: resolution.action,
        classification: resolution.action === "classify" ? resolution.classification : null,
        issueId,
      });
      await transaction
        .update(dataIssues)
        .set({
          resolvedAt: new Date(),
          status: resolution.action === "ignore_once" ? "ignored" : "resolved",
        })
        .where(eq(dataIssues.id, issueId));

      if (issue.relatedEntityType !== "transaction") return;
      if (resolution.action === "classify") {
        await transaction
          .update(normalizedTransactions)
          .set({ sochleClassification: resolution.classification, updatedAt: new Date() })
          .where(
            and(
              eq(normalizedTransactions.connectionId, issue.connectionId),
              eq(normalizedTransactions.sourceTransactionId, issue.relatedEntityId)
            )
          );
      }
      if (resolution.action === "exclude") {
        await transaction
          .update(normalizedTransactions)
          .set({ cashFlowInclusion: "excluded", updatedAt: new Date() })
          .where(
            and(
              eq(normalizedTransactions.connectionId, issue.connectionId),
              eq(normalizedTransactions.sourceTransactionId, issue.relatedEntityId)
            )
          );
      }
    });
  }

  async getLatestSnapshot(connectionId: string) {
    const [snapshot] = await this.db
      .select()
      .from(financialSnapshots)
      .where(and(eq(financialSnapshots.connectionId, connectionId)))
      .orderBy(desc(financialSnapshots.capturedAt), desc(financialSnapshots.createdAt))
      .limit(1);

    return snapshot ?? null;
  }
}
