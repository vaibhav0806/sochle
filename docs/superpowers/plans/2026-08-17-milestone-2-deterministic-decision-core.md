# Milestone 2 Deterministic Decision Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a manual purchase flow that returns and persists a deterministic, explainable affordability verdict from a cached financial snapshot in under five seconds.

**Architecture:** Extend the normalized financial contract with explicitly budgeted obligations and expected income, then implement all money maths as pure functions in `@sochle/domain`. Add append-oriented decision schemas and a focused `DecisionRepository`, while Next.js server routes orchestrate authentication, cached data loading, persistence, export, and deletion. Server-rendered pages display immutable decision evidence and versioned Sochle personality copy.

**Tech Stack:** TypeScript 5.9, pnpm workspaces, Zod 4, Vitest 4, PostgreSQL 17, Drizzle ORM, Next.js 16 App Router, React 19, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-17-deterministic-decision-core-design.md`

## Global Constraints

- Execute inline because the user explicitly requested no subagents.
- Use test-driven development: observe the intended failure before each implementation.
- Store and calculate INR as safe integer paise; reject fractional paise and unsupported currency.
- Keep evaluation pure: no clock, environment, database, network, or Fold access inside `packages/domain`.
- Pass `evaluatedAt` explicitly and use ISO calendar dates for forecast logic.
- Limit every forecast horizon to 30 calendar days.
- Reserve one full essential-spending amount and one full investment target per evaluation.
- Treat ambiguous obligation budget treatment as `additional` and lower confidence if it can alter the verdict.
- Gate every low-confidence result to `insufficient_confidence` while preserving the financial verdict in the audit bundle.
- Keep copy deterministic, versioned, English-first Hinglish, and factual; never use playful copy to soften uncertainty or a negative verdict.
- Use the existing private single-owner session. Do not introduce multi-user identity or authorization tables.
- Push `main` after every task commit, preserving the user's requested continuous GitHub backup.
- Persist exact snapshot, rule version, inputs, formulas, intermediate values, exclusions, confidence evidence, and rendered template with every immutable decision.
- Never log or export Fold tokens, full account numbers, or raw transaction narration.
- Use only synthetic values in tests and artifacts.
- Real Fold OAuth and remote revocation remain manual external checks; CI tests local encrypted authorization removal with a fake/local boundary.
- A verdict-category defect blocks completion.

## File Map

### Domain and normalization

- Modify `packages/domain/package.json`: add Zod.
- Modify `packages/domain/src/financial-state.ts`: add expected income and obligation budget treatment.
- Modify `packages/domain/src/index.ts`: export decision-core interfaces.
- Create `packages/domain/src/rules.ts`: rule schema, defaults, horizon resolution.
- Create `packages/domain/src/forecast.ts`: headrooms, cash events, daily forecast.
- Create `packages/domain/src/verdict.ts`: financial verdict precedence.
- Create `packages/domain/src/confidence.ts`: materiality, freshness, sensitivity confidence.
- Create `packages/domain/src/explanations.ts`: versioned Sochle voice templates.
- Create `packages/domain/src/evaluate-purchase.ts`: orchestration and serializable result.
- Create adjacent `*.test.ts` files for every executable domain module.
- Modify `packages/fold/src/normalize.ts` and `packages/fold/src/normalize.test.ts`: emit conservative budget treatment and empty expected income.
- Modify normalized-state literals in existing DB, Fold, and E2E tests.
- Modify `vitest.config.ts`: include `packages/domain/src/**/*.ts` in coverage.

### Scenarios

- Create `packages/fixtures/src/scenarios/decision-scenarios.ts`: the ₹45,000 reference case and twelve hand-calculated adversarial cases.
- Create `packages/fixtures/src/scenarios/decision-scenarios.test.ts`: assert every fixture through the public evaluator.
- Modify `packages/fixtures/src/index.ts`: export scenario fixtures.

### Persistence

- Create `packages/db/src/schema/rule-sets.ts`.
- Create `packages/db/src/schema/purchase-intents.ts`.
- Create `packages/db/src/schema/decisions.ts`.
- Create `packages/db/src/schema/audit-events.ts`.
- Modify `packages/db/src/schema/common.ts` and `packages/db/src/schema/index.ts`.
- Generate `packages/db/drizzle/0003_decision-core.sql` and `packages/db/drizzle/meta/0003_snapshot.json`; update the Drizzle journal.
- Create `packages/db/src/decision-repository.ts`.
- Create `packages/db/src/decision-repository.integration.test.ts`.
- Modify `packages/db/src/index.ts`.

### Web

- Modify `apps/web/package.json`: add direct `@sochle/domain` dependency.
- Modify `apps/web/lib/server/database.ts`: expose the focused decision repository.
- Create `apps/web/lib/money.ts` and `apps/web/lib/money.test.ts`: exact INR form parsing and formatting.
- Create `apps/web/lib/server/decision-service.ts` and `apps/web/lib/server/decision-service.integration.test.ts`.
- Create `apps/web/lib/server/data-deletion.ts` and `apps/web/lib/server/data-deletion.integration.test.ts`.
- Create `apps/web/app/api/rules/route.ts`.
- Create `apps/web/app/api/decisions/route.ts`.
- Create `apps/web/app/api/purchase-intents/[id]/status/route.ts`.
- Create `apps/web/app/api/export/route.ts`.
- Create `apps/web/app/api/delete/route.ts`.
- Create `apps/web/app/rules/page.tsx`.
- Create `apps/web/app/check/page.tsx`.
- Create `apps/web/app/today/page.tsx`.
- Create `apps/web/app/decisions/page.tsx`.
- Create `apps/web/app/decisions/[id]/page.tsx`.
- Modify `apps/web/app/layout.tsx` and `apps/web/app/globals.css`.

### End-to-end and standards

- Modify `e2e/test-data.ts` to seed a fresh snapshot and active rules.
- Create `e2e/decision-core.e2e.ts`.
- Modify `playwright.config.ts` to include the decision-core live test.
- Modify `docs/TESTING.md` with the Milestone 2 coverage matrix.

---

### Task 1: Extend the normalized financial contract and validate rules

**Files:**

- Modify: `packages/domain/package.json`
- Modify: `packages/domain/src/financial-state.ts`
- Create: `packages/domain/src/rules.ts`
- Test: `packages/domain/src/rules.test.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/fold/src/normalize.ts`
- Test: `packages/fold/src/normalize.test.ts`
- Modify: `packages/db/src/repository.integration.test.ts`
- Modify: `e2e/test-data.ts`
- Modify: `vitest.config.ts`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: existing `Money`, `NormalizedFinancialState`, and Fold normalization.
- Produces: `ExpectedIncome`, budget-aware `UpcomingObligation`, `RuleSet`, `validateRuleSet(input, referenceDate)`, `resolveForecastHorizon(rules, evaluatedAt)`, and `nextSalaryDate(salaryDay, afterDate)`.

- [ ] **Step 1: Write failing rule and normalization tests**

```ts
it("clamps salary day 31 to the end of February", () => {
  expect(nextSalaryDate(31, "2027-02-01")).toBe("2027-02-28");
});

