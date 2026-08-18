import { extractedProductSchema } from "@sochle/contracts/browser";

import type { CommerceAdapter } from "./types";
import {
  canonicalProductUrl,
  currentPrices,
  extractionConfidence,
  normalizedText,
  productImageUrl,
} from "./types";

const currentPriceSelectors = [
  ".pdp-discount-container .pdp-price strong",
  ".pdp-price strong",
] as const;
const productImageSelectors = ["img.image-grid-image", ".image-grid-image img"] as const;

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
      imageUrl: productImageUrl(document, productImageSelectors, this.merchant),
      merchant: this.merchant,
      price: prices[0] ?? null,
      title: title.slice(0, 120),
    });
  },
};
