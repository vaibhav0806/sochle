import { parseRupeesToMinor } from "./money";

const INDIAN_RUPEE_INPUT = /^(?:\d+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/;

export class PurchaseInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PurchaseInputError";
  }
}

export function parsePurchaseInput(formData: FormData): {
  description: string;
  priceMinor: number;
} {
  const rawDescription = formData.get("description");
  const rawPrice = formData.get("price");
  if (typeof rawDescription !== "string" || typeof rawPrice !== "string") {
    throw new PurchaseInputError("Add the product name and price");
  }

  const description = rawDescription.trim();
  if (description.length === 0) throw new PurchaseInputError("Add the product name");
  if (description.length > 120) {
    throw new PurchaseInputError("Keep the product name under 120 characters");
  }

  const price = rawPrice.trim();
  if (!INDIAN_RUPEE_INPUT.test(price)) {
    throw new PurchaseInputError("Enter a valid price in rupees");
  }
  try {
    return { description, priceMinor: parseRupeesToMinor(price.replaceAll(",", "")) };
  } catch {
    throw new PurchaseInputError("Enter a valid price in rupees");
  }
}
