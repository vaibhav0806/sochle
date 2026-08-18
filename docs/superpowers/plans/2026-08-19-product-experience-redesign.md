# Sochle Product Experience Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For this repository, use `superpowers:executing-plans` because the owner requested no subagents.

**Goal:** Replace Sochle's implementation-shaped web and extension UI with a calm, qualitative purchase-decision experience that hides financial-system internals while preserving deterministic calculations and audit evidence.

**Architecture:** Keep `@sochle/domain`, persistence, and decision immutability unchanged. Add a server-owned presentation layer that converts stored `DecisionResult` and daily-position data into stable user-facing models; the web renders those models directly and the extension receives the same model through its existing authenticated API. Roll out the redesign as independently testable milestones: vocabulary, shell, core web journey, extension, history/settings, and release hardening.

**Tech Stack:** TypeScript 5.9, Next.js 16 App Router, React 19, WXT Manifest V3, plain CSS with design tokens, Zod, Vitest, Testing Library, PostgreSQL integration tests, Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-08-19-product-experience-redesign-design.md`

## Global Constraints

- Do not change affordability formulas, verdict precedence, stored audit bundles, or decision immutability.
- Preserve direct URLs for `/today`, `/rules`, `/connections`, `/money-inbox`, and `/weekly-review`.
- Primary navigation contains Home, Check, Decisions, and Settings only.
- Normal journeys never display raw enum names, source identifiers, UUIDs, snapshot IDs, formula versions, rule versions, reconciliation terminology, normalization terminology, confidence grades, JSON, or generic uncaught-error prefixes.
- Fold is named only where the owner connects, authorizes, refreshes, or disconnects the provider.
- Home uses a qualitative headline; no large spending-room amount becomes the hero or a spending target.
- Use Geist Sans and Noto Sans Devanagari. Bundle extension font assets locally and make no remote extension font requests.
- Use the approved light and dark tokens from the spec. Content surfaces use 16px radii, compact controls 10px, and primary/outcome actions pill radii.
- Adapt only interaction patterns that materially improve a specified flow. Do not add Tailwind solely for BeUI and do not add GSAP to product surfaces.
- Motion animates only transform and opacity, communicates state, and has a tested reduced-motion fallback.
- Touch targets are at least 44px, all controls have visible focus, and status is never conveyed through color alone.
- Every milestone uses test-first development and passes its targeted unit, integration, and E2E tests before commit.
- Do not stage or modify the owner's unrelated `apps/web/next-env.d.ts`, `apps/web/AGENTS.md`, or `apps/web/CLAUDE.md` changes unless the owner explicitly asks.

---

## Milestone UX0: Presentation boundary and vocabulary

### Task 1: Define stable user-facing presentation contracts

**Files:**

- Create: `packages/contracts/src/presentation.ts`
- Create: `packages/contracts/src/presentation.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `packages/contracts/src/browser.ts`

**Interfaces:**

- Consumes: existing verdict strings and ISO dates.
- Produces: `DecisionTone`, `DecisionPresentation`, `DecisionMathsRow`, `decisionPresentationSchema`, `decisionToneSchema`, and `forbiddenPrimaryTerms`.

- [ ] **Step 1: Write the failing schema tests**

```ts
import { describe, expect, it } from "vitest";

import {
  decisionPresentationSchema,
  decisionToneSchema,
  forbiddenPrimaryTerms,
} from "./presentation";

describe("decision presentation contract", () => {
  it.each(["comfortable", "tradeoff", "wait", "tight", "no", "needs-input"])(
    "accepts the %s tone",
    (tone) => expect(decisionToneSchema.parse(tone)).toBe(tone)
  );

  it("rejects internal vocabulary in primary copy", () => {
    for (const term of forbiddenPrimaryTerms) {
      expect(() =>
        decisionPresentationSchema.parse({
          consequence: `Internal ${term}`,
          mathsRows: [],
          recencyLabel: "Updated recently",
          suggestedAction: null,
          title: "A clear answer",
          tone: "comfortable",
        })
      ).toThrow();
    }
  });
});
```

- [ ] **Step 2: Run the contract test and confirm the missing-module failure**

Run: `pnpm exec vitest run packages/contracts/src/presentation.test.ts`

Expected: FAIL because `./presentation` does not exist.

- [ ] **Step 3: Implement the presentation schema**

