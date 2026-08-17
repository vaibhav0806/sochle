import { index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { connections } from "./connections";

export const extensionPairings = pgTable(
  "extension_pairings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    credentialHash: text("credential_hash").notNull(),
    extensionOrigin: text("extension_origin").notNull(),
    label: text("label").notNull().default("Chrome extension"),
    lastUsedAt: timestamp("last_used_at", { mode: "date", withTimezone: true }),
    revokedAt: timestamp("revoked_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("extension_pairings_credential_hash_unique").on(table.credentialHash),
    index("extension_pairings_connection_created_idx").on(table.connectionId, table.createdAt),
  ]
);
