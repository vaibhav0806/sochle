import type { RuleSet } from "@sochle/domain";
import { integer, jsonb, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { connections } from "./connections";

export const ruleSets = pgTable(
  "rule_sets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    rules: jsonb("rules").$type<RuleSet>().notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("rule_sets_connection_version_unique").on(table.connectionId, table.version),
  ]
);
