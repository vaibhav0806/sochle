# Milestone 2: Deterministic Decision Core

**Status:** Approved design

**Date:** 2026-08-17

**Source:** `SOCHLE_PRD.md`, sections 11–13, and `MILESTONES.md`, Milestone 2

## 1. Goal

Milestone 2 gives a signed-in user an auditable affordability decision for a manually entered purchase. The calculation is deterministic, uses integer paise, and produces technical, comfortable, and goal-compatible headroom, a daily forecast, a confidence rating, and one of the seven PRD verdicts.

The decision engine is a pure domain function. Database and web code collect inputs, persist immutable evidence, and display results; they do not reproduce financial calculations.

## 2. Scope

### In scope

- Versioned and validated user rules.
- Manual purchase checks.
- Technical, comfortable, and goal-compatible headroom.
- A daily forecast and first comfortably affordable date.
- Confidence and issue-materiality evaluation.
- Deterministic verdict selection and explanation templates.
- Immutable decision and audit persistence.
- Rules, Check, Today, Decisions list, and Decision Detail screens.
- Authenticated JSON export and complete account-data deletion.
- Unit, integration, end-to-end, adversarial scenario, and performance tests.

### Out of scope

- Browser-extension decision cards and commerce-page integration; those remain Milestone 3.
- LLM-generated calculations or explanations.
- Automatic purchase detection, receipt matching, or post-purchase tracking.
- Category-specific budgets and multiple buffer modes.
- Real-time Fold calls in the evaluation path. Milestone 2 evaluates a persisted normalized snapshot.

## 3. Architecture

The implementation has three boundaries:

1. `packages/domain` owns validation-independent financial types and pure calculation logic.
2. `packages/db` owns rule, intent, decision, and audit persistence.
3. `apps/web` owns authenticated input, orchestration, and presentation.

The domain package exposes a single evaluation entry point. It receives a complete input object and returns a serializable result without reading the clock, environment, database, network, or Fold adapter. `evaluatedAt` is always supplied by the caller.

The initial modules are:

- `rules.ts`: rule types and validation.
- `forecast.ts`: date generation, cash events, balances, and first-affordable date.
- `confidence.ts`: freshness, materiality, assumption, and sensitivity rules.
- `verdict.ts`: pre-confidence verdict precedence.
- `evaluate-purchase.ts`: orchestration and final immutable result.

This separation makes every financial outcome reproducible from its stored audit bundle.

## 4. Domain model

All money values are signed integer paise. Inputs with fractional paise, non-safe integers, or currency other than INR are rejected at the boundary. Dates are ISO `YYYY-MM-DD` calendar dates; timestamps are ISO 8601 UTC strings.

```ts
type RuleSet = {
  version: number;
  minimumBuffer: Money;
  salary: {
    amount: Money;
    dayOfMonth: number;
    confirmed: boolean;
  };
  essentialMonthlySpending: Money;
  monthlyInvestmentTarget: Money;
  largePurchaseThreshold: Money;
  materiality: {
    absoluteCap: Money;
    purchaseRatioBps: number;
  };
  forecastHorizon:
    | { kind: "next_salary" }
    | { kind: "rolling_days"; days: number }
    | { kind: "custom"; endDate: string };
};

type Obligation = {
  id: string;
  dueOn: string;
  amount: Money;
  kind: "card" | "rent" | "bill" | "other";
  budgetTreatment: "inside_essential_budget" | "additional";
  confirmed: boolean;
};

type PlannedPurchase = {
  id: string;
  dueOn: string;
  amount: Money;
};

type Verdict =
  | "comfortably_affordable"
  | "affordable_with_tradeoffs"
  | "wait_until_payday"
  | "requires_reducing_investments"
  | "technically_possible_financially_tight"
  | "not_affordable"
  | "insufficient_confidence";
```

