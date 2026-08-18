import {
  assessConfidence,
  materialityThresholdMinor,
  type ConfidenceAssessment,
  type DecisionIssue,
} from "./confidence";
import { buildExplanation, type DecisionExplanation } from "./explanations";
import type { Money, NormalizedFinancialState } from "./financial-state";
import {
  buildDailyForecast,
  calculateHeadrooms,
  type DailyForecast,
  type DatedAmount,
  type ForecastObligation,
  type Headrooms,
} from "./forecast";
import { nextSalaryDate, resolveForecastHorizon, validateRuleSet, type RuleSet } from "./rules";
import { selectFinancialVerdict, type FinancialVerdict, type Verdict } from "./verdict";

export type PlannedPurchase = {
  amount: Money;
  dueOn: string;
  id: string;
};

export type EvaluatePurchaseInput = {
  dataIssues: DecisionIssue[];
  evaluatedAt: string;
  financialState: NormalizedFinancialState;
  plannedPurchases: PlannedPurchase[];
  price: Money;
  rules: RuleSet;
  snapshotId: string;
};

export type DecisionInputs = {
  additionalObligationsMinor: number;
  confirmedObligationsMinor: number;
  dataIssues: DecisionIssue[];
  essentialSpendingMinor: number;
  evaluatedAt: string;
  expectedIncomeMinor: number;
  financialState: NormalizedFinancialState;
  horizonEnd: string;
  immediateObligationsMinor: number;
  investmentTargetMinor: number;
  liquidCashMinor: number;
  minimumBufferMinor: number;
  nextSalaryDate: string | null;
  plannedPurchases: PlannedPurchase[];
  plannedPurchasesMinor: number;
  price: Money;
  rules: RuleSet;
  snapshotId: string;
};

export type DecisionResult = {
  confidence: ConfidenceAssessment;
  evaluatedAt: string;
  explanation: DecisionExplanation;
  financialVerdict: FinancialVerdict;
  firstComfortablyAffordableDate: string | null;
  forecast: DailyForecast;
  formulaVersion: 1;
  headrooms: Headrooms;
  inputs: DecisionInputs;
  verdict: Verdict;
};

function assertMoney(value: Money, label: string, positive = false): number {
  if (
    value.currency !== "INR" ||
    !Number.isSafeInteger(value.minor) ||
    (positive ? value.minor <= 0 : value.minor < 0)
  ) {
    throw new Error(
      positive
        ? `${label} must be a positive safe integer`
        : `${label} must be a non-negative safe integer`
    );
  }
  return value.minor;
}

function assertSignedMoney(value: Money, label: string): number {
  if (value.currency !== "INR" || !Number.isSafeInteger(value.minor)) {
    throw new Error(`${label} must use safe integer INR paise`);
  }
  return value.minor;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => {
    const result = total + value;
    if (!Number.isSafeInteger(result)) throw new Error("Money calculation exceeded safe range");
    return result;
  }, 0);
}

function evaluatedDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Evaluation timestamp must be ISO 8601");
  return new Date(timestamp).toISOString().slice(0, 10);
}

function inRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

type PreparedPurchaseCalculation = {
  assumptionsConfirmed: boolean;
  configuredSalaryDate: string;
  dataIssues: DecisionIssue[];
  forecast: DailyForecast;
  forecastInput: Parameters<typeof buildDailyForecast>[0];
  headroomInput: Parameters<typeof calculateHeadrooms>[0];
  headrooms: Headrooms;
  inputs: DecisionInputs;
  liquidCashMinor: number;
  purchasePriceMinor: number;
  rules: RuleSet;
};

