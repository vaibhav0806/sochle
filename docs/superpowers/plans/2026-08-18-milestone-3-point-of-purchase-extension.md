# Milestone 3 Point-of-Purchase Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a paired Manifest V3 extension that extracts products from Amazon India, Flipkart, and Myntra, saves deterministic Sochle decisions, displays a minimized in-page card, and records outcomes without exposing financial data.

**Architecture:** Merchant adapters and a React card run in an isolated WXT content script, while the background worker alone owns the pairing credential and scoped API calls. The Next.js app authenticates one-time pairing through the owner login, persists hash-only credentials and product provenance in PostgreSQL, and projects the existing immutable decision into a strict card-safe contract.

**Tech Stack:** pnpm, TypeScript 5.9, Node 24, Next.js 16 App Router, React 19, WXT 0.21, Manifest V3, Zod 4, PostgreSQL, Drizzle ORM, Vitest, happy-dom, Testing Library, Playwright Chromium.

**Spec:** `docs/superpowers/specs/2026-08-17-milestone-3-point-of-purchase-extension-design.md`

## Global Constraints

- Use strict red-green-refactor: add one behavior test, observe the expected failure, implement the minimum, and rerun focused plus affected tests.
- Run database-backed Vitest commands sequentially; simultaneous integration/coverage runs race on `sochle_verify`.
- Money crossing an extension boundary is integer INR paise: `{ currency: "INR", minor: number }`.
- The commerce page and content script never receive the pairing credential, Fold material, snapshots, rules, transactions, issue details, or audit bundles.
- The background worker exposes named, schema-validated operations and never accepts arbitrary URL/method/body proxy messages.
- Every completed calculation is persisted once; `(pairingId, idempotencyKey)` enforces retry idempotency.
- Do not auto-sync Fold from the product page. Label snapshot freshness and direct stale/unavailable recovery to the app.
- Production host access is limited to Amazon India, Flipkart, Myntra, and `WXT_SOCHLE_API_ORIGIN`.
- Keep deterministic Hinglish copy server-owned; the extension renders it without selecting verdicts or recomputing financial values.
- Read `apps/web/AGENTS.md` and the installed Next.js 16 guides `apps/web/node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `01-app/03-api-reference/04-functions/cookies.md`, and `01-app/02-guides/redirecting.md` before changing App Router files.
- Preserve unrelated `apps/web/AGENTS.md` and `apps/web/CLAUDE.md` working-tree files unless the user separately asks to commit them.

---

### Task 1: Define strict extension contracts

**Files:**

- Create: `packages/contracts/src/purchases.ts`
- Create: `packages/contracts/src/extension-decisions.ts`
- Create: `packages/contracts/src/extension-auth.ts`
- Create: `packages/contracts/src/extension-contracts.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**

- Produces `merchantSchema`, `extractedProductSchema`, `productDecisionRequestSchema`, `purchaseOutcomeSchema`, `extensionDecisionCardSchema`, `extensionSessionSchema`, `pairingRequestInputSchema`, `pairingRequestOutputSchema`, and the exact inferred types used by all later tasks.
- Rejects unknown keys with `.strict()` at every external object boundary.

- [ ] **Step 1: Write failing contract tests**

Add table-driven literals that prove valid INR paise and nullable extracted price pass, while unknown merchants, HTTP product URLs, mismatched merchant hosts, empty titles, unsafe/zero corrected prices, unknown keys, invalid outcomes, and an audit-bundle-shaped response fail.

```ts
it("accepts the minimized extension decision and rejects financial audit fields", () => {
  const valid = {
    bufferHeadroomMinor: 2_000_00,
    confidence: "high",
    decisionUrl: "http://localhost:3000/decisions/00000000-0000-4000-8000-000000000001",
    evaluatedAt: "2026-08-18T08:00:00.000Z",
    firstComfortablyAffordableDate: null,
    freshness: "fresh",
    headline: "Haan, this fits.",
    intentId: "00000000-0000-4000-8000-000000000002",
    priceMinor: 45_000_00,
    primaryAction: null,
    primaryTradeoff: "Your buffer and goals stay intact.",
    projectedLiquidityMinor: 55_000_00,
    safeToSpendMinor: 47_000_00,
    verdict: "comfortably_affordable",
  };
  expect(extensionDecisionCardSchema.parse(valid)).toEqual(valid);
  expect(() => extensionDecisionCardSchema.parse({ ...valid, auditBundle: {} })).toThrow();
});
```

- [ ] **Step 2: Run the focused test and observe RED**

Run: `pnpm vitest run --project unit packages/contracts/src/extension-contracts.test.ts`

Expected: FAIL because the new schemas are not exported.

- [ ] **Step 3: Implement the strict Zod schemas and inferred types**