`NormalizedFinancialState` remains the source of liquid accounts, dated income, obligations, snapshot freshness, source exclusions, and open data-quality issues. Milestone 2 extends normalized obligations with `budgetTreatment`; ambiguous imported obligations default to `additional` until the user confirms otherwise. This avoids silently omitting a real liability.

## 5. Rules and horizons

A rule set is append-only by version. Editing rules creates a new version; prior decisions continue to reference the exact version used.

Validation requires:

- `version` is a positive integer.
- Monetary rule values are non-negative safe integers.
- Salary day is an integer from 1 through 31.
- Materiality basis points are from 0 through 10,000.
- A rolling horizon is a positive integer no greater than 30 days.
- A custom end date is not earlier than `evaluatedAt` and is no more than 30 days later.

For `next_salary`, the horizon ends on the next salary date after `evaluatedAt`, capped at 30 days. A salary day absent from a month is clamped to that month's final calendar day. The configured salary event is included on the horizon end date.

## 6. Calculation semantics

The engine evaluates the proposed purchase as an immediate cash event on the evaluation date.

### 6.1 Shared amounts

- `liquidCash`: sum of included spendable liquid accounts at the snapshot.
- `immediateObligations`: confirmed card or other immediate obligations due on or before the next configured salary date.
- `expectedIncomeWithinHorizon`: confirmed dated income plus confirmed configured salary events within the horizon.
- `confirmedObligationsWithinHorizon`: confirmed obligations due within the horizon.
- `additionalObligationsWithinHorizon`: confirmed obligations within the horizon whose `budgetTreatment` is `additional`.
- `plannedPurchasesWithinHorizon`: planned purchases due within the horizon, excluding the purchase currently being evaluated.
- `essentialSpendingForecast`: one full monthly essential-spending reserve, applied at evaluation time.
- `plannedInvestmentForecast`: one full monthly investment target, applied at evaluation time.

An income event represented in normalized data and by the configured salary recurrence is deduplicated by source identity before evaluation. If identity is unavailable and the events may be duplicates, the issue enters confidence evaluation instead of both amounts being assumed.

### 6.2 Headroom formulas

```text
technical_headroom =
    liquid_cash
  - immediate_obligations
  - purchase_price

comfortable_headroom =
    liquid_cash
  + expected_income_within_horizon
  - confirmed_obligations_within_horizon
  - minimum_liquidity_buffer
  - purchase_price

goal_headroom =
    liquid_cash
  + expected_income_within_horizon
  - additional_obligations_within_horizon
  - essential_spending_forecast
  - planned_investment_forecast
  - planned_purchases_within_horizon
  - minimum_liquidity_buffer
  - purchase_price
```

The horizon is limited to 30 days, and the full essential monthly spending estimate and full monthly investment target are each reserved once at evaluation time. Neither is prorated by day. Obligations marked `inside_essential_budget` affect chronological cash flow but are not subtracted again from goal headroom because the essential reserve already covers them. Obligations marked `additional` are separate liabilities and are deducted in addition to the essential reserve.

All comparisons are inclusive at zero: headroom of exactly zero satisfies that constraint.

### 6.3 Daily forecast

The forecast starts with liquid cash and spans every calendar date from `evaluatedAt` through the horizon end date. Its cash track applies only real confirmed income, confirmed obligations, and planned purchases. A separate goal-available track deducts the one-time essential and investment reserves without pretending those allocations have already left the user's accounts.

Events on the same date are treated as one atomic group. Affordability is evaluated only after the entire day's group is applied, so event ordering within a date cannot manufacture a temporary positive balance. For each date, candidate comfortable headroom is that day's ending cash minus confirmed obligations still due through the horizon, the minimum buffer, and the proposed purchase. Future income does not count until its date has arrived. The first date with non-negative candidate comfortable headroom is the first comfortably affordable date.

The forecast returns:

- end-of-day projected cash and goal-available balance for each date;
- each applied event and its source ID;
- the minimum projected cash and its date;
- the first comfortably affordable date, or `null` when none exists in the horizon.

