# Sochle testing standard

This document is the completion gate for every milestone. A milestone is not complete because its happy path works manually; it is complete only when its behavior is protected at the appropriate test layers and the full quality gate passes from a clean checkout.

## Principles

1. **Test behavior, not implementation.** A test must name the production regression it catches and assert an observable result. Do not assert private function calls, framework behavior, or the existence of mocks.
2. **Use test-first development.** For new behavior and bug fixes, write the smallest failing test, confirm that it fails for the intended reason, implement the minimum change, and run the test again. A bug fix without a regression test is incomplete.
3. **Use the lowest sufficient layer.** Put permutations and edge cases in unit tests, persistence and protocol boundaries in integration tests, and only critical user journeys in E2E tests.
4. **Use real boundaries where they matter.** Integration tests use PostgreSQL and real migrations. MCP tests use the real client transport against a local synthetic protocol server. Only external identity and financial systems may be replaced at the network boundary.
5. **Never use real financial data in tests.** Fixtures, identifiers, passwords, tokens, merchants, and balances must be synthetic. Tests and failure artifacts must be safe to upload to CI.
6. **Coverage is a backstop, not the objective.** Thresholds detect untested code paths; scenario selection, boundary analysis, and regression tests establish confidence.

## Test layers

### Unit tests

- File name: `*.test.ts`.
- No network, filesystem, clock, or database I/O unless the unit explicitly owns that primitive.
- Cover valid inputs, boundary values, malformed inputs, error branches, and security-sensitive rejection paths.
- Prefer literal, independently calculated expectations.
- Run with `pnpm test:unit`.

### Integration tests

- File name: `*.integration.test.ts`.
- Exercise real PostgreSQL migrations, constraints, transactions, encryption boundaries, and local protocol transports.
- Each test owns its data and leaves the database clean. Database integration tests run serially.
- External Fold infrastructure is never called in CI; use complete sanitized responses or a local MCP server at the network boundary.
- Run with `pnpm test:integration`.

### End-to-end tests

- File name: `*.e2e.ts` under `e2e/`.
- Exercise the production Next.js build in Chromium through accessible user-facing selectors.
- Cover authentication, authorization, navigation, critical writes, persistence after reload, demo-mode isolation, and visible failure/freshness states.
- Keep E2E tests deterministic and few. Do not duplicate unit-test permutations in a browser.
- Capture traces, screenshots, and video only on failure. Artifacts must contain synthetic data only.
- Run with `pnpm e2e`; the command rebuilds the production web app and extension first so stale artifacts cannot produce false results.
- Install the browser once with `pnpm exec playwright install chromium`.

## Coverage policy

- The executable shared-package baseline is at least 80% statements, 75% branches, 80% functions, and 80% lines.
- New or materially changed executable modules should reach at least 90% lines and 85% branches unless the pull request documents why a lower number is the more honest test boundary.
- Type-only modules, schema declarations, generated files, framework entrypoints, and trivial re-export files are excluded. Exclusion is not allowed merely because code is difficult to test.
- Coverage may not be lowered to make a change pass.

## Milestone completion gate

Before a milestone is marked complete or pushed to `main`:

1. Map every acceptance criterion to at least one automated test or a documented manual/external verification.
2. Run migrations against a disposable PostgreSQL database.
3. Run `pnpm format:check`.
4. Run `pnpm lint`.
5. Run `pnpm typecheck`.
6. Run `pnpm test:unit`.
7. Run `pnpm test:integration`.
8. Run `pnpm test:coverage`.
9. Run `pnpm build`.
10. Run `pnpm e2e`.
11. Check `git diff --check` and confirm no secrets or real financial payloads are present.

CI must run the same gate. A retry is diagnostic, not evidence that a flaky test passes. A flaky test blocks the milestone until it is made deterministic or removed with an explicit loss-of-coverage explanation.

## Pull-request expectations

Every behavior-changing pull request states:

- which test was observed failing before the implementation or fix;
- which unit, integration, and E2E scenarios were added or intentionally not needed;
- the commands used for final verification;
- any external verification that cannot run safely in CI, such as a real owner-authorized Fold OAuth round trip.

Real Fold OAuth remains an external verification gate because CI must not possess personal financial credentials. Its local OAuth state, PKCE persistence, encrypted storage, callback validation, MCP transport, and normalized response contracts must still be automated independently.

## Milestones 0–1 baseline matrix

| Capability                                | Unit                                                                                          | Integration                                                                               | E2E/build                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Environment validation and demo isolation | Server-env and source-selector rejection paths                                                | Credential-free production startup                                                        | Demo navigation without live controls                                       |
| Secret and financial-data handling        | Recursive redaction and AES-GCM tamper rejection                                              | Encrypted authorization state in PostgreSQL                                               | Synthetic artifacts only                                                    |
| Database foundation                       | Repository gate behavior                                                                      | Real migrations, constraints, idempotent projections, snapshots, backoff, and corrections | Money Inbox correction survives reload                                      |
| Fold contracts and normalization          | Zod shapes, pagination, minor units, exclusions, cards, freshness, reconciliation, and issues | Real MCP Streamable HTTP client against a local synthetic server                          | Live Fold remains an owner-authorized external check                        |
| Owner security                            | Password and signed-session boundaries                                                        | Authenticated API behavior through the production server                                  | Invalid/valid login, cookie attributes, unauthorized APIs, stable redirects |
| Connection and sync surfaces              | Coordinator fresh/cached/unavailable branches                                                 | Single-flight and failure backoff in PostgreSQL                                           | Disconnected state and connect-first result                                 |
| Browser extension foundation              | Typecheck                                                                                     | Production Manifest V3 build                                                              | Chromium loads the built popup                                              |

