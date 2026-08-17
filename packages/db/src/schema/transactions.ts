import { bigint, date, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { financialAccounts } from "./accounts";
import {
  cashFlowInclusion,
  dataConfidence,
  transactionClassification,
  transactionDirection,
} from "./common";
import { connections } from "./connections";

export const normalizedTransactions = pgTable(
  "normalized_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id, { onDelete: "cascade" }),
    sourceTransactionId: text("source_transaction_id").notNull(),
    transactionDate: date("transaction_date", { mode: "string" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    direction: transactionDirection("direction").notNull(),
    rawMerchant: text("raw_merchant"),
    canonicalMerchant: text("canonical_merchant"),
    sourceCategory: text("source_category"),
    sochleClassification: transactionClassification("sochle_classification")
      .notNull()
      .default("unclassified"),
    cashFlowInclusion: cashFlowInclusion("cash_flow_inclusion").notNull(),
    confidence: dataConfidence("confidence").notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("normalized_transactions_connection_source_unique").on(
      table.connectionId,
      table.sourceTransactionId
    ),
  ]
);
