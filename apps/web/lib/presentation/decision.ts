import { decisionPresentationSchema, type DecisionPresentation } from "@sochle/contracts";
import type { DecisionResult, Verdict } from "@sochle/domain";

import { formatMinorAsRupees } from "../money";

const copy: Record<
  Verdict,
  Pick<DecisionPresentation, "consequence" | "suggestedAction" | "title" | "tone">
> = {
  affordable_with_tradeoffs: {
    consequence: "Your essentials stay covered, but one planned expense needs room.",
    suggestedAction: "Move one flexible plan before buying.",
    title: "This fits, with one trade-off.",
    tone: "tradeoff",
  },
  comfortably_affordable: {
    consequence: "Your buffer and upcoming commitments stay protected.",
    suggestedAction: "You can buy this without moving another plan.",
    title: "Yes, this fits comfortably.",
    tone: "comfortable",
  },
  insufficient_confidence: {
    consequence: "One important detail needs attention before this call is reliable.",
    suggestedAction: "Review what needs attention, then check again.",
    title: "We need one detail first.",
    tone: "needs-input",
  },
  not_affordable: {
    consequence: "Buying this would disturb money already set aside for essentials.",
    suggestedAction: "Pass for now or choose a lower price.",
    title: "This doesn't fit right now.",
    tone: "no",
  },
  requires_reducing_investments: {
    consequence: "Your essentials stay covered, but this uses money set aside for a goal.",
    suggestedAction: "Buy only if moving that goal feels worth it.",
    title: "This fits, but it moves one goal.",
    tone: "tradeoff",
  },
  technically_possible_financially_tight: {
    consequence: "The payment clears, but it leaves too little breathing room.",
    suggestedAction: "Wait or choose a lower price.",
    title: "This would make things too tight.",
    tone: "tight",
  },
  wait_until_payday: {
    consequence: "Your position improves on the next expected income date.",
    suggestedAction: "Wait until the suggested date before buying.",
    title: "Better to wait a little.",
    tone: "wait",
  },
};

function recencyLabel(result: DecisionResult): string {
  const statuses = result.inputs.financialState.sourceFreshness.map((source) => source.status);
  if (statuses.some((status) => status === "missing" || status === "stale")) {
    return result.verdict === "insufficient_confidence"
      ? "Update needed"
      : "Based on your latest available picture";
  }
  return statuses.some((status) => status === "aging")
    ? "Based on your latest available picture"
    : "Updated recently";
}

function displayDate(value: string | null): string {
  if (value === null) return "Not within the current window";
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function presentDecision(result: DecisionResult): DecisionPresentation {
  const selected = copy[result.verdict];
  return decisionPresentationSchema.parse({
    ...selected,
    mathsRows: [
      {
        label: "After this purchase",
        value: formatMinorAsRupees(result.inputs.liquidCashMinor - result.inputs.price.minor),
      },
      {
        label: "Buffer kept aside",
        value: formatMinorAsRupees(result.inputs.minimumBufferMinor),
      },
      {
        label: "Commitments already covered",
        value: formatMinorAsRupees(result.inputs.confirmedObligationsMinor),
      },
      {
        label: "Better buying date",
        value: displayDate(result.firstComfortablyAffordableDate),
      },
    ],
    recencyLabel: recencyLabel(result),
  });
}
