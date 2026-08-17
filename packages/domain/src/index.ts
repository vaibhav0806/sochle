export type {
  AccountExclusion,
  DataConfidence,
  ExpectedIncome,
  FinancialDataProvider,
  FinancialSource,
  Money,
  NormalizedAccount,
  NormalizedFinancialState,
  NormalizedTransaction,
  SourceFreshness,
  UpcomingObligation,
} from "./financial-state";
export { DEFAULT_RULES, nextSalaryDate, resolveForecastHorizon, validateRuleSet } from "./rules";
export type { ForecastHorizon, RuleSet } from "./rules";
export { buildDailyForecast, calculateHeadrooms } from "./forecast";
export type {
  DailyForecast,
  DailyForecastInput,
  DatedAmount,
  ForecastDay,
  ForecastEvent,
  ForecastObligation,
  HeadroomInput,
  Headrooms,
} from "./forecast";
export {
  assessConfidence,
  materialityThresholdMinor,
  REQUIRED_DECISION_SOURCES,
} from "./confidence";
export type {
  ConfidenceAssessment,
  ConfidenceInput,
  ConfidenceReason,
  DecisionIssue,
  SensitivityResult,
} from "./confidence";
export { buildExplanation } from "./explanations";
export type { DecisionExplanation, ExplanationInput } from "./explanations";
export { selectFinancialVerdict } from "./verdict";
export type { FinancialVerdict, FinancialVerdictInput, Verdict } from "./verdict";
export { calculateTodayPosition, evaluatePurchase } from "./evaluate-purchase";
export type {
  DecisionInputs,
  DecisionResult,
  EvaluatePurchaseInput,
  PlannedPurchase,
  TodayPosition,
} from "./evaluate-purchase";
export { buildWeeklyReview } from "./weekly-review";
export type { WeeklyReview, WeeklyReviewInput, WeeklyReviewOutcome } from "./weekly-review";