```ts
import { z } from "zod";

export const forbiddenPrimaryTerms = [
  "bufferHeadroom",
  "buffer headroom",
  "confidence",
  "financialVerdict",
  "financial verdict",
  "formulaVersion",
  "formula version",
  "projectedLiquidity",
  "projected liquidity",
  "reconciliation",
  "snapshotId",
  "snapshot id",
  "sourceFreshness",
  "source freshness",
  "total_balance",
] as const;

const primaryCopySchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .superRefine((value, context) => {
    const normalized = value.toLowerCase();
    for (const term of forbiddenPrimaryTerms) {
      if (normalized.includes(term.toLowerCase())) {
        context.addIssue({ code: "custom", message: `Primary copy exposes ${term}` });
      }
    }
  });

export const decisionToneSchema = z.enum([
  "comfortable",
  "tradeoff",
  "wait",
  "tight",
  "no",
  "needs-input",
]);
export type DecisionTone = z.infer<typeof decisionToneSchema>;

export const decisionMathsRowSchema = z.object({
  label: primaryCopySchema,
  value: z.string().trim().min(1).max(100),
});
export type DecisionMathsRow = z.infer<typeof decisionMathsRowSchema>;

export const decisionPresentationSchema = z
  .object({
    consequence: primaryCopySchema,
    mathsRows: z.array(decisionMathsRowSchema).max(4),
    recencyLabel: primaryCopySchema,
    suggestedAction: primaryCopySchema.nullable(),
    title: primaryCopySchema,
    tone: decisionToneSchema,
  })
  .strict();
export type DecisionPresentation = z.infer<typeof decisionPresentationSchema>;
```

Export these names from both public contract entrypoints.

- [ ] **Step 4: Run the contract tests**

Run: `pnpm exec vitest run packages/contracts/src/presentation.test.ts packages/contracts/src/extension-contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contract**

```bash
git add packages/contracts/src/presentation.ts packages/contracts/src/presentation.test.ts packages/contracts/src/index.ts packages/contracts/src/browser.ts
git commit -m "feat: define decision presentation contract"
```

### Task 2: Translate decision and daily-position data once on the server

**Files:**

- Create: `apps/web/lib/presentation/decision.ts`
- Create: `apps/web/lib/presentation/decision.test.ts`
- Create: `apps/web/lib/presentation/today.ts`
- Create: `apps/web/lib/presentation/today.test.ts`
- Create: `apps/web/lib/presentation/status.ts`
- Create: `apps/web/lib/presentation/status.test.ts`
- Modify: `apps/web/lib/server/decision-service.ts`
- Modify: `apps/web/lib/server/decision-service.integration.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**

- Consumes: `DecisionResult`, an explicit `TodayPresentationInput` projected from `createDecisionService().getTodaySummary()`, and `PurchaseStatus`.
- Produces: `presentDecision(result): DecisionPresentation`, `presentToday(summary): TodayPresentation`, `purchaseStatusLabel(status): string`, and `relativeUpdateLabel(evaluatedAt, now): string`.

- [ ] **Step 1: Write failing decision-mapping tests for every verdict**

Use the existing synthetic decision scenarios to build one `DecisionResult` per verdict and assert this exact title map:

```ts
const titles = {
  comfortably_affordable: "Yes, this fits comfortably.",
  affordable_with_tradeoffs: "This fits, with one trade-off.",
  wait_until_payday: "Better to wait a little.",
  requires_reducing_investments: "This fits, but it moves one goal.",
  technically_possible_financially_tight: "This would make things too tight.",
  not_affordable: "This doesn't fit right now.",
  insufficient_confidence: "We need one detail first.",
} as const;
```

Also flatten `title`, `consequence`, `suggestedAction`, `recencyLabel`, and every maths label, then assert that none contains any `forbiddenPrimaryTerms` value.

- [ ] **Step 2: Write failing daily-position and status tests**

```ts
it.each([
  [5_000_00, 25_000_00, false, "comfortable", "You're in a comfortable spot today."],
  [0, 25_000_00, true, "tradeoff", "You have room, but one plan needs attention."],
  [0, -1, false, "tight", "Today looks a little tight."],
])(
  "maps the daily position without using the amount as a headline",
  (safe, goal, blocked, tone, title) => {
    expect(
      presentToday({
        committedMinor: 20_000_00,
        goalHeadroomMinor: goal,
        hasBlockingIssue: blocked,
        minimumBufferMinor: 25_000_00,
        safeToSpendMinor: safe,
      })
    ).toMatchObject({
      title,
      tone,
    });
  }
);

it.each([
  ["considering", "Considering"],
  ["waiting", "Waiting"],
  ["planned", "Planned"],
  ["purchased", "Bought"],
  ["skipped", "Passed"],
  ["not_relevant", "Not relevant"],
])("labels %s as %s", (status, label) => expect(purchaseStatusLabel(status)).toBe(label));
```

- [ ] **Step 3: Run the presentation tests and confirm they fail**

Run: `pnpm exec vitest run apps/web/lib/presentation`

Expected: FAIL because the modules do not exist.

- [ ] **Step 4: Implement the translators**

`presentDecision` must:

