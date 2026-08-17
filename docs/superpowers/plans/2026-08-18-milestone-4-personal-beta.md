# Milestone 4 Personal Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the local trust loop required to begin four weeks of private Sochle dogfooding.

**Architecture:** Add owner-scoped persistence/service boundaries for issue correction and decision lineage, retain the current status API as the lifecycle boundary, and calculate weekly review content in a pure domain module. The web UI reads only projected owner data; no third-party analytics or financial-value telemetry is introduced.

**Tech Stack:** TypeScript, Next.js, Drizzle/PostgreSQL, Zod, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-18-milestone-4-personal-beta-design.md`

## Global Constraints

- Existing decisions remain immutable; recalculation creates a linked successor.
- All data is owner- and connection-scoped.
- No credentials, raw financial data, or analytics leave the local app.
- Unit, integration, E2E, build, and security gates must pass before marking implementation ready for dogfooding.

---

### Task 1: Define weekly-review and lifecycle contracts

**Files:**

- Create: `packages/domain/src/weekly-review.ts`, `packages/domain/src/weekly-review.test.ts`
- Modify: `packages/domain/src/index.ts`, `packages/contracts/src/purchases.ts`

- [ ] Write failing pure tests for week boundaries, skipped totals, planned/waiting counts, unresolved issues, safe-to-spend delta, and PRD metric progress.
- [ ] Implement typed `buildWeeklyReview(input)` using integer minor units and explicit week boundaries.
- [ ] Add schemas for a planned purchase date and review response; reject invalid status/date combinations.
- [ ] Run `pnpm vitest run --project unit packages/domain/src/weekly-review.test.ts` and commit `feat: define personal beta review contracts`.

### Task 2: Persist issue corrections and immutable successor decisions

**Files:**

- Modify: `packages/db/src/repository.ts`, `packages/db/src/decision-repository.ts`
- Modify: `packages/db/src/repository.integration.test.ts`, `packages/db/src/decision-repository.integration.test.ts`
- Modify: `apps/web/lib/server/decision-service.ts`

- [ ] Write integration tests proving a resolved issue creates an immutable correction/audit event and that recalculation appends a successor decision without changing the original.
- [ ] Add owner-scoped correction/rule lookup and decision-lineage repository methods.
- [ ] Implement the service that loads current snapshot/rules, re-evaluates affected intent, and appends a successor decision.
- [ ] Run focused integration tests and commit `feat: recalculate decisions after corrections`.

### Task 3: Build purchase planning and history filters

**Files:**

- Modify: `apps/web/app/api/purchase-intents/[id]/status/route.ts`
- Modify: `apps/web/app/decisions/page.tsx`, `apps/web/app/decisions/[id]/page.tsx`, `apps/web/app/decisions/[id]/status-form.tsx`
- Modify: corresponding unit/integration/E2E tests

- [ ] Write failing tests for promotion of waiting/considering to planned with a valid date and rejection of invalid transitions.
- [ ] Add repository/service transition support and audit events.
- [ ] Render status filters, planned/outcome dates, and a default date from the stored first-affordable forecast result.
- [ ] Run focused tests and commit `feat: plan waiting purchases`.

### Task 4: Extend Money Inbox correction UX

**Files:**

- Modify: `apps/web/app/money-inbox/page.tsx`, `apps/web/app/api/issues/[id]/route.ts`
- Modify: correction route/service tests and E2E coverage

- [ ] Write failing tests for supported classifications and explicit reusable-rule opt-in.
- [ ] Implement validated owner action handling, issue resolution, and successor decision recalculation.
- [ ] Render classification actions and recalculation result without exposing raw provider payloads.
- [ ] Run focused integration/E2E tests and commit `feat: close the money inbox correction loop`.

### Task 5: Add local weekly review and dogfooding metrics

**Files:**

- Create: `apps/web/app/weekly-review/page.tsx`
- Modify: database/service tests, navigation, export/deletion tests, `docs/TESTING.md`, `MILESTONES.md`, `README.md`

- [ ] Write failing tests for owner-scoped weekly-review inputs and export/deletion of new persisted records.
- [ ] Implement the review query/service/page and PRD-target progress display from local persisted data only.
- [ ] Document the required four-week manual dogfooding report as an external remaining gate.
- [ ] Run focused tests and commit `feat: add local weekly decision review`.

### Task 6: Full verification and handoff

- [ ] Run `pnpm format`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`, `pnpm test:integration`, `pnpm test:coverage`, `pnpm build`, `pnpm test:extension-security`, and `pnpm e2e` sequentially.
- [ ] Inspect `git diff --check` and ensure local instruction files, build artifacts, and real financial data are not staged.
- [ ] Commit the quality gate and push `main`.
- [ ] Record automated results and the four-week dogfooding/report requirement in the handoff.
