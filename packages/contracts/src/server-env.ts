import { z } from "zod";

const rawServerEnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  FOLD_MCP_URL: z.string().url().default("https://mcp.fold.money/mcp"),
  SOCHLE_DEMO_MODE: z.enum(["true", "false"]).default("false"),
  SOCHLE_TOKEN_ENCRYPTION_KEY: z.string().optional(),
});

export type ServerEnv = {
  DATABASE_URL: string | undefined;
  FOLD_MCP_URL: string;
  SOCHLE_DEMO_MODE: boolean;
  SOCHLE_TOKEN_ENCRYPTION_KEY: string | undefined;
};

export function parseServerEnv(input: Record<string, string | undefined>): ServerEnv {
  const parsed = rawServerEnvSchema.parse(input);
  const demoMode = parsed.SOCHLE_DEMO_MODE === "true";

  if (!demoMode && parsed.DATABASE_URL === undefined) {
    throw new Error("DATABASE_URL is required outside demo mode");
  }

  if (!demoMode && parsed.SOCHLE_TOKEN_ENCRYPTION_KEY === undefined) {
    throw new Error("SOCHLE_TOKEN_ENCRYPTION_KEY is required outside demo mode");
  }

  if (
    parsed.SOCHLE_TOKEN_ENCRYPTION_KEY !== undefined &&
    Buffer.from(parsed.SOCHLE_TOKEN_ENCRYPTION_KEY, "base64").byteLength !== 32
  ) {
    throw new Error("SOCHLE_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }

  return {
    DATABASE_URL: parsed.DATABASE_URL,
    FOLD_MCP_URL: parsed.FOLD_MCP_URL,
    SOCHLE_DEMO_MODE: demoMode,
    SOCHLE_TOKEN_ENCRYPTION_KEY: parsed.SOCHLE_TOKEN_ENCRYPTION_KEY,
  };
}
