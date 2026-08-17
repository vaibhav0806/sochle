import type { NormalizedFinancialState } from "@sochle/domain";
import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { connections } from "./connections";

export const financialSnapshots = pgTable("financial_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => connections.id, { onDelete: "cascade" }),
  sourceFingerprint: text("source_fingerprint").notNull(),
  state: jsonb("state").$type<NormalizedFinancialState>().notNull(),
  capturedAt: timestamp("captured_at", { mode: "date", withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});