The essential reserve and investment target are applied once on the evaluation date. Remaining essential reserve starts at the full monthly amount. When an `inside_essential_budget` obligation is paid, cash and remaining essential reserve fall together, so goal-available cash is unchanged; any amount beyond the remaining reserve reduces goal-available cash. This prevents both omission and double counting. Additional obligations and planned purchases reduce goal-available cash directly.

## 7. Verdict precedence

The engine computes and retains a financial verdict for auditability. The public verdict first checks confidence: low confidence always returns `insufficient_confidence`. Otherwise, exactly one financial branch is selected in this order:

1. `wait_until_payday` when candidate comfortable headroom at the end of the evaluation date is negative, the first comfortably affordable date is the next confirmed salary date, and it is not comfortably affordable on any earlier date.
2. `comfortably_affordable` when `goalHeadroom >= 0`.
3. `requires_reducing_investments` when goal headroom is negative, but adding back the monthly investment target makes it non-negative.
4. `affordable_with_tradeoffs` when comfortable headroom is non-negative but goal headroom remains negative for reasons other than only the investment target, such as planned purchases.
5. `technically_possible_financially_tight` when technical headroom is non-negative but comfortable headroom is negative.
6. `not_affordable` otherwise.

The stored result preserves both layers:

- Low confidence changes the public verdict to `insufficient_confidence` regardless of the financial branch.
- Medium and high confidence preserve the financial verdict.
- The pre-confidence financial verdict remains in the immutable audit bundle for diagnosis and recalculation, but low-confidence user-facing copy must not state it as categorical advice.

This ordering deliberately gives `wait_until_payday` priority over a longer-horizon positive goal result when a known salary event is what resolves the immediate constraint.

## 8. Confidence and materiality

The issue threshold is:

```text
materiality_threshold = min(₹5,000, floor(purchase_price * 1,000 / 10,000))
```

The configured cap and ratio replace those defaults. Multiplication and division use integer arithmetic; the threshold rounds down to paise. An issue is material when its maximum possible liquidity effect is greater than or equal to the threshold, or when sensitivity evaluation shows that resolving it can change the financial verdict. Manual purchase prices must be positive, so a zero materiality threshold is not valid for a saved purchase decision.

Required-source freshness uses the repository defaults: high through 6 hours, medium after 6 and through 24 hours, and low after 24 hours. Boundary timestamps belong to the fresher band.

Overall confidence is the lowest applicable level:

- **Low:** a required source is missing or older than 24 hours; a material issue is unresolved; a required salary, obligation, or rule assumption is unconfirmed; or sensitivity evaluation produces a different financial verdict.
- **Medium:** a required source is older than 6 but no older than 24 hours; or an unresolved or assumption-based issue remains below materiality and cannot change the verdict.
- **High:** required sources are no older than 6 hours, required assumptions are confirmed, and no unresolved issue can materially affect the result.

Sensitivity is deterministic. For an issue with a bounded financial effect, the engine evaluates both documented endpoints. An unbounded or directionally unknown issue is low confidence because the result cannot be proven stable.

The result includes confidence reasons, blocking issue IDs, and excluded-source reasons. It never converts missing evidence into a zero-valued assumption.

## 9. Persistence and auditability

The database adds append-oriented tables for rule sets, purchase intents, decisions, and audit events. Existing repository conventions determine IDs, timestamps, ownership keys, and JSON storage types.

A decision row is immutable after insertion. Status changes to the related purchase intent do not rewrite it; recalculation creates a new decision linked to the same intent and previous decision.

Each decision stores an audit bundle containing:

- purchase price, intent ID, and `evaluatedAt`;
- normalized snapshot ID and captured snapshot timestamp;
- complete rule-set values and rule-set version;
- planned purchases, obligations, income events, issues, and exclusions used;
- formula version;
- all three headroom values and named intermediate amounts;
- the daily forecast and first comfortably affordable date;
- pre-confidence financial verdict and final public verdict;
- confidence level, reasons, sensitivity endpoints, and blocking issue IDs;
- deterministic explanation template ID, parameters, and rendered text.

