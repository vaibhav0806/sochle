# Milestone 4: Personal beta and trust loop

## Goal

Make Sochle useful for weekly private use by closing the loop between financial-data corrections, purchase decisions, recorded outcomes, and a local-only weekly review.

## Scope and exit gates

This implementation delivers all product and automated-test work needed to begin dogfooding. The final Milestone 4 exit criterion remains external: four weeks of real personal use followed by a written continue, pivot, or stop decision against the PRD metrics.

## Product decisions

- A Money Inbox resolution may classify a transaction as investment, transfer, card payment, refund, lending, income, or not relevant. The resolution becomes an immutable correction; a reusable rule is created only when the owner explicitly opts in.
- A correction never mutates an existing decision. A recalculation creates a successor decision linked to the superseded decision and uses the current snapshot and active rules.
- `waiting` remains an outcome. The owner may promote it to `planned` with a date, defaulting to the stored first comfortably affordable date when one exists.
- Weekly review is computed from locally persisted decisions, intents, issues, and the current snapshot. It contains no third-party analytics and does not emit financial values beyond the owner-facing app.
- Dogfooding metrics are derived locally and show progress toward the PRD targets; they are not presented as validation before the four-week period ends.

## Architecture

### Corrections and recalculation

Extend correction persistence with the normalized classification and optional reusable rule. Resolve an issue transactionally: save the correction, mark the issue resolved, create an audit event, then identify decisions whose saved financial input includes the corrected transaction. Re-evaluate each affected intent using the current snapshot/rules and persist a new decision with `previousDecisionId` set. The old decision remains immutable and visible in detail history.

### Purchase lifecycle

Keep the existing status endpoint as the single transition boundary. Add a typed `plan` operation that permits only waiting/considering intents to become planned, validates a future-or-today ISO date, and records an audit event. Decision history gains query-string status filters and displays outcome/planned dates.

### Weekly review

Introduce a pure domain projection with an explicit week range and input records. It returns decision counts, recorded outcomes, confirmed skipped amount, delayed/planned count, upcoming obligations, safe-to-spend delta, unresolved issues, and outcome-quality gaps. The database repository supplies minimal owner-scoped inputs; the web page renders the result and a local dogfooding metric checklist.

### Privacy and data boundaries

No analytics provider is added. The app persists only operational records already required for decisions and corrections. Exports include new owner-visible records but exclude credentials, tokens, and encrypted authorization material. Deletion cascades through all new data.

## Tests and verification

- Unit: correction classification validation, reusable-rule matching, plan-date validation, weekly-review calculations and PRD metric definitions.
- Integration: transactional correction/resolution, recalculation lineage, status/plan persistence, owner-scoped weekly-review inputs, export/deletion.
- E2E: resolve a Money Inbox issue, verify successor decision, plan a waiting intent, filter history, and view a synthetic weekly review.
- Full gate: format, lint, typecheck, unit, integration, coverage, build, extension security scan, and E2E.

## Non-goals

- No Gmail/receipt matching, refund matching, notifications, billing, multi-user support, or third-party analytics.
- No claim that the four-week dogfooding criterion has been met until the owner completes it.
