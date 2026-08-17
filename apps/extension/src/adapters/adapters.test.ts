import { readFileSync } from "node:fs";

import type { ExtractedProduct } from "@sochle/contracts/browser";
import { Window } from "happy-dom";
import { describe, expect, it } from "vitest";

import { adapterForUrl, extractProduct } from ".";
import { parseInrPrice } from "./inr";

describe("parseInrPrice", () => {
  it.each([
    ["₹45,000", 4_500_000],
    ["₹45,000.00", 4_500_000],
    ["INR 1,23,456.78", 12_345_678],
    ["₹\u00a01,23,456.70", 12_345_670],
    ["  ₹45,000.00  ", 4_500_000],
    ["₹123456", 12_345_600],
  ])("parses %s as integer paise", (input, expectedMinor) => {
    expect(parseInrPrice(input)).toEqual({ currency: "INR", minor: expectedMinor });
  });

  it.each([
    "₹45,00.00",
    "$45,000",
    "₹2,499 - ₹3,499",
    "₹2,499/month",
    "EMI ₹2,499",
    "-₹2,499",
    "₹0",
    "₹2,499.999",
    "₹1,234,56",
    "",
  ])("rejects ambiguous or invalid price %s", (input) => {
    expect(parseInrPrice(input)).toBeNull();
  });
});

type FixtureCase = {
  expected: ExtractedProduct;
  fixture: string;
  merchantDirectory: string;
  pageUrl: string;
};

const fixtureCases: FixtureCase[] = [
  {
    fixture: "primary",
    merchantDirectory: "amazon-in",
    pageUrl: "https://www.amazon.in/dp/AMZ001?ref=synthetic",
    expected: {
      canonicalUrl: "https://www.amazon.in/dp/AMZ001",
      confidence: "high",
      merchant: "amazon.in",
      price: { currency: "INR", minor: 4_500_000 },
      title: "Noise Cancelling Headphones",
    },
  },
  {
    fixture: "sale",
    merchantDirectory: "amazon-in",
    pageUrl: "https://www.amazon.in/dp/AMZ002",
    expected: {
      canonicalUrl: "https://www.amazon.in/dp/AMZ002",
      confidence: "high",
      merchant: "amazon.in",
      price: { currency: "INR", minor: 3_999_900 },
      title: "Travel Camera",
    },
  },
  {
    fixture: "conflict",
    merchantDirectory: "amazon-in",
    pageUrl: "https://www.amazon.in/dp/AMZ003",
    expected: {
      canonicalUrl: "https://www.amazon.in/dp/AMZ003",
      confidence: "low",
      merchant: "amazon.in",
      price: { currency: "INR", minor: 2_999_900 },
      title: "Portable Projector",
    },
  },
  {
    fixture: "missing-price",
    merchantDirectory: "amazon-in",
    pageUrl: "https://www.amazon.in/dp/AMZ004",
    expected: {
      canonicalUrl: "https://www.amazon.in/dp/AMZ004",
      confidence: "low",
      merchant: "amazon.in",
      price: null,
      title: "Mechanical Keyboard",
    },
  },
  {
    fixture: "primary",
    merchantDirectory: "flipkart",
    pageUrl: "https://www.flipkart.com/item/p/FLP001?pid=synthetic",
    expected: {
      canonicalUrl: "https://www.flipkart.com/item/p/FLP001",
      confidence: "high",
      merchant: "flipkart.com",
      price: { currency: "INR", minor: 8_999_900 },
      title: "Gaming Laptop",
    },
  },
  {
    fixture: "sale",
    merchantDirectory: "flipkart",
    pageUrl: "https://www.flipkart.com/item/p/FLP002",
    expected: {
      canonicalUrl: "https://www.flipkart.com/item/p/FLP002",
      confidence: "high",
      merchant: "flipkart.com",
      price: { currency: "INR", minor: 7_499_900 },
      title: "OLED Television",
    },
  },
  {
    fixture: "conflict",
    merchantDirectory: "flipkart",
    pageUrl: "https://www.flipkart.com/item/p/FLP003",
    expected: {
      canonicalUrl: "https://www.flipkart.com/item/p/FLP003",
      confidence: "low",
      merchant: "flipkart.com",
      price: { currency: "INR", minor: 2_499_900 },
      title: "Robot Vacuum",
    },
  },
  {
    fixture: "missing-price",
    merchantDirectory: "flipkart",
    pageUrl: "https://www.flipkart.com/item/p/FLP004",
    expected: {
      canonicalUrl: "https://www.flipkart.com/item/p/FLP004",
      confidence: "low",
      merchant: "flipkart.com",
      price: null,
      title: "Standing Desk",
    },
  },
  {
    fixture: "primary",
    merchantDirectory: "myntra",
    pageUrl: "https://www.myntra.com/shoes/MYN001?rawQuery=synthetic",
    expected: {
      canonicalUrl: "https://www.myntra.com/shoes/MYN001",
      confidence: "high",
      merchant: "myntra.com",
      price: { currency: "INR", minor: 1_249_900 },
      title: "RunFast Carbon Running Shoes",
    },
  },
  {
    fixture: "sale",
    merchantDirectory: "myntra",
    pageUrl: "https://www.myntra.com/jackets/MYN002",
    expected: {
      canonicalUrl: "https://www.myntra.com/jackets/MYN002",
      confidence: "high",
      merchant: "myntra.com",
      price: { currency: "INR", minor: 899_900 },
      title: "North Trail Insulated Jacket",
    },
  },
  {
    fixture: "conflict",
    merchantDirectory: "myntra",
    pageUrl: "https://www.myntra.com/watches/MYN003",
    expected: {
      canonicalUrl: "https://www.myntra.com/watches/MYN003",
      confidence: "low",
      merchant: "myntra.com",
      price: { currency: "INR", minor: 2_299_900 },
      title: "Timecraft Automatic Watch",
    },
  },
  {
    fixture: "missing-price",
    merchantDirectory: "myntra",
    pageUrl: "https://www.myntra.com/bags/MYN004",
    expected: {
      canonicalUrl: "https://www.myntra.com/bags/MYN004",
      confidence: "low",
      merchant: "myntra.com",
      price: null,
      title: "Carry Co Leather Work Bag",
    },
  },
];

