import { describe, expect, it } from "vitest";

import {
  extensionBackgroundRequestSchema,
  extensionDecisionCardSchema,
  extensionSessionSchema,
  extractedProductSchema,
  pairingRequestInputSchema,
  productDecisionRequestSchema,
  purchaseOutcomeSchema,
} from "./index";

const extractedProduct = {
  canonicalUrl: "https://www.amazon.in/dp/SYNTHETIC",
  confidence: "high",
  merchant: "amazon.in",
  price: { currency: "INR", minor: 49_000_00 },
  title: "Synthetic headphones",
} as const;

const decisionCard = {
  bufferHeadroomMinor: 2_000_00,
  confidence: "high",
  decisionUrl: "http://localhost:3000/decisions/00000000-0000-4000-8000-000000000001",
  evaluatedAt: "2026-08-18T08:00:00.000Z",
  firstComfortablyAffordableDate: null,
  freshness: "fresh",
  headline: "Haan, this fits.",
  intentId: "00000000-0000-4000-8000-000000000002",
  priceMinor: 45_000_00,
  primaryAction: null,
  primaryTradeoff: "Your buffer and goals stay intact.",
  projectedLiquidityMinor: 55_000_00,
  safeToSpendMinor: 47_000_00,
  verdict: "comfortably_affordable",
} as const;

describe("extension purchase contracts", () => {
  it("accepts supported HTTPS products and a nullable extracted price", () => {
    expect(extractedProductSchema.parse(extractedProduct)).toEqual(extractedProduct);
    expect(extractedProductSchema.parse({ ...extractedProduct, price: null })).toEqual({
      ...extractedProduct,
      price: null,
    });
  });

  it.each([
    ["unsupported merchant", { ...extractedProduct, merchant: "example.com" }],
    ["insecure URL", { ...extractedProduct, canonicalUrl: "http://www.amazon.in/dp/ONE" }],
    ["merchant mismatch", { ...extractedProduct, canonicalUrl: "https://www.flipkart.com/item" }],
    ["URL credentials", { ...extractedProduct, canonicalUrl: "https://user@www.amazon.in/dp/ONE" }],
    ["empty title", { ...extractedProduct, title: "   " }],
    ["zero extracted price", { ...extractedProduct, price: { currency: "INR", minor: 0 } }],
    ["fractional paise", { ...extractedProduct, price: { currency: "INR", minor: 100.5 } }],
  ])("rejects %s", (_label, value) => {
    expect(() => extractedProductSchema.parse(value)).toThrow();
  });

  it("requires a corrected positive price and rejects unknown request fields", () => {
    const valid = {
      correctedPrice: { currency: "INR", minor: 45_000_00 },
      correctedTitle: "Synthetic headphones, corrected",
      extracted: extractedProduct,
      idempotencyKey: "10000000-0000-4000-8000-000000000001",
    };
    expect(productDecisionRequestSchema.parse(valid)).toEqual(valid);
    expect(() =>
      productDecisionRequestSchema.parse({
        ...valid,
        correctedPrice: { currency: "INR", minor: 0 },
      })
    ).toThrow();
    expect(() => productDecisionRequestSchema.parse({ ...valid, snapshot: {} })).toThrow();
  });

  it("accepts only extension-owned outcome values", () => {
    for (const outcome of ["waiting", "purchased", "skipped", "not_relevant"]) {
      expect(purchaseOutcomeSchema.parse(outcome)).toBe(outcome);
    }
    expect(() => purchaseOutcomeSchema.parse("planned")).toThrow();
    expect(() => purchaseOutcomeSchema.parse("bought")).toThrow();
  });
});

describe("extension response contracts", () => {
  it("accepts the minimized decision and rejects financial audit fields", () => {
    expect(extensionDecisionCardSchema.parse(decisionCard)).toEqual(decisionCard);
    expect(() => extensionDecisionCardSchema.parse({ ...decisionCard, auditBundle: {} })).toThrow();
    expect(() => extensionDecisionCardSchema.parse({ ...decisionCard, priceMinor: 1.5 })).toThrow();
  });

  it("distinguishes paired and unpaired extension sessions", () => {
    expect(
      extensionSessionSchema.parse({
        appUrl: "http://localhost:3000",
        kind: "paired",
        pairingId: "00000000-0000-4000-8000-000000000003",
        ready: true,
        thresholdMinor: 10_000_00,
      })
    ).toMatchObject({ kind: "paired", thresholdMinor: 10_000_00 });
    expect(
      extensionSessionSchema.parse({ appUrl: "http://localhost:3000", kind: "unpaired" })
    ).toEqual({ appUrl: "http://localhost:3000", kind: "unpaired" });
  });
});

describe("extension authentication and message contracts", () => {
  it("validates hash-only pairing requests", () => {
    const valid = {
      callbackUrl: "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pair",
      credentialHash: "a".repeat(64),
    };
    expect(pairingRequestInputSchema.parse(valid)).toEqual(valid);
    expect(() => pairingRequestInputSchema.parse({ ...valid, credential: "raw-secret" })).toThrow();
    expect(() =>
      pairingRequestInputSchema.parse({ ...valid, credentialHash: "A".repeat(64) })
    ).toThrow();
  });

  it("allows named background operations but not an arbitrary proxy request", () => {
    expect(extensionBackgroundRequestSchema.parse({ operation: "getSession" })).toEqual({
      operation: "getSession",
    });
    expect(
      extensionBackgroundRequestSchema.parse({
        operation: "evaluateProduct",
        product: {
          correctedPrice: { currency: "INR", minor: 45_000_00 },
          correctedTitle: "Synthetic headphones",
          extracted: extractedProduct,
          idempotencyKey: "10000000-0000-4000-8000-000000000001",
        },
      })
    ).toMatchObject({ operation: "evaluateProduct" });
    expect(() =>
      extensionBackgroundRequestSchema.parse({
        body: { connection: "fold" },
        method: "POST",
        operation: "fetch",
        url: "http://localhost:3000/api/sync",
      })
    ).toThrow();
  });
});
