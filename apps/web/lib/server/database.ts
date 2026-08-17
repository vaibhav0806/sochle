import "server-only";

import { createSochleDatabase, FinancialRepository } from "@sochle/db";

import { getServerEnv } from "./env";

const globalDatabase = globalThis as typeof globalThis & {
  sochleDatabase?: ReturnType<typeof createSochleDatabase>;
};

export function getRepository(): FinancialRepository | null {
  const serverEnv = getServerEnv();
  if (serverEnv.DATABASE_URL === undefined) return null;
  globalDatabase.sochleDatabase ??= createSochleDatabase(serverEnv.DATABASE_URL);
  return new FinancialRepository(globalDatabase.sochleDatabase.db);
}