Canonical product validation must require HTTPS and match `amazon.in`, `flipkart.com`, or `myntra.com` including permitted subdomains. `ProductDecisionRequest` contains `idempotencyKey`, `correctedTitle`, `correctedPrice`, and the original extraction. Pairing input contains a 64-character lowercase SHA-256 hex digest and a Chromium identity callback whose extension ID matches the request origin at the server layer.

```ts
export const productDecisionRequestSchema = z
  .object({
    correctedPrice: positiveInrMoneySchema,
    correctedTitle: z.string().trim().min(1).max(120),
    extracted: extractedProductSchema,
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const purchaseOutcomeSchema = z.enum(["waiting", "purchased", "skipped", "not_relevant"]);
```

- [ ] **Step 4: Run focused tests, contract typecheck, and mutation check**

Run: `pnpm vitest run --project unit packages/contracts/src/extension-contracts.test.ts && pnpm --filter @sochle/contracts typecheck`

Expected: PASS. Temporarily allowing unknown keys or zero price must make at least one assertion fail; restore the implementation afterward.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts/src
git commit -m "feat: define extension purchase contracts"
```

### Task 2: Persist pairing lifecycle with hash-only credentials

**Files:**

- Create: `packages/db/src/schema/extension-pairing-requests.ts`
- Create: `packages/db/src/schema/extension-pairings.ts`
- Create: `packages/db/src/extension-repository.ts`
- Create: `packages/db/src/extension-repository.integration.test.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema/common.ts`
- Modify: `packages/db/src/index.ts`
- Generate: `packages/db/drizzle/0004_extension-pairings.sql`
- Generate: `packages/db/drizzle/meta/0004_snapshot.json`
- Modify: `packages/db/drizzle/meta/_journal.json`

**Interfaces:**

- Produces `ExtensionRepository.createPairingRequest`, `getPairingRequest`, `approvePairingRequest`, `authenticatePairing`, `listPairings`, `revokePairing`, and `revokeCurrentPairing`.
- `approvePairingRequest` binds the active pairing to a Fold connection and consumes the pending request atomically.

- [ ] **Step 1: Write failing repository integration tests**

Cover creation without plaintext, approval, expiry boundary, callback/origin persistence, replay rejection, exact origin authentication, last-used update, owner-scoped listing/revocation, self-revocation, and cascade deletion.

```ts
it("approves once and authenticates only the matching hash and origin", async () => {
  const connection = await financialRepository.ensureConnection("fold");
  const request = await repository.createPairingRequest({
    callbackUrl: "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pair",
    credentialHash: "a".repeat(64),
    expiresAt: new Date("2026-08-18T08:10:00.000Z"),
    extensionOrigin: "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
  });
  const pairing = await repository.approvePairingRequest(
    request.id,
    connection.id,
    new Date("2026-08-18T08:05:00.000Z")
  );
  await expect(
    repository.authenticatePairing(
      "a".repeat(64),
      pairing.extensionOrigin,
      new Date("2026-08-18T08:06:00.000Z")
    )
  ).resolves.toMatchObject({ id: pairing.id, connectionId: connection.id });
  await expect(
    repository.approvePairingRequest(
      request.id,
      connection.id,
      new Date("2026-08-18T08:06:00.000Z")
    )
  ).rejects.toThrow("Pairing request is no longer pending");
});
```

- [ ] **Step 2: Run RED against the migrated Milestone 2 database**

Run: `pnpm vitest run --project integration packages/db/src/extension-repository.integration.test.ts`

Expected: FAIL because pairing tables and repository do not exist.

- [ ] **Step 3: Add schemas and repository implementation**

Use UUID primary keys, a unique credential-hash index, connection foreign key with cascade, request expiry/approved/consumed timestamps, and pairing revocation/last-used timestamps. Add `extension_paired` and `extension_revoked` audit-event enum values. Never accept or return a raw bearer token.

```ts
async authenticatePairing(hash: string, origin: string, usedAt: Date) {
  const [pairing] = await this.db
    .update(extensionPairings)
    .set({ lastUsedAt: usedAt })
    .where(
      and(
        eq(extensionPairings.credentialHash, hash),
        eq(extensionPairings.extensionOrigin, origin),
        isNull(extensionPairings.revokedAt)
      )
    )
    .returning();
  return pairing ?? null;
}
```

- [ ] **Step 4: Generate and apply the additive migration**

Run: `pnpm --filter @sochle/db db:generate`

Rename the generated SQL and journal tag to `0004_extension-pairings`. Inspect the SQL; it must create only the two pairing tables, their indexes/FKs, and additive audit enum values.

Run: `DATABASE_URL=postgresql://sochle:sochle@localhost:65432/sochle_verify pnpm --filter @sochle/db db:migrate`

- [ ] **Step 5: Run GREEN and typecheck**

Run: `pnpm vitest run --project integration packages/db/src/extension-repository.integration.test.ts && pnpm --filter @sochle/db typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src packages/db/drizzle
git commit -m "feat: persist extension pairings"
```

### Task 3: Add extension provenance, outcomes, and idempotent decision persistence

