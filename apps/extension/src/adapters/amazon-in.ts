import { extractedProductSchema } from "@sochle/contracts";

import type { CommerceAdapter } from "./types";
import { canonicalProductUrl, currentPrices, extractionConfidence, normalizedText } from "./types";

const currentPriceSelectors = [
  ".apexPriceToPay .a-offscreen",
  ".priceToPay .a-offscreen",
  "#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen",
] as const;

export const amazonIndiaAdapter: CommerceAdapter = {
  merchant: "amazon.in",
  extract(document, url) {
    const title = normalizedText(document.querySelector("#productTitle"));
    if (title === null) return null;
    const prices = currentPrices(document, currentPriceSelectors);
    return extractedProductSchema.parse({
      canonicalUrl: canonicalProductUrl(document, url, this.merchant),
      confidence: extractionConfidence(prices),
      merchant: this.merchant,
      price: prices[0] ?? null,
      title,
    });
  },
};