function preparePurchaseCalculation(
  input: EvaluatePurchaseInput,
  requirePositivePrice: boolean
): PreparedPurchaseCalculation {
  const evaluatedOn = evaluatedDate(input.evaluatedAt);
  const rules = validateRuleSet(input.rules, evaluatedOn);
  const purchasePriceMinor = assertMoney(input.price, "Purchase price", requirePositivePrice);
  const liquidCashMinor = assertSignedMoney(input.financialState.liquidCash, "Liquid cash");
  const cardObligationsMinor = assertMoney(
    input.financialState.cardObligations,
    "Card obligations"
  );
  const horizonEnd = resolveForecastHorizon(rules, evaluatedOn);
  const configuredSalaryDate = nextSalaryDate(rules.salary.dayOfMonth, evaluatedOn);
  const derivedIssues: DecisionIssue[] = [];
  let assumptionsConfirmed = rules.salary.confirmed;

  const income: DatedAmount[] = [];
  for (const expected of input.financialState.expectedIncome) {
    if (expected.certainty === "estimated") {
      assumptionsConfirmed = false;
      continue;
    }
    if (inRange(expected.dueOn, evaluatedOn, horizonEnd)) {
      income.push({
        amountMinor: assertMoney(expected.amount, `Income ${expected.id}`),
        dueOn: expected.dueOn,
        id: expected.id,
      });
    }
  }

  if (rules.salary.confirmed && configuredSalaryDate <= horizonEnd) {
    const salaryCandidates = input.financialState.expectedIncome.filter(
      (expected) =>
        expected.certainty === "confirmed" &&
        expected.source === "salary" &&
        expected.dueOn === configuredSalaryDate
    );
    const exactSalary = salaryCandidates.find(
      (expected) => expected.amount.minor === rules.salary.amount.minor
    );
    if (exactSalary === undefined && salaryCandidates.length === 0) {
      income.push({
        amountMinor: rules.salary.amount.minor,
        dueOn: configuredSalaryDate,
        id: `rules:salary:${configuredSalaryDate}`,
      });
    } else if (exactSalary === undefined) {
      derivedIssues.push({
        effect: null,
        id: "derived:possible-duplicate-salary",
        label: "Possible duplicate salary",
      });
    }
  }

  const allConfirmedObligations: ForecastObligation[] = [];
  let datedCardObligationsMinor = 0;
  for (const obligation of input.financialState.upcomingObligations) {
    if (obligation.certainty === "estimated") {
      assumptionsConfirmed = false;
      continue;
    }
    const treatment = (obligation as typeof obligation & { budgetTreatment?: string })
      .budgetTreatment;
    if (treatment !== "inside_essential_budget" && treatment !== "additional") {
      derivedIssues.push({
        effect: null,
        id: `derived:obligation-budget:${obligation.id}`,
        label: `${obligation.name} budget treatment`,
      });
    }
    const amountMinor = assertMoney(obligation.amount, `Obligation ${obligation.id}`);
    allConfirmedObligations.push({
      amountMinor,
      budgetTreatment: treatment === "inside_essential_budget" ? treatment : "additional",
      dueOn: obligation.dueOn,
      id: obligation.id,
    });
    if (obligation.source === "credit_card") {
      datedCardObligationsMinor = sum([datedCardObligationsMinor, amountMinor]);
    }
  }

  if (cardObligationsMinor > datedCardObligationsMinor) {
    const remainder = cardObligationsMinor - datedCardObligationsMinor;
    allConfirmedObligations.push({
      amountMinor: remainder,
      budgetTreatment: "additional",
      dueOn: evaluatedOn,
      id: "derived:undated-card-obligation",
    });
    derivedIssues.push({
      effect: { maxMinor: 0, minMinor: 0 },
      id: "derived:undated-card-obligation",
      label: "Card obligation with unknown due date",
    });
  } else if (datedCardObligationsMinor > cardObligationsMinor) {
    derivedIssues.push({
      effect: null,
      id: "derived:card-obligation-conflict",
      label: "Card obligation totals conflict",
    });
  }

  const obligations = allConfirmedObligations.filter((obligation) =>
    inRange(obligation.dueOn, evaluatedOn, horizonEnd)
  );
  const plannedPurchases = input.plannedPurchases
    .filter((purchase) => inRange(purchase.dueOn, evaluatedOn, horizonEnd))
    .map((purchase) => ({
      amountMinor: assertMoney(purchase.amount, `Planned purchase ${purchase.id}`),
      dueOn: purchase.dueOn,
      id: purchase.id,
    }));
  const expectedIncomeMinor = sum(income.map((event) => event.amountMinor));
  const confirmedObligationsMinor = sum(obligations.map((event) => event.amountMinor));
  const additionalObligationsMinor = sum(
    obligations
      .filter((event) => event.budgetTreatment === "additional")
      .map((event) => event.amountMinor)
  );
  const immediateObligationsMinor = sum(
    allConfirmedObligations
      .filter((event) => event.dueOn >= evaluatedOn && event.dueOn <= configuredSalaryDate)
      .map((event) => event.amountMinor)
  );
  const plannedPurchasesMinor = sum(plannedPurchases.map((event) => event.amountMinor));
  const headroomInput = {
    additionalObligationsMinor,
    confirmedObligationsMinor,
    essentialSpendingMinor: rules.essentialMonthlySpending.minor,
    expectedIncomeMinor,
    immediateObligationsMinor,
    investmentTargetMinor: rules.monthlyInvestmentTarget.minor,
    liquidCashMinor,
    minimumBufferMinor: rules.minimumBuffer.minor,
    plannedPurchasesMinor,
    purchasePriceMinor,
  };
  const headrooms = calculateHeadrooms(headroomInput);
  const forecastInput = {
    endDate: horizonEnd,
    essentialReserveMinor: rules.essentialMonthlySpending.minor,
    income,
    investmentReserveMinor: rules.monthlyInvestmentTarget.minor,
    liquidCashMinor,
    minimumBufferMinor: rules.minimumBuffer.minor,
    obligations,
    plannedPurchases,
    purchasePriceMinor,
    startDate: evaluatedOn,
  };
  const forecast = buildDailyForecast(forecastInput);
  const dataIssues = input.dataIssues.map((issue) => ({
    ...issue,
    effect: issue.effect === null ? null : { ...issue.effect },
  }));
  dataIssues.push(...derivedIssues);
  return {
    assumptionsConfirmed,
    configuredSalaryDate,
    dataIssues,
    forecast,
    forecastInput,
    headroomInput,
    headrooms,
    inputs: {
      additionalObligationsMinor,
      confirmedObligationsMinor,
      dataIssues: structuredClone(dataIssues),
      essentialSpendingMinor: rules.essentialMonthlySpending.minor,
      evaluatedAt: input.evaluatedAt,
      expectedIncomeMinor,
      financialState: structuredClone(input.financialState),
      horizonEnd,
      immediateObligationsMinor,
      investmentTargetMinor: rules.monthlyInvestmentTarget.minor,
      liquidCashMinor,
      minimumBufferMinor: rules.minimumBuffer.minor,
      nextSalaryDate: rules.salary.confirmed ? configuredSalaryDate : null,
      plannedPurchases: structuredClone(input.plannedPurchases),
      plannedPurchasesMinor,
      price: { ...input.price },
      rules: structuredClone(rules),
      snapshotId: input.snapshotId,
    },
    liquidCashMinor,
    purchasePriceMinor,
    rules,
  };
}