it("rejects horizons longer than 30 days", () => {
  expect(() =>
    validateRuleSet(
      {
        ...validRules,
        forecastHorizon: { kind: "rolling_days", days: 31 },
      },
      "2026-08-17"
    )
  ).toThrow("Forecast horizon must be at most 30 days");
});

it("marks imported recurring obligations as additional by default", () => {
  const state = normalizeFoldSnapshot(coreResponses, syncedAt);
  expect(state.upcomingObligations[0]?.budgetTreatment).toBe("additional");
  expect(state.expectedIncome).toEqual([]);
});
```

- [ ] **Step 2: Run the focused tests and observe the contract failures**

Run: `pnpm vitest run packages/domain/src/rules.test.ts packages/fold/src/normalize.test.ts`

Expected: FAIL because `rules.ts`, `budgetTreatment`, and `expectedIncome` do not exist.

- [ ] **Step 3: Implement the contract and validation**

Add Zod `^4.3.5` to `@sochle/domain` and define:

```ts
export type ExpectedIncome = {
  amount: Money;
  certainty: "confirmed" | "estimated";
  dueOn: string;
  id: string;
  name: string;
  source: "salary" | "other";
};

export type UpcomingObligation = {
  amount: Money;
  budgetTreatment: "inside_essential_budget" | "additional";
  certainty: "confirmed" | "estimated";
  dueOn: string;
  id: string;
  name: string;
  source: "credit_card" | "recurring_expense";
};
```

Add `expectedIncome: ExpectedIncome[]` to `NormalizedFinancialState`. Make Fold normalization return `expectedIncome: []` and `budgetTreatment: "additional"`. Update every existing typed state literal.

In `rules.ts` export:

```ts
export const DEFAULT_RULES: Omit<RuleSet, "version"> = {
  minimumBuffer: { currency: "INR", minor: 50_000_00 },
  salary: { amount: { currency: "INR", minor: 0 }, confirmed: false, dayOfMonth: 1 },
  essentialMonthlySpending: { currency: "INR", minor: 0 },
  monthlyInvestmentTarget: { currency: "INR", minor: 0 },
  largePurchaseThreshold: { currency: "INR", minor: 10_000_00 },
  materiality: {
    absoluteCap: { currency: "INR", minor: 5_000_00 },
    purchaseRatioBps: 1_000,
  },
  forecastHorizon: { kind: "next_salary" },
};

export function validateRuleSet(input: unknown, referenceDate: string): RuleSet;
export function nextSalaryDate(dayOfMonth: number, afterDate: string): string;
export function resolveForecastHorizon(rules: RuleSet, evaluatedAt: string): string;
```

Use UTC calendar construction and Zod refinements for positive version, safe integer paise, salary day 1–31, materiality 0–10,000 bps, and a maximum 30-day horizon relative to `referenceDate`. `evaluatePurchase` validates stored rules again against its explicit evaluation date so an expired custom horizon fails safely.

- [ ] **Step 4: Run tests, typecheck, and coverage**

Run: `pnpm vitest run packages/domain/src/rules.test.ts packages/fold/src/normalize.test.ts && pnpm typecheck && pnpm test:coverage`

Expected: PASS, with domain executable files included in coverage.

- [ ] **Step 5: Commit**

```bash
git add packages/domain packages/fold/src/normalize.ts packages/fold/src/normalize.test.ts packages/db/src/repository.integration.test.ts e2e/test-data.ts vitest.config.ts pnpm-lock.yaml
git commit -m "feat: define decision rules and financial inputs"
```

---

### Task 2: Implement exact headrooms and the daily forecast

**Files:**

- Create: `packages/domain/src/forecast.ts`
- Test: `packages/domain/src/forecast.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `RuleSet`, `Money`, `ExpectedIncome`, and `UpcomingObligation` from Task 1.
- Produces: `calculateHeadrooms(input): Headrooms` and `buildDailyForecast(input): DailyForecast`.

- [ ] **Step 1: Write failing formula and date-order tests**

```ts
it("does not double count an obligation inside the essential reserve", () => {
  const result = calculateHeadrooms({
    liquidCashMinor: 150_000_00,
    expectedIncomeMinor: 0,
    confirmedObligationsMinor: 30_000_00,
    additionalObligationsMinor: 10_000_00,
    essentialSpendingMinor: 40_000_00,
    investmentTargetMinor: 20_000_00,
    minimumBufferMinor: 25_000_00,
    plannedPurchasesMinor: 5_000_00,
    purchasePriceMinor: 45_000_00,
    immediateObligationsMinor: 30_000_00,
  });

  expect(result).toEqual({
    technicalMinor: 75_000_00,
    comfortableMinor: 50_000_00,
    goalMinor: 5_000_00,
  });
});

it("evaluates same-day salary and rent only after both are applied", () => {
  const forecast = buildDailyForecast(forecastInputWithSameDaySalaryAndRent);
  expect(forecast.days.find((day) => day.date === "2026-08-31")).toMatchObject({
    endingCashMinor: 120_000_00,
    candidateComfortableHeadroomMinor: 50_000_00,
  });
});
```

- [ ] **Step 2: Run the forecast tests and observe the missing module**

Run: `pnpm vitest run packages/domain/src/forecast.test.ts`

Expected: FAIL because `calculateHeadrooms` and `buildDailyForecast` do not exist.

- [ ] **Step 3: Implement pure integer calculations**

Export these stable shapes:

