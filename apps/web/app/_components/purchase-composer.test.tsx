// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PurchaseCheckState } from "../_actions/check-purchase";
import { PurchaseComposer } from "./purchase-composer";

vi.mock("../_actions/check-purchase", () => ({
  checkPurchaseAction: vi.fn(),
}));

afterEach(cleanup);

const success: PurchaseCheckState = {
  decisionId: "decision-123",
  presentation: {
    consequence: "Your buffer and upcoming commitments stay protected.",
    mathsRows: [
      { label: "After this purchase", value: "₹55,000.00" },
      { label: "Buffer kept aside", value: "₹25,000.00" },
    ],
    recencyLabel: "Updated recently",
    suggestedAction: "You can buy this without moving another plan.",
    title: "Yes, this fits comfortably.",
    tone: "comfortable",
  },
  status: "success",
};

describe("purchase composer", () => {
  it("starts with the two purchase fields and a useful action", () => {
    render(<PurchaseComposer />);

    expect(screen.getByLabelText("What are you considering?")).toBeTruthy();
    expect(screen.getByLabelText("Price in rupees")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Does this fit?" })).toBeTruthy();
  });

  it("shows a checking state while the action is pending", async () => {
    let resolveAction!: (state: PurchaseCheckState) => void;
    const action = vi.fn(
      () =>
        new Promise<PurchaseCheckState>((resolve) => {
          resolveAction = resolve;
        })
    );
    render(<PurchaseComposer action={action} />);

    fireEvent.change(screen.getByLabelText("What are you considering?"), {
      target: { value: "Headphones" },
    });
    fireEvent.change(screen.getByLabelText("Price in rupees"), {
      target: { value: "45,000" },
    });
    fireEvent.submit(screen.getByRole("form", { name: "Check a purchase" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Checking…" })).toBeTruthy();
    });
    await act(async () => resolveAction({ status: "idle" }));
  });

  it("keeps the fields available after an error and offers recovery", async () => {
    const action = vi.fn(async (): Promise<PurchaseCheckState> => ({
      message: "Connect your account before checking a purchase.",
      recoveryHref: "/connections",
      status: "error",
    }));
    render(<PurchaseComposer action={action} />);

    const description = screen.getByLabelText<HTMLInputElement>("What are you considering?");
    const price = screen.getByLabelText<HTMLInputElement>("Price in rupees");
    fireEvent.change(description, { target: { value: "Headphones" } });
    fireEvent.change(price, { target: { value: "45,000" } });
    fireEvent.submit(screen.getByRole("form", { name: "Check a purchase" }));

    expect(
      await screen.findByText("Connect your account before checking a purchase.")
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Connect your account" })).toBeTruthy();
    expect(description.value).toBe("Headphones");
    expect(price.value).toBe("45,000");
  });

  it("renders a clear result with closed maths and the immutable detail link", () => {
    render(<PurchaseComposer initialState={success} />);

    expect(screen.getByRole("heading", { name: "Yes, this fits comfortably." })).toBeTruthy();
    const maths = screen.getByText("See the maths").closest("details");
    expect(maths?.open).toBe(false);
    expect(screen.getByRole("link", { name: "Full decision" }).getAttribute("href")).toBe(
      "/decisions/decision-123"
    );
  });
});
