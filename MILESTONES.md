# Sochle MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, single-user product that produces a trustworthy affordability decision from an Amazon India, Flipkart, or Myntra product page in under five seconds when a fresh financial snapshot is available.

**Architecture:** Use a pnpm TypeScript monorepo with a Next.js web/API application and a WXT browser extension. Keep Fold access, normalization, persistence, and the pure decision engine behind explicit package boundaries; PostgreSQL stores encrypted connection references, normalized snapshots, corrections, rules, purchase intents, and immutable decision evidence.

**Tech stack:** TypeScript, pnpm workspaces, Next.js, React, WXT, PostgreSQL, Drizzle, Zod, Vitest, Playwright, GitHub Actions.

**Spec:** `SOCHLE_PRD.md`

## Global constraints

- The initial operating mode is one private user; no public Fold-backed access without Fold's written approval.
- Fold access is read-only, isolated behind an adapter, and replaceable without changing domain logic.
- Financial calculations are deterministic. AI may explain a result but may not calculate it.
- Fold tokens remain encrypted and server-side; extension content scripts never receive them.
- Raw tokens, account numbers, transaction narration, and full balances must not appear in logs.
- Financial snapshots, rules, and corrections remain usable during Fold outages and display their freshness.
- A verdict-category error is severity 1 and blocks release.
- Public demos use synthetic data only.
- P1 and P2 requirements stay out of the MVP unless an exit criterion explicitly promotes them.

## Initial product decisions

These defaults resolve PRD open questions for the first implementation and remain configurable where noted.

- Store the minimum liquidity buffer as an absolute INR amount. Months-of-expenses can be added after dogfooding.
- Treat parent-card outstanding as the card obligation; never add an add-on child card's shared statement again.
- Treat planned investments as goals, not hard debt obligations. Breaching them produces `requires_reducing_investments`.
- Default the large-purchase threshold to ₹10,000 and make it configurable.
- Show a passive extension control automatically on supported product pages; calculate only after user invocation.
- Rate snapshot confidence as high through 6 hours, medium through 24 hours, and low after 24 hours. Any source required by the calculation can lower the overall rating.
- Default the forecast horizon to the next configured salary date, capped at 30 days; allow an explicit custom date later.
- Exclude Fold accounts marked user-excluded, passively tracked, or pending from spendable liquidity and preserve the exclusion reason.
- Count “amount preserved” only for confirmed skipped purchases. Report delayed purchases separately.
- Expose synthetic values only in demo mode.

## Planned repository map

```text
apps/
  web/                 Authenticated UI, HTTP API, and manual purchase simulator
  extension/           WXT Manifest V3 extension and commerce-site adapters
packages/
  contracts/           Zod API contracts and shared public types
  domain/              Money types, forecasting, confidence, and verdict engine
  fold/                Fold MCP client, response schemas, and normalization
  db/                  Drizzle schema, migrations, repositories, and encryption boundary
  fixtures/            Sanitized Fold contracts and adversarial decision scenarios
docs/
  decisions/           Short architecture and security decision records
```

Dependency direction is `apps -> contracts/domain/fold/db`, `fold -> contracts/domain`, and `db -> domain`. The `domain` package must not import framework, database, MCP, UI, or model code.

---

## Milestone 0 — Repository and safety foundation

**Outcome:** The project installs, checks, tests, and runs against synthetic data without requiring real financial credentials.

**Files:**

- Create `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`
- Create `.github/workflows/ci.yml`
- Create the package and application directories from the planned repository map
- Create `docs/decisions/0001-system-boundaries.md`
- Create `docs/decisions/0002-financial-data-handling.md`

**Interfaces produced:**

