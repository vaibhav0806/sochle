export type Verdict =
  | "comfortably_affordable"
  | "affordable_with_tradeoffs"
  | "wait_until_payday"
  | "requires_reducing_investments"
  | "technically_possible_financially_tight"
  | "not_affordable"
  | "insufficient_confidence";

export type FinancialVerdict = Exclude<Verdict, "insufficient_confidence">;

export type FinancialVerdictInput = {
  comfortableHeadroomMinor: number;
  currentComfortableHeadroomMinor: number;
  firstComfortablyAffordableDate: string | null;
  goalHeadroomMinor: number;
  investmentTargetMinor: number;
  nextSalaryDate: string | null;
  technicalHeadroomMinor: number;
};

export function selectFinancialVerdict(input: FinancialVerdictInput): FinancialVerdict {
  if (
    input.currentComfortableHeadroomMinor < 0 &&
    input.nextSalaryDate !== null &&
    input.firstComfortablyAffordableDate === input.nextSalaryDate
  ) {
    return "wait_until_payday";
  }
  if (input.goalHeadroomMinor >= 0) return "comfortably_affordable";
  if (input.goalHeadroomMinor + input.investmentTargetMinor >= 0) {
    return "requires_reducing_investments";
  }
  if (input.comfortableHeadroomMinor >= 0) return "affordable_with_tradeoffs";
  if (input.technicalHeadroomMinor >= 0) return "technically_possible_financially_tight";
  return "not_affordable";
}
