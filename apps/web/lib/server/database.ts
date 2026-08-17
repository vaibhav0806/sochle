import "server-only";

import {
  createSochleDatabase,
  DecisionRepository,
  ExtensionRepository,
  FinancialRepository,
} from "@sochle/db";

import { getServerEnv } from "./env";

const globalDatabase = globalThis as typeof globalThis & {
  sochleDatabase?: ReturnType<typeof createSochleDatabase>;
};

export function getRepository(): FinancialRepository | null {
  const serverEnv = getServerEnv();
  if (serverEnv.SOCHLE_DEMO_MODE || serverEnv.DATABASE_URL === undefined) return null;
  globalDatabase.sochleDatabase ??= createSochleDatabase(serverEnv.DATABASE_URL);
  return new FinancialRepository(globalDatabase.sochleDatabase.db);
}

export function getDecisionRepository(): DecisionRepository | null {
  const serverEnv = getServerEnv();
  if (serverEnv.SOCHLE_DEMO_MODE || serverEnv.DATABASE_URL === undefined) return null;
  globalDatabase.sochleDatabase ??= createSochleDatabase(serverEnv.DATABASE_URL);
  return new DecisionRepository(globalDatabase.sochleDatabase.db);
}

export function getExtensionRepository(): ExtensionRepository | null {
  const serverEnv = getServerEnv();
  if (serverEnv.SOCHLE_DEMO_MODE || serverEnv.DATABASE_URL === undefined) return null;
  globalDatabase.sochleDatabase ??= createSochleDatabase(serverEnv.DATABASE_URL);
  return new ExtensionRepository(globalDatabase.sochleDatabase.db);
}
