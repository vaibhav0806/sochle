import {
  extensionBackgroundRequestSchema,
  type ExtensionSession,
  type ProductDecisionRequest,
  type PurchaseOutcome,
} from "@sochle/contracts/browser";

import { adapterForUrl } from "../adapters";

type BackgroundApi = {
  createDecision(product: ProductDecisionRequest): Promise<unknown>;
  disconnect(): Promise<unknown>;
  getSession(): Promise<ExtensionSession>;
  setOutcome(intentId: string, outcome: PurchaseOutcome): Promise<unknown>;
};

type TabApi = {
  queryActive(): Promise<{ id?: number; url?: string } | null>;
  sendMessage(tabId: number, message: { operation: "showManualCheck" }): Promise<unknown>;
};

export function createBackgroundMessageHandler(options: {
  api: BackgroundApi;
  pair(): Promise<unknown>;
  tabs: TabApi;
}) {
  return async (rawMessage: unknown) => {
    const message = extensionBackgroundRequestSchema.parse(rawMessage);
    switch (message.operation) {
      case "getSession":
        return options.api.getSession();
      case "pair":
        return options.pair();
      case "disconnect":
        return options.api.disconnect();
      case "evaluateProduct":
        return options.api.createDecision(message.product);
      case "setOutcome":
        return options.api.setOutcome(message.intentId, message.outcome);
      case "openCurrentProductCheck": {
        const tab = await options.tabs.queryActive();
        if (tab?.id === undefined || tab.url === undefined || adapterForUrl(tab.url) === null) {
          return { opened: false as const };
        }
        try {
          await options.tabs.sendMessage(tab.id, { operation: "showManualCheck" });
          return { opened: true as const };
        } catch {
          return { opened: false as const };
        }
      }
    }
  };
}
