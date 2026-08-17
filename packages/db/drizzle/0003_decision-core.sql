CREATE TYPE "public"."audit_event_type" AS ENUM('decision_created', 'decision_recalculated', 'intent_status_changed', 'export_created', 'deletion_initiated');--> statement-breakpoint
CREATE TYPE "public"."decision_verdict" AS ENUM('comfortably_affordable', 'affordable_with_tradeoffs', 'wait_until_payday', 'requires_reducing_investments', 'technically_possible_financially_tight', 'not_affordable', 'insufficient_confidence');--> statement-breakpoint
CREATE TYPE "public"."financial_verdict" AS ENUM('comfortably_affordable', 'affordable_with_tradeoffs', 'wait_until_payday', 'requires_reducing_investments', 'technically_possible_financially_tight', 'not_affordable');--> statement-breakpoint
CREATE TYPE "public"."purchase_intent_status" AS ENUM('considering', 'planned', 'purchased', 'skipped');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"type" "audit_event_type" NOT NULL,
	"entity_type" text,
	"entity_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"purchase_intent_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"previous_decision_id" uuid,
	"price_minor" bigint NOT NULL,
	"financial_verdict" "financial_verdict" NOT NULL,
	"verdict" "decision_verdict" NOT NULL,
	"confidence" "data_confidence" NOT NULL,
	"formula_version" integer NOT NULL,
	"audit_bundle" jsonb NOT NULL,
	"evaluated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"description" text NOT NULL,
	"price_minor" bigint NOT NULL,
	"status" "purchase_intent_status" DEFAULT 'considering' NOT NULL,
	"planned_for" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_purchase_intent_id_purchase_intents_id_fk" FOREIGN KEY ("purchase_intent_id") REFERENCES "public"."purchase_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_snapshot_id_financial_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."financial_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_rule_set_id_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."rule_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_previous_decision_id_decisions_id_fk" FOREIGN KEY ("previous_decision_id") REFERENCES "public"."decisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD CONSTRAINT "purchase_intents_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_sets" ADD CONSTRAINT "rule_sets_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decisions_connection_created_idx" ON "decisions" USING btree ("connection_id","created_at");--> statement-breakpoint
CREATE INDEX "purchase_intents_connection_created_idx" ON "purchase_intents" USING btree ("connection_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_sets_connection_version_unique" ON "rule_sets" USING btree ("connection_id","version");