- Workspace scripts: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`
- Environment contract containing database URL, token-encryption key, and Fold MCP endpoint without real values
- Demo-mode switch that selects synthetic fixtures and cannot fall through to real Fold data

### Work

- [x] Scaffold pnpm workspaces with `apps/web`, `apps/extension`, and the five shared packages.
- [x] Configure strict TypeScript, formatting, linting, Vitest, and consistent package scripts.
- [x] Scaffold the Next.js web app and WXT Manifest V3 extension with no product features.
- [x] Add PostgreSQL and Drizzle configuration; verify an empty migration applies to a disposable database.
- [x] Define the environment schema with Zod and fail startup when required secrets are absent outside demo/test mode.
- [x] Add a redacting structured logger and tests proving configured sensitive keys and nested values are removed.
- [x] Add synthetic demo fixtures containing no copied Fold values or identifiers.
- [x] Add CI for install, lint, typecheck, unit tests, build, dependency review, and secret scanning.
- [x] Record system boundaries and financial-data handling decisions in the two architecture notes.

**Verification:** A clean clone passes `pnpm install --frozen-lockfile && pnpm lint && pnpm typecheck && pnpm test && pnpm build`; demo mode boots without Fold credentials.

**Exit criterion:** The empty product is reproducible and CI prevents accidental secret or financial-payload leakage.

**Suggested commit:** `chore: establish project foundation`

---

## Milestone 1 — Financial foundation

**Outcome:** Sochle can authenticate to Fold, capture a normalized financial snapshot, reconcile its headline inputs, and explain exclusions or stale data.

**Files:**

- Create `packages/domain/src/financial-state.ts`
- Create `packages/fold/src/client.ts`, `schemas.ts`, `normalize.ts`, `sync.ts`
- Create `packages/db/src/schema/connections.ts`, `accounts.ts`, `transactions.ts`, `snapshots.ts`, `data-issues.ts`
- Create `apps/web/app/connections/page.tsx`, `apps/web/app/money-inbox/page.tsx`, `apps/web/app/api/fold/callback/route.ts`, `apps/web/app/api/sync/route.ts`
- Test in `packages/fold/src/*.test.ts`, `packages/db/src/*.test.ts`, and `packages/fixtures/fold/`

**Interfaces produced:**

```ts
type Money = { currency: "INR"; minor: number }; // safe integer paise

type NormalizedFinancialState = {
  asOf: string;
  liquidCash: Money;
  cardObligations: Money;
  upcomingObligations: Array<{ id: string; name: string; dueOn: string; amount: Money; certainty: "confirmed" | "estimated" }>;
  observedMonthlySpending: Money;
  reconciliation: Array<{ headline: "liquid_cash" | "card_obligations"; headlineMinor: number; projectedMinor: number; differenceMinor: number; status: "matched" | "mismatch" }>;
  sourceFreshness: Array<{ source: string; refreshedAt: string | null; status: "fresh" | "aging" | "stale" | "missing" }>;
  exclusions: Array<{ sourceId: string; reason: string }>;
};

interface FinancialDataProvider {
  sync(signal?: AbortSignal): Promise<NormalizedFinancialState>;
}
```

### Work

- [x] Implement the server-only remote MCP authorization callback and encrypt the stored authorization reference with an application-managed key.
- [x] Wrap every consumed Fold response in a local Zod contract before normalization.
- [x] Integrate `get_total_balance`, `list_bank_accounts`, `list_credit_cards`, `list_transactions`, `get_spending_summary`, `list_recurring_expenses`, and `list_upcoming_recurring_cycles`.
- [x] Add contextual ingestion for `get_net_worth`, `get_net_worth_history`, `get_mf_portfolio_summary`, and `get_stocks_portfolio_summary`; never count investments as spendable cash.
- [x] Implement cursor walking for transaction and recurring-expense tools with stable filters and idempotent upserts by provider/source ID.
- [x] Integrate `get_transaction` for on-demand Money Inbox evidence without sending additional raw history to the client.
- [x] Normalize INR values to integer minor units and preserve raw source timestamps and exclusion reasons.
- [x] Handle parent/child credit-card relationships without double-counting shared outstanding amounts.
- [x] Persist immutable snapshots and separately upsert current account/transaction projections.
- [x] Reconcile normalized liquid cash against Fold's total balance and card obligations against eligible parent-card outstanding.
- [x] Create data issues for material untagged transactions, suspected transfers, likely card repayments, and stale/missing required sources.
- [x] Build the Connections screen with connection state, manual sync, last success, last failure, and per-source freshness.
- [x] Build the initial Money Inbox for large untagged transactions with classify, exclude, and ignore-once actions stored as Sochle corrections.
- [x] Add single-flight automatic refresh with a configurable minimum interval defaulting to 60 minutes, exponential failure backoff, and no overlapping syncs.
- [x] Add cached-snapshot fallback that never labels cached data as current.
- [x] Capture sanitized response fixtures covering success, null fields, pending accounts, excluded accounts, add-on cards, pagination, and disconnected Fold.

**Verification:** Contract tests accept the sanitized live shapes already observed for balances, accounts, cards, spending, recurring expenses, and upcoming cycles. Re-running a sync creates no duplicate transactions; a Fold outage returns the last snapshot with an explicit freshness downgrade.

**Exit criterion:** The normalized snapshot reproduces Fold's relevant headline totals or records a specific, visible reconciliation difference for each mismatch.

**Suggested commits:**

- `feat: add secure Fold connection`
- `feat: normalize financial snapshots`
- `feat: surface financial data issues`

---

## Milestone 2 — Deterministic decision core

**Outcome:** A manually entered purchase receives an auditable technical, comfortable, and goal-compatible assessment without relying on an LLM.

**Files:**

- Create `packages/domain/src/rules.ts`, `forecast.ts`, `confidence.ts`, `verdict.ts`, `evaluate-purchase.ts`
- Create `packages/db/src/schema/rule-sets.ts`, `purchase-intents.ts`, `decisions.ts`, `audit-events.ts`
- Create `apps/web/app/today/page.tsx`, `apps/web/app/rules/page.tsx`, `apps/web/app/check/page.tsx`, `apps/web/app/decisions/page.tsx`, `apps/web/app/decisions/[id]/page.tsx`
- Create scenario fixtures in `packages/fixtures/scenarios/`

**Interfaces produced:**

```ts
type RuleSet = {
  version: number;
  minimumBuffer: Money;
  salary: { amount: Money; dayOfMonth: number };
  essentialMonthlySpending: Money;
  monthlyInvestmentTarget: Money;
  largePurchaseThreshold: Money;
  materiality: { absoluteCap: Money; purchaseRatioBps: 1000 };
  forecastHorizon:
    | { kind: "next_salary" }
    | { kind: "rolling_days"; days: number }
    | { kind: "custom"; endDate: string };
};

type Verdict =
  | "comfortably_affordable"
  | "affordable_with_tradeoffs"
  | "wait_until_payday"
  | "requires_reducing_investments"
  | "technically_possible_financially_tight"
  | "not_affordable"
  | "insufficient_confidence";

function evaluatePurchase(input: {
  price: Money;
  financialState: NormalizedFinancialState;
  rules: RuleSet;
  plannedPurchases: Array<{ id: string; dueOn: string; amount: Money }>;
  evaluatedAt: string;
}): DecisionResult;
```

### Work

- [ ] Implement versioned rule sets with validation for buffer, salary, salary day, essential spending, investment target, threshold, materiality, and horizon.
- [ ] Implement technical headroom as liquid cash minus immediate obligations minus purchase price.
- [ ] Implement comfortable headroom using expected income, confirmed obligations, minimum buffer, and purchase price within the horizon.
- [ ] Implement goal headroom using essential spending, planned investments, planned purchases, buffer, and purchase price.
- [ ] Implement a daily forecast that applies dated income and obligations in chronological order and returns the first comfortably affordable date.
- [ ] Calculate issue materiality as the lower of ₹5,000 and 10% of purchase price by default, using integer paise and basis points.
- [ ] Implement confidence from required-source freshness, unresolved material issues, assumption confirmation, and verdict sensitivity.
- [ ] Implement verdict precedence so insufficient confidence gates categorical financial advice before other copy is generated.
- [ ] Persist each decision with immutable calculation inputs, snapshot ID, rule-set version, formulas, intermediate values, exclusions, and confidence reasons.
- [ ] Build Rules, manual Check, and Decision Detail screens with a complete calculation breakdown.
- [ ] Build Today with liquid cash, obligations, safe-to-spend, freshness, and blocking issues.
- [ ] Build the Decisions list with status, verdict, price, confidence, and links to immutable detail.
- [ ] Add authenticated data export and deletion; deletion removes Fold authorization, normalized data, corrections, rules, decisions, and audit records.
- [ ] Generate explanation copy from versioned deterministic templates with Sochle's concise English-first Hinglish personality, varied by verdict and confidence; preserve factual labels and guardrails, and defer model-generated explanations until templates prove insufficient.
- [ ] Add table-driven tests for all seven verdicts and every boundary around zero headroom and the minimum buffer.
- [ ] Add adversarial cases for transfers, card repayments, salary timing, rent variance, refunds, stale sources, uncertain merchants, and duplicate equal-price charges.
- [ ] Benchmark the pure evaluation path and cached-snapshot API path.

**Verification:** The ₹45,000 reference purchase and at least ten adversarial fixtures have hand-calculated expected inputs, headroom values, confidence, verdict, and first-affordable date. Tests assert exact integer results and verdict precedence.

**Exit criterion:** A manual ₹45,000 scenario produces the correct, explainable verdict across the reference and adversarial fixtures, and a cached-snapshot decision completes in under five seconds.

**Suggested commits:**

- `feat: add versioned affordability rules`
- `feat: implement deterministic decision engine`
- `feat: add manual purchase simulator`

---

## Milestone 3 — Point-of-purchase extension

**Outcome:** A supported commerce page can produce and save a real Sochle decision without exposing financial data to the page.

**Files:**

- Create `apps/extension/src/adapters/types.ts`, `amazon-in.ts`, `flipkart.ts`, `myntra.ts`
- Create `apps/extension/src/content/index.tsx`, `background.ts`, `components/decision-card.tsx`
- Create `packages/contracts/src/purchases.ts`, `decisions.ts`
- Create `apps/web/app/api/purchase-intents/route.ts`, `apps/web/app/api/decisions/route.ts`
- Test with sanitized HTML fixtures in `apps/extension/test/fixtures/`

**Interfaces produced:**

```ts
type ExtractedProduct = {
  title: string;
  merchant: "amazon.in" | "flipkart.com" | "myntra.com";
  price: Money;
  canonicalUrl: string;
  confidence: "high" | "medium" | "low";
};

interface CommerceAdapter {
  matches(url: URL): boolean;
  extract(document: Document, url: URL): ExtractedProduct | null;
}
```

### Work

- [ ] Restrict Manifest V3 host permissions to Amazon India, Flipkart, Myntra, and the configured Sochle API origin.
- [ ] Implement locale-aware INR parsing using integer minor units; reject crossed-out MRP when a current sale price exists.
- [ ] Implement Amazon India extraction against saved product-page variants.
- [ ] Implement Flipkart extraction against saved product-page variants.
- [ ] Implement Myntra extraction against saved product-page variants.
- [ ] Observe dynamic page changes without repeatedly injecting controls or issuing calculations.
- [ ] Add a passive, dismissible Sochle control for products at or above the configured threshold.
- [ ] Add manual title and price correction before evaluation.
- [ ] Define authenticated extension-to-API messaging that sends product context and receives only the minimum decision-card payload.
- [ ] Build collapsed, expanded, loading, stale, low-confidence, unavailable, and error states for the decision card.
- [ ] Add save and outcome actions for `waiting`, `bought`, `skipped`, and `not_relevant`.
- [ ] Link the card to the full immutable decision detail in the web app.
- [ ] Add DOM fixture tests for sale price versus MRP, multiple sellers, comma formatting, missing prices, and dynamic updates.
- [ ] Add an end-to-end test from a local commerce fixture through evaluation to a persisted decision.

**Verification:** Automated extraction fixtures pass for all three merchants, content scripts contain no Fold credentials or full financial snapshots, and extension permissions contain no unrelated hosts.

**Exit criterion:** A live Amazon India, Flipkart, and Myntra product page can each produce a saved decision and open its audit detail end to end.

**Suggested commits:**

- `feat: extract supported commerce products`
- `feat: show purchase decision card`

---

## Milestone 4 — Personal beta and trust loop

**Outcome:** Sochle is useful enough to evaluate during four weeks of real personal use.

**Files:**

- Extend `apps/web/app/today/page.tsx`, `decisions/page.tsx`, and `money-inbox/page.tsx`
- Create `apps/web/app/weekly-review/page.tsx`
- Create `packages/domain/src/weekly-review.ts`, `issue-resolution.ts`
- Extend decision, data-issue, correction, and audit repositories in `packages/db`

**Interfaces produced:**

- Data-issue resolutions that create immutable corrections or persistent classification rules
- Immediate recalculation that creates a new decision version and retains the superseded result
- Weekly review with explicit metric definitions matching the PRD

### Work

- [ ] Extend Decisions with filters for waiting, bought, skipped, and not relevant plus outcome dates.
- [ ] Extend Money Inbox with investment, transfer, card-payment, refund, lending, and income classifications plus persistent rules.
- [ ] Recalculate affected decisions after a correction and preserve both versions in the audit trail.
- [ ] Add wait-until-payday saved state and show the first affordable date from the deterministic forecast.
- [ ] Generate an in-app weekly review for decisions, confirmed skipped amount, delayed purchases, upcoming obligations, safe-to-spend change, open issues, and inaccurate predictions.
- [ ] Track the PRD's personal success metrics without sending financial values to third-party analytics.
- [ ] Re-run export and deletion end-to-end checks against every schema added through this milestone.
- [ ] Run security checks for token leakage, log redaction, CSRF, callback validation, extension CSP, and host permissions.
- [ ] Dogfood for four weeks and record a written continue/pivot/stop decision against every success and failure threshold in the PRD.

**Verification:** End-to-end tests cover connect/sync/configure/check/save, resolve/recalculate, cached fallback, export, and deletion. Manual security review confirms no real financial values enter demo artifacts or analytics.

**Exit criterion:** Four weeks of dogfooding are complete and the PRD success metrics are reviewed in a written continue, pivot, or stop decision.

**Suggested commits:**

- `feat: add personal finance overview`
- `feat: close the data correction loop`
- `feat: add weekly decision review`

---

## Milestone 5 — Closed loop after MVP validation

**Outcome:** Purchase intent can be matched to a receipt, financial transaction, refund, and actual impact.

This milestone starts only after Milestone 4 produces a continue decision. It is not required for the first usable MVP.

**Files:**

- Create an isolated Gmail adapter package only after its authorization and privacy design is approved
- Create receipt, match-candidate, refund, and return-window persistence
- Extend purchase detail with intent-to-outcome timeline and predicted-versus-actual comparison

### Work

- [ ] Define the minimized Gmail permission scope and document retention/deletion before connecting an inbox.
- [ ] Parse receipt candidates into structured proposals without persisting unrelated message bodies.
- [ ] Score receipt-to-transaction candidates by amount, date, merchant, and identifiers; require confirmation below the high-confidence threshold.
- [ ] Link Fold refund groups and remaining refund amounts without counting refund credits as income.
- [ ] Track return windows and actual purchase outcomes.
- [ ] Compare predicted liquidity impact with the realized transaction sequence and surface material deviations.
- [ ] Validate at least three real purchases end to end using private data while keeping public artifacts synthetic.

**Exit criterion:** At least three purchases are traced from product intent through receipt, transaction, and any refund, with predicted-versus-actual impact visible and auditable.

**Suggested commit:** `feat: connect purchase intent to outcomes`

---

## Release gates

The private MVP may be considered complete only when all of these are true:

- [ ] Milestones 0–3 exit criteria pass; Milestone 4 dogfooding can then begin.
- [ ] Every formula, verdict boundary, confidence transition, and source-normalization branch has deterministic tests.
- [ ] A fresh-snapshot decision has median end-to-end latency below five seconds.
- [ ] Fold unavailability returns a labelled cached result or refuses a verdict; it never fabricates current data.
- [ ] Amazon India, Flipkart, and Myntra extraction pass saved variants and live smoke tests.
- [ ] Tokens and raw financial payloads are absent from browser bundles, logs, analytics, fixtures, and public demos.
- [ ] Data export and deletion are tested.
- [ ] No P1/P2 feature has displaced work required for the point-of-purchase decision.

## Fold feasibility notes from 17 August 2026

Privacy-conscious live calls succeeded for `get_total_balance`, `list_bank_accounts`, `list_credit_cards`, `get_spending_summary`, `list_recurring_expenses`, and `list_upcoming_recurring_cycles`.

Planning implications:

- Balance, bank-account, and card responses expose freshness timestamps; spending and recurring responses do not consistently do so. Snapshot freshness must therefore be tracked per source and inherit the sync attempt timestamp only when the provider omits a source timestamp.
- Recurring expenses are paginated while upcoming cycles are range-based; the adapter must treat them as separate datasets.
- Credit-card add-on relationships explicitly require parent-only aggregation for shared dues.
- Spending summaries already expose included and excluded account inventories, so Sochle should preserve these rather than recomputing inclusion silently.
- Live MCP access proves data retrieval in this environment, not the application's remote authorization, encrypted token lifecycle, or production availability. Those remain Milestone 1 gates.
