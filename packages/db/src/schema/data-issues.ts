import { bigint, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

import { correctionAction, issueSeverity, issueStatus, transactionClassification } from "./common";
import { connections } from "./connections";
import { financialSnapshots } from "./snapshots";

export const dataIssues = pgTable("data_issues", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => connections.id, { onDelete: "cascade" }),
  snapshotId: uuid("snapshot_id").references(() => financialSnapshots.id, {
    onDelete: "set null",
  }),
  type: text("type").notNull(),
  severity: issueSeverity("severity").notNull(),
  materialityMinor: bigint("materiality_minor", { mode: "number" }).notNull(),
  relatedEntityType: text("related_entity_type").notNull(),
  relatedEntityId: text("related_entity_id").notNull(),
  status: issueStatus("status").notNull().default("open"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { mode: "date", withTimezone: true }),
});

export const corrections = pgTable("corrections", {
  id: uuid("id").defaultRandom().primaryKey(),
  issueId: uuid("issue_id")
    .notNull()
    .references(() => dataIssues.id, { onDelete: "cascade" }),
  action: correctionAction("action").notNull(),
  classification: transactionClassification("classification"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});