- select the approved title and tone from `result.verdict`;
- describe the protected consequence without copying `result.explanation`;
- use `result.firstComfortablyAffordableDate` only for the wait action;
- format at most four maths rows as `After this purchase`, `Buffer kept aside`, `Commitments already covered`, and `Better buying date`;
- map fresh data to `Updated recently`, aging data to `Based on your latest available picture`, and blocking stale/missing data to `Update needed`;
- never return a raw confidence reason or source identifier.

`presentToday` must return:

```ts
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
```

The three fact labels are exactly `Comfortable to spend`, `Already committed`, and `Safety buffer protected`.

Extend `getTodaySummary()` with `minimumBufferMinor: ruleSet.rules.minimumBuffer.minor`. Add an integration assertion for that value so Home never reconstructs the protected buffer from unrelated headroom values.

- [ ] **Step 5: Add presentation modules to coverage and run focused coverage**

Add `apps/web/lib/presentation/**/*.ts` to `coverage.include`.

Run: `pnpm exec vitest run --coverage apps/web/lib/presentation`

Expected: PASS with at least 90% lines and 85% branches in each changed executable module.

- [ ] **Step 6: Run UX0 gates and commit**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:coverage
pnpm build
pnpm test:extension-security
pnpm e2e
```

Expected: all PASS.

```bash
git add apps/web/lib/presentation apps/web/lib/server/decision-service.ts apps/web/lib/server/decision-service.integration.test.ts vitest.config.ts
git commit -m "feat: translate decisions for product surfaces"
```

---

## Milestone UX1: Visual foundation and app shell

### Task 3: Build tokens, primitives, and the four-item navigation

**Files:**

- Create: `apps/web/app/_components/app-shell.tsx`
- Create: `apps/web/app/_components/primary-navigation.tsx`
- Create: `apps/web/app/_components/stateful-action.tsx`
- Create: `apps/web/app/_components/stateful-action.test.tsx`
- Create: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: Next App Router pathname and React action pending state.
- Produces: `AppShell`, `PrimaryNavigation`, and `StatefulAction` shared by later web tasks.

- [ ] **Step 1: Read the installed Next.js 16 guidance before changing layout**

Run: `rg -l "usePathname|Root Layout" apps/web/node_modules/next/dist/docs node_modules/next/dist/docs | head -20`

Read the matching App Router layout and client-hook guides completely. Do not rely on older Next.js conventions.

- [ ] **Step 2: Record the implementation design preflight**

Before producing React code, record a `<design_plan>` in the implementation commentary confirming:

- calm premium decision companion;
- design variance 5, motion 4, density 4;
- qualitative hero, compact navigation, flat grouping, selective cards;
- cream/forest/rust palette in both color schemes;
- no giant spending-room number, bento dashboard, gradient decoration, or gratuitous motion.

- [ ] **Step 3: Add local fonts and web component-test dependencies, then write the failing primitive test**

Add `@fontsource-variable/geist` and `@fontsource-variable/noto-sans-devanagari` as web dependencies. Add `@testing-library/dom`, `@testing-library/react`, and `happy-dom` as web dev dependencies. Import the two font packages from the root layout so Next bundles them and no runtime font request is required.

```tsx
// @vitest-environment happy-dom
it("announces loading and preserves a useful label", () => {
  render(<StatefulAction pending>Does this fit?</StatefulAction>);
  const button = screen.getByRole<HTMLButtonElement>("button", { name: "Checking…" });
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
});
```

Run: `pnpm exec vitest run apps/web/app/_components/stateful-action.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 4: Implement the tokens and shell**

Define the spec's exact light/dark colors as CSS custom properties. Add semantic variables for canvas, surface, text, muted text, action, accent, positive, caution, negative, border, overlay shadow, radii, and focus ring. Use `@media (prefers-color-scheme: dark)` and `@media (prefers-reduced-motion: reduce)`.

`PrimaryNavigation` contains exactly:

```ts
const items = [
  { href: "/", label: "Home" },
  { href: "/check", label: "Check" },
  { href: "/decisions", label: "Decisions" },
  { href: "/settings", label: "Settings" },
] as const;
```

Use `usePathname()` only in `primary-navigation.tsx`. Keep `layout.tsx` server-rendered and load Geist plus Noto Sans Devanagari through the installed Next font API. `AppShell` renders a skip link, header, navigation, and content slot.

- [ ] **Step 5: Implement the Settings index**

Render four plain navigation rows:

- My guardrails → `/rules`
- Connected account and browser → `/connections`
- Privacy and data → `/settings/privacy`
- Technical details → `/settings/technical`

Do not expose provider or diagnostic language on the Settings index.

- [ ] **Step 6: Add navigation E2E coverage**

Update `e2e/decision-core.e2e.ts` so the owner-navigation test asserts the four primary links, opens Settings, and confirms each Settings row. Preserve direct-route smoke checks for all old URLs.

