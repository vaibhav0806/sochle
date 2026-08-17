# ADR 0001: System boundaries

**Status:** Accepted  
**Date:** 17 August 2026

## Decision

Sochle is a pnpm TypeScript monorepo with two applications and five shared packages:

- `apps/web` owns authenticated UI, HTTP routes, server-side orchestration, and scheduled entrypoints.
- `apps/extension` owns page observation and the minimum decision-card interface.
- `packages/contracts` owns runtime-validated boundary payloads and shared public types.
- `packages/domain` owns deterministic financial types and calculations with no framework, network, database, UI, or model dependencies.
- `packages/fold` owns MCP transport, response validation, normalization, and provider-specific reconciliation.
- `packages/db` owns Drizzle schemas, migrations, encryption at rest, and repositories.
- `packages/fixtures` owns synthetic demos and sanitized regression fixtures.

Dependencies point inward: applications may use packages; Fold and database packages may use contracts and domain; domain imports no other workspace package. Financial providers implement a domain-facing interface so Fold can be replaced without changing decision logic.

## Consequences

The web app is the only public API and the only component permitted to hold Fold authorization material. Extension content scripts receive product context and minimized decision output, never a financial snapshot. A separate worker is deferred until scheduled jobs outgrow web-hosted entrypoints and database-backed leases.
