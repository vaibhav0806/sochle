import {
  safeProductImageUrl,
  type ExtractedProduct,
  type Merchant,
} from "@sochle/contracts/browser";

import { parseInrPrice } from "./inr";

export type CommerceAdapter = {
  extract(document: Document, url: URL): ExtractedProduct | null;
  merchant: Merchant;
};

export function normalizedText(element: Element | null): string | null {
  const text = element?.textContent?.replace(/\s+/g, " ").trim();
  return text === undefined || text.length === 0 ? null : text.slice(0, 120);
}

export function currentPrices(document: Document, selectors: readonly string[]) {
  const seen = new Set<Element>();
  const prices = [];
  for (const selector of selectors) {
    for (const element of document.querySelectorAll(selector)) {
      if (seen.has(element)) continue;
      seen.add(element);
      const price = parseInrPrice(element.textContent ?? "");
      if (price !== null) prices.push(price);
    }
  }
  return prices;
}

export function productImageUrl(
  document: Document,
  selectors: readonly string[],
  merchant: Merchant
): string | null {
  for (const selector of selectors) {
    const image = document.querySelector<HTMLImageElement>(selector);
    const raw = image?.getAttribute("src") ?? image?.getAttribute("data-src");
    if (raw === null || raw === undefined) continue;
    const safe = safeProductImageUrl(raw, merchant);
    if (safe !== null) return safe;
  }
  return null;
}

export function canonicalProductUrl(document: Document, pageUrl: URL, merchant: Merchant): string {
  const rawCanonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href;
  let canonical: URL;
  try {
    canonical = rawCanonical === undefined ? new URL(pageUrl) : new URL(rawCanonical);
  } catch {
    canonical = new URL(pageUrl);
  }
  if (
    canonical.protocol !== "https:" ||
    (canonical.hostname !== merchant && !canonical.hostname.endsWith(`.${merchant}`))
  ) {
    canonical = new URL(pageUrl);
  }
  canonical.search = "";
  canonical.hash = "";
  return canonical.toString();
}

export function extractionConfidence(prices: readonly { minor: number }[]) {
  if (prices.length === 0) return "low" as const;
  return new Set(prices.map((price) => price.minor)).size === 1
    ? ("high" as const)
    : ("low" as const);
}
