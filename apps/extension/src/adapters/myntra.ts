import { extractedProductSchema } from "@sochle/contracts";

import type { CommerceAdapter } from "./types";
import { canonicalProductUrl, currentPrices, extractionConfidence, normalizedText } from "./types";

const currentPriceSelectors = [
  ".pdp-discount-container .pdp-price strong",
  ".pdp-price strong",
] as const;

export const myntraAdapter: CommerceAdapter = {
  merchant: "myntra.com",
  extract(document, url) {
    const brand = normalizedText(document.querySelector("h1.pdp-title"));
    const product = normalizedText(document.querySelector("h1.pdp-name"));
    const title = [brand, product].filter((part): part is string => part !== null).join(" ");
    if (title.length === 0) return null;
    const prices = currentPrices(document, currentPriceSelectors);
    return extractedProductSchema.parse({
      canonicalUrl: canonicalProductUrl(document, url, this.merchant),
      confidence: extractionConfidence(prices),
      merchant: this.merchant,
      price: prices[0] ?? null,
      title: title.slice(0, 120),
    });
  },
};
