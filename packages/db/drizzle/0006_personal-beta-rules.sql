CREATE TABLE "transaction_classification_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "connection_id" uuid NOT NULL,
  "merchant_key" text NOT NULL,
  "classification" "transaction_classification" NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transaction_classification_rules" ADD CONSTRAINT "transaction_classification_rules_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_classification_rules_connection_merchant_unique" ON "transaction_classification_rules" USING btree ("connection_id", "merchant_key");