```ts
export type Headrooms = {
  comfortableMinor: number;
  goalMinor: number;
  technicalMinor: number;
};

export type ForecastDay = {
  candidateComfortableHeadroomMinor: number;
  date: string;
  endingCashMinor: number;
  events: ForecastEvent[];
  goalAvailableMinor: number;
};

export type DailyForecast = {
  days: ForecastDay[];
  firstComfortablyAffordableDate: string | null;
  minimumCashDate: string;
  minimumCashMinor: number;
};
```

Validate all arithmetic operands with `Number.isSafeInteger` before and after addition/subtraction. Group events by date, sort groups by ISO date, apply the whole group before computing balances, exclude future income from candidate headroom until its date, and decrement the remaining essential reserve when an `inside_essential_budget` obligation is paid.

- [ ] **Step 4: Run forecast tests and domain typecheck**

Run: `pnpm vitest run packages/domain/src/forecast.test.ts && pnpm --filter @sochle/domain typecheck`

Expected: PASS for zero boundaries, same-day grouping, reserve exhaustion, month-end salary, minimum cash, and `null` first-affordable date.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/forecast.ts packages/domain/src/forecast.test.ts packages/domain/src/index.ts
git commit -m "feat: calculate affordability forecast"
```

---

### Task 3: Implement verdicts, confidence, and Sochle personality copy

**Files:**

- Create: `packages/domain/src/verdict.ts`
- Test: `packages/domain/src/verdict.test.ts`
- Create: `packages/domain/src/confidence.ts`
- Test: `packages/domain/src/confidence.test.ts`
- Create: `packages/domain/src/explanations.ts`
- Test: `packages/domain/src/explanations.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

- Consumes: `Headrooms` and forecast dates from Task 2.
- Produces: `selectFinancialVerdict`, `materialityThresholdMinor`, `assessConfidence`, and `buildExplanation`.

- [ ] **Step 1: Write failing precedence, boundary, and tone tests**

```ts
it.each([
  ["payday wins before a horizon-positive goal", paydayInput, "wait_until_payday"],
  [
    "zero goal headroom is comfortable",
    { ...base, goalHeadroomMinor: 0 },
    "comfortably_affordable",
  ],
  ["investment reduction is isolated", investmentInput, "requires_reducing_investments"],
  ["buffer survives with another compromised goal", tradeoffInput, "affordable_with_tradeoffs"],
  ["cash exists but buffer breaks", tightInput, "technically_possible_financially_tight"],
  ["cash cannot cover it", unaffordableInput, "not_affordable"],
])("%s", (_name, input, expected) => {
  expect(selectFinancialVerdict(input)).toBe(expected);
});

it("gates a material ambiguity to low confidence", () => {
  expect(
    assessConfidence({
      baseVerdict: "comfortably_affordable",
      evaluatedAt: "2026-08-17T12:00:00.000Z",
      issues: [{ id: "issue-1", effect: null, label: "Unknown debit" }],
      sources: freshRequiredSources,
      assumptionsConfirmed: true,
    }).level
  ).toBe("low");
});

it("keeps low-confidence copy protective", () => {
  const copy = buildExplanation(lowConfidenceInput);
  expect(copy.headline).toBe("Pehle data sort karte hain, phir decision.");
  expect(copy.reason).toContain("Unknown debit");
  expect(copy.headline).not.toMatch(/fits|affordable|go for it/i);
});
```

- [ ] **Step 2: Run tests and observe missing decision modules**

Run: `pnpm vitest run packages/domain/src/verdict.test.ts packages/domain/src/confidence.test.ts packages/domain/src/explanations.test.ts`

Expected: FAIL because the three modules do not exist.

- [ ] **Step 3: Implement the public types and ordered rules**

```ts
export type FinancialVerdict = Exclude<Verdict, "insufficient_confidence">;

export function selectFinancialVerdict(input: {
  comfortableHeadroomMinor: number;
  currentComfortableHeadroomMinor: number;
  firstComfortablyAffordableDate: string | null;
  goalHeadroomMinor: number;
  investmentTargetMinor: number;
  nextSalaryDate: string;
  technicalHeadroomMinor: number;
}): FinancialVerdict;

export type DecisionIssue = {
  effect: { maxMinor: number; minMinor: number } | null;
  id: string;
  label: string;
};

export function materialityThresholdMinor(
  priceMinor: number,
  absoluteCapMinor: number,
  purchaseRatioBps: number
): number;

export function assessConfidence(input: ConfidenceInput): ConfidenceAssessment;
export function buildExplanation(input: ExplanationInput): DecisionExplanation;
```

Use exact precedence from the spec. Freshness boundaries are `<= 6h` high, `> 6h && <= 24h` medium, and `> 24h` low. An issue is material at threshold equality or when its min/max endpoint changes the financial verdict; when the rounded threshold is zero, require a non-zero or unknown effect rather than treating a proven zero-effect issue as material. Evaluate each bounded issue and the combined minimum/maximum endpoints, so several individually small ambiguities cannot collectively change a verdict unnoticed. Store `templateVersion: 1` and fixed IDs such as `high.comfortably_affordable.v1` and `low.insufficient_confidence.v1`.

The required freshness set is `total_balance`, `bank_accounts`, `credit_cards`, `transactions`, `recurring_expenses`, and `upcoming_recurring_cycles`. Sources used only for context—net worth, stocks, and mutual funds—do not lower an affordability decision because their balances are never counted as spendable cash.

- [ ] **Step 4: Run all focused tests**

Run: `pnpm vitest run packages/domain/src/verdict.test.ts packages/domain/src/confidence.test.ts packages/domain/src/explanations.test.ts`

Expected: PASS for six financial branches, low-confidence gating inputs, 6h/24h boundaries, materiality equality, a zero-paise threshold for purchases below ₹0.10, unbounded issues, and copy guardrails.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/verdict.ts packages/domain/src/verdict.test.ts packages/domain/src/confidence.ts packages/domain/src/confidence.test.ts packages/domain/src/explanations.ts packages/domain/src/explanations.test.ts packages/domain/src/index.ts
git commit -m "feat: add verdict confidence and voice"
```

---

### Task 4: Compose the evaluator and prove the reference scenarios

**Files:**

- Create: `packages/domain/src/evaluate-purchase.ts`
- Test: `packages/domain/src/evaluate-purchase.test.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/fixtures/src/scenarios/decision-scenarios.ts`
- Test: `packages/fixtures/src/scenarios/decision-scenarios.test.ts`
- Modify: `packages/fixtures/src/index.ts`

**Interfaces:**

- Consumes: all pure functions from Tasks 1–3.
- Produces: `evaluatePurchase(input): DecisionResult` and `decisionScenarios`.

- [ ] **Step 1: Write the failing ₹45,000 reference fixture and test**

```ts
import { evaluatePurchase } from "@sochle/domain";

