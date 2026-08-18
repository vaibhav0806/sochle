import { extractedProductSchema } from "@sochle/contracts/browser";

import { parseInrPrice } from "./inr";
import type { CommerceAdapter } from "./types";
import {
  canonicalProductUrl,
  currentPrices,
  extractionConfidence,
  normalizedText,
  productImageUrl,
} from "./types";

const currentPriceSelectors = [
  ".apexPriceToPay .a-offscreen",
  ".priceToPay .a-offscreen",
  "#corePrice_feature_div .a-price:not(.a-text-price) .a-offscreen",
  "#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price) .a-offscreen",
  "#corePriceDisplay_mobile_feature_div .a-price:not(.a-text-price) .a-offscreen",
  ".reinventPricePriceToPayMargin .a-offscreen",
] as const;

const currentPriceContainerSelectors = [
  ".apexPriceToPay",
  ".priceToPay",
  "#corePrice_feature_div .a-price:not(.a-text-price)",
  "#corePriceDisplay_desktop_feature_div .a-price:not(.a-text-price)",
  "#corePriceDisplay_mobile_feature_div .a-price:not(.a-text-price)",
  ".reinventPricePriceToPayMargin",
] as const;

const productImageSelectors = ["#landingImage", "#imgBlkFront"] as const;

function visiblePartPrices(document: Document) {
  const seen = new Set<Element>();
  const prices = [];
  for (const selector of currentPriceContainerSelectors) {
    for (const container of document.querySelectorAll(selector)) {
      if (seen.has(container)) continue;
      seen.add(container);
      const symbol = normalizedText(container.querySelector(".a-price-symbol"));
      const whole = normalizedText(container.querySelector(".a-price-whole"));
      const fraction = normalizedText(container.querySelector(".a-price-fraction")) ?? "00";
      if (symbol === null || whole === null) continue;
      const price = parseInrPrice(`${symbol}${whole}.${fraction}`);
      if (price !== null) prices.push(price);
    }
  }
  return prices;
}

export const amazonIndiaAdapter: CommerceAdapter = {
  merchant: "amazon.in",
  extract(document, url) {
    const title = normalizedText(document.querySelector("#productTitle"));
    if (title === null) return null;
    const prices = [
      ...currentPrices(document, currentPriceSelectors),
      ...visiblePartPrices(document),
    ];
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