Audit events record creation, recalculation, status changes, export, and deletion initiation. A successful deletion removes that initiation event with the rest of the user's audit history, so no user-linked completion record remains. Audit rows never contain Fold tokens, full account numbers, or raw transaction narration.

## 10. Web and API behavior

All Milestone 2 routes require the existing owner session except public synthetic demo routes that already exist.

- **Rules:** view the active version, validate edits, and create a new version.
- **Check:** enter a description and positive INR price, select the active rules, run an evaluation against the latest persisted snapshot, and save the intent and immutable decision atomically.
- **Today:** show liquid cash, immediate and upcoming obligations, safe-to-spend as the non-negative goal headroom before a candidate purchase, snapshot freshness, and blocking issues. It derives this summary from the same shared intermediates without creating a zero-price decision.
- **Decisions:** list intent status, latest verdict, price, confidence, evaluation time, and detail link.
- **Decision Detail:** render stored inputs, three headrooms, daily forecast, confidence evidence, exclusions, formula version, and deterministic explanation. It reads the stored audit bundle and never silently recalculates.

If no usable snapshot or rule set exists, Check explains the missing prerequisite and does not create a decision. A low-confidence evaluation may be saved, but it displays `insufficient_confidence` and directs the user to its blocking issues.

Explanations come from versioned templates keyed by verdict and confidence. Templates interpolate only stored deterministic values. No model call participates in calculation or copy generation in this milestone.

### 10.1 Sochle voice and personality

The product should sound like a sharp, trusted friend who has checked the maths—not a bank notice and not a stand-up comic. Default copy is concise, English-first Hinglish. Financial labels, amounts, dates, confidence, and next actions remain plain and unambiguous even when the headline is playful.

Each explanation has three independently rendered parts:

1. a short personality-led headline;
2. a factual reason containing the relevant amount, date, or uncertainty;
3. one concrete next action when action is useful.

Tone follows confidence:

- **High:** clear and confident, with the most personality. Example: “Haan, this fits.” followed by “Your buffer and planned goals stay intact.”
- **Medium:** warm but qualified. Example: “Looks doable—but ek quick check.” followed by the specific stale or assumed input.
- **Low:** protective and direct, with no celebratory language. Example: “Abhi haan bolna tukka hoga.” followed by the blocking issue and how to resolve it.

Verdict templates may use lines such as:

- `wait_until_payday`: “Bas thoda ruk jao—payday ke baad maths bhi haan bolti hai.”
- `requires_reducing_investments`: “Le sakte ho, but your investment goal takes the hit.”
- `affordable_with_tradeoffs`: “Possible hai, free nahi—one plan needs to move.”
- `technically_possible_financially_tight`: “Technically ho jayega. Comfortably? Abhi nahi.”
- `not_affordable`: “Dil haan bol raha hai; numbers abhi nahi.”
- `insufficient_confidence`: “Pehle data sort karte hain, phir decision.”

The canonical verdict label and confidence badge always appear beside the personality copy. Messages must never shame the user, mock their income or spending, imply guaranteed future income, hide a negative amount, or turn low confidence into a positive recommendation. Avoid forced slang, emojis, and random message rotation in the MVP.

Templates are versioned and keyed by final verdict plus confidence. The selected template ID, parameters, and rendered copy are stored with the decision, so detail views and exports reproduce exactly what the user saw. Product copy can be refined without changing calculation or verdict code.

## 11. Export and deletion

Authenticated export returns one JSON archive containing the user's normalized financial data, corrections, rules, purchase intents, decisions with audit bundles, and audit events. Secrets and encrypted Fold credentials are omitted. Export itself creates an audit event before the archive is assembled.

