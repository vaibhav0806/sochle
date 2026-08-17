import type { ExtractedProduct } from "@sochle/contracts/browser";

import { amazonIndiaAdapter } from "./amazon-in";
import { flipkartAdapter } from "./flipkart";
import { myntraAdapter } from "./myntra";
import type { CommerceAdapter } from "./types";

const adapters = [amazonIndiaAdapter, flipkartAdapter, myntraAdapter] as const;

export function adapterForUrl(value: string): CommerceAdapter | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  return (
    adapters.find(
      (adapter) =>
        url.hostname === adapter.merchant || url.hostname.endsWith(`.${adapter.merchant}`)
    ) ?? null
  );
}

export function extractProduct(document: Document, value: string): ExtractedProduct | null {
  const adapter = adapterForUrl(value);
  return adapter === null ? null : adapter.extract(document, new URL(value));
}

export type { CommerceAdapter } from "./types";
export { parseInrPrice } from "./inr";
