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
- Run with `pnpm e2e` after the web build and migrations are available.
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
