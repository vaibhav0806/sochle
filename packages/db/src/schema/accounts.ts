import { bigint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { accountStatus, accountType } from "./common";
import { connections } from "./connections";

export const financialAccounts = pgTable(
  "financial_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    sourceAccountId: text("source_account_id").notNull(),
    type: accountType("type").notNull(),
    institution: text("institution").notNull(),
    maskedDisplayName: text("masked_display_name").notNull(),
    currentBalanceMinor: bigint("current_balance_minor", { mode: "number" }),
    currency: text("currency").notNull().default("INR"),
    status: accountStatus("status").notNull(),
    exclusionReason: text("exclusion_reason"),
    lastRefreshedAt: timestamp("last_refreshed_at", { mode: "date", withTimezone: true }),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("financial_accounts_connection_source_unique").on(
      table.connectionId,
      table.sourceAccountId
    ),
  ]
);