**Files:**

- Modify: `packages/db/src/schema/purchase-intents.ts`
- Modify: `packages/db/src/schema/common.ts`
- Modify: `packages/db/src/decision-repository.ts`
- Modify: `packages/db/src/decision-repository.integration.test.ts`
- Generate: `packages/db/drizzle/0005_extension-purchases.sql`
- Generate: `packages/db/drizzle/meta/0005_snapshot.json`
- Modify: `packages/db/drizzle/meta/_journal.json`

**Interfaces:**

- Extends `CreatePurchaseDecisionInput` with optional `extensionContext`.
- Produces `DecisionRepository.getDecisionByExtensionRequest(pairingId, idempotencyKey)` and `updateExtensionIntentStatus(connectionId, pairingId, intentId, outcome)`.
- Existing manual callers remain source `manual` with nullable extension fields.

- [ ] **Step 1: Write failing persistence tests**

Prove original and corrected product values are both stored, a duplicate `(pairingId, idempotencyKey)` returns the original intent/decision without an extra audit event, another pairing may reuse the same key, extension outcomes map correctly, and cross-pairing mutation fails.

```ts
const extensionContext = {
  canonicalUrl: "https://www.amazon.in/dp/SYNTHETIC",
  extractedPriceMinor: 49_000_00,
  extractedTitle: "Synthetic headphones MRP title",
  extractionConfidence: "high" as const,
  idempotencyKey: "10000000-0000-4000-8000-000000000001",
  merchant: "amazon.in" as const,
  pairingId: pairing.id,
};
```

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run --project integration packages/db/src/decision-repository.integration.test.ts`

Expected: FAIL because provenance columns, statuses, and idempotent methods are absent.

- [ ] **Step 3: Implement additive schema and repository behavior**

Add `source`, `pairingId`, `merchant`, `canonicalUrl`, `extractionConfidence`, `extractedTitle`, `extractedPriceMinor`, and `idempotencyKey`. Add `waiting` and `not_relevant` enum values. Add a partial/nullable unique `(pairing_id, idempotency_key)` index. Insert the intent with `onConflictDoNothing()` and, when no row returns, load the already stored intent and decision for that same pairing/key without aborting the transaction.

- [ ] **Step 4: Regenerate/apply migration and run GREEN**

Run:

```bash
pnpm --filter @sochle/db db:generate
DATABASE_URL=postgresql://sochle:sochle@localhost:65432/sochle_verify pnpm --filter @sochle/db db:migrate
pnpm vitest run --project integration packages/db/src/decision-repository.integration.test.ts
pnpm --filter @sochle/db typecheck
```

Expected: PASS, with manual Milestone 2 decision tests unchanged.

Rename the generated SQL and journal tag to `0005_extension-purchases` before committing.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src packages/db/drizzle
git commit -m "feat: persist extension purchase context"
```

### Task 4: Build pairing security helpers and service

**Files:**

- Create: `apps/web/lib/server/extension-auth.ts`
- Create: `apps/web/lib/server/extension-auth.test.ts`
- Create: `apps/web/lib/server/extension-pairing-service.ts`
- Create: `apps/web/lib/server/extension-pairing-service.integration.test.ts`
- Modify: `apps/web/lib/server/database.ts`

**Interfaces:**

- Produces `hashExtensionCredential`, `parseExtensionOrigin`, `validateIdentityCallback`, `readBearerCredential`, `extensionCorsHeaders`, `createPairingCsrfToken`, `verifyPairingCsrfToken`, `authenticateExtensionRequest`, and `createExtensionPairingService`.
- `getExtensionRepository()` follows the existing singleton database pattern.

- [ ] **Step 1: Write failing unit tests for origin, callback, bearer, CORS, hash, and CSRF**

Use fixed literal vectors. The callback must be exactly `https://<same-extension-id>.chromiumapp.org/pair`; reject HTTP, wrong suffix, credentials, query/fragment, mismatched ID, `null` origin, malformed bearer headers, expired CSRF, and a CSRF token for another request ID.

```ts
expect(
  validateIdentityCallback(
    "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    "https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pair"
  )
).toBe("https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/pair");
```

- [ ] **Step 2: Run unit RED**

Run: `pnpm vitest run --project unit apps/web/lib/server/extension-auth.test.ts`

Expected: FAIL because helpers do not exist.

- [ ] **Step 3: Implement pure security helpers**

Hash raw credentials with SHA-256, compare signatures with `timingSafeEqual`, parse origin/callback with `URL`, and return exact CORS headers rather than a wildcard. CSRF payload is `<requestId>.<expiresEpochSeconds>` signed with HMAC-SHA-256 under `SOCHLE_SESSION_SECRET`.

- [ ] **Step 4: Run unit GREEN**

