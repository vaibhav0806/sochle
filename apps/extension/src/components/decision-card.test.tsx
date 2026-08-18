// @vitest-environment happy-dom

import type {
  ExtensionDecisionCard,
  ExtensionSession,
  ExtractedProduct,
  PurchaseOutcome,
} from "@sochle/contracts/browser";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DecisionCard } from "./decision-card";

const product: ExtractedProduct = {
  canonicalUrl: "https://www.amazon.in/dp/SYNTHETIC",
  confidence: "high",
  imageUrl: "https://m.media-amazon.com/images/I/synthetic.jpg",
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
  decisionUrl: "http://localhost:3000/decisions/00000000-0000-4000-8000-000000000002",
  evaluatedAt: "2026-08-18T08:00:00.000Z",
  firstComfortablyAffordableDate: null,
  intentId: "00000000-0000-4000-8000-000000000003",
  presentation: {
    consequence: "Your buffer and upcoming commitments stay protected.",
    mathsRows: [{ label: "After this purchase", value: "₹1,05,000.00" }],
    recencyLabel: "Updated recently",
    suggestedAction: "You can buy this without moving another plan.",
    title: "Yes, this fits comfortably.",
    tone: "comfortable",
  },
  priceMinor: 45_000_00,
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

async function openAndCheck(values = props()) {
  render(<DecisionCard {...values} />);
  fireEvent.click(screen.getByRole("button", { name: "सोचle" }));
  fireEvent.click(screen.getByRole("button", { name: "Check this purchase" }));
  await screen.findByText("Yes, this fits comfortably.");
  return values;
}

describe("decision card", () => {
  it("renders a confident extraction as product text, not editable controls", () => {
    render(<DecisionCard {...props()} />);
    fireEvent.click(screen.getByRole("button", { name: "सोचle" }));
    expect(screen.getByText("Synthetic headphones")).toBeTruthy();
    expect(screen.getByText("₹45,000.00")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(document.querySelector("img")?.getAttribute("alt")).toBe("");
  });

  it("exposes only uncertain fields when extraction needs help", () => {
    render(
      <DecisionCard {...props({ product: { ...product, confidence: "low", price: null } })} />
    );
    fireEvent.click(screen.getByRole("button", { name: "सोचle" }));
    expect(screen.getByLabelText("Product")).toBeTruthy();
    expect(screen.getByLabelText("Price in rupees")).toBeTruthy();
  });

  it("announces checking with branded copy", async () => {
    let finish!: (value: ExtensionDecisionCard) => void;
    const onEvaluate = vi.fn(
      () =>
        new Promise<ExtensionDecisionCard>((resolve) => {
          finish = resolve;
        })
    );
    render(<DecisionCard {...props({ onEvaluate })} />);
    fireEvent.click(screen.getByRole("button", { name: "सोचle" }));
    fireEvent.click(screen.getByRole("button", { name: "Check this purchase" }));
    expect(screen.getByText("Thoda soch rahe hain…").getAttribute("aria-live")).toBe("polite");
    await act(async () => finish(result));
  });

  it("renders the human answer and keeps maths closed", async () => {
    await openAndCheck();
    expect(screen.getByText(result.presentation.consequence)).toBeTruthy();
    expect(screen.getByText(result.presentation.suggestedAction!)).toBeTruthy();
    expect(screen.getByText("Updated recently")).toBeTruthy();
    expect(screen.getByText("See the maths").closest("details")?.open).toBe(false);
    const primary = screen.getByLabelText("Sochle purchase check").textContent!.toLowerCase();
    for (const term of [
      "confidence",
      "freshness",
      "projected liquidity",
      "headroom",
      "fold",
      "uncaught error",
    ]) {
      expect(primary).not.toContain(term);
    }
  });

  it("uses direct outcome language and keeps not relevant secondary", async () => {
    const values = await openAndCheck();
    fireEvent.click(screen.getByRole("button", { name: "Buy" }));
    expect(await screen.findByText("Saved")).toBeTruthy();
    expect(values.onOutcome).toHaveBeenCalledWith(result.intentId, "purchased");
    expect(screen.getByRole("button", { name: "Wait" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pass" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not relevant" }).className).toContain(
      "not-relevant"
    );
  });

  it("preserves corrections and translates a failure", async () => {
    const onEvaluate = vi
      .fn()
      .mockRejectedValueOnce(new Error("secret raw failure"))
      .mockResolvedValueOnce(result);
    render(<DecisionCard {...props({ onEvaluate, product: { ...product, confidence: "low" } })} />);
    fireEvent.click(screen.getByRole("button", { name: "सोचle" }));
    fireEvent.change(screen.getByLabelText("Price in rupees"), { target: { value: "44,000" } });
    fireEvent.click(screen.getByRole("button", { name: "Check this purchase" }));
    expect((await screen.findByRole("alert")).textContent).not.toContain("secret raw failure");
    expect(screen.getByLabelText<HTMLInputElement>("Price in rupees").value).toBe("44,000");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(result.presentation.title)).toBeTruthy();
  });

  it.each([
    [
      { appUrl: "http://localhost:3000", kind: "unpaired" } as ExtensionSession,
      "Pair Sochle to start.",
    ],
    [{ ...paired, ready: false }, "Finish setup first."],
  ])("offers one recovery action when unavailable", (session, message) => {
    const values = props({ session });
    render(<DecisionCard {...values} />);
    fireEvent.click(screen.getByRole("button", { name: "सोचle" }));
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Open Sochle" }));
    expect(values.onOpenApp).toHaveBeenCalledWith("http://localhost:3000");
  });
});
