import { readFileSync } from "node:fs";

import type { ExtractedProduct } from "@sochle/contracts/browser";
import { Window } from "happy-dom";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { createProductController } from "./product-controller";

let observerCallback: (() => void) | null;
let disconnect: Mock<() => void>;
let scheduled: (() => void)[];
let location: { href: string };
let document: Document;
let onProduct: ReturnType<typeof vi.fn<(product: ExtractedProduct | null) => void>>;

function loadAmazonFixture(name: string, url: string) {
  const window = new Window({ url });
  window.document.write(
    readFileSync(new URL(`../../test/fixtures/amazon-in/${name}.html`, import.meta.url), "utf8")
  );
  return window.document as unknown as Document;
}

function controller() {
  return createProductController({
    document,
    location,
    observe(callback) {
      observerCallback = callback;
      return { disconnect };
    },
    onProduct,
    schedule(callback) {
      scheduled.push(callback);
      return () => {
        scheduled = scheduled.filter((candidate) => candidate !== callback);
      };
    },
  });
}

function mutate() {
  observerCallback?.();
}

function flush() {
  const callbacks = scheduled;
  scheduled = [];
  callbacks.forEach((callback) => callback());
}

beforeEach(() => {
  observerCallback = null;
  disconnect = vi.fn();
  scheduled = [];
  location = { href: "https://www.amazon.in/dp/AMZ005" };
  document = loadAmazonFixture("dynamic-update", location.href);
  onProduct = vi.fn();
});

describe("product controller", () => {
  it("extracts the initial product and owns one observer", () => {
    const active = controller();
    active.start();
    active.start();

    expect(onProduct).toHaveBeenCalledTimes(1);
    expect(onProduct).toHaveBeenLastCalledWith(
      expect.objectContaining({ price: { currency: "INR", minor: 5_499_900 } })
    );
    expect(observerCallback).not.toBeNull();
  });

  it("debounces mutations and emits one settled product update", () => {
    const active = controller();
    active.start();
    document.querySelector(".apexPriceToPay .a-offscreen")!.textContent = "₹52,999";
    mutate();
    mutate();

    expect(scheduled).toHaveLength(1);
    flush();
    expect(onProduct).toHaveBeenCalledTimes(2);
    expect(onProduct).toHaveBeenLastCalledWith(
      expect.objectContaining({ price: { currency: "INR", minor: 5_299_900 } })
    );
  });

  it("suppresses identical settled mutations", () => {
    const active = controller();
    active.start();
    mutate();
    flush();
    mutate();
    flush();

    expect(onProduct).toHaveBeenCalledTimes(1);
  });

  it("emits a new normalized context after SPA navigation", () => {
    const active = controller();
    active.start();
    location.href = "https://www.amazon.in/dp/AMZ006?ref=spa";
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')!.href =
      "https://www.amazon.in/dp/AMZ006";
    document.querySelector("#productTitle")!.textContent = "Studio Headphones";
    mutate();
    flush();

    expect(onProduct).toHaveBeenCalledTimes(2);
    expect(onProduct).toHaveBeenLastCalledWith(
      expect.objectContaining({
        canonicalUrl: "https://www.amazon.in/dp/AMZ006",
        title: "Studio Headphones",
      })
    );
  });

  it("disconnects, cancels pending work, and emits nothing after stop", () => {
    const active = controller();
    active.start();
    document.querySelector(".apexPriceToPay .a-offscreen")!.textContent = "₹51,999";
    mutate();
    active.stop();
    flush();
    mutate();
    flush();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(onProduct).toHaveBeenCalledTimes(1);
  });
});