import { decisionScenarios } from "./decision-scenarios";

it("reproduces the hand-calculated ₹45,000 reference decision", () => {
  const referencePurchase = decisionScenarios.find(
    (scenario) => scenario.id === "reference-purchase-45000"
  );
  if (referencePurchase === undefined) throw new Error("Reference scenario missing");
  const result = evaluatePurchase(referencePurchase.input);

  expect(referencePurchase.expected.headrooms).toEqual({
    technicalMinor: 75_000_00,
    comfortableMinor: 50_000_00,
    goalMinor: 5_000_00,
  });
  expect(result.headrooms).toEqual(referencePurchase.expected.headrooms);
  expect(result.financialVerdict).toBe(referencePurchase.expected.financialVerdict);
  expect(result.confidence.level).toBe(referencePurchase.expected.confidence);
  expect(result.verdict).toBe(referencePurchase.expected.verdict);
  expect(result.formulaVersion).toBe(1);
});
```

- [ ] **Step 2: Run the evaluator test and observe the missing entry point**

Run: `pnpm vitest run packages/fixtures/src/scenarios/decision-scenarios.test.ts`

Expected: FAIL because `evaluatePurchase` does not exist.

- [ ] **Step 3: Implement orchestration and immutable output**

```ts
export type EvaluatePurchaseInput = {
  dataIssues: DecisionIssue[];
  evaluatedAt: string;
  financialState: NormalizedFinancialState;
  plannedPurchases: PlannedPurchase[];
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

export function evaluatePurchase(input: EvaluatePurchaseInput): DecisionResult;
```

Derive confirmed salary recurrence, expected income, immediate/confirmed/additional obligations, exclusions, and planned purchases once. Exclude estimated income and obligations from arithmetic and add an unconfirmed-assumption reason that makes confidence low. Reconcile `cardObligations` against dated card obligations by source ID; count any positive undated remainder once as an immediate additional obligation and add an unknown-timing confidence issue. When a normalized confirmed salary event matches the configured salary date and amount, use the normalized event and omit the generated recurrence. When date/amount suggests a possible duplicate but does not match exactly, include neither twice: retain the normalized event, add an unbounded duplicate-income issue, and let confidence gate the result. Run sensitivity by applying each bounded issue endpoint to liquid cash and reusing `selectFinancialVerdict`. Deep-copy serializable inputs into the result and never mutate the caller's objects.

- [ ] **Step 4: Add and run all hand-calculated scenarios**

Add evaluator-local tests for invalid price, expired custom horizon, safe-integer overflow, caller-input immutability, salary de-duplication, and an undated card remainder. Expand the fixture file with twelve named scenarios from the spec: self-transfer, parent/add-on card, same-day salary, short-month salary, rent variance, matched refund, stale source, uncertain merchant below/at threshold, duplicate equal-price charges, essential versus additional obligation, investment-only compromise, and planned-purchase trade-off.

Run: `pnpm vitest run packages/domain/src/evaluate-purchase.test.ts packages/fixtures/src/scenarios/decision-scenarios.test.ts`

Expected: PASS with exact integer intermediate values, headrooms, confidence, verdict, and first-affordable date for every scenario.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/evaluate-purchase.ts packages/domain/src/evaluate-purchase.test.ts packages/domain/src/index.ts packages/fixtures/src/scenarios packages/fixtures/src/index.ts
git commit -m "feat: compose deterministic purchase evaluation"
```

---

### Task 5: Add append-oriented decision schemas and migration

**Files:**

- Modify: `packages/db/src/schema/common.ts`
- Create: `packages/db/src/schema/rule-sets.ts`
- Create: `packages/db/src/schema/purchase-intents.ts`
- Create: `packages/db/src/schema/decisions.ts`
- Create: `packages/db/src/schema/audit-events.ts`
- Modify: `packages/db/src/schema/index.ts`
- Generate: `packages/db/drizzle/0003_decision-core.sql`
- Generate: `packages/db/drizzle/meta/0003_snapshot.json`
- Modify: `packages/db/drizzle/meta/_journal.json`
- Test: `packages/db/src/decision-repository.integration.test.ts`

**Interfaces:**

- Consumes: `RuleSet` and `DecisionResult` from `@sochle/domain`.
- Produces: Drizzle tables `ruleSets`, `purchaseIntents`, `decisions`, and `auditEvents`.

- [ ] **Step 1: Write a failing schema integration test**

```ts
it("enforces one rule version per connection and immutable decision evidence", async () => {
  const connection = await financialRepository.ensureConnection("fold");
  await database.db.insert(ruleSets).values({
    connectionId: connection.id,
    rules: validRules,
    version: 1,
  });

  await expect(
    database.db.insert(ruleSets).values({
      connectionId: connection.id,
      rules: validRules,
      version: 1,
    })
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run the integration test and observe missing tables**

Run: `pnpm test:integration -- packages/db/src/decision-repository.integration.test.ts`

Expected: FAIL because the decision-core schemas are not exported.

- [ ] **Step 3: Define schemas and generate the migration**

Use `bigint({ mode: "number" })` for paise, `jsonb` typed with domain interfaces, and cascading `connectionId` foreign keys. Define:

```ts
export const decisionVerdict = pgEnum("decision_verdict", [
  "comfortably_affordable",
  "affordable_with_tradeoffs",
  "wait_until_payday",
  "requires_reducing_investments",
  "technically_possible_financially_tight",
  "not_affordable",
  "insufficient_confidence",
]);

export const purchaseIntentStatus = pgEnum("purchase_intent_status", [
  "considering",
  "planned",
  "purchased",
  "skipped",
]);
```

Store full `rules` JSON on rule versions and full `DecisionResult` plus exact input JSON in `decisions.auditBundle`. Purchase intents contain nullable `plannedFor` as a calendar-date column; it is required by application validation when status is `planned`. Add unique indexes on `(connectionId, version)` and an index for newest decisions by connection. Do not add update timestamps to decisions.

Run: `pnpm --filter @sochle/db db:generate -- --name=decision-core`

Inspect `0003_decision-core.sql` and verify all foreign keys and delete actions.

- [ ] **Step 4: Migrate a clean PostgreSQL database and rerun the schema test**

Run: `docker compose up -d && pnpm --filter @sochle/db db:migrate && pnpm test:integration -- packages/db/src/decision-repository.integration.test.ts`

Expected: PASS and the migration applies from `0000` through `0003` without manual SQL.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema packages/db/drizzle packages/db/src/decision-repository.integration.test.ts
git commit -m "feat: add decision audit schema"
```

---

### Task 6: Implement rule and decision persistence

**Files:**

- Create: `packages/db/src/decision-repository.ts`
- Test: `packages/db/src/decision-repository.integration.test.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**

- Consumes: tables from Task 5 and domain evaluation output from Task 4.
- Produces: `DecisionRepository` methods used by all web tasks.

- [ ] **Step 1: Write failing repository behavior tests**

```ts
it("creates an intent and its first immutable decision atomically", async () => {
  const saved = await repository.createPurchaseDecision({
    auditBundle,
    connectionId,
    description: "Synthetic headphones",
    priceMinor: 45_000_00,
    result,
    ruleSetId,
    snapshotId,
  });

  expect(saved.intent.status).toBe("considering");
  expect(saved.decision.auditBundle.result.headrooms.goalMinor).toBe(5_000_00);
  await expect(repository.getDecision(connectionId, saved.decision.id)).resolves.toMatchObject({
    id: saved.decision.id,
  });
});

it("recalculation appends and does not mutate the old decision", async () => {
  const second = await repository.appendDecision({ ...nextInput, previousDecisionId: first.id });
  expect(second.previousDecisionId).toBe(first.id);
  await expect(repository.getDecision(connectionId, first.id)).resolves.toMatchObject({
    auditBundle: first.auditBundle,
  });
});
```

- [ ] **Step 2: Run the focused integration tests**

Run: `pnpm test:integration -- packages/db/src/decision-repository.integration.test.ts`

Expected: FAIL because `DecisionRepository` does not exist.

- [ ] **Step 3: Implement the focused repository**

```ts
export class DecisionRepository {
  constructor(private readonly db: SochleDatabase) {}

  createRuleSet(connectionId: string, rules: RuleSet): Promise<RuleSetRow>;
  getActiveRuleSet(connectionId: string): Promise<RuleSetRow | null>;
  createPurchaseDecision(input: CreatePurchaseDecisionInput): Promise<{
    decision: DecisionRow;
    intent: PurchaseIntentRow;
  }>;
  appendDecision(input: AppendDecisionInput): Promise<DecisionRow>;
  getDecision(connectionId: string, decisionId: string): Promise<DecisionDetail | null>;
  listDecisions(connectionId: string): Promise<DecisionSummary[]>;
  listPlannedPurchases(connectionId: string): Promise<PlannedPurchase[]>;
  updateIntentStatus(
    connectionId: string,
    intentId: string,
    status: PurchaseIntentStatus,
    plannedFor: string | null
  ): Promise<{ latestDecisionId: string }>;
  createAuditEvent(input: NewAuditEvent): Promise<void>;
  exportOwnerData(connectionId: string): Promise<OwnerExport>;
  deleteOwnerData(connectionId: string): Promise<void>;
}
```

Use one transaction for intent + decision + creation audit. `listPlannedPurchases` returns all `planned` intents with a non-null `plannedFor` and maps `plannedFor` to `dueOn`; the pure evaluator filters them to its resolved horizon. Scope every lookup and mutation by `connectionId`. `deleteOwnerData` inserts `deletion_initiated` and then deletes the connection in the same transaction, relying on explicit cascades to remove credentials and all user-owned rows.

- [ ] **Step 4: Run repository integration tests**

Run: `pnpm test:integration -- packages/db/src/decision-repository.integration.test.ts`

Expected: PASS for rule versions, atomic creation, immutable recalculation, status audit, connection scoping, export secret exclusion, and complete cascading deletion.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/decision-repository.ts packages/db/src/decision-repository.integration.test.ts packages/db/src/index.ts
git commit -m "feat: persist immutable purchase decisions"
```

---

### Task 7: Add server orchestration and authenticated mutation routes

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/lib/server/database.ts`
- Create: `apps/web/lib/money.ts`
- Test: `apps/web/lib/money.test.ts`
- Create: `apps/web/lib/server/decision-service.ts`
- Test: `apps/web/lib/server/decision-service.integration.test.ts`
- Create: `apps/web/app/api/rules/route.ts`
- Create: `apps/web/app/api/decisions/route.ts`
- Create: `apps/web/app/api/purchase-intents/[id]/status/route.ts`

**Interfaces:**

- Consumes: `FinancialRepository`, `DecisionRepository`, and `evaluatePurchase`.
- Produces: `DecisionPrerequisiteError`, `toDecisionIssue`, `createDecisionService()` with `checkPurchase` and `getTodaySummary`, exact rupee parsing, and authenticated POST routes.

- [ ] **Step 1: Write failing parsing and service integration tests**

```ts
it.each([
  ["45000", 45_000_00],
  ["45000.50", 45_000_50],
  ["0.01", 1],
])("parses %s without floating point", (input, expected) => {
  expect(parseRupeesToMinor(input)).toBe(expected);
});

it.each(["0", "-1", "1.001", "₹45,000", "abc"])("rejects %s", (input) => {
  expect(() => parseRupeesToMinor(input)).toThrow();
});

it("evaluates from the latest cached snapshot and persists the exact result", async () => {
  const saved = await service.checkPurchase({
    connectionId,
    description: "Synthetic headphones",
    evaluatedAt: "2026-08-17T12:00:00.000Z",
    priceMinor: 45_000_00,
  });
  expect(saved.result.inputs.snapshotId).toBe(snapshotId);
  expect(saved.decision.auditBundle.result).toEqual(saved.result);
});
```

- [ ] **Step 2: Run tests and observe missing helpers**

Run: `pnpm vitest run apps/web/lib/money.test.ts && pnpm test:integration -- apps/web/lib/server/decision-service.integration.test.ts`

Expected: FAIL because parsing and decision orchestration are absent.

- [ ] **Step 3: Implement the service and routes**

Add `@sochle/domain: "workspace:*"` to the web package. Reuse one database client and expose both repositories.

```ts
export function createDecisionService(
  financialRepository: FinancialRepository,
  decisionRepository: DecisionRepository
) {
  return {
    async checkPurchase(input: {
      connectionId: string;
      description: string;
      evaluatedAt: string;
      priceMinor: number;
    }): Promise<SavedDecision> {
      const [snapshot, ruleSet, openIssues] = await Promise.all([
        financialRepository.getLatestSnapshot(input.connectionId),
        decisionRepository.getActiveRuleSet(input.connectionId),
        financialRepository.listOpenIssues(input.connectionId),
      ]);
      if (snapshot === null) throw new DecisionPrerequisiteError("snapshot");
      if (ruleSet === null) throw new DecisionPrerequisiteError("rules");

      const result = evaluatePurchase({
        dataIssues: openIssues.map(toDecisionIssue),
        evaluatedAt: input.evaluatedAt,
        financialState: snapshot.state,
        plannedPurchases: await decisionRepository.listPlannedPurchases(input.connectionId),
        price: { currency: "INR", minor: input.priceMinor },
        rules: ruleSet.rules,
        snapshotId: snapshot.id,
      });
      const saved = await decisionRepository.createPurchaseDecision({
        auditBundle: { input: result.inputs, result },
        connectionId: input.connectionId,
        description: input.description,
        priceMinor: input.priceMinor,
        result,
        ruleSetId: ruleSet.id,
        snapshotId: snapshot.id,
      });
      return { ...saved, result };
    },
  };
}
```

`toDecisionIssue` accepts bounded endpoints only when `details.liquidityEffectMinMinor` and `details.liquidityEffectMaxMinor` are safe integers; otherwise it sets `effect: null` so ambiguity cannot manufacture confidence. Routes must call `isOwnerAuthenticated()` before parsing data, return 401 when absent, 400 for invalid inputs, 409 for missing rules/snapshot, and redirect with 303 only through `SOCHLE_APP_URL`. The rule route assigns `version = active.version + 1` server-side. The intent-status route accepts only `considering`, `planned`, `purchased`, or `skipped`; `planned` requires a valid `plannedFor` date no more than 365 days ahead, while every other status clears `plannedFor`.

`getTodaySummary(connectionId, evaluatedAt)` loads the same snapshot, rules, issues, and planned purchases, calls the shared headroom/forecast inputs with a zero candidate price, and returns `safeToSpendMinor = Math.max(0, goalHeadroomBeforePurchase)` without running purchase materiality or persisting a decision.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `pnpm vitest run apps/web/lib/money.test.ts && pnpm test:integration -- apps/web/lib/server/decision-service.integration.test.ts && pnpm --filter @sochle/web typecheck`

Expected: PASS, including stale snapshot, blocking issue, missing prerequisite, and exact stored-result cases.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/lib apps/web/app/api/rules apps/web/app/api/decisions apps/web/app/api/purchase-intents
git commit -m "feat: orchestrate manual purchase checks"
```

---

### Task 8: Build Rules and manual Check screens

**Files:**

- Create: `apps/web/app/rules/page.tsx`
- Create: `apps/web/app/check/page.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `e2e/test-data.ts`
- Test: `e2e/decision-core.e2e.ts`
- Modify: `playwright.config.ts`

**Interfaces:**

- Consumes: authenticated routes from Task 7.
- Produces: owner-facing rule configuration and manual decision creation.

- [ ] **Step 1: Write the failing browser journey**

```ts
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { resetLiveDatabase, seedDecisionDatabase } from "./test-data";

test.beforeEach(seedDecisionDatabase);
test.afterEach(resetLiveDatabase);

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Owner password").fill("synthetic-owner-password");
  await page.getByRole("button", { name: "Continue" }).click();
}

