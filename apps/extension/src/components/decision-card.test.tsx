// @vitest-environment happy-dom

import type {
  ExtensionDecisionCard,
  ExtensionSession,
  ExtractedProduct,
  PurchaseOutcome,
} from "@sochle/contracts/browser";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DecisionCard } from "./decision-card";

const product: ExtractedProduct = {
  canonicalUrl: "https://www.amazon.in/dp/SYNTHETIC",
  confidence: "high",
  merchant: "amazon.in",
  price: { currency: "INR", minor: 45_000_00 },
  title: "Synthetic headphones",
};
const paired: ExtensionSession = {
  appUrl: "http://localhost:3000",
  kind: "paired",
  pairingId: "00000000-0000-4000-8000-000000000001",
  ready: true,
  thresholdMinor: 10_000_00,
};
const result: ExtensionDecisionCard = {
  bufferHeadroomMinor: 50_000_00,
  confidence: "high",
  decisionUrl: "http://localhost:3000/decisions/00000000-0000-4000-8000-000000000002",
  evaluatedAt: "2026-08-18T08:00:00.000Z",
  firstComfortablyAffordableDate: null,
  freshness: "fresh",
  headline: "Haan, this fits.",
  intentId: "00000000-0000-4000-8000-000000000003",
  priceMinor: 45_000_00,
  primaryAction: null,
  primaryTradeoff: "Your buffer and goals stay intact.",
  projectedLiquidityMinor: 105_000_00,
  safeToSpendMinor: 50_000_00,
  verdict: "comfortably_affordable",
};

afterEach(cleanup);

function props(overrides: Partial<Parameters<typeof DecisionCard>[0]> = {}) {
  return {
    onEvaluate: vi.fn(async () => result),
    onOpenApp: vi.fn(),
    onOutcome: vi.fn(async (_intentId: string, outcome: PurchaseOutcome) => ({ status: outcome })),
    product,
    session: paired,
    ...overrides,
  };
}

describe("decision card", () => {
  it("stays passive until opened and requires an explicit calculation", async () => {
    const values = props();
    render(<DecisionCard {...values} />);

    expect(screen.getByRole("button", { name: /सोचle/i })).not.toBeNull();
    expect(values.onEvaluate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /सोचle/i }));
    expect(screen.getByRole("textbox", { name: "Product" })).not.toBeNull();
    expect(values.onEvaluate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByText("Haan, this fits.")).not.toBeNull();
    expect(values.onEvaluate).toHaveBeenCalledOnce();
  });

  it("submits corrections, keeps the result compact, and expands literal values", async () => {
    const values = props();
    render(<DecisionCard {...values} />);
    fireEvent.click(screen.getByRole("button", { name: /सोचle/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Product" }), {
      target: { value: "Corrected headphones" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "Price in rupees" }), {
      target: { value: "42,500" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await screen.findByText("Haan, this fits.");

    expect(values.onEvaluate).toHaveBeenCalledWith(
      expect.objectContaining({
        correctedPrice: { currency: "INR", minor: 42_500_00 },
        correctedTitle: "Corrected headphones",
      })
    );
    expect(screen.queryByText("Projected liquidity")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show the maths" }));
    expect(screen.getByText("Projected liquidity")).not.toBeNull();
    expect(screen.getByText("₹1,05,000.00")).not.toBeNull();
  });

  it.each([
    ["aging", "Aging financial data"],
    ["stale", "Stale financial data"],
    ["missing", "Missing financial data"],
  ] as const)("labels %s data without recomputing the verdict", async (freshness, message) => {
    render(
      <DecisionCard {...props({ onEvaluate: vi.fn(async () => ({ ...result, freshness })) })} />
    );
    fireEvent.click(screen.getByRole("button", { name: /सोचle/i }));
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByText(message)).not.toBeNull();
    expect(screen.getByText(result.headline)).not.toBeNull();
  });

  it("labels low confidence while preserving the server-owned brand copy", async () => {
    render(
      <DecisionCard
        {...props({
          onEvaluate: vi.fn(async () => ({ ...result, confidence: "low" as const })),
        })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /सोचle/i }));
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(await screen.findByText("Low confidence")).not.toBeNull();
    expect(screen.getByText(result.headline)).not.toBeNull();
  });

  it.each([
    [
      { appUrl: "http://localhost:3000", kind: "unpaired" } as ExtensionSession,
      "Pair Sochle from the extension first.",
    ],
    [{ ...paired, ready: false }, "Rules or money snapshot missing—app mein setup finish karo."],
  ])("directs unavailable sessions back to the app", (session, message) => {
    const values = props({ session });
    render(<DecisionCard {...values} />);
    fireEvent.click(screen.getByRole("button", { name: /सोचle/i }));
    expect(screen.getByText(message)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Sochle" }));
    expect(values.onOpenApp).toHaveBeenCalledWith("http://localhost:3000");
    expect(values.onEvaluate).not.toHaveBeenCalled();
  });

  it("supports a missing extracted price through editable input", () => {
    render(<DecisionCard {...props({ product: { ...product, price: null } })} />);
    fireEvent.click(screen.getByRole("button", { name: /सोचle/i }));
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Price in rupees" }).value).toBe(
      ""
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Calculate" }).disabled).toBe(
      true
    );
  });

  it("retains corrections after a network error and retries", async () => {
    const onEvaluate = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network took a chai break"))
      .mockResolvedValueOnce(result);
    render(<DecisionCard {...props({ onEvaluate })} />);
    fireEvent.click(screen.getByRole("button", { name: /सोचle/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Price in rupees" }), {
      target: { value: "44,000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Network took a chai break");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Price in rupees" }).value).toBe(
      "44,000"
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(result.headline)).not.toBeNull();
  });

  it("saves an explicit outcome", async () => {
    const values = props();
    render(<DecisionCard {...values} />);
    fireEvent.click(screen.getByRole("button", { name: /सोचle/i }));
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    await screen.findByText(result.headline);
    fireEvent.click(screen.getByRole("button", { name: "Wait" }));
    expect(await screen.findByText("Saved: waiting")).not.toBeNull();
    expect(values.onOutcome).toHaveBeenCalledWith(result.intentId, "waiting");
  });

  it("dismisses only the current product and resets on a new canonical URL", () => {
    const values = props();
    const { rerender } = render(<DecisionCard {...values} />);
    fireEvent.click(screen.getByRole("button", { name: /सोचle/i }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("button", { name: /सोचle/i })).toBeNull();

    rerender(
      <DecisionCard
        {...values}
        product={{ ...product, canonicalUrl: "https://www.amazon.in/dp/NEXT" }}
      />
    );
    expect(screen.getByRole("button", { name: /सोचle/i })).not.toBeNull();
  });
});