function fixtureDocument(merchantDirectory: string, fixture: string, pageUrl: string) {
  const window = new Window({ url: pageUrl });
  window.document.write(
    readFileSync(
      new URL(`../../test/fixtures/${merchantDirectory}/${fixture}.html`, import.meta.url),
      "utf8"
    )
  );
  return window.document as unknown as Document;
}

describe("merchant adapters", () => {
  it.each(fixtureCases)(
    "extracts $merchantDirectory/$fixture deterministically",
    ({ expected, fixture, merchantDirectory, pageUrl }) => {
      const document = fixtureDocument(merchantDirectory, fixture, pageUrl);
      expect(extractProduct(document, pageUrl)).toEqual(expected);
    }
  );

  it.each([
    [
      "amazon-in",
      "https://www.amazon.in/dp/AMZ005",
      ".apexPriceToPay .a-offscreen",
      "₹52,999",
      5_299_900,
    ],
    ["flipkart", "https://www.flipkart.com/item/p/FLP005", ".Nx9bqj.CxhGGd", "₹17,999", 1_799_900],
    ["myntra", "https://www.myntra.com/sunglasses/MYN005", ".pdp-price strong", "₹9,999", 999_900],
  ])(
    "reads a settled dynamic update for %s",
    (directory, pageUrl, selector, nextText, expectedMinor) => {
      const document = fixtureDocument(directory, "dynamic-update", pageUrl);
      document.querySelector(selector)!.textContent = nextText;
      expect(extractProduct(document, pageUrl)?.price?.minor).toBe(expectedMinor);
    }
  );

  it("selects adapters only for the three supported HTTPS merchant hosts", () => {
    expect(adapterForUrl("https://smile.amazon.in/dp/AMZ001")?.merchant).toBe("amazon.in");
    expect(adapterForUrl("https://www.flipkart.com/item/p/FLP001")?.merchant).toBe("flipkart.com");
    expect(adapterForUrl("https://www.myntra.com/shoes/MYN001")?.merchant).toBe("myntra.com");
    expect(adapterForUrl("http://www.amazon.in/dp/AMZ001")).toBeNull();
    expect(adapterForUrl("https://amazon.in.attacker.example/dp/AMZ001")).toBeNull();
    expect(adapterForUrl("https://example.com/product")).toBeNull();
  });
});
