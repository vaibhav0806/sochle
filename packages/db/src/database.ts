import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export function createSochleDatabase(url: string) {
  const client = postgres(url, { max: 5 });
  const db = drizzle(client, { schema });

  return {
    close: () => client.end(),
    db,
  };
}

export type SochleDatabase = ReturnType<typeof createSochleDatabase>["db"];