Run: `pnpm vitest run --project unit apps/web/lib/server/extension-auth.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing service integration tests**

Exercise request creation, ten-minute expiry, owner approval, authentication, replay, revoked pairing, wrong origin, owner listing, owner revocation, and current-pairing revocation against real repositories.

- [ ] **Step 6: Run service RED, implement, then run GREEN**

Run RED: `pnpm vitest run --project integration apps/web/lib/server/extension-pairing-service.integration.test.ts`

Implement the service as orchestration over `ExtensionRepository`; it must never log or return credential hashes.

Run GREEN: `pnpm vitest run --project integration apps/web/lib/server/extension-pairing-service.integration.test.ts && pnpm --filter @sochle/web typecheck`

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/server
git commit -m "feat: authenticate paired extensions"
```

### Task 5: Expose owner-approved pairing routes and management UI

**Files:**

- Create: `apps/web/app/api/extension/pairing-requests/route.ts`
- Create: `apps/web/app/api/extension/pairing-requests/[id]/approve/route.ts`
- Create: `apps/web/app/api/extension/session/route.ts`
- Create: `apps/web/app/api/extension/pairings/[id]/revoke/route.ts`
- Create: `apps/web/app/extension/pair/page.tsx`
- Create: `apps/web/app/extension/pair/pairing-form.tsx`
- Modify: `apps/web/app/connections/page.tsx`
- Create: `apps/web/lib/server/extension-route-handlers.ts`
- Create: `apps/web/lib/server/extension-routes.integration.test.ts`

**Interfaces:**

- Implements the pairing/session routes from the spec with JSON contracts and exact-origin preflights.
- Owner approval redirects only to the callback already stored on the pairing request and includes only `requestId`.

- [ ] **Step 1: Read installed Next.js route/cookie/redirect guides**

Run:

```bash
sed -n '1,240p' apps/web/node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
sed -n '1,220p' apps/web/node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md
sed -n '1,180p' apps/web/node_modules/next/dist/docs/01-app/02-guides/redirecting.md
```

- [ ] **Step 2: Write failing route-boundary integration tests**

Call dependency-injected functions from `extension-route-handlers.ts` with real `Request` objects and a real verification database. Thin Next route files pass owner authentication, repositories, environment, and clock into these handlers. Assert status, response schema, CORS, no hash fields, login redirect, invalid/expired request display, CSRF rejection, callback redirect, readiness/threshold response, and revocation.

```ts
expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
  "chrome-extension://abcdefghijklmnopabcdefghijklmnop"
);
expect(await response.json()).toEqual({
  approvalUrl: expect.stringMatching(/\/extension\/pair\?request=/),
  expiresAt: "2026-08-18T08:10:00.000Z",
  requestId: expect.any(String),
});
```

- [ ] **Step 3: Run RED**

Run: `pnpm vitest run --project integration apps/web/lib/server/extension-routes.integration.test.ts`

Expected: FAIL because route orchestration is absent.

- [ ] **Step 4: Implement routes and approval page**

The pairing request route parses a strict body, derives origin from `Origin`, validates callback binding, and returns CORS on success/error/preflight. The approval page requires the owner session, displays the requesting origin, and posts request ID plus CSRF. Connections lists pairing label/origin/created/last-used/status and posts revocation with CSRF.

- [ ] **Step 5: Run GREEN, web typecheck, and focused build**

Run: `pnpm vitest run --project integration apps/web/lib/server/extension-routes.integration.test.ts && pnpm --filter @sochle/web typecheck && pnpm --filter @sochle/web build`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/extension apps/web/app/extension apps/web/app/connections/page.tsx apps/web/lib/server/extension-routes.integration.test.ts
git commit -m "feat: pair extension through web login"
```

### Task 6: Implement INR parsing and merchant adapters from fixtures

**Files:**

- Create: `apps/extension/src/adapters/types.ts`
- Create: `apps/extension/src/adapters/inr.ts`
- Create: `apps/extension/src/adapters/amazon-in.ts`
- Create: `apps/extension/src/adapters/flipkart.ts`
- Create: `apps/extension/src/adapters/myntra.ts`
- Create: `apps/extension/src/adapters/index.ts`
- Create: `apps/extension/src/adapters/adapters.test.ts`
- Create: sanitized fixtures under `apps/extension/test/fixtures/{amazon-in,flipkart,myntra}/`
- Modify: `apps/extension/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Produces `parseInrPrice(text): Money | null`, three `CommerceAdapter` values, `adapterForUrl(url)`, and `extractProduct(document, url)`.
- Adapters are read-only and deterministic.

- [ ] **Step 1: Add DOM test dependencies only**

Run:

```bash
pnpm --filter @sochle/extension add @sochle/contracts@workspace:*
pnpm --filter @sochle/extension add -D happy-dom@^20.11.2
```

- [ ] **Step 2: Write failing INR parser tests**

Hand-check literals for `₹45,000`, `₹45,000.00`, `INR 1,23,456.78`, Unicode whitespace, accessibility text, and rejection of malformed grouping, non-INR, ranges, EMI/month, negative, zero, and three decimals.

