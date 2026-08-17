import { text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { transactionClassification } from "./common";
import { connections } from "./connections";

export const transactionClassificationRules = pgTable(
  "transaction_classification_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    merchantKey: text("merchant_key").notNull(),
    classification: transactionClassification("classification").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transaction_classification_rules_connection_merchant_unique").on(
      table.connectionId,
      table.merchantKey
    ),
  ]
);