## Milestone 2 decision-core matrix

| Capability                                 | Unit                                                                                                                                                                                                                                    | Integration                                                                                                                             | E2E/build                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Rule versions and exact INR input          | Rule validation, month-end dates, horizon bounds, and exact paise parsing/formatting                                                                                                                                                    | Unique rule versions and active-version loading in PostgreSQL                                                                           | Owner saves a new rules version; anonymous mutation is rejected                             |
| Technical, comfortable, and goal headrooms | Integer formulas, zero boundaries, buffer boundaries, signed cash, and budget-treatment cases                                                                                                                                           | Cached snapshot and active rules produce the expected ₹45,000 result                                                                    | Detail renders all three stored headrooms                                                   |
| Daily forecast and salary timing           | Same-day grouping, reserve depletion, 30-day cap, month-end salary clamp, and first-affordable date                                                                                                                                     | Today reuses the same shared calculation without persisting a fake purchase                                                             | Today displays ₹50,000 safe-to-spend and current obligations                                |
| Confidence and materiality                 | Fresh/aging/stale/missing sources, source-specific card cadence, bounded card exposure, sensitivity, and materiality edges                                                                                                              | Stored data issues are conservatively converted to decision issues                                                                      | Confidence and blocking evidence remain visible on immutable detail                         |
| Verdicts and personality                   | All seven verdicts, precedence boundaries, and deterministic English-first Hinglish templates across confidence levels                                                                                                                  | Exact verdict, template, intermediates, and inputs persist together                                                                     | The reference purchase displays the deterministic headline after reload                     |
| Adversarial financial scenarios            | Fourteen hand-calculated fixtures cover transfers, parent/add-on cards, salary timing, rent variance, refunds, stale data, uncertain merchants, duplicate equal-price charges, obligation treatment, investments, and planned purchases | Cross-connection snapshot/rule references are rejected                                                                                  | Critical purchase journey runs through the production server                                |
| Immutable persistence and status           | Repository error branches are covered through integration rather than mocks                                                                                                                                                             | Atomic create/audit, append-only recalculation, connection scoping, planned dates, JSON audit round-trip, and cascading deletion        | History/detail persist across reload; planned status/date survive reload                    |
| Export and deletion                        | Revocation capability orchestration is covered by integration because it owns persistence ordering                                                                                                                                      | Export excludes authorization secrets; failed remote revoke preserves local data; successful deletion removes all connection-owned rows | Authenticated attachment download, exact `DELETE`, cookie clearing, and anonymous rejection |
| Cached performance                         | 1,000 pure reference evaluations must complete in under 1 second                                                                                                                                                                        | Cached PostgreSQL snapshot-to-persisted-decision path must complete in under 5 seconds                                                  | Production build and browser journey exercise the cached path                               |

Real owner-authorized Fold OAuth and remote authorization revocation remain manual external verification. CI validates local OAuth state handling, encryption, callback/session boundaries, synthetic MCP transport, and complete local credential/data deletion without possessing personal financial credentials.

## Milestone 3 point-of-purchase matrix

| Capability                                | Unit / integration                                                 | E2E / build                                                       |
| ----------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Pairing, CORS, revocation                 | Extension auth, pairing service, and route integration tests       | Paired Chromium extension session                                 |
| Amazon India, Flipkart, Myntra extraction | Sanitized sale, conflict, missing-price, and dynamic DOM fixtures  | Amazon synthetic product journey                                  |
| Card interaction and outcomes             | Card/content runtime tests; decision and outcome integration tests | Calculate, save `waiting`, and persist through the production API |
| Persistence, export, deletion             | Decision repository and owner-deletion integration tests           | Covered by authenticated web routes in existing E2E               |
| Permission and payload boundaries         | Exact manifest permission test                                     | `pnpm test:extension-security` scans the built bundle             |

Manual external verification still required before distributing the extension: load the production build and smoke-test one current product page on each supported merchant. Record only pass/fail results and never retain page dumps or financial data.

## Milestone 4 personal-beta matrix

| Capability                              | Unit / integration                                                                                   | E2E / build                                                                                  |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Planning and status filters             | Planned-date validation, status persistence, and planned-purchase projection                         | Planned date survives reload; planned/waiting filters render the expected history            |
| Corrections and immutable recalculation | Correction persistence, reusable merchant rules, and predecessor-linked successor decisions          | Blocking issue resolves, latest decision changes, and the original decision remains readable |
| Weekly review foundation                | Week boundaries, skipped amount, delayed count, and input validation                                 | Local review renders decision and delayed/planned metrics                                    |
| Export and deletion                     | Export includes classification rules without secrets; connection cascade removes Milestone 4 records | Authenticated schema-v3 export and full deletion; anonymous requests rejected                |
| Responsive owner access                 | CSS remains implementation-owned                                                                     | Mobile navigation reaches the purchase check without document overflow                       |

The complete Weekly Review projection, selective affected-decision recalculation, visible lineage, live Flipkart/Myntra smoke checks, and four-week dogfooding report remain explicit Milestone 4 gates. See `docs/reports/2026-08-19-release-readiness.md`.
