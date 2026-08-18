import { formatMinorAsRupees } from "../money";

export type TodayPresentationInput = {
  committedMinor: number;
  goalHeadroomMinor: number;
  hasBlockingIssue: boolean;
  minimumBufferMinor: number;
  safeToSpendMinor: number;
};

export type TodayPresentation = {
  consequence: string;
  facts: Array<{ label: string; value: string }>;
  title: string;
  tone: "comfortable" | "tradeoff" | "tight" | "needs-input";
};

export function presentToday(input: TodayPresentationInput): TodayPresentation {
  const state = input.hasBlockingIssue
    ? {
        consequence: "One plan needs a quick check before your next purchase.",
        title: "You have room, but one plan needs attention.",
        tone: "tradeoff" as const,
      }
    : input.goalHeadroomMinor < 0
      ? {
          consequence: "Your essentials are covered, but there is not much breathing room.",
          title: "Today looks a little tight.",
          tone: "tight" as const,
        }
      : {
          consequence: "Your upcoming commitments and safety buffer are covered.",
          title: "You're in a comfortable spot today.",
          tone: "comfortable" as const,
        };

  return {
    ...state,
    facts: [
      { label: "Comfortable to spend", value: formatMinorAsRupees(input.safeToSpendMinor) },
      { label: "Already committed", value: formatMinorAsRupees(input.committedMinor) },
      { label: "Safety buffer protected", value: formatMinorAsRupees(input.minimumBufferMinor) },
    ],
  };
}