async function createReferenceDecision(page: Page) {
  await loginOwner(page);
  await page.goto("/rules");
  await page.getByLabel("Minimum buffer").fill("25000");
  await page.getByLabel("Monthly salary").fill("0");
  await page.getByLabel("Salary confirmed").check();
  await page.getByLabel("Salary day").fill("31");
  await page.getByLabel("Essential monthly spending").fill("40000");
  await page.getByLabel("Monthly investment target").fill("25000");
  await page.getByLabel("Large purchase threshold").fill("10000");
  await page.getByLabel("Materiality cap").fill("5000");
  await page.getByLabel("Materiality ratio").fill("10");
  await page.getByLabel("Forecast horizon").selectOption("rolling_days");
  await page.getByLabel("Forecast days").fill("30");
  await page.getByRole("button", { name: "Save rules" }).click();
  await page.goto("/check");
  await page.getByLabel("What are you considering?").fill("Synthetic headphones");
  await page.getByLabel("Price").fill("45000");
  await page.getByRole("button", { name: "Sochle" }).click();
}

test("decision pages and mutations require the owner session", async ({ page }) => {
  await page.goto("/check");
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (
      await page.request.post("/api/rules", {
        form: { minimumBuffer: "25000" },
        maxRedirects: 0,
      })
    ).status()
  ).toBe(401);
  expect(
    (
      await page.request.post("/api/decisions", {
        form: { description: "Synthetic headphones", price: "45000" },
        maxRedirects: 0,
      })
    ).status()
  ).toBe(401);
});

