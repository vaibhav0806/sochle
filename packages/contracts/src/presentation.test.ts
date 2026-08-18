import { describe, expect, it } from "vitest";

import {
  decisionPresentationSchema,
  decisionToneSchema,
  forbiddenPrimaryTerms,
} from "./presentation";

describe("decision presentation contract", () => {
  it.each(["comfortable", "tradeoff", "wait", "tight", "no", "needs-input"])(
    "accepts the %s tone",
    (tone) => expect(decisionToneSchema.parse(tone)).toBe(tone)
  );

  it("rejects internal vocabulary anywhere in primary copy", () => {
    for (const term of forbiddenPrimaryTerms) {
      expect(() =>
        decisionPresentationSchema.parse({
          consequence: `Internal ${term}`,
          mathsRows: [],
          recencyLabel: "Updated recently",
          suggestedAction: null,
          title: "A clear answer",
          tone: "comfortable",
        })
      ).toThrow();
    }
  });

  it("accepts concise copy and no more than four maths rows", () => {
    const presentation = {
      consequence: "Your upcoming commitments stay protected.",
      mathsRows: [
        { label: "After this purchase", value: "₹55,000" },
        { label: "Buffer kept aside", value: "₹25,000" },
      ],
      recencyLabel: "Updated recently",
      suggestedAction: "Buy without moving another plan.",
      title: "Yes, this fits comfortably.",
      tone: "comfortable",
    };

    expect(decisionPresentationSchema.parse(presentation)).toEqual(presentation);
    expect(() =>
      decisionPresentationSchema.parse({
        ...presentation,
        mathsRows: Array.from({ length: 5 }, (_, index) => ({
          label: `Value ${index + 1}`,
          value: "₹1",
        })),
      })
    ).toThrow();
  });
});