- [ ] **Step 7: Run UX1 gates and commit**

Run:

```bash
pnpm exec vitest run apps/web/app/_components/stateful-action.test.tsx
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:coverage
pnpm build
pnpm test:extension-security
pnpm e2e
```

Expected: all PASS.

```bash
git add apps/web/app/_components apps/web/app/settings/page.tsx apps/web/app/layout.tsx apps/web/app/globals.css apps/web/package.json pnpm-lock.yaml e2e/decision-core.e2e.ts
git commit -m "feat: add Sochle product shell"
```

---

## Milestone UX2: Home and manual purchase check

### Task 4: Build one reusable in-page purchase composer

**Files:**

- Create: `apps/web/app/_actions/check-purchase.ts`
- Create: `apps/web/app/_components/purchase-composer.tsx`
- Create: `apps/web/app/_components/purchase-composer.test.tsx`
- Create: `apps/web/lib/purchase-input.ts`
- Create: `apps/web/lib/purchase-input.test.ts`
- Modify: `apps/web/app/api/decisions/route.ts`
- Modify: `apps/web/app/check/page.tsx`

**Interfaces:**

- Consumes: `createDecisionService().checkPurchase`, `presentDecision`, product description, and INR price.
- Produces: `PurchaseCheckState`, `checkPurchaseAction(previous, formData)`, `parsePurchaseInput(formData)`, and `PurchaseComposer`.

- [ ] **Step 1: Write failing input and component-state tests**

Test exact INR parsing, blank/121-character names, idle fields, pending copy, error recovery, success title, `See the maths`, and the link to `/decisions/:id`.

```ts
expect(parsePurchaseInput(form("Headphones", "45,000"))).toEqual({
  description: "Headphones",
  priceMinor: 4_500_000,
});
expect(() => parsePurchaseInput(form("", "45,000"))).toThrow("Add the product name");
```

- [ ] **Step 2: Run tests and confirm the missing-module failures**

Run: `pnpm exec vitest run apps/web/lib/purchase-input.test.ts apps/web/app/_components/purchase-composer.test.tsx`

Expected: FAIL.

- [ ] **Step 3: Extract shared purchase-input validation**

Implement `parsePurchaseInput(formData)` with the existing 120-character limit and `parseRupeesToMinor`. Update `/api/decisions` to call it, preserving its current 401, 409, and 303 behavior.

- [ ] **Step 4: Implement the server action**

```ts
export type PurchaseCheckState =
  | { status: "idle" }
  | { message: string; recoveryHref: string | null; status: "error" }
  | { decisionId: string; presentation: DecisionPresentation; status: "success" };

export async function checkPurchaseAction(
  _previous: PurchaseCheckState,
  formData: FormData
): Promise<PurchaseCheckState>;
```

The action authenticates the owner, validates input, loads the connection, creates the immutable decision, and returns `presentDecision(saved.result)`. Map missing rules to `Finish your guardrails` with `/rules`, missing snapshot/connection to `Connect your account` with `/connections`, and invalid input to a field-neutral plain-language message. Never return a raw exception.

- [ ] **Step 5: Implement the composer as a small client leaf**

Use `useActionState(checkPurchaseAction, { status: "idle" })`. The visual sequence is input → checking → result in the same surface. Keep title/price values after failure. Render maths inside `<details>`. Use `StatefulAction`; do not add a motion dependency yet because CSS transitions cover this state change.

- [ ] **Step 6: Replace the Check page**

The page title is `Does this fit?`, supporting copy is one sentence, and `PurchaseComposer` is the only primary surface. Remove rules version, snapshot timestamp, confidence, and prerequisite exception wording.

- [ ] **Step 7: Update manual-check E2E coverage**

Change the reference journey to assert that the result appears on `/check` without a navigation, the clear verdict is visible, maths is closed by default, and `Full decision` opens the immutable detail.

- [ ] **Step 8: Run UX2 composer gates and commit**

Run:

```bash
pnpm exec vitest run apps/web/lib/purchase-input.test.ts apps/web/app/_components/purchase-composer.test.tsx
pnpm test:integration
pnpm typecheck
pnpm exec playwright test e2e/decision-core.e2e.ts --project=live-chromium --grep "checks a"
```

Expected: all PASS.

```bash
git add apps/web/app/_actions apps/web/app/_components/purchase-composer.tsx apps/web/app/_components/purchase-composer.test.tsx apps/web/lib/purchase-input.ts apps/web/lib/purchase-input.test.ts apps/web/app/api/decisions/route.ts apps/web/app/check/page.tsx e2e/decision-core.e2e.ts
git commit -m "feat: add focused purchase composer"
```

### Task 5: Turn `/` into the qualitative owner Home

**Files:**

