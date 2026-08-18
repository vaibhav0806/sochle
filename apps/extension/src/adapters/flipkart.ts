import { extractedProductSchema } from "@sochle/contracts/browser";

import type { CommerceAdapter } from "./types";
import {
  canonicalProductUrl,
  currentPrices,
  extractionConfidence,
  normalizedText,
  productImageUrl,
} from "./types";

const currentPriceSelectors = [".Nx9bqj.CxhGGd", "._30jeq3._16Jk6d"] as const;
const productImageSelectors = ["img.DByuf4", "img._53J4C-"] as const;

export const flipkartAdapter: CommerceAdapter = {
  merchant: "flipkart.com",
  extract(document, url) {
    const title =
      normalizedText(document.querySelector("h1 .VU-ZEz")) ??
      normalizedText(document.querySelector("h1 .B_NuCI"));
    if (title === null) return null;
    const prices = currentPrices(document, currentPriceSelectors);
    return extractedProductSchema.parse({
      canonicalUrl: canonicalProductUrl(document, url, this.merchant),
      confidence: extractionConfidence(prices),
      imageUrl: productImageUrl(document, productImageSelectors, this.merchant),
      merchant: this.merchant,
      price: prices[0] ?? null,
      title,
    });
  },
};
