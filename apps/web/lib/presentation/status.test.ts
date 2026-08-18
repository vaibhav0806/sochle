import { describe, expect, it } from "vitest";

import { purchaseStatusLabel, relativeUpdateLabel } from "./status";

describe("presentation labels", () => {
  it.each([
    ["considering", "Considering"],
    ["waiting", "Waiting"],
    ["planned", "Planned"],
    ["purchased", "Bought"],
    ["skipped", "Passed"],
    ["not_relevant", "Not relevant"],
  ] as const)("labels %s as %s", (status, label) => {
    expect(purchaseStatusLabel(status)).toBe(label);
  });

  it("uses human relative update labels", () => {
    const now = new Date("2026-08-19T12:00:00.000Z");
    expect(relativeUpdateLabel(new Date("2026-08-19T11:55:00.000Z"), now)).toBe("Just now");
    expect(relativeUpdateLabel(new Date("2026-08-18T12:00:00.000Z"), now)).toBe("Yesterday");
    expect(relativeUpdateLabel(new Date("2026-08-12T12:00:00.000Z"), now)).toBe("7 days ago");
  });
});
