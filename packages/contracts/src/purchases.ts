import { z } from "zod";

export const merchantSchema = z.enum(["amazon.in", "flipkart.com", "myntra.com"]);
export type Merchant = z.infer<typeof merchantSchema>;

export const extractionConfidenceSchema = z.enum(["high", "medium", "low"]);
export type ExtractionConfidence = z.infer<typeof extractionConfidenceSchema>;

const positiveInrMoneySchema = z
  .object({
    currency: z.literal("INR"),
    minor: z.number().int().safe().positive(),
  })
  .strict();

function merchantMatchesHost(merchant: Merchant, hostname: string): boolean {
  return hostname === merchant || hostname.endsWith(`.${merchant}`);
}

export const extractedProductSchema = z
  .object({
    canonicalUrl: z.string().url(),
    confidence: extractionConfidenceSchema,
    merchant: merchantSchema,
    price: positiveInrMoneySchema.nullable(),
    title: z.string().trim().min(1).max(120),
  })
  .strict()
  .superRefine((product, context) => {
    const url = new URL(product.canonicalUrl);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== "" ||
      !merchantMatchesHost(product.merchant, url.hostname)
    ) {
      context.addIssue({
        code: "custom",
        message: "Canonical URL must be a supported HTTPS merchant URL",
        path: ["canonicalUrl"],
      });
    }
  });
export type ExtractedProduct = z.infer<typeof extractedProductSchema>;

export const productDecisionRequestSchema = z
  .object({
    correctedPrice: positiveInrMoneySchema,
    correctedTitle: z.string().trim().min(1).max(120),
    extracted: extractedProductSchema,
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export type ProductDecisionRequest = z.infer<typeof productDecisionRequestSchema>;

export const purchaseOutcomeSchema = z.enum(["waiting", "purchased", "skipped", "not_relevant"]);
export type PurchaseOutcome = z.infer<typeof purchaseOutcomeSchema>;