test("owner configures rules and checks a ₹45,000 purchase", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/rules");
  await page.getByLabel("Minimum buffer").fill("25000");
  await page.getByLabel("Monthly salary").fill("100000");
  await page.getByLabel("Salary confirmed").check();
  await page.getByLabel("Salary day").fill("31");
  await page.getByLabel("Essential monthly spending").fill("40000");
  await page.getByLabel("Monthly investment target").fill("20000");
  await page.getByLabel("Large purchase threshold").fill("10000");
  await page.getByLabel("Materiality cap").fill("5000");
  await page.getByLabel("Materiality ratio").fill("10");
  await page.getByLabel("Forecast horizon").selectOption("rolling_days");
  await page.getByLabel("Forecast days").fill("30");
  await page.getByRole("button", { name: "Save rules" }).click();

  await page.goto("/check");
  await page.getByLabel("What are you considering?").fill("Synthetic headphones");
  await page.getByLabel("Price").fill("45000");
  await page.getByRole("button", { name: "Sochle" }).click();
  await expect(page).toHaveURL(/\/decisions\/[0-9a-f-]+$/);
  await expect(page.getByText("Haan, this fits.")).toBeVisible();
});
```

- [ ] **Step 2: Build and run the live E2E test to observe missing pages**

Run: `pnpm build && pnpm exec playwright test e2e/decision-core.e2e.ts --project=live-chromium`

Expected: FAIL with 404 for `/rules`.

- [ ] **Step 3: Implement server-rendered forms**

Add `seedDecisionDatabase` beside the existing Money Inbox seed. It uses a fresh synthetic `asOf` timestamp, ₹1,50,000 liquid cash, ₹30,000 of confirmed obligations (₹20,000 inside the essential budget and ₹10,000 additional), fresh required sources, and no open issues. Keep `seedLiveDatabase` unchanged so the existing Money Inbox test retains its blocking issue.

Both pages call `requireOwnerPage()`. Rules displays the active version and posts minimum buffer, salary amount/day/confirmation, essential spending, investment target, large-purchase threshold, materiality cap/ratio, and horizon controls to `/api/rules`. Check shows snapshot timestamp and active rule version, posts description and price to `/api/decisions`, and explains missing prerequisites without creating a decision.

Add `Today`, `Check`, `Rules`, and `Decisions` links to the existing navigation. Add only shared form-grid, metric-grid, badge, negative-value, and table styles needed by Milestone 2. Change the live Playwright project's matcher to `/(?:live|decision-core)\.e2e\.ts/` so this file runs only against the authenticated server.

- [ ] **Step 4: Run the focused E2E test**

Run: `pnpm build && pnpm exec playwright test e2e/decision-core.e2e.ts --project=live-chromium -g "configures rules"`

Expected: PASS and the resulting detail URL remains stable after reload.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/rules apps/web/app/check apps/web/app/layout.tsx apps/web/app/globals.css e2e/test-data.ts e2e/decision-core.e2e.ts playwright.config.ts
git commit -m "feat: add rules and manual purchase flow"
```