```ts
expect(parseInrPrice("₹1,23,456.78")).toEqual({ currency: "INR", minor: 12_345_678 });
expect(parseInrPrice("₹45,00.00")).toBeNull();
expect(parseInrPrice("₹2,499/month")).toBeNull();
```

- [ ] **Step 3: Run parser RED, implement integer-string conversion, run GREEN**

Run RED/GREEN: `pnpm vitest run --project unit apps/extension/src/adapters/adapters.test.ts`

Implementation strips only validated separators and calculates `rupees * 100 + paise`; do not use `parseFloat`.

- [ ] **Step 4: Add sanitized fixture variants and failing adapter cases**

Each merchant gets primary, sale/MRP, conflict/multiple-seller-or-variant, missing-price, and dynamic-update fixture fragments. Assertions use literal expected title, canonical URL, paise, merchant, and confidence.

- [ ] **Step 5: Run adapter RED, implement ordered selectors, run GREEN**

Run: `pnpm vitest run --project unit apps/extension/src/adapters/adapters.test.ts`

Expected: PASS with sale price selected, MRP/EMI/recommendations excluded, conflict low confidence, and missing price represented as `null`.

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/adapters apps/extension/test/fixtures apps/extension/package.json pnpm-lock.yaml
git commit -m "feat: extract supported commerce products"
```

### Task 7: Build the extension decision projection and scoped API

**Files:**

- Create: `apps/web/lib/server/extension-decision-service.ts`
- Create: `apps/web/lib/server/extension-decision-service.test.ts`
- Create: `apps/web/lib/server/extension-decision-service.integration.test.ts`
- Create: `apps/web/app/api/extension/decisions/route.ts`
- Create: `apps/web/app/api/extension/purchase-intents/[id]/route.ts`
- Modify: `apps/web/lib/server/decision-service.ts`

**Interfaces:**

- Produces `projectExtensionDecision(saved, appOrigin): ExtensionDecisionCard` and `createExtensionDecisionService`.
- Extension creation authenticates pairing/origin, validates strict product context, checks current threshold, persists provenance/idempotency, and returns only `ExtensionDecisionCard`.

- [ ] **Step 1: Write failing pure projection tests**

Use a complete literal `DecisionResult`. Assert safe-to-spend is `Math.max(0, postPurchaseGoalHeadroom + price)`, projected liquidity is `liquidCash - price`, buffer headroom is comfortable headroom, freshness follows `missing > stale > aging > fresh` across required sources, copy comes unchanged from explanation, URL targets the saved decision, and parsed output contains no extra keys.

- [ ] **Step 2: Run projection RED, implement, and run GREEN**

Run: `pnpm vitest run --project unit apps/web/lib/server/extension-decision-service.test.ts`

- [ ] **Step 3: Write failing integration tests for creation/outcomes**

Prove successful persistence, corrected/original provenance, threshold equality accepted, below threshold rejected, idempotent retry returns one decision, another pairing cannot reuse intent access, unavailable prerequisites map to structured codes, stale/low confidence are labelled, and outcome updates are pairing-scoped/idempotent.

- [ ] **Step 4: Run integration RED, implement service/routes, run GREEN**

Run RED/GREEN: `pnpm vitest run --project integration apps/web/lib/server/extension-decision-service.integration.test.ts`

Routes support `OPTIONS`, validate exact origin, use bearer authentication, parse strict JSON, and return stable `{ error: { code, message, correlationId? } }` bodies without stack/financial details.

- [ ] **Step 5: Run affected Milestone 2 tests and typecheck**

Run:

```bash
pnpm vitest run --project unit apps/web/lib/server/extension-decision-service.test.ts
pnpm vitest run --project integration apps/web/lib/server/decision-service.integration.test.ts apps/web/lib/server/extension-decision-service.integration.test.ts
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/server apps/web/app/api/extension
git commit -m "feat: expose minimized extension decisions"
```

### Task 8: Implement dynamic page observation without duplicate UI

**Files:**

- Create: `apps/extension/src/content/product-controller.ts`
- Create: `apps/extension/src/content/product-controller.test.ts`

**Interfaces:**

- Produces `createProductController({ document, location, observe, schedule, onProduct })` with `start()` and `stop()`.
- Emits only when normalized product context changes and owns one observer/timer lifecycle.

- [ ] **Step 1: Write failing happy-dom controller tests**

Use the real adapter and mutable fixture DOM. Prove initial extraction, debounced mutation update, identical mutation suppression, SPA URL/product change, one callback per settled change, and no callback after `stop()`.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run --project unit apps/extension/src/content/product-controller.test.ts`

- [ ] **Step 3: Implement minimal debounced controller**

Inject scheduler/observer factories for deterministic tests, compare serialized normalized product fields, and cancel pending work on stop. Do not calculate or mutate page product markup.

- [ ] **Step 4: Run GREEN and mutation check**

