CREATE TYPE "public"."commerce_merchant" AS ENUM('amazon.in', 'flipkart.com', 'myntra.com');--> statement-breakpoint
CREATE TYPE "public"."purchase_intent_source" AS ENUM('manual', 'extension');--> statement-breakpoint
ALTER TYPE "public"."purchase_intent_status" ADD VALUE 'waiting' BEFORE 'planned';--> statement-breakpoint
ALTER TYPE "public"."purchase_intent_status" ADD VALUE 'not_relevant';--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD COLUMN "source" "purchase_intent_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD COLUMN "pairing_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD COLUMN "merchant" "commerce_merchant";--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD COLUMN "canonical_url" text;--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD COLUMN "extraction_confidence" "data_confidence";--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD COLUMN "extracted_title" text;--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD COLUMN "extracted_price_minor" bigint;--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD CONSTRAINT "purchase_intents_pairing_id_extension_pairings_id_fk" FOREIGN KEY ("pairing_id") REFERENCES "public"."extension_pairings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_intents_pairing_idempotency_unique" ON "purchase_intents" USING btree ("pairing_id","idempotency_key");
