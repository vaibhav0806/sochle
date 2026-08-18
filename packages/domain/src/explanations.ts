import type { DataConfidence } from "./financial-state";
import type { Verdict } from "./verdict";

export type DecisionExplanation = {
  action: string | null;
  headline: string;
  reason: string;
  templateId: string;
  templateVersion: 1;
};

export type ExplanationInput = {
  blockingIssueLabels: string[];
  bufferShortfallMinor: number;
  confidence: DataConfidence;
  firstComfortablyAffordableDate: string | null;
  goalHeadroomMinor: number;
  investmentReductionMinor: number;
  recoveryAction?: string;
  technicalHeadroomMinor: number;
  verdict: Verdict;
};

const money = new Intl.NumberFormat("en-IN", {
  currency: "INR",
  minimumFractionDigits: 2,
  style: "currency",
});

function formatMoney(minor: number): string {
  if (!Number.isSafeInteger(minor))
    throw new Error("Explanation money must use safe integer paise");
  return money.format(minor / 100);
}

function highCopy(
  input: ExplanationInput
): Omit<DecisionExplanation, "templateId" | "templateVersion"> {
  switch (input.verdict) {
    case "comfortably_affordable":
      return {
        action: null,
        headline: "Haan, this fits.",
        reason: `Your buffer and goals stay intact with ${formatMoney(input.goalHeadroomMinor)} left.`,
      };
    case "affordable_with_tradeoffs":
      return {
        action: "Review which planned purchase or goal should move.",
        headline: "Possible hai, free nahi—one plan needs to move.",
        reason: `Your goal plan is short by ${formatMoney(Math.abs(input.goalHeadroomMinor))}.`,
      };
    case "wait_until_payday":
      return {
        action: `Wait until ${input.firstComfortablyAffordableDate ?? "the confirmed payday"}.`,
        headline: "Bas thoda ruk jao—payday ke baad maths bhi haan bolti hai.",
        reason: `The purchase becomes comfortable on ${input.firstComfortablyAffordableDate ?? "the confirmed payday"}.`,
      };
    case "requires_reducing_investments":
      return {
        action: "Choose whether this purchase matters more than the investment target.",
        headline: "Le sakte ho, but your investment goal takes the hit.",
        reason: `You would need to reduce planned investments by ${formatMoney(input.investmentReductionMinor)}.`,
      };
    case "technically_possible_financially_tight":
      return {
        action: "Wait, lower the price, or deliberately change the buffer.",
        headline: "Technically ho jayega. Comfortably? Abhi nahi.",
        reason: `Your liquidity buffer would be short by ${formatMoney(input.bufferShortfallMinor)}.`,
      };
    case "not_affordable":
      return {
        action: "Wait for more cash or choose a lower price.",
        headline: "Dil haan bol raha hai; numbers abhi nahi.",
        reason: `Technical headroom is ${formatMoney(input.technicalHeadroomMinor)}.`,
      };
    case "insufficient_confidence":
      throw new Error("Verdict and confidence do not match");
  }
}

function mediumHeadline(verdict: Exclude<Verdict, "insufficient_confidence">): string {
  switch (verdict) {
    case "comfortably_affordable":
      return "Likely fits—but ek quick check.";
    case "affordable_with_tradeoffs":
      return "Possible lag raha hai—but the trade-off needs a quick check.";
    case "wait_until_payday":
      return "Payday looks better—but ek input needs a quick check.";
    case "requires_reducing_investments":
      return "This may fit by trimming investments—but check the inputs first.";
    case "technically_possible_financially_tight":
      return "Tight lag raha hai—and one input needs a quick check.";
    case "not_affordable":
      return "Abhi no lag raha hai—but ek input needs a quick check.";
  }
}

export function buildExplanation(input: ExplanationInput): DecisionExplanation {
  if (input.confidence === "low") {
    if (input.verdict !== "insufficient_confidence") {
      throw new Error("Verdict and confidence do not match");
    }
    const blocker = input.blockingIssueLabels[0] ?? "A required financial input";
    return {
      action: input.recoveryAction ?? "Resolve the blocking item in Money Inbox and check again.",
      headline: "Pehle data sort karte hain, phir decision.",
      reason: `${blocker}, so Sochle cannot give a reliable call.`,
      templateId: "low.insufficient_confidence.v1",
      templateVersion: 1,
    };
  }
  if (input.verdict === "insufficient_confidence") {
    throw new Error("Verdict and confidence do not match");
  }

  const copy = highCopy(input);
  if (input.confidence === "medium") {
    return {
      ...copy,
      headline: mediumHeadline(input.verdict),
      reason: `${copy.reason} One or more inputs are aging or estimated.`,
      templateId: `medium.${input.verdict}.v1`,
      templateVersion: 1,
    };
  }
  return {
    ...copy,
    templateId: `high.${input.verdict}.v1`,
    templateVersion: 1,
  };
}
