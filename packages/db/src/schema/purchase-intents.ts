import { bigint, date, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { purchaseIntentStatus } from "./common";
import { connections } from "./connections";

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
    plannedFor: date("planned_for", { mode: "string" }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("purchase_intents_connection_created_idx").on(table.connectionId, table.createdAt),
  ]
);
