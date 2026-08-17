import { describe, expect, it, vi } from "vitest";

import { loadFixtureSource } from "./source";

describe("loadFixtureSource", () => {
  it("never calls the live loader in demo mode", async () => {
    const liveLoader = vi.fn<() => Promise<string>>().mockRejectedValue(new Error("live called"));

    await expect(
      loadFixtureSource({
        demoLoader: async () => "synthetic",
        demoMode: true,
        liveLoader,
      })
    ).resolves.toBe("synthetic");
    expect(liveLoader).not.toHaveBeenCalled();
  });

  it("uses the live loader outside demo mode", async () => {
    await expect(
      loadFixtureSource({
        demoLoader: async () => "synthetic",
        demoMode: false,
        liveLoader: async () => "fold",
      })
    ).resolves.toBe("fold");
  });
});
