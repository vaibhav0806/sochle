import {
  extensionContentRequestSchema,
  extensionDecisionCardSchema,
  extensionSessionSchema,
  purchaseOutcomeSchema,
  type ExtensionDecisionCard,
  type ExtensionSession,
  type ExtractedProduct,
  type ProductDecisionRequest,
  type PurchaseOutcome,
} from "@sochle/contracts/browser";

import { createProductController } from "./product-controller";

export type CommerceCardModel = {
  onEvaluate(request: ProductDecisionRequest): Promise<ExtensionDecisionCard>;
  onOpenApp(url: string): void;
  onOutcome(intentId: string, outcome: PurchaseOutcome): Promise<{ status: PurchaseOutcome }>;
  product: ExtractedProduct;
  session: ExtensionSession;
};

type CommerceRuntimeOptions = {
  document: Document;
  location: { href: string };
  observe(callback: () => void): { disconnect(): void };
  openUrl(url: string): void;
  renderCard(model: CommerceCardModel | null): void;
  schedule(callback: () => void): () => void;
  sendMessage(message: unknown): Promise<unknown>;
};

function parseOutcomeResponse(input: unknown) {
  if (typeof input !== "object" || input === null || Object.keys(input).length !== 1) {
    throw new Error("Invalid outcome response");
  }
  return { status: purchaseOutcomeSchema.parse(Reflect.get(input, "status")) };
}

export function createCommerceContentRuntime(options: CommerceRuntimeOptions) {
  let session: ExtensionSession | null = null;
  let product: ExtractedProduct | null = null;
  let manual = false;
  let previousCanonicalUrl: string | null = null;

  const render = () => {
    if (session === null || product === null) {
      options.renderCard(null);
      return;
    }
    const automaticallyVisible =
      product.price === null ||
      (session.kind === "paired" && product.price.minor >= session.thresholdMinor);
    if (!manual && !automaticallyVisible) {
      options.renderCard(null);
      return;
    }
    options.renderCard({
      onEvaluate: async (request) =>
        extensionDecisionCardSchema.parse(
          await options.sendMessage({ operation: "evaluateProduct", product: request })
        ),
      onOpenApp: options.openUrl,
      onOutcome: async (intentId, outcome) =>
        parseOutcomeResponse(
          await options.sendMessage({ intentId, operation: "setOutcome", outcome })
        ),
      product,
      session,
    });
  };

  const controller = createProductController({
    document: options.document,
    location: options.location,
    observe: options.observe,
    onProduct(nextProduct) {
      if (nextProduct?.canonicalUrl !== previousCanonicalUrl) manual = false;
      previousCanonicalUrl = nextProduct?.canonicalUrl ?? null;
      product = nextProduct;
      render();
    },
    schedule: options.schedule,
  });

  return {
    async handleMessage(message: unknown) {
      extensionContentRequestSchema.parse(message);
      manual = true;
      render();
      return { shown: product !== null };
    },

    async start() {
      session = extensionSessionSchema.parse(
        await options.sendMessage({ operation: "getSession" })
      );
      controller.start();
    },

    stop() {
      controller.stop();
      options.renderCard(null);
    },
  };
}