- Create: `apps/web/app/_components/daily-position.tsx`
- Create: `apps/web/app/_components/decision-list.tsx`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/today/page.tsx`
- Modify: `apps/web/app/weekly-review/page.tsx`
- Modify: `e2e/decision-core.e2e.ts`

**Interfaces:**

- Consumes: `presentToday`, `PurchaseComposer`, latest decisions, open material issues, and `buildWeeklyReview`.
- Produces: authenticated Home with daily position, quick check, recent decisions, and conditional Worth knowing.

- [ ] **Step 1: Write failing E2E expectations for the Home hierarchy**

After login and synthetic seeding, assert in order:

1. `You're in a comfortable spot today.`
2. `Does this fit?`
3. `Today's picture`
4. `Recent decisions`

Also assert that `Safe to spend`, `Liquid cash`, `Snapshot`, `Rules v`, and `Fold` are absent from the default Home body.

- [ ] **Step 2: Run the Home E2E test and confirm it fails on the old landing page**

Run: `pnpm exec playwright test e2e/decision-core.e2e.ts --project=live-chromium --grep "Home hierarchy"`

Expected: FAIL because `/` still shows the technical landing copy.

- [ ] **Step 3: Implement authenticated Home composition**

Require the owner session, load the existing Today summary, latest decisions, and material issues concurrently, then render:

- `DailyPosition` with qualitative title and consequence;
- `PurchaseComposer`;
- a closed `Today's picture` disclosure containing only the three approved facts;
- at most five `DecisionList` rows using `presentDecision` and `purchaseStatusLabel`;
- `Worth knowing` only when a material blocker exists;
- a compact seven-day reflection link when history is non-empty.

No raw financial amount appears before the first explicit disclosure.

- [ ] **Step 4: Preserve secondary URLs**

Make `/today` redirect to `/`. Keep `/weekly-review` rendering its existing calculations, but relabel it `Your week` and link it from Home/Decisions rather than primary navigation.

- [ ] **Step 5: Run UX2 full gates and commit**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:coverage
pnpm build
pnpm test:extension-security
pnpm e2e
```

Expected: all PASS.

```bash
git add apps/web/app/page.tsx apps/web/app/today/page.tsx apps/web/app/weekly-review/page.tsx apps/web/app/_components/daily-position.tsx apps/web/app/_components/decision-list.tsx e2e/decision-core.e2e.ts
git commit -m "feat: redesign qualitative home experience"
```

---

## Milestone UX3: Browser extension experience

### Task 6: Add optional, sanitized product imagery

**Files:**

- Modify: `packages/contracts/src/purchases.ts`
- Modify: `packages/contracts/src/extension-contracts.test.ts`
- Modify: `apps/extension/src/adapters/types.ts`
- Modify: `apps/extension/src/adapters/amazon-in.ts`
- Modify: `apps/extension/src/adapters/flipkart.ts`
- Modify: `apps/extension/src/adapters/myntra.ts`
- Modify: `apps/extension/src/adapters/adapters.test.ts`
- Modify: `apps/extension/test/fixtures/amazon-in/primary.html`
- Modify: `apps/extension/test/fixtures/flipkart/primary.html`
- Modify: `apps/extension/test/fixtures/myntra/primary.html`

**Interfaces:**

- Consumes: merchant DOM and canonical URL.
- Produces: optional `imageUrl: string | null` on `ExtractedProduct` and `safeProductImageUrl(raw, merchant)`.

- [ ] **Step 1: Add failing contract and adapter tests**

Test HTTPS merchant/CDN imagery, `javascript:` rejection, credentials rejection, unknown-host rejection, and null fallback. Each primary merchant fixture must produce its expected image URL; missing-image fixtures must still produce a usable product.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm exec vitest run packages/contracts/src/extension-contracts.test.ts apps/extension/src/adapters/adapters.test.ts`

Expected: FAIL because `imageUrl` and the helper do not exist.

- [ ] **Step 3: Implement the allowlist and extraction**

Allow only HTTPS URLs without credentials. Use explicit merchant image-host suffixes:

- Amazon India: `media-amazon.com`, `ssl-images-amazon.com`
- Flipkart: `flixcart.com`
- Myntra: `myntra.com`, `myntraassets.com`

Return null for every other host. Adapter selectors remain merchant-owned. Missing imagery never affects extraction confidence or blocks a check.

- [ ] **Step 4: Run tests, security scan, and commit**

Run:

```bash
pnpm exec vitest run packages/contracts/src/extension-contracts.test.ts apps/extension/src/adapters/adapters.test.ts
pnpm typecheck
pnpm test:extension-security
```

Expected: all PASS.

```bash
git add packages/contracts/src/purchases.ts packages/contracts/src/extension-contracts.test.ts apps/extension/src/adapters apps/extension/test/fixtures
git commit -m "feat: extract safe product imagery"
```

