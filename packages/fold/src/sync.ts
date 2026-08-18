import { createHash } from "node:crypto";

import type { FinancialDataProvider, NormalizedFinancialState } from "@sochle/domain";

import type { FoldGateway } from "./client";
import { detectDataIssues } from "./issues";
import type { DetectedDataIssue } from "./issues";
import { normalizeFoldSnapshot } from "./normalize";

type SyncGate =
  | { kind: "started"; runId: string }
  | { kind: "running"; runId?: string }
  | { kind: "throttled" | "backed_off"; nextAllowedAt: Date };

type StoredSnapshot = { id: string; state: NormalizedFinancialState };

export type SyncRepository = {
  beginSync(connectionId: string, startedAt: Date, minimumIntervalMs: number): Promise<SyncGate>;
  completeSync(
    runId: string,
    connectionId: string,
    result:
      | { completedAt: Date; status: "succeeded" }
      | { completedAt: Date; failureMessage: string; status: "failed" }
  ): Promise<void>;
  getLatestSnapshot(connectionId: string): Promise<StoredSnapshot | null>;
  persistProjection(connectionId: string, state: NormalizedFinancialState): Promise<void>;
  replaceOpenIssues(
    connectionId: string,
    snapshotId: string,
    issues: DetectedDataIssue[]
  ): Promise<unknown>;
  saveSnapshot(
    connectionId: string,
    state: NormalizedFinancialState,
    sourceFingerprint: string
  ): Promise<StoredSnapshot>;
};

export type SyncResult =
  | { snapshot: NormalizedFinancialState; status: "fresh" }
  | {
      reason: "backed_off" | "provider_error" | "running" | "throttled";
      snapshot: NormalizedFinancialState;
      status: "cached";
    }
  | { reason: "backed_off" | "provider_error" | "running" | "throttled"; status: "unavailable" };

export class FoldFinancialProvider implements FinancialDataProvider {
  constructor(
    private readonly gateway: FoldGateway,
    private readonly now: () => Date = () => new Date()
  ) {}

  async sync(signal?: AbortSignal): Promise<NormalizedFinancialState> {
    signal?.throwIfAborted();
    const syncedAt = this.now();
    const payload = await this.gateway.fetchSyncPayload(syncedAt);
    signal?.throwIfAborted();
    return normalizeFoldSnapshot(payload.snapshot, syncedAt.toISOString());
  }
}

export class FoldSyncCoordinator {
  constructor(
    private readonly provider: FinancialDataProvider,
    private readonly repository: SyncRepository,
    private readonly options: { minimumIntervalMs: number; now: () => Date }
  ) {}

  async sync(
    connectionId: string,
    options: { trigger: "automatic" | "manual" } = { trigger: "automatic" }
  ): Promise<SyncResult> {
    const startedAt = this.options.now();
    const gate = await this.repository.beginSync(
      connectionId,
      startedAt,
      options.trigger === "manual" ? 0 : this.options.minimumIntervalMs
    );

    if (gate.kind !== "started") {
      return this.cachedOrUnavailable(connectionId, gate.kind);
    }

    try {
      const state = await this.provider.sync();
      await this.repository.persistProjection(connectionId, state);
      const fingerprint = createHash("sha256").update(JSON.stringify(state)).digest("hex");
      const snapshot = await this.repository.saveSnapshot(connectionId, state, fingerprint);
      await this.repository.replaceOpenIssues(
        connectionId,
        snapshot.id,
        detectDataIssues(state, { largeTransactionMinor: 500_000 })
      );
      await this.repository.completeSync(gate.runId, connectionId, {
        completedAt: this.options.now(),
        status: "succeeded",
      });
      return { snapshot: state, status: "fresh" };
    } catch {
      await this.repository.completeSync(gate.runId, connectionId, {
        completedAt: this.options.now(),
        failureMessage: "Fold provider request failed",
        status: "failed",
      });
      return this.cachedOrUnavailable(connectionId, "provider_error");
    }
  }

  private async cachedOrUnavailable(
    connectionId: string,
    reason: "backed_off" | "provider_error" | "running" | "throttled"
  ): Promise<SyncResult> {
    const cached = await this.repository.getLatestSnapshot(connectionId);
    return cached === null
      ? { reason, status: "unavailable" }
      : { reason, snapshot: cached.state, status: "cached" };
  }
}
