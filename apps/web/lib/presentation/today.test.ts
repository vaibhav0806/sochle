import { describe, expect, it } from "vitest";

import { presentToday } from "./today";

describe("today presentation", () => {
  it.each([
    [5_000_00, 25_000_00, false, "comfortable", "You're in a comfortable spot today."],
    [0, 25_000_00, true, "tradeoff", "You have room, but one plan needs attention."],
    [0, -1, false, "tight", "Today looks a little tight."],
  ] as const)(
    "maps a daily position without making money the headline",
    (safe, goal, blocked, tone, title) => {
      expect(
        presentToday({
          committedMinor: 20_000_00,
          goalHeadroomMinor: goal,
          hasBlockingIssue: blocked,
          minimumBufferMinor: 25_000_00,
          safeToSpendMinor: safe,
        })
      ).toMatchObject({ title, tone });
    }
  );

  it("uses only the three approved supporting facts", () => {
    expect(
      presentToday({
        committedMinor: 20_000_00,
        goalHeadroomMinor: 5_000_00,
        hasBlockingIssue: false,
        minimumBufferMinor: 25_000_00,
        safeToSpendMinor: 5_000_00,
      }).facts.map((fact) => fact.label)
    ).toEqual(["Comfortable to spend", "Already committed", "Safety buffer protected"]);
  });
});
