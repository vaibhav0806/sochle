import type { FinancialDataProvider, NormalizedFinancialState } from "@sochle/domain";
import { foldCoreResponses } from "@sochle/fixtures";
import { describe, expect, it } from "vitest";

import { normalizeFoldSnapshot } from "./normalize";
import { FoldFinancialProvider, FoldSyncCoordinator } from "./sync";
import type { SyncRepository } from "./sync";

const state = normalizeFoldSnapshot(foldCoreResponses, "2026-08-17T06:30:00.000Z");

class MemorySyncRepository implements SyncRepository {
  gate: Awaited<ReturnType<SyncRepository["beginSync"]>> = {
    kind: "started",
    runId: "demo_run",
  };
  latest: { id: string; state: NormalizedFinancialState } | null = null;
  completed: "failed" | "succeeded" | null = null;
  minimumIntervalMs: number | null = null;
  persisted = false;

  async beginSync(_connectionId: string, _startedAt: Date, minimumIntervalMs: number) {
    this.minimumIntervalMs = minimumIntervalMs;
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
  it("normalizes the complete payload returned by the Fold gateway", async () => {
    const provider = new FoldFinancialProvider(
      {
        async fetchSyncPayload() {
          return {
            netWorthHistory: foldCoreResponses.netWorthHistory,
            snapshot: foldCoreResponses,
          };
        },
      } as never,
      () => new Date("2026-08-17T06:30:00.000Z")
    );

    await expect(provider.sync()).resolves.toMatchObject({
      asOf: "2026-08-17T06:30:00.000Z",
      liquidCash: { currency: "INR", minor: 25_000_025 },
    });
  });

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

  it("bypasses the successful-sync cooldown only for a manual trigger", async () => {
    const automaticRepository = new MemorySyncRepository();
    const manualRepository = new MemorySyncRepository();
    const provider: FinancialDataProvider = {
      async sync() {
        return state;
      },
    };
    const options = {
      minimumIntervalMs: 60 * 60 * 1000,
      now: () => new Date("2026-08-17T06:30:00.000Z"),
    };

    await new FoldSyncCoordinator(provider, automaticRepository, options).sync("demo_connection", {
      trigger: "automatic",
    });
    await new FoldSyncCoordinator(provider, manualRepository, options).sync("demo_connection", {
      trigger: "manual",
    });

    expect(automaticRepository.minimumIntervalMs).toBe(60 * 60 * 1000);
    expect(manualRepository.minimumIntervalMs).toBe(0);
  });

  it("returns unavailable when no cached snapshot exists", async () => {
    const repository = new MemorySyncRepository();
    repository.gate = { kind: "running" };
    const coordinator = new FoldSyncCoordinator(
      {
        async sync() {
          return state;
        },
      },
      repository,
      {
        minimumIntervalMs: 60 * 60 * 1000,
        now: () => new Date("2026-08-17T06:30:00.000Z"),
      }
    );

    await expect(coordinator.sync("demo_connection")).resolves.toEqual({
      reason: "running",
      status: "unavailable",
    });
  });
});