### Task 7: Redesign the injected decision card and popup

**Files:**

- Modify: `packages/contracts/src/extension-decisions.ts`
- Modify: `packages/contracts/src/extension-contracts.test.ts`
- Modify: `apps/web/lib/server/extension-decision-service.ts`
- Modify: `apps/web/lib/server/extension-decision-service.test.ts`
- Modify: `apps/web/lib/server/extension-decision-service.integration.test.ts`
- Modify: `apps/extension/src/components/decision-card.tsx`
- Modify: `apps/extension/src/components/decision-card.css`
- Modify: `apps/extension/src/components/decision-card.test.tsx`
- Modify: `apps/extension/entrypoints/popup/App.tsx`
- Modify: `apps/extension/entrypoints/popup/style.css`
- Modify: `apps/extension/entrypoints/popup/App.test.tsx`
- Modify: `apps/extension/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `e2e/extension.e2e.ts`

**Interfaces:**

- Consumes: `presentDecision(saved.result)` and optional product image.
- Produces: `ExtensionDecisionCard` with identity fields plus `presentation: DecisionPresentation`; injected states detected/checking/result/error; popup states checking/unpaired/ready/not-ready/unsupported/reload-required.

- [ ] **Step 1: Rewrite the component tests first**

Cover:

- high-confidence extraction renders title and price as text, not editable controls;
- incomplete extraction exposes only the missing/uncertain fields;
- checking state uses one approved branded message and `aria-live="polite"`;
- every verdict renders title, consequence, suggested action, recency, and closed maths;
- primary UI contains none of `confidence`, `freshness`, `projected liquidity`, `headroom`, `Fold`, or raw error prefixes;
- outcome labels are Buy, Wait, Pass; Not relevant is secondary;
- failure preserves corrections and offers Try again;
- unpaired/not-ready states have one direct recovery action;
- popup hides app origin, threshold, and disconnect until secondary disclosure.

- [ ] **Step 2: Run extension component tests and confirm they fail**

Run: `pnpm exec vitest run apps/extension/src/components/decision-card.test.tsx apps/extension/entrypoints/popup/App.test.tsx`

Expected: FAIL against the old UI.

- [ ] **Step 3: Replace the extension API projection**

Change `extensionDecisionCardSchema` to retain only:

```ts
{
  decisionUrl: z.string().url(),
  evaluatedAt: z.string().datetime({ offset: true }),
  firstComfortablyAffordableDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  intentId: z.string().uuid(),
  presentation: decisionPresentationSchema,
  priceMinor: nonNegativeMinorSchema,
  verdict: z.enum([
    "comfortably_affordable",
    "affordable_with_tradeoffs",
    "wait_until_payday",
    "requires_reducing_investments",
    "technically_possible_financially_tight",
    "not_affordable",
    "insufficient_confidence",
  ]),
}
```

Remove client-facing `bufferHeadroomMinor`, `confidence`, `freshness`, `primaryAction`, `primaryTradeoff`, `projectedLiquidityMinor`, and `safeToSpendMinor`. `projectExtensionDecision` calls `presentDecision(saved.result)` and schema-parses the result.

- [ ] **Step 4: Implement the injected-card state machine**

Use a single `phase: "detected" | "checking" | "result" | "error"` instead of overlapping booleans. Keep animations in CSS with opacity/transform and reduced-motion overrides. Render the optional product image with an empty alt because the adjacent title supplies the accessible name. Keep the merchant page usable at 320px through desktop widths and clamp card height to the dynamic viewport.

Add `@fontsource-variable/geist` and `@fontsource-variable/noto-sans-devanagari` to the extension and import them through the WXT entrypoints so both font families are packaged inside the extension. Verify the built CSS contains no `http://` or `https://` font URL.

- [ ] **Step 5: Implement the popup hierarchy**

The default paired popup shows `Ready to check`, supported stores, Check current product, and Open Sochle. Move origin, auto-prompt threshold, disconnect, and pairing details into `<details><summary>Browser connection</summary>`. Translate unsupported/reload-required failures into direct next steps without raw exceptions.

- [ ] **Step 6: Update extension E2E journeys**

For Amazon India, Flipkart, and Myntra assert detected product/price, calculate, clear answer, hidden maths, outcome persistence, and no forbidden terms. Add a low-confidence extraction case, unsupported-tab popup case, reload-required case, and reduced-motion emulation.

