import { describe, expect, it } from "vitest";

import { isValidPurchaseStatus, validPlannedDate } from "../../../../../lib/purchase-status";

describe("purchase status route validation", () => {
  it.each(["considering", "waiting", "planned", "purchased", "skipped", "not_relevant"])(
    "accepts %s",
    (status) => {
      expect(isValidPurchaseStatus(status)).toBe(true);
    }
  );

  it("keeps the planned date constraint", () => {
    expect(validPlannedDate("2026-08-18", "2026-08-18")).toBe(true);
    expect(validPlannedDate("2026-08-17", "2026-08-18")).toBe(false);
    expect(validPlannedDate("2027-08-19", "2026-08-18")).toBe(false);
  });
});
