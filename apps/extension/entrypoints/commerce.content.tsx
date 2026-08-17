import { createRoot, type Root } from "react-dom/client";

import { DecisionCard } from "../src/components/decision-card";
import "../src/components/decision-card.css";
import { createCommerceContentRuntime } from "../src/content/commerce-runtime";

export default defineContentScript({
  cssInjectionMode: "ui",
  matches: ["https://*.amazon.in/*", "https://*.flipkart.com/*", "https://*.myntra.com/*"],
  async main(ctx) {
    let reactRoot: Root | null = null;
    const ui = await createShadowRootUi(ctx, {
      anchor: "body",
      name: "sochle-decision-card",
      onMount(container) {
        reactRoot = createRoot(container);
        return reactRoot;
      },
      onRemove(root) {
        root?.unmount();
      },
      position: "inline",
    });
    ui.mount();
    const runtime = createCommerceContentRuntime({
      document,
      location,
      observe(callback) {
        const observer = new MutationObserver(callback);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        return observer;
      },
      openUrl: (url) => window.open(url, "_blank", "noopener"),
      renderCard(model) {
        reactRoot?.render(model === null ? null : <DecisionCard {...model} />);
      },
      schedule(callback) {
        const timer = window.setTimeout(callback, 250);
        return () => window.clearTimeout(timer);
      },
      sendMessage: (message) => browser.runtime.sendMessage(message),
    });
    const onMessage = (message: unknown) => runtime.handleMessage(message);
    browser.runtime.onMessage.addListener(onMessage);
    await runtime.start();
    ctx.onInvalidated(() => {
      browser.runtime.onMessage.removeListener(onMessage);
      runtime.stop();
      ui.remove();
    });
  },
});