- [ ] **Step 7: Run UX3 gates and commit**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:coverage
pnpm test:extension-security
pnpm build
pnpm e2e
```

Expected: all PASS.

```bash
git add packages/contracts/src/extension-decisions.ts packages/contracts/src/extension-contracts.test.ts apps/web/lib/server/extension-decision-service.ts apps/web/lib/server/extension-decision-service.test.ts apps/web/lib/server/extension-decision-service.integration.test.ts apps/extension/src/components apps/extension/entrypoints/popup apps/extension/package.json pnpm-lock.yaml e2e/extension.e2e.ts
git commit -m "feat: redesign extension decision experience"
```

---

## Milestone UX4: Decisions, attention, and settings

### Task 8: Replace technical decision tables with decision memory

**Files:**

- Modify: `apps/web/app/decisions/page.tsx`
- Modify: `apps/web/app/decisions/[id]/page.tsx`
- Modify: `apps/web/app/decisions/[id]/status-form.tsx`
- Modify: `apps/web/app/_components/decision-list.tsx`
- Modify: `e2e/decision-core.e2e.ts`

**Interfaces:**

- Consumes: `presentDecision`, `purchaseStatusLabel`, immutable decision rows.
- Produces: human-labeled filters, responsive history rows, consequence-first detail, and collapsed technical evidence.

- [ ] **Step 1: Write failing history/detail E2E assertions**

Assert All, Considering, Waiting, Planned, Bought, and Passed filters. The default list row contains product, price, human verdict, status, and relative time. Assert raw verdict, confidence, formula, rules, snapshot, and UUID text is absent.

On detail, assert answer → consequence → protected facts → suggested action → outcome controls → maths → closed Technical details.

- [ ] **Step 2: Run the focused browser test and confirm failure**

Run: `pnpm exec playwright test e2e/decision-core.e2e.ts --project=live-chromium --grep "decision memory"`

Expected: FAIL on the current table and technical-first detail.

- [ ] **Step 3: Implement responsive history and filters**

Reuse `DecisionList`. Preserve status query values for compatibility but render human labels. Use `<time dateTime>` with `relativeUpdateLabel`. Empty results invite `Check a purchase`.

- [ ] **Step 4: Reorder decision detail**

Render `presentDecision(result)` first. Put outcome controls immediately after the consequence. Render maths in a disclosure. Put extraction evidence, confidence evidence, exclusions, exact audit input, and daily forecast in one closed `Technical details` disclosure. Preserve canonical URL sanitization and all immutable evidence.

- [ ] **Step 5: Simplify outcome controls**

Show Buy, Wait, Pass as direct actions. Keep Planned with date in the expanded status editor. Put Not relevant in the secondary editor. Preserve the existing POST route and persisted enum values.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
pnpm exec vitest run apps/web/app/api/purchase-intents/\[id\]/status/route.test.ts
pnpm test:integration
pnpm exec playwright test e2e/decision-core.e2e.ts --project=live-chromium --grep "decision memory|stored decision"
```

Expected: all PASS.

```bash
git add apps/web/app/decisions apps/web/app/_components/decision-list.tsx e2e/decision-core.e2e.ts
git commit -m "feat: redesign decision memory"
```

### Task 9: Make blockers actionable and move operations into Settings

**Files:**

- Create: `apps/web/app/settings/privacy/page.tsx`
- Create: `apps/web/app/settings/technical/page.tsx`
- Modify: `apps/web/app/money-inbox/page.tsx`
- Modify: `apps/web/app/connections/page.tsx`
- Modify: `apps/web/app/connections/automatic-sync.tsx`
- Modify: `apps/web/app/rules/page.tsx`
- Modify: `e2e/decision-core.e2e.ts`

**Interfaces:**

- Consumes: open data issues, connection state, latest snapshot, pairings, existing export/delete/revoke/sync routes.
- Produces: Needs attention, My guardrails, Connected account/browser, Privacy and data, and Technical details surfaces.

- [ ] **Step 1: Write failing E2E tests for all Settings states**

Cover connected ready, updating, update needed, no pairings, active pairing, export, exact DELETE confirmation, guardrail save, no blockers, one material transaction blocker, one source-update blocker, and optional cleanup. Assert only explicit connected-account controls name Fold.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `pnpm exec playwright test e2e/decision-core.e2e.ts --project=live-chromium --grep "Settings|Needs attention"`

Expected: FAIL against the current pages.

- [ ] **Step 3: Redesign Needs attention**

Keep `/money-inbox` but title it `Needs attention`. Primary queue includes only material blockers. Each card has a plain title, one-sentence purchase consequence, and one primary action. Transaction classification stays available when required. Optional cleanup renders only in `/settings/technical`; raw evidence remains behind a closed disclosure there.

- [ ] **Step 4: Simplify connected-account and guardrail pages**

Relabel `/rules` as `My guardrails` and remove rule-version copy from the normal view. Relabel `/connections` as `Connected account and browser`; default statuses are Ready, Updating, or Update needed. Keep Fold only on connect, refresh, authorization, and disconnect controls. Keep app origins and pairing identifiers inside a secondary browser-connection disclosure.

