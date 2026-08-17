import { bigint, date, index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import {
  commerceMerchant,
  dataConfidence,
  purchaseIntentSource,
  purchaseIntentStatus,
} from "./common";
import { connections } from "./connections";
import { extensionPairings } from "./extension-pairings";

export const purchaseIntents = pgTable(
  "purchase_intents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    status: purchaseIntentStatus("status").notNull().default("considering"),
    source: purchaseIntentSource("source").notNull().default("manual"),
    pairingId: uuid("pairing_id").references(() => extensionPairings.id, {
      onDelete: "set null",
    }),
    merchant: commerceMerchant("merchant"),
    canonicalUrl: text("canonical_url"),
    extractionConfidence: dataConfidence("extraction_confidence"),
    extractedTitle: text("extracted_title"),
    extractedPriceMinor: bigint("extracted_price_minor", { mode: "number" }),
    idempotencyKey: uuid("idempotency_key"),
    plannedFor: date("planned_for", { mode: "string" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("purchase_intents_connection_created_idx").on(table.connectionId, table.createdAt),
    uniqueIndex("purchase_intents_pairing_idempotency_unique").on(
      table.pairingId,
      table.idempotencyKey
    ),
  ]
);
