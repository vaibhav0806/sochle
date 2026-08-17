import { index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

export const extensionPairingRequests = pgTable(
  "extension_pairing_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    credentialHash: text("credential_hash").notNull(),
    extensionOrigin: text("extension_origin").notNull(),
    callbackUrl: text("callback_url").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    approvedAt: timestamp("approved_at", { mode: "date", withTimezone: true }),
    consumedAt: timestamp("consumed_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("extension_pairing_requests_credential_hash_unique").on(table.credentialHash),
    index("extension_pairing_requests_expires_idx").on(table.expiresAt),
  ]
);