---

### Task 9: Build Today, Decisions, and immutable Decision Detail

**Files:**

- Create: `apps/web/app/today/page.tsx`
- Create: `apps/web/app/decisions/page.tsx`
- Create: `apps/web/app/decisions/[id]/page.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `e2e/decision-core.e2e.ts`

**Interfaces:**

- Consumes: domain intermediates and repository reads from Tasks 4 and 6.
- Produces: read-only current summary, decision history, and full stored evidence.

- [ ] **Step 1: Extend E2E with failing evidence assertions**

```ts
test("Today and history expose the stored decision evidence", async ({ page }) => {
  await createReferenceDecision(page);
  await page.goto("/today");
  await expect(page.getByText("Safe to spend")).toBeVisible();
  await expect(page.getByText("₹50,000.00")).toBeVisible();

  await page.goto("/decisions");
  await page.getByRole("link", { name: "Synthetic headphones" }).click();
  await expect(page.getByText("Technical headroom")).toBeVisible();
  await expect(page.getByText("Comfortable headroom")).toBeVisible();
  await expect(page.getByText("Goal headroom")).toBeVisible();
  await expect(page.getByText("Formula v1")).toBeVisible();

  const plannedFor = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  await page.getByLabel("Purchase status").selectOption("planned");
  await page.getByLabel("Planned for").fill(plannedFor);
  await page.getByRole("button", { name: "Update status" }).click();
  await page.reload();
  await expect(page.getByLabel("Purchase status")).toHaveValue("planned");
  await expect(page.getByLabel("Planned for")).toHaveValue(plannedFor);
});
```

- [ ] **Step 2: Run the focused E2E and observe 404 failures**

Run: `pnpm build && pnpm exec playwright test e2e/decision-core.e2e.ts --project=live-chromium -g "Today and history"`

Expected: FAIL because the three read pages do not exist.

- [ ] **Step 3: Implement read-only evidence pages**

Today loads the latest snapshot and rules, derives safe-to-spend from the same shared headroom inputs without creating a zero-price decision, and displays freshness/blockers. Decisions lists status, final verdict, price, confidence, evaluation timestamp, and detail link. Detail scopes the lookup to the Fold connection and renders only `decision.auditBundle`: canonical verdict, confidence badge, Sochle headline/reason/action, all three headrooms, first-affordable date, formula/rule/snapshot versions, inputs, exclusions, confidence reasons, and daily forecast.

Add a status form on detail that posts status plus an accessible `Planned for` date input to `/api/purchase-intents/[id]/status`. Show the date input only for planning in the UI, while the server independently enforces it. Do not recalculate when rendering detail.

- [ ] **Step 4: Run focused E2E and accessibility selectors**

Run: `pnpm build && pnpm exec playwright test e2e/decision-core.e2e.ts --project=live-chromium -g "Today and history"`

Expected: PASS before and after a page reload, with negative money values visually marked and every status/confidence exposed as text.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/today apps/web/app/decisions apps/web/app/globals.css e2e/decision-core.e2e.ts
git commit -m "feat: show decision history and evidence"
```

---

### Task 10: Add authenticated export and complete local deletion

**Files:**

- Create: `apps/web/app/api/export/route.ts`
- Create: `apps/web/app/api/delete/route.ts`
- Modify: `apps/web/app/today/page.tsx`
- Create: `apps/web/lib/server/data-deletion.ts`
- Test: `apps/web/lib/server/data-deletion.integration.test.ts`
- Test: `packages/db/src/decision-repository.integration.test.ts`
- Test: `e2e/decision-core.e2e.ts`

**Interfaces:**

- Consumes: `DecisionRepository.exportOwnerData` and `deleteOwnerData`.
- Produces: authenticated JSON download, `AuthorizationRevoker` capability boundary, and explicit destructive confirmation flow.

- [ ] **Step 1: Write failing integration and E2E tests**

