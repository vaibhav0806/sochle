CREATE TYPE "public"."account_status" AS ENUM('active', 'pending', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('bank', 'credit_card');--> statement-breakpoint
CREATE TYPE "public"."cash_flow_inclusion" AS ENUM('included', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."connection_status" AS ENUM('disconnected', 'authorizing', 'connected', 'error');--> statement-breakpoint
CREATE TYPE "public"."correction_action" AS ENUM('classify', 'exclude', 'ignore_once');--> statement-breakpoint
CREATE TYPE "public"."data_confidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."issue_severity" AS ENUM('info', 'warning', 'blocking');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'resolved', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."transaction_classification" AS ENUM('consumption', 'investment', 'transfer', 'credit_card_payment', 'refund', 'lending', 'income', 'unclassified');--> statement-breakpoint
CREATE TYPE "public"."transaction_direction" AS ENUM('credit', 'debit');--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"source_account_id" text NOT NULL,
	"type" "account_type" NOT NULL,
	"institution" text NOT NULL,
	"masked_display_name" text NOT NULL,
	"current_balance_minor" bigint,
	"currency" text DEFAULT 'INR' NOT NULL,
	"status" "account_status" NOT NULL,
	"exclusion_reason" text,
	"last_refreshed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"encrypted_authorization" "bytea",
	"authorization_iv" "bytea",
	"authorization_tag" "bytea",
	"status" "connection_status" DEFAULT 'disconnected' NOT NULL,
	"last_successful_sync_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"action" "correction_action" NOT NULL,
	"classification" "transaction_classification",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"snapshot_id" uuid,
	"type" text NOT NULL,
	"severity" "issue_severity" NOT NULL,
	"materiality_minor" bigint NOT NULL,
	"related_entity_type" text NOT NULL,
	"related_entity_id" text NOT NULL,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"details" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "financial_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"source_fingerprint" text NOT NULL,
	"state" jsonb NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" "sync_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failure_message" text
);
--> statement-breakpoint
CREATE TABLE "normalized_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"source_transaction_id" text NOT NULL,
	"transaction_date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"direction" "transaction_direction" NOT NULL,
	"raw_merchant" text,
	"canonical_merchant" text,
	"source_category" text,
	"sochle_classification" "transaction_classification" DEFAULT 'unclassified' NOT NULL,
	"cash_flow_inclusion" "cash_flow_inclusion" NOT NULL,
	"confidence" "data_confidence" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_issue_id_data_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."data_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_issues" ADD CONSTRAINT "data_issues_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_issues" ADD CONSTRAINT "data_issues_snapshot_id_financial_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."financial_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_snapshots" ADD CONSTRAINT "financial_snapshots_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_transactions" ADD CONSTRAINT "normalized_transactions_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "normalized_transactions" ADD CONSTRAINT "normalized_transactions_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "financial_accounts_connection_source_unique" ON "financial_accounts" USING btree ("connection_id","source_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_provider_unique" ON "connections" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "normalized_transactions_connection_source_unique" ON "normalized_transactions" USING btree ("connection_id","source_transaction_id");