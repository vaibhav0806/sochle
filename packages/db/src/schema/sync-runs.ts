import { sql } from "drizzle-orm";
import { text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { connections } from "./connections";
import { syncStatus } from "./common";

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    status: syncStatus("status").notNull(),
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { mode: "date", withTimezone: true }),
    failureMessage: text("failure_message"),
  },
  (table) => [
    uniqueIndex("sync_runs_one_running_per_connection")
      .on(table.connectionId)
      .where(sql`${table.status} = 'running'`),
  ]
);