```ts
it("exports decisions but no encrypted authorization", async () => {
  const exported = await repository.exportOwnerData(connectionId);
  expect(exported.decisions).toHaveLength(1);
  expect(JSON.stringify(exported)).not.toMatch(/encryptedAuthorization|accessToken|refreshToken/);
});

it("preserves local data when a supported remote revocation fails", async () => {
  const revoker: AuthorizationRevoker = {
    revoke: async () => {
      throw new Error("Synthetic provider failure");
    },
  };

  await expect(
    deleteOwnerData({ connectionId, decisionRepository: repository, revoker })
  ).rejects.toThrow("Synthetic provider failure");
  await expect(financialRepository.getConnection("fold")).resolves.not.toBeNull();
});

test("owner exports then deletes every local record", async ({ page }) => {
  await createReferenceDecision(page);
  const exportResponse = await page.request.get("/api/export");
  expect(exportResponse.status()).toBe(200);
  expect(await exportResponse.json()).toMatchObject({ schemaVersion: 1 });

  const rejected = await page.request.post("/api/delete", {
    form: { confirmation: "delete" },
  });
  expect(rejected.status()).toBe(400);

  await page.goto("/today");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete all my data" }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1$/);
});

test("export and deletion reject an anonymous request", async ({ page }) => {
  expect((await page.request.get("/api/export")).status()).toBe(401);
  expect(
    (
      await page.request.post("/api/delete", {
        form: { confirmation: "DELETE" },
        maxRedirects: 0,
      })
    ).status()
  ).toBe(401);
});
```

- [ ] **Step 2: Run tests and observe missing routes**

Run: `pnpm test:integration -- packages/db/src/decision-repository.integration.test.ts apps/web/lib/server/data-deletion.integration.test.ts && pnpm build && pnpm exec playwright test e2e/decision-core.e2e.ts --project=live-chromium -g "exports then deletes"`

Expected: FAIL because `/api/export` and `/api/delete` do not exist.

- [ ] **Step 3: Implement secure export and deletion**

Export authenticates first, creates an `export_created` audit event, then returns `application/json` with `Content-Disposition: attachment`. It includes normalized state, corrections, rules, intents, decisions, and audit events, but never connection credential columns or raw transaction narration.

Define the capability boundary and call it before any local deletion:

```ts
export type AuthorizationRevoker = {
  revoke(connectionId: string): Promise<void>;
};

export async function deleteOwnerData(input: {
  connectionId: string;
  decisionRepository: DecisionRepository;
  revoker: AuthorizationRevoker | null;
}): Promise<void> {
  await input.revoker?.revoke(input.connectionId);
  await input.decisionRepository.deleteOwnerData(input.connectionId);
}
```

Deletion authenticates first, requires exact `DELETE`, calls `deleteOwnerData`, clears `sochle_owner` only after success, and redirects to `/login?deleted=1`. Because the current Fold adapter has no remote-revocation capability, the production route passes `revoker: null` and describes the result as local credential removal; do not claim remote authorization was revoked. Tests inject both successful and failing supported revokers.

- [ ] **Step 4: Run integration and browser deletion checks**

Run: `pnpm test:integration -- packages/db/src/decision-repository.integration.test.ts apps/web/lib/server/data-deletion.integration.test.ts && pnpm build && pnpm exec playwright test e2e/decision-core.e2e.ts --project=live-chromium -g "exports then deletes"`

Expected: PASS; direct DB assertions show zero connections, snapshots, issues, corrections, rules, intents, decisions, and audit events after deletion.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/export apps/web/app/api/delete apps/web/app/today/page.tsx apps/web/lib/server/data-deletion.ts apps/web/lib/server/data-deletion.integration.test.ts packages/db/src/decision-repository.integration.test.ts e2e/decision-core.e2e.ts
git commit -m "feat: export and delete owner data"
```

---

### Task 11: Prove performance and run the Milestone 2 quality gate

**Files:**

- Modify: `apps/web/lib/server/decision-service.integration.test.ts`
- Modify: `packages/fixtures/src/scenarios/decision-scenarios.test.ts`
- Modify: `docs/TESTING.md`
- Modify: `MILESTONES.md`

**Interfaces:**

- Consumes: the complete Milestone 2 implementation.
- Produces: cached-path timing evidence, acceptance mapping, and completed milestone checklist.

- [ ] **Step 1: Add cached-path performance regression assertions**

```ts
it("creates a cached-snapshot decision in under five seconds", async () => {
  const startedAt = performance.now();
  await service.checkPurchase(referenceRequest);
  const elapsedMs = performance.now() - startedAt;

  expect(elapsedMs).toBeLessThan(5_000);
});

it("keeps pure evaluation comfortably below the API budget", () => {
  const startedAt = performance.now();
  for (let index = 0; index < 1_000; index += 1) {
    evaluatePurchase(referencePurchase.input);
  }
  expect(performance.now() - startedAt).toBeLessThan(1_000);
});
```

- [ ] **Step 2: Run performance and all decision-core tests**

Run: `pnpm vitest run packages/domain/src packages/fixtures/src/scenarios && pnpm test:integration -- packages/db/src/decision-repository.integration.test.ts apps/web/lib/server/decision-service.integration.test.ts`

Expected: PASS with the cached database path below 5,000 ms and 1,000 pure evaluations below 1,000 ms on the CI runner. If timing is noisy, diagnose the measured boundary; do not increase the five-second product limit.

- [ ] **Step 3: Complete the testing matrix and milestone checklist**

Add a Milestone 2 matrix to `docs/TESTING.md` mapping rules, headrooms, forecast, confidence, verdicts, personality copy, persistence, export/deletion, and cached performance to unit/integration/E2E tests. Check only Milestone 2 items demonstrably covered by passing tests. Record real Fold authorization/revocation as manual external verification.

- [ ] **Step 4: Run the entire clean quality gate**

Run:

```bash
pnpm --filter @sochle/db db:migrate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:coverage
pnpm build
pnpm e2e
git diff --check
```

Expected: every command exits 0; coverage remains at least 80% statements, 75% branches, 80% functions, and 80% lines globally, with new executable modules at least 90% lines and 85% branches.

- [ ] **Step 5: Inspect for secrets and real financial data**

Run: `git diff --check; git grep -nE "(access[_-]?token|refresh[_-]?token|account_number)" -- ':!pnpm-lock.yaml'`

Expected: only field names, redaction rules, and explicitly synthetic test tokens appear; no real credentials, account numbers, narrations, or balances are present.

- [ ] **Step 6: Commit and push the completed milestone**

```bash
git add docs/TESTING.md MILESTONES.md apps/web/lib/server/decision-service.integration.test.ts packages/fixtures/src/scenarios/decision-scenarios.test.ts
git commit -m "test: complete milestone 2 quality gate"
git push origin main
```

Record the final command results, test counts, coverage percentages, performance timings, commit hash, and the manual Fold external-verification caveat in the handoff.
