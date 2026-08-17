import { describe, expect, it } from "vitest";

import { parseServerEnv } from "./server-env";

describe("parseServerEnv", () => {
  it("allows demo mode without database or encryption credentials", () => {
    expect(parseServerEnv({ SOCHLE_DEMO_MODE: "true" })).toEqual({
      DATABASE_URL: undefined,
      FOLD_MCP_URL: "https://mcp.fold.money/mcp",
      SOCHLE_DEMO_MODE: true,
      SOCHLE_TOKEN_ENCRYPTION_KEY: undefined,
    });
  });

  it("rejects a non-demo environment without server secrets", () => {
    expect(() => parseServerEnv({ SOCHLE_DEMO_MODE: "false" })).toThrow(
      "DATABASE_URL is required outside demo mode"
    );
  });

  it("accepts a 32-byte base64 encryption key outside demo mode", () => {
    const key = Buffer.alloc(32, 7).toString("base64");

    expect(
      parseServerEnv({
        DATABASE_URL: "postgresql://sochle:sochle@localhost:65432/sochle",
        SOCHLE_DEMO_MODE: "false",
        SOCHLE_TOKEN_ENCRYPTION_KEY: key,
      })
    ).toMatchObject({
      SOCHLE_DEMO_MODE: false,
      SOCHLE_TOKEN_ENCRYPTION_KEY: key,
    });
  });

  it("rejects an encryption key that is not exactly 32 bytes", () => {
    expect(() =>
      parseServerEnv({
        DATABASE_URL: "postgresql://sochle:sochle@localhost:65432/sochle",
        SOCHLE_DEMO_MODE: "false",
        SOCHLE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64"),
      })
    ).toThrow("SOCHLE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  });
});