- [ ] **Step 5: Move privacy and diagnostics**

`/settings/privacy` owns export and deletion copy/forms currently on Today. `/settings/technical` owns source freshness, reconciliation, optional cleanup, raw evidence, and provider terminology. Never duplicate destructive forms across routes.

- [ ] **Step 6: Run UX4 full gates and commit**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:coverage
pnpm build
pnpm test:extension-security
pnpm e2e
```

Expected: all PASS.

```bash
git add apps/web/app/settings apps/web/app/money-inbox/page.tsx apps/web/app/connections apps/web/app/rules/page.tsx e2e/decision-core.e2e.ts
git commit -m "feat: reorganize attention and settings"
```

---

## Milestone UX5: Accessibility, visual regression, and release proof

### Task 10: Add automated accessibility and responsive visual coverage

**Files:**

- Create: `e2e/product-experience.e2e.ts`
- Create: `e2e/product-experience.e2e.ts-snapshots/` generated baseline images
- Modify: `playwright.config.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `docs/TESTING.md`

**Interfaces:**

- Consumes: completed web/extension surfaces and synthetic E2E state.
- Produces: WCAG regression checks, reduced-motion assertions, desktop/mobile/popup/card screenshots, and a documented UX completion gate.

- [ ] **Step 1: Add `@axe-core/playwright` and create the failing accessibility harness**

For authenticated Home, Check, Decisions, one decision detail, Settings, Needs attention, popup, and injected card:

```ts
const results = await new AxeBuilder({ page }).analyze();
expect(results.violations).toEqual([]);
```

Also keyboard-tab through every primary action and assert a visible focus indicator.

- [ ] **Step 2: Add deterministic visual assertions**

Seed fixed timestamps and synthetic balances. Capture:

- Home at 1440×1000 and 390×844;
- Check idle, error, and result at 390×844;
- Decisions list and detail at 1440×1000;
- Settings and Needs attention at 390×844;
- popup at its fixed width;
- injected detected, checking, comfortable, wait, and needs-input states.

Use `expect(page).toHaveScreenshot()` with animations disabled and committed baselines. Do not mask actual product UI; mask only browser-generated timestamps if a deterministic clock cannot own them.

Repeat Home, Check result, and the injected comfortable result with `colorScheme: "dark"` so both approved token sets have reviewed baselines.

- [ ] **Step 3: Add reduced-motion and overflow assertions**

Emulate `reducedMotion: "reduce"`; assert rotating loading copy is static and computed animation duration is zero. At 320px, 390px, 768px, and 1440px assert `document.documentElement.scrollWidth <= window.innerWidth`.

- [ ] **Step 4: Add forbidden-term browser assertions**

On every primary journey, lower-case `main` or extension-card text and reject all `forbiddenPrimaryTerms` plus `uncaught error`, `rules v`, `snapshot`, and `Fold`. Exclude closed Technical details content from this assertion.

- [ ] **Step 5: Update the testing standard**

Add a Product Experience matrix to `docs/TESTING.md` covering presentation mapping, component states, shared API projection, three merchant journeys, accessibility, reduced motion, responsive overflow, dark mode, and screenshot review. State that visual baselines change only with explicit design review.

Update the live Playwright project matcher to `/(?:live|decision-core|product-experience)\.e2e\.ts/` so the new suite runs under `pnpm e2e`.

- [ ] **Step 6: Run the complete repository gate**

Run:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:coverage
pnpm build
pnpm test:extension-security
pnpm e2e
git diff --check
```

Expected: every command PASS on the first final verification run. If a failure occurs, fix it and rerun the failed layer plus the entire gate; do not call the milestone complete on a retry-only result.

- [ ] **Step 7: Perform the external merchant smoke check**

With the locally built extension and owner-authorized synthetic/local account state, check one current product on Amazon India, Flipkart, and Myntra. Record only pass/fail and the date; do not retain page dumps, tokens, or financial data. This is external verification, not a replacement for fixture E2E.

- [ ] **Step 8: Commit the release proof**

```bash
git add e2e/product-experience.e2e.ts e2e/product-experience.e2e.ts-snapshots playwright.config.ts package.json pnpm-lock.yaml docs/TESTING.md
git commit -m "test: verify product experience redesign"
```

## Milestone completion and push policy

After each milestone:

1. Confirm its targeted tests failed before implementation for the intended reason.
2. Run every gate listed for that milestone.
3. Inspect `git status --short` and stage only milestone-owned files.
4. Commit without `--author` and without `Co-Authored-By` trailers.
5. Push `main` only after the milestone commit and gates pass.
6. Report the exact test counts, commit hash, and any external-only check still outstanding.

The redesign is complete only after UX5 passes the complete repository gate and current Amazon India, Flipkart, and Myntra smoke checks are recorded.