Run: `pnpm vitest run --project unit apps/extension/src/content/product-controller.test.ts`

Removing the equality guard must make the duplicate-emission assertion fail; restore it.

- [ ] **Step 5: Commit**

```bash
git add apps/extension/src/content
git commit -m "feat: observe commerce product changes"
```

### Task 9: Build background pairing, scoped API client, and popup

**Files:**

- Create: `apps/extension/src/background/api-client.ts`
- Create: `apps/extension/src/background/pairing.ts`
- Create: `apps/extension/src/background/messages.ts`
- Create: `apps/extension/src/background/background.test.ts`
- Modify: `apps/extension/entrypoints/background.ts`
- Create: `apps/extension/entrypoints/popup/App.tsx`
- Create: `apps/extension/entrypoints/popup/App.test.tsx`
- Modify: `apps/extension/entrypoints/popup/main.ts`
- Modify: `apps/extension/entrypoints/popup/index.html`
- Modify: `apps/extension/entrypoints/popup/style.css`
- Modify: `apps/extension/wxt.config.ts`
- Modify: `apps/extension/package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Content/popup messages are discriminated operations: `getSession`, `pair`, `disconnect`, `openCurrentProductCheck`, `evaluateProduct`, and `setOutcome`.
- The credential remains private to pairing/api-client modules and `chrome.storage.local`.

- [ ] **Step 1: Add the supported React toolchain**

Run:

```bash
pnpm --filter @sochle/extension add react@^19.2.3 react-dom@^19.2.3
pnpm --filter @sochle/extension add -D @wxt-dev/module-react@^1.2.2 @testing-library/react@^16.3.2 @testing-library/dom@^10.4.1 @types/react@^19.2.7 @types/react-dom@^19.2.3
```

Configure WXT `modules: ["@wxt-dev/module-react"]`, permissions `storage` and `identity`, exact merchant matches/hosts, and only `${WXT_SOCHLE_API_ORIGIN}/*` for API host access.

- [ ] **Step 2: Write failing background tests with a specific fake browser**

Test credential generation/hash request, exact `identity.getRedirectURL("pair")`, interactive `launchWebAuthFlow`, returned request-ID verification, persistence only after session success, auth header attachment, strict response parsing, credential removal on 401/revocation, disconnect, and rejection of unknown message operations. The fake must implement the complete storage/identity/runtime methods consumed.

- [ ] **Step 3: Run RED, implement background modules, run GREEN**

Run: `pnpm vitest run --project unit apps/extension/src/background/background.test.ts`

Generate 32 random bytes with `crypto.getRandomValues`, encode base64url, and SHA-256 with Web Crypto. API client accepts fixed named path functions only.

- [ ] **Step 4: Write failing popup component tests**

Render real React with happy-dom. Assert unpaired sign-in, pairing loading/error, paired origin/status, supported merchant guidance, below-threshold manual check of the active supported tab, open-app, and disconnect confirmation using user-visible roles/text rather than test IDs.

- [ ] **Step 5: Run popup RED, implement, run GREEN**

Run: `pnpm vitest run --project unit apps/extension/entrypoints/popup/App.test.tsx`

- [ ] **Step 6: Build and inspect manifest/bundle**

Run: `WXT_SOCHLE_API_ORIGIN=http://localhost:3000 pnpm --filter @sochle/extension build`

Inspect `.output/chrome-mv3/manifest.json`; it must contain `identity`, `storage`, three merchant host families, and localhost API only. Search built JS for forbidden names in Task 12.

- [ ] **Step 7: Commit**

```bash
git add apps/extension packages/contracts package.json pnpm-lock.yaml
git commit -m "feat: pair the browser extension"
```

### Task 10: Build the shadow-root decision card and content entrypoint

**Files:**

- Create: `apps/extension/src/components/decision-card.tsx`
- Create: `apps/extension/src/components/decision-card.test.tsx`
- Create: `apps/extension/src/components/decision-card.css`
- Create: `apps/extension/entrypoints/commerce.content.tsx`
- Create: `apps/extension/entrypoints/commerce.content.test.tsx`

**Interfaces:**

- `DecisionCard` receives product/session state and named callbacks; it never imports storage or API modules.
- Content entrypoint uses WXT `createShadowRootUi`, `cssInjectionMode: "ui"`, and `isolateEvents: true`.

- [ ] **Step 1: Write failing reducer/component tests for every state**

Cover passive, editable, loading, success collapsed/expanded, aging/stale, low-confidence, missing prerequisites, unpaired/revoked, missing price, network error with retained corrections/retry, saved outcome, and dismissed-current-product. Assert accessible buttons/forms, literal money formatting, negative labels, and no calculation until explicit click.

```tsx
render(
  <DecisionCard
    initialProduct={amazonProduct}
    session={{ kind: "paired", thresholdMinor: 10_000_00 }}
    onEvaluate={async () => cardResult}
    onOutcome={async () => ({ status: "waiting" })}
  />
);
expect(screen.getByRole("button", { name: /सोचle/i })).toBeVisible();
expect(onEvaluate).not.toHaveBeenCalled();
```

- [ ] **Step 2: Run component RED, implement state model/UI, run GREEN**

Run: `pnpm vitest run --project unit apps/extension/src/components/decision-card.test.tsx`

Use `Intl.NumberFormat("en-IN", { currency: "INR", style: "currency" })`. Do not derive verdict or trade-off copy in the component.

- [ ] **Step 3: Write failing entrypoint/controller integration test**

Mount against a happy-dom merchant fixture and fake runtime messaging. Assert one `sochle-decision-card` shadow host, threshold gating, missing-price manual affordance, product update in place, dismiss reset on canonical URL change, and named messages only.

- [ ] **Step 4: Implement WXT content entrypoint and run GREEN**

Run: `pnpm vitest run --project unit apps/extension/entrypoints/commerce.content.test.tsx apps/extension/src/components/decision-card.test.tsx`

The entrypoint handles only `showManualCheck` from the background worker; it rejects every other background-to-content message. Manual invocation displays the editable card even below threshold but still requires an explicit Calculate click.

- [ ] **Step 5: Run extension typecheck/build**

Run: `pnpm --filter @sochle/extension typecheck && WXT_SOCHLE_API_ORIGIN=http://localhost:3000 pnpm --filter @sochle/extension build`

- [ ] **Step 6: Commit**

```bash
git add apps/extension/src/components apps/extension/entrypoints/commerce.content.tsx apps/extension/entrypoints/commerce.content.test.tsx
git commit -m "feat: show purchase decision card"
```

### Task 11: Extend web history, outcomes, export, and deletion

**Files:**

- Modify: `apps/web/app/decisions/[id]/page.tsx`
- Modify: `apps/web/app/decisions/[id]/status-form.tsx`
- Modify: `apps/web/app/api/purchase-intents/[id]/status/route.ts`
- Modify: `apps/web/app/connections/page.tsx`
- Modify: `packages/db/src/decision-repository.ts`
- Modify: `packages/db/src/decision-repository.integration.test.ts`
- Modify: `apps/web/lib/server/data-deletion.integration.test.ts`

**Interfaces:**

- Web history displays safe merchant provenance and supports all statuses.
- Export schema version becomes `2`, includes pairing metadata with `credentialHash` omitted, and deletion removes pending/active pairings.

- [ ] **Step 1: Write failing integration tests for export/deletion and status compatibility**

Assert export contains merchant/canonical/extracted/corrected context and pairing ID/origin/timestamps but JSON does not match `/credentialHash|authorization|accessToken|refreshToken/i`. Assert deletion empties both pairing tables. Assert web status route accepts `waiting`/`not_relevant` while `planned` still requires a valid date.

- [ ] **Step 2: Run RED**

Run: `pnpm vitest run --project integration packages/db/src/decision-repository.integration.test.ts apps/web/lib/server/data-deletion.integration.test.ts`

- [ ] **Step 3: Implement safe export/deletion and web detail/status UI**

Use selected pairing columns rather than `select *` so hashes cannot enter `OwnerExport`. Render merchant and a safe external canonical link only for HTTPS supported hosts. Add Waiting and Not relevant options without changing planned-date behavior.

- [ ] **Step 4: Run GREEN and web build**

Run:

```bash
pnpm vitest run --project integration packages/db/src/decision-repository.integration.test.ts apps/web/lib/server/data-deletion.integration.test.ts
pnpm --filter @sochle/web typecheck
pnpm --filter @sochle/web build
```

- [ ] **Step 5: Commit**

```bash
git add apps/web packages/db/src
git commit -m "feat: complete extension decision lifecycle"
```

### Task 12: Prove pairing and all three merchants end to end

**Files:**

- Create: `e2e/extension-purchase.e2e.ts`
- Create: `e2e/fixtures/merchant-pages.ts`
- Modify: `playwright.config.ts`
- Modify: `e2e/extension.e2e.ts`

**Interfaces:**

- Playwright launches the built unpacked extension in persistent Chromium against the authenticated live local app.
- Route interception fulfills sanitized HTML under supported HTTPS merchant URLs; production manifest needs no test host.

- [ ] **Step 1: Write the failing E2E pairing scenario**

Start from an unpaired popup, click Sign in, complete the real owner login and pairing approval, return to the extension, and assert paired state. Do not seed the pairing credential directly.

- [ ] **Step 2: Run pairing E2E RED**

Run: `pnpm e2e -- --project extension-chromium e2e/extension-purchase.e2e.ts`

Expected: FAIL until persistent context, app server, and extension wiring are configured together.

- [ ] **Step 3: Configure persistent extension/app E2E environment**

Build with `WXT_SOCHLE_API_ORIGIN=http://127.0.0.1:3101`, launch Chromium with `--disable-extensions-except` and `--load-extension`, seed only synthetic Fold snapshot/rules through existing test setup, and use the real pairing routes.

- [ ] **Step 4: Add failing merchant flows, then make them pass one at a time**

For Amazon India, Flipkart, and Myntra: intercept a supported URL, verify extracted title/current price, correct price, calculate once, assert minimized card/freshness/confidence, expand values, set a distinct outcome, open full decision detail, and query the verification DB to prove one intent/decision with matching provenance.

- [ ] **Step 5: Add revocation and performance assertions**

Revoke from Connections, assert the next card request shows unpaired, and record cached request duration with `expect(durationMs).toBeLessThan(5_000)`.

- [ ] **Step 6: Run the complete E2E suite**

Run: `pnpm e2e`

Expected: all existing and new browser tests pass with one worker and no retries.

- [ ] **Step 7: Commit**

```bash
git add e2e playwright.config.ts
git commit -m "test: verify extension purchase flow"
```

### Task 13: Security assertions, documentation, live smoke, and full gate

**Files:**

- Create: `apps/extension/src/security-boundaries.test.ts`
- Create: `apps/extension/src/manifest.ts`
- Create: `scripts/verify-extension-bundle.mjs`
- Modify: `package.json`
- Modify: `vitest.config.ts`
- Modify: `docs/TESTING.md`
- Modify: `MILESTONES.md`
- Modify: `README.md`

**Interfaces:**

- Produces executable permission/bundle/payload security evidence and the Milestone 3 coverage matrix.
- Marks checklist items complete only after automated and manual evidence exists.

- [ ] **Step 1: Write failing security boundary tests**

Test the pure manifest builder for exact permission/host sets. `scripts/verify-extension-bundle.mjs` recursively inspects built text assets and exits nonzero on `encryptedAuthorization`, `authorizationTag`, `refresh_token`, `SOCHLE_TOKEN_ENCRYPTION_KEY`, account/transaction fixture fields, or token-like synthetic secrets. Parse representative card responses through the strict schema and assert exact keys.

```ts
expect(new Set(manifest.permissions)).toEqual(new Set(["identity", "storage"]));
expect(new Set(manifest.host_permissions)).toEqual(
  new Set([
    "http://localhost:3000/*",
    "https://*.amazon.in/*",
    "https://*.flipkart.com/*",
    "https://*.myntra.com/*",
  ])
);
```

- [ ] **Step 2: Run security RED, implement build-safe boundaries, run GREEN**

Run:

```bash
pnpm vitest run --project unit apps/extension/src/security-boundaries.test.ts
WXT_SOCHLE_API_ORIGIN=http://localhost:3000 pnpm --filter @sochle/extension build
node scripts/verify-extension-bundle.mjs apps/extension/.output/chrome-mv3
```

Add `test:extension-security` to the root scripts as the build plus scanner commands. Extend coverage includes to extension source and the new web extension services. If forbidden material appears, remove the import/data path that bundled it; do not weaken the assertion.

- [ ] **Step 3: Perform manual live smoke without saving page dumps**

Load `apps/extension/.output/chrome-mv3` unpacked. Pair with the local app. On one current Amazon India, Flipkart, and Myntra product page, record only pass/fail for hostname match, title, current price, one-control behavior, correction, decision, and detail link. If a selector fails, add a minimal sanitized regression fixture, watch it fail, fix the adapter, and rerun focused plus live smoke.

- [ ] **Step 4: Update the testing matrix and milestone status**

Add a Milestone 3 matrix to `docs/TESTING.md` mapping pairing, CORS, extraction, dynamic updates, card states, persistence/idempotency, outcomes, permission/bundle boundaries, export/deletion, performance, E2E, and live smoke to exact tests. Check only demonstrated Milestone 3 work in `MILESTONES.md`. Update README status to Milestones 0-3 complete.

- [ ] **Step 5: Run the complete quality gate sequentially**

Run:

```bash
pnpm format
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

Expected: every command exits 0; coverage remains above repository thresholds; no warning indicates a skipped security check. Do not run integration and coverage concurrently.

- [ ] **Step 6: Review committed diff and repository state**

Run:

```bash
git diff --check
git status --short
git log --oneline --decorate -15
```

Verify no secrets, real financial data, page dumps, build output, test artifacts, or unrelated `apps/web/AGENTS.md` / `CLAUDE.md` files are staged.

- [ ] **Step 7: Commit documentation and push Milestone 3**

```bash
git add docs/TESTING.md MILESTONES.md README.md apps/extension/src/security-boundaries.test.ts apps/extension/src/manifest.ts scripts/verify-extension-bundle.mjs package.json vitest.config.ts
git commit -m "test: complete milestone 3 quality gate"
git push origin main
```

Record the final commit, automated counts, coverage summary, cached-path timing, manual three-merchant smoke result, and `HEAD == origin/main` in the handoff.
