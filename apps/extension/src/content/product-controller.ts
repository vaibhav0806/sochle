import type { ExtractedProduct } from "@sochle/contracts";

import { extractProduct } from "../adapters";

type ProductControllerOptions = {
  document: Document;
  location: { href: string };
  observe(callback: () => void): { disconnect(): void };
  onProduct(product: ExtractedProduct | null): void;
  schedule(callback: () => void): () => void;
};

export function createProductController(options: ProductControllerOptions) {
  let active = false;
  let cancelScheduled: (() => void) | null = null;
  let lastProduct: string | null = null;
  let observer: { disconnect(): void } | null = null;

  const extract = () => {
    if (!active) return;
    const product = extractProduct(options.document, options.location.href);
    const normalized = JSON.stringify(product);
    if (normalized === lastProduct) return;
    lastProduct = normalized;
    options.onProduct(product);
  };

  const scheduleExtraction = () => {
    if (!active) return;
    cancelScheduled?.();
    cancelScheduled = options.schedule(() => {
      cancelScheduled = null;
      extract();
    });
  };

  return {
    start() {
      if (active) return;
      active = true;
      observer = options.observe(scheduleExtraction);
      extract();
    },

    stop() {
      if (!active) return;
      active = false;
      cancelScheduled?.();
      cancelScheduled = null;
      observer?.disconnect();
      observer = null;
    },
  };
}
