// @vitest-environment happy-dom

import { readFileSync } from "node:fs";

import type { ExtensionSession } from "@sochle/contracts/browser";
import { Window } from "happy-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCommerceContentRuntime,
  type CommerceCardModel,
} from "../src/content/commerce-runtime";

const paired: ExtensionSession = {
  appUrl: "http://localhost:3000",
  kind: "paired",
  pairingId: "00000000-0000-4000-8000-000000000001",
  ready: true,
  thresholdMinor: 60_000_00,
};

function fixture(name: string, url: string) {
  const window = new Window({ url });
  window.document.write(
    readFileSync(`apps/extension/test/fixtures/amazon-in/${name}.html`, "utf8")
  );
  return { document: window.document as unknown as Document, location: { href: url } };
}

let mutation: (() => void) | null;
let scheduled: (() => void)[];
let renderCard: ReturnType<typeof vi.fn<(model: CommerceCardModel | null) => void>>;
let sendMessage: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;

function runtime(name = "dynamic-update", session: ExtensionSession = paired) {
  const page = fixture(name, `https://www.amazon.in/dp/${name.toUpperCase()}`);
  return {
    active: createCommerceContentRuntime({
      document: page.document,
      location: page.location,
      observe(callback) {
        mutation = callback;
        return { disconnect: vi.fn() };
      },
      openUrl: vi.fn(),
      renderCard,
      schedule(callback) {
        scheduled.push(callback);
        return () => {
          scheduled = scheduled.filter((candidate) => candidate !== callback);
        };
      },
      sendMessage,
    }),
    page,
    session,
  };
}

function flush() {
  const callbacks = scheduled;
  scheduled = [];
  callbacks.forEach((callback) => callback());
}

beforeEach(() => {
  mutation = null;
  scheduled = [];
  renderCard = vi.fn();
  sendMessage = vi.fn(async (message) =>
    typeof message === "object" &&
    message !== null &&
    Reflect.get(message, "operation") === "getSession"
      ? paired
      : { status: "waiting" }
  );
});

describe("commerce content runtime", () => {
  it("gates automatic UI by threshold and supports named manual invocation", async () => {
    const { active } = runtime();
    await active.start();
    expect(renderCard).toHaveBeenLastCalledWith(null);

    await active.handleMessage({ operation: "showManualCheck" });
    const model = renderCard.mock.lastCall?.[0];
    expect(model?.product.price?.minor).toBe(5_499_900);
    await model
      ?.onEvaluate({
        correctedPrice: { currency: "INR", minor: 5_499_900 },
        correctedTitle: model.product.title,
        extracted: model.product,
        idempotencyKey: "00000000-0000-4000-8000-000000000002",
      })
      .catch(() => undefined);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ operation: "evaluateProduct" })
    );
  });

  it("shows a missing-price product so the user can enter a correction", async () => {
    const { active } = runtime("missing-price");
    await active.start();
    expect(renderCard.mock.lastCall?.[0]?.product.price).toBeNull();
  });

  it("updates one rendered model after a settled product mutation", async () => {
    const { active, page } = runtime();
    await active.start();
    await active.handleMessage({ operation: "showManualCheck" });
    page.document.querySelector(".apexPriceToPay .a-offscreen")!.textContent = "₹62,999";
    mutation?.();
    flush();

    expect(renderCard.mock.lastCall?.[0]?.product.price?.minor).toBe(6_299_900);
  });

  it("rejects every background-to-content message except showManualCheck", async () => {
    const { active } = runtime();
    await active.start();
    await expect(active.handleMessage({ operation: "getSession" })).rejects.toThrow();
  });
});
