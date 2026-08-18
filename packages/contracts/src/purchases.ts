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

const imageHostSuffixes: Record<Merchant, readonly string[]> = {
  "amazon.in": ["media-amazon.com", "ssl-images-amazon.com"],
  "flipkart.com": ["flixcart.com"],
  "myntra.com": ["myntra.com", "myntraassets.com"],
};

function matchesSuffix(hostname: string, suffix: string): boolean {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function safeProductImageUrl(raw: string, merchant: Merchant): string | null {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      !imageHostSuffixes[merchant].some((suffix) => matchesSuffix(url.hostname, suffix))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export const extractedProductSchema = z
  .object({
    canonicalUrl: z.string().url(),
    confidence: extractionConfidenceSchema,
    imageUrl: z.string().url().nullable().optional(),
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
    if (
      product.imageUrl !== undefined &&
      product.imageUrl !== null &&
      safeProductImageUrl(product.imageUrl, product.merchant) === null
    ) {
      context.addIssue({
        code: "custom",
        message: "Product image must use a supported HTTPS image host",
        path: ["imageUrl"],
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
