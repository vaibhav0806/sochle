import { z } from "zod";

const rawServerEnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  FOLD_MCP_URL: z.string().url().default("https://mcp.fold.money/mcp"),
  SOCHLE_APP_URL: z.string().url().default("http://localhost:3000"),
  SOCHLE_DEMO_MODE: z.enum(["true", "false"]).default("false"),
  SOCHLE_FOLD_REDIRECT_URL: z.string().url().optional(),
  SOCHLE_OWNER_PASSWORD: z.string().min(1).optional(),
  SOCHLE_SESSION_SECRET: z.string().min(32).optional(),
  SOCHLE_SYNC_MINIMUM_INTERVAL_MINUTES: z.coerce.number().int().positive().default(60),
  SOCHLE_TOKEN_ENCRYPTION_KEY: z.string().optional(),
});

export type ServerEnv = {
  DATABASE_URL: string | undefined;
  FOLD_MCP_URL: string;
  SOCHLE_APP_URL: string;
  SOCHLE_DEMO_MODE: boolean;
  SOCHLE_FOLD_REDIRECT_URL: string;
  SOCHLE_OWNER_PASSWORD: string | undefined;
  SOCHLE_SESSION_SECRET: string | undefined;
  SOCHLE_SYNC_MINIMUM_INTERVAL_MINUTES: number;
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

  if (!demoMode && parsed.SOCHLE_OWNER_PASSWORD === undefined) {
    throw new Error("SOCHLE_OWNER_PASSWORD is required outside demo mode");
  }

  if (!demoMode && parsed.SOCHLE_SESSION_SECRET === undefined) {
    throw new Error("SOCHLE_SESSION_SECRET is required outside demo mode");
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
    SOCHLE_APP_URL: parsed.SOCHLE_APP_URL,
    SOCHLE_DEMO_MODE: demoMode,
    SOCHLE_FOLD_REDIRECT_URL:
      parsed.SOCHLE_FOLD_REDIRECT_URL ?? `${parsed.SOCHLE_APP_URL}/api/fold/callback`,
    SOCHLE_OWNER_PASSWORD: parsed.SOCHLE_OWNER_PASSWORD,
    SOCHLE_SESSION_SECRET: parsed.SOCHLE_SESSION_SECRET,
    SOCHLE_SYNC_MINIMUM_INTERVAL_MINUTES: parsed.SOCHLE_SYNC_MINIMUM_INTERVAL_MINUTES,
    SOCHLE_TOKEN_ENCRYPTION_KEY: parsed.SOCHLE_TOKEN_ENCRYPTION_KEY,
  };
}
