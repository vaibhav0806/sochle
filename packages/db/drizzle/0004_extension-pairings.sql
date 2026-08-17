ALTER TYPE "public"."audit_event_type" ADD VALUE 'extension_paired';--> statement-breakpoint
ALTER TYPE "public"."audit_event_type" ADD VALUE 'extension_revoked';--> statement-breakpoint
CREATE TABLE "extension_pairing_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credential_hash" text NOT NULL,
	"extension_origin" text NOT NULL,
	"callback_url" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extension_pairings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"credential_hash" text NOT NULL,
	"extension_origin" text NOT NULL,
	"label" text DEFAULT 'Chrome extension' NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extension_pairings" ADD CONSTRAINT "extension_pairings_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "extension_pairing_requests_credential_hash_unique" ON "extension_pairing_requests" USING btree ("credential_hash");--> statement-breakpoint
CREATE INDEX "extension_pairing_requests_expires_idx" ON "extension_pairing_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "extension_pairings_credential_hash_unique" ON "extension_pairings" USING btree ("credential_hash");--> statement-breakpoint
CREATE INDEX "extension_pairings_connection_created_idx" ON "extension_pairings" USING btree ("connection_id","created_at");
