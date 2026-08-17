import type { FinancialDataProvider, NormalizedFinancialState } from "@sochle/domain";
import { foldCoreResponses } from "@sochle/fixtures";
import { describe, expect, it } from "vitest";

import { normalizeFoldSnapshot } from "./normalize";
import { FoldSyncCoordinator } from "./sync";
import type { SyncRepository } from "./sync";

const state = normalizeFoldSnapshot(foldCoreResponses, "2026-08-17T06:30:00.000Z");

class MemorySyncRepository implements SyncRepository {
  gate: Awaited<ReturnType<SyncRepository["beginSync"]>> = {
    kind: "started",
    runId: "demo_run",
  };
  latest: { id: string; state: NormalizedFinancialState } | null = null;
  completed: "failed" | "succeeded" | null = null;
  persisted = false;

  async beginSync() {
    return this.gate;
  }
  async completeSync(
    _runId: string,
    _connectionId: string,
    result: { completedAt: Date; failureMessage?: string; status: "failed" | "succeeded" }
  ) {
    this.completed = result.status;
  }
  async getLatestSnapshot() {
    return this.latest;
  }
  async persistProjection() {
    this.persisted = true;
  }
  async replaceOpenIssues() {}
  async saveSnapshot(_connectionId: string, nextState: NormalizedFinancialState) {
    this.latest = { id: "demo_snapshot", state: nextState };
    return this.latest;
  }
}

describe("FoldSyncCoordinator", () => {
  it("persists a fresh provider snapshot and completes the sync", async () => {
    const repository = new MemorySyncRepository();
    const provider: FinancialDataProvider = {
      async sync() {
        return state;
      },
    };
    const coordinator = new FoldSyncCoordinator(provider, repository, {
      minimumIntervalMs: 60 * 60 * 1000,
      now: () => new Date("2026-08-17T06:30:00.000Z"),
    });

    const result = await coordinator.sync("demo_connection");

    expect(result).toMatchObject({ snapshot: state, status: "fresh" });
    expect(repository.persisted).toBe(true);
    expect(repository.completed).toBe("succeeded");
  });

  it("returns a labelled cached snapshot when Fold fails", async () => {
    const repository = new MemorySyncRepository();
    repository.latest = { id: "cached", state };
    const provider: FinancialDataProvider = {
      async sync() {
        throw new Error("provider payload must not leak");
      },
    };
    const coordinator = new FoldSyncCoordinator(provider, repository, {
      minimumIntervalMs: 60 * 60 * 1000,
      now: () => new Date("2026-08-17T06:30:00.000Z"),
    });

    const result = await coordinator.sync("demo_connection");

    expect(result).toEqual({ reason: "provider_error", snapshot: state, status: "cached" });
    expect(repository.completed).toBe("failed");
  });

  it("does not call Fold when the database gate throttles the refresh", async () => {
    const repository = new MemorySyncRepository();
    repository.gate = { kind: "throttled", nextAllowedAt: new Date("2026-08-17T07:00:00Z") };
    repository.latest = { id: "cached", state };
    let providerCalls = 0;
    const coordinator = new FoldSyncCoordinator(
      {
        async sync() {
          providerCalls += 1;
          return state;
        },
      },
      repository,
      {
        minimumIntervalMs: 60 * 60 * 1000,
        now: () => new Date("2026-08-17T06:30:00.000Z"),
      }
    );

    await expect(coordinator.sync("demo_connection")).resolves.toMatchObject({
      reason: "throttled",
      status: "cached",
    });
    expect(providerCalls).toBe(0);
  });
});
