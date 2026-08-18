import { describe, expect, it } from "vitest";

import { parsePurchaseInput } from "./purchase-input";

function form(description: string, price: string): FormData {
  const data = new FormData();
  data.set("description", description);
  data.set("price", price);
  return data;
}

describe("purchase input", () => {
  it("parses a product and an Indian-formatted rupee price", () => {
    expect(parsePurchaseInput(form("Headphones", "45,000"))).toEqual({
      description: "Headphones",
      priceMinor: 4_500_000,
    });
  });

  it("rejects a blank product name", () => {
    expect(() => parsePurchaseInput(form("  ", "45,000"))).toThrow("Add the product name");
  });

  it("rejects a product name longer than 120 characters", () => {
    expect(() => parsePurchaseInput(form("x".repeat(121), "45,000"))).toThrow(
      "Keep the product name under 120 characters"
    );
  });

  it.each(["", "0", "45,00,0", "₹45,000"])("rejects invalid price %j", (price) => {
    expect(() => parsePurchaseInput(form("Headphones", price))).toThrow(
      "Enter a valid price in rupees"
    );
  });
});
