import { sql } from "drizzle-orm";
import { integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { bytea, connectionStatus } from "./common";

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: text("provider").notNull(),
    encryptedAuthorization: bytea("encrypted_authorization"),
    authorizationIv: bytea("authorization_iv"),
    authorizationTag: bytea("authorization_tag"),
    status: connectionStatus("status").notNull().default("disconnected"),
    lastSuccessfulSyncAt: timestamp("last_successful_sync_at", {
      mode: "date",
      withTimezone: true,
    }),
    lastFailureAt: timestamp("last_failure_at", { mode: "date", withTimezone: true }),
    lastFailureMessage: text("last_failure_message"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => sql`now()`),
  },
  (table) => [uniqueIndex("connections_provider_unique").on(table.provider)]
);