export type TodayPosition = {
  forecast: DailyForecast;
  headrooms: Headrooms;
  safeToSpendMinor: number;
};

export function calculateTodayPosition(input: Omit<EvaluatePurchaseInput, "price">): TodayPosition {
  const prepared = preparePurchaseCalculation(
    { ...input, price: { currency: "INR", minor: 0 } },
    false
  );
  return {
    forecast: prepared.forecast,
    headrooms: prepared.headrooms,
    safeToSpendMinor: Math.max(0, prepared.headrooms.goalMinor),
  };
}

export function evaluatePurchase(input: EvaluatePurchaseInput): DecisionResult {
  const {
    assumptionsConfirmed,
    configuredSalaryDate,
    dataIssues,
    forecast,
    forecastInput,
    headroomInput,
    headrooms,
    inputs,
    liquidCashMinor,
    purchasePriceMinor,
    rules,
  } = preparePurchaseCalculation(input, true);
  const verdictInput = {
    comfortableHeadroomMinor: headrooms.comfortableMinor,
    currentComfortableHeadroomMinor:
      forecast.days[0]?.candidateComfortableHeadroomMinor ?? headrooms.comfortableMinor,
    firstComfortablyAffordableDate: forecast.firstComfortablyAffordableDate,
    goalHeadroomMinor: headrooms.goalMinor,
    investmentTargetMinor: rules.monthlyInvestmentTarget.minor,
    nextSalaryDate: rules.salary.confirmed ? configuredSalaryDate : null,
    technicalHeadroomMinor: headrooms.technicalMinor,
  };
  const financialVerdict = selectFinancialVerdict(verdictInput);
  const thresholdMinor = materialityThresholdMinor(
    purchasePriceMinor,
    rules.materiality.absoluteCap.minor,
    rules.materiality.purchaseRatioBps
  );
  const confidence = assessConfidence({
    assumptionsConfirmed,
    baseVerdict: financialVerdict,
    evaluatedAt: input.evaluatedAt,
    issues: dataIssues,
    materialityThresholdMinor: thresholdMinor,
    sources: input.financialState.sourceFreshness,
    verdictForLiquidityAdjustment: (adjustmentMinor) => {
      const adjustedHeadrooms = calculateHeadrooms({
        ...headroomInput,
        liquidCashMinor: liquidCashMinor + adjustmentMinor,
      });
      const adjustedForecast = buildDailyForecast({
        ...forecastInput,
        liquidCashMinor: liquidCashMinor + adjustmentMinor,
      });
      return selectFinancialVerdict({
        ...verdictInput,
        comfortableHeadroomMinor: adjustedHeadrooms.comfortableMinor,
        currentComfortableHeadroomMinor:
          adjustedForecast.days[0]?.candidateComfortableHeadroomMinor ??
          adjustedHeadrooms.comfortableMinor,
        firstComfortablyAffordableDate: adjustedForecast.firstComfortablyAffordableDate,
        goalHeadroomMinor: adjustedHeadrooms.goalMinor,
        technicalHeadroomMinor: adjustedHeadrooms.technicalMinor,
      });
    },
  });
  const verdict: Verdict =
    confidence.level === "low" ? "insufficient_confidence" : financialVerdict;
  const issueLabels = new Map(dataIssues.map((issue) => [issue.id, issue.label]));
  const blockingIssueLabels = confidence.blockingIssueIds.map(
    (issueId) => issueLabels.get(issueId) ?? issueId
  );
  if (blockingIssueLabels.length === 0 && confidence.level === "low") {
    blockingIssueLabels.push(confidence.reasons[0]?.detail ?? "A required financial input");
  }
  const explanation = buildExplanation({
    blockingIssueLabels,
    bufferShortfallMinor: Math.max(0, -headrooms.comfortableMinor),
    confidence: confidence.level,
    firstComfortablyAffordableDate: forecast.firstComfortablyAffordableDate,
    goalHeadroomMinor: headrooms.goalMinor,
    investmentReductionMinor: Math.min(
      rules.monthlyInvestmentTarget.minor,
      Math.max(0, -headrooms.goalMinor)
    ),
    technicalHeadroomMinor: headrooms.technicalMinor,
    verdict,
  });

  return {
    confidence,
    evaluatedAt: input.evaluatedAt,
    explanation,
    financialVerdict,
    firstComfortablyAffordableDate: forecast.firstComfortablyAffordableDate,
    forecast,
    formulaVersion: 1,
    headrooms,
    inputs,
    verdict,
  };
}