Authenticated deletion requires an explicit confirmation in the UI. If the Fold adapter supports remote revocation, the server attempts it first; a failed supported revocation blocks deletion and permits retry. Whether or not remote revocation exists, successful deletion removes the locally stored encrypted Fold authorization and all user-owned normalized data, corrections, snapshots, rules, purchase intents, decisions, and audit records. Successful deletion signs the user out and leaves no user-owned audit record behind.

Tests use fake authorization adapters. Real Fold authorization and revocation remain manual external checks because CI must not contain personal Fold credentials.

## 12. Security and privacy

- Financial values and raw narrations must not enter application logs, analytics, test snapshots, or error messages.
- Domain failures return structured field/reason codes; web code maps them to safe text.
- Every database read and mutation is scoped to the authenticated owner.
- Decision detail, export, and deletion endpoints reject unauthenticated and wrong-owner access.
- Demo and end-to-end fixtures contain synthetic values only.
- The browser receives only the data required for the current authenticated screen; Fold credentials remain server-side.

## 13. Testing and release gate

Milestone 2 follows `docs/TESTING.md`. Implementation uses test-driven development: each behavior starts with a failing test, receives the smallest implementation, and is refactored only while green.

### Unit tests

Table-driven domain tests cover:

- all seven final verdicts and all six pre-confidence financial branches;
- zero boundaries for every headroom and the minimum buffer;
- salary-day month-end clamping, horizon inclusion, and 30-day cap;
- same-day event grouping;
- one-time essential-reserve behavior and obligation non-double-counting;
- materiality arithmetic and boundary equality;
- freshness at 6 hours and 24 hours;
- sensitivity-driven confidence changes;
- integer overflow, invalid dates, invalid rules, and fractional-paise rejection;
- deterministic explanations and serialization.
- every verdict/confidence copy template, required factual parameters, and tone guardrails.

### Scenario fixtures

The ₹45,000 reference purchase and at least ten hand-calculated adversarial fixtures cover:

1. self-transfer excluded from spending;
2. parent-card outstanding without add-on-card double counting;
3. salary on the evaluation date;
4. salary day clamped in a short month;
5. rent variance above materiality;
6. refund matched to an earlier purchase;
7. stale required source;
8. uncertain merchant below and at materiality;
9. duplicate equal-price charges with distinct source IDs;
10. essential-budget obligation versus an additional obligation;
11. planned investment as the sole compromised goal;
12. planned purchase causing a trade-off.

Each fixture stores expected integer intermediate amounts, all headrooms, financial verdict, confidence, final verdict, and first-affordable date. Tests assert exact values rather than snapshots of prose.

### Integration tests

- Rule version creation and validation.
- Atomic purchase-intent and immutable-decision persistence.
- Recalculation creates a new decision without changing the old one.
- Owner isolation on all queries and mutations.
- JSON export completeness and secret exclusion.
- Deletion removes every user-owned Milestone 0–2 record and Fold authorization.
- Failure during Fold revocation preserves local data and reports failure.

### End-to-end tests

- Configure rules, manually check a purchase, and inspect the same stored breakdown.
- View Today and Decisions from the newly saved decision.
- Save and display an insufficient-confidence decision.
- Export data and verify the archive structure.
- Confirm and complete account-data deletion.

### Performance

Benchmarks measure the pure evaluator and the authenticated API using a cached snapshot. The release criterion is an API decision response under five seconds. The benchmark also records pure evaluation duration separately so database or rendering regressions remain distinguishable.

The milestone is complete only when unit, integration, coverage, build, and Playwright suites pass; every reference fixture matches its hand calculation; no verdict-category defect remains; and the cached-snapshot performance criterion passes.

## 14. Rollout and compatibility

Database changes are additive. Existing Milestone 1 snapshots are migrated by requiring obligation `budgetTreatment` during normalization; records without a confirmed value use `additional` and lower confidence when that ambiguity can affect the verdict. Existing demo behavior continues to use synthetic data.

No backfill manufactures historical decisions. The first decision is created only after valid rules and a usable snapshot exist. Formula and explanation versions make future changes reproducible without rewriting prior results.
