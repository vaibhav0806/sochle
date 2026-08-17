# ADR 0002: Financial data handling

**Status:** Accepted  
**Date:** 17 August 2026

## Decision

- Store Fold authorization material only on the server, encrypted with AES-256-GCM under an application-managed 32-byte key.
- Persist the smallest normalized financial representation needed for calculations and auditability.
- Keep provider payloads out of logs. Logging redacts tokens, account/source/transaction identifiers, amounts, balances, and transaction narration recursively.
- Validate every external payload before it crosses into domain code.
- Preserve source timestamps and account-exclusion reasons. Never present cached data as current.
- Use integer paise for INR calculations and persistence.
- Send no financial values to third-party analytics. Public demos use synthetic fixtures selected before any live provider is invoked.
- Delete authorization material, normalized financial data, corrections, decisions, and audit history through one authenticated deletion workflow.

## Threat boundaries

Browser pages and extension content scripts are untrusted. They can submit product title, URL, merchant, and corrected price but cannot request Fold tools directly. Model providers are also outside the financial trust boundary; future explanations receive a minimized, identifier-free decision summary only.

## Consequences

Debugging must rely on event names, timings, counts, source labels, and opaque correlation IDs rather than payload dumps. A connection outage may reduce freshness or prevent a verdict, but cannot erase user rules or corrections.
