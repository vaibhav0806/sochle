import type { DecisionInputs, DecisionResult } from "@sochle/domain";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { bigint, index, integer, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { dataConfidence, decisionVerdict, financialVerdict } from "./common";
import { connections } from "./connections";
import { purchaseIntents } from "./purchase-intents";
import { ruleSets } from "./rule-sets";
import { financialSnapshots } from "./snapshots";

export type DecisionAuditBundle = {
  input: DecisionInputs;
  result: DecisionResult;
};

export const decisions = pgTable(
  "decisions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => connections.id, { onDelete: "cascade" }),
    purchaseIntentId: uuid("purchase_intent_id")
      .notNull()
      .references(() => purchaseIntents.id, { onDelete: "cascade" }),
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => financialSnapshots.id, { onDelete: "cascade" }),
    ruleSetId: uuid("rule_set_id")
      .notNull()
      .references(() => ruleSets.id, { onDelete: "cascade" }),
    previousDecisionId: uuid("previous_decision_id").references((): AnyPgColumn => decisions.id, {
      onDelete: "set null",
    }),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    financialVerdict: financialVerdict("financial_verdict").notNull(),
    verdict: decisionVerdict("verdict").notNull(),
    confidence: dataConfidence("confidence").notNull(),
    formulaVersion: integer("formula_version").notNull(),
    auditBundle: jsonb("audit_bundle").$type<DecisionAuditBundle>().notNull(),
    evaluatedAt: timestamp("evaluated_at", { mode: "date", withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("decisions_connection_created_idx").on(table.connectionId, table.createdAt)]
);
