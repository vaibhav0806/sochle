# Fold MCP data-readiness audit

Date: 2026-08-19

## Verdict

Fold MCP is working and supplies enough data for Sochle's current purchase-decision MVP: current cash, card obligations, recent transactions, monthly spending, recurring expenses, upcoming cycles, and non-spendable investment context all returned successfully.

It is not sufficient to infer a complete personal budget without user confirmation. Sochle must continue to ask for essential spending, salary, investment target, and safety-buffer rules rather than silently deriving them.

This audit used read-only Fold calls. Only aggregate counts, missing-field rates, freshness, pagination, and reconciliation results were retained; no raw narration, merchant list, account identifier, account name, or balance is included here.

## Live data quality

| Area                  | Result                                                                                                                                                                      | Product implication                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| MCP availability      | All endpoints used by the sync pipeline returned structured data                                                                                                            | Connector is operational                                                      |
| Recent transactions   | 621 rows over 93 days, 7 complete cursor pages, 0 duplicate IDs                                                                                                             | Pagination and deduplication inputs are sound                                 |
| Categories            | 273 of 621 recent rows were untagged (44%)                                                                                                                                  | Category cleanup cannot be an onboarding prerequisite                         |
| Merchants             | 7 of 621 recent rows lacked a merchant (1.1%)                                                                                                                               | Merchant-based learning remains useful for most transactions                  |
| Cash-flow exclusions  | 3 recent rows were explicitly non-cashflow; no included transfer/card-payment category mismatch was found                                                                   | Trust Fold's explicit exclusion instead of asking the user to reconfirm it    |
| Account references    | Every recent transaction resolved to a current bank/card account                                                                                                            | Projection persistence is safe for the audited window                         |
| Cash reconciliation   | Fold's total matched the sum of its included current accounts                                                                                                               | Current liquid-cash input reconciles                                          |
| Spending inventory    | Spending summary referenced 3 accounts while current bank/card inventory contained 2; the extra account had no orphaned recent transactions                                 | Likely historical/disconnected account; monitor but do not block              |
| Credit card           | One connected card had a positive outstanding balance; current-cycle due date/reconciliation was absent, previous-cycle due date was usable, and sync age was about one day | Use dated fallback when available; reserve undated remainder immediately      |
| Recurring obligations | One active recurring expense and one upcoming cycle were returned with amount and date                                                                                      | Useful, but the endpoint cannot prove that all real obligations were detected |
| Investments/net worth | Portfolio and net-worth endpoints returned useful context; mutual-fund and stock refresh timestamps were absent                                                             | Keep as context only, never spendable cash or a decision prerequisite         |
| History               | Net-worth history returned 93 points                                                                                                                                        | Enough for trend context, not needed for the purchase verdict                 |

January and February data was almost entirely untagged/no-merchant, while later months were substantially better. Historical enrichment quality is therefore inconsistent and should not be treated as equivalent to current data.

## Fixes made from this audit

- Large historical untagged debits are optional cleanup with a proven zero current-liquidity effect. They no longer force `insufficient_confidence`.
- Decision confidence now consumes only blocking issues. Warning and info items cannot silently become blockers.
- Legacy `large_untagged_transaction` rows already stored as blocking are treated as optional immediately; a resync is not required for compatibility.
- Undated card outstanding is reserved immediately as the conservative case without also creating unbounded uncertainty.
- Source-classified transfers and card repayments are trusted instead of generating duplicate confirmation work.
- Missing/stale timestamps for optional investment context no longer create Money Inbox items.
- User-corrected transactions and merchant rules suppress the same issue on later syncs.
- Money Inbox separates `Needs attention` from `Optional cleanup` and says explicitly which items affect decisions.
- Stale source issues show Fold refresh/resync guidance instead of irrelevant transaction-classification controls.

## Remaining limitations

1. **Stale card or bank data must still block.** A balance older than 24 hours can materially change affordability. The user should refresh the source in Fold and sync Sochle again. This is intentional safety behavior.
2. **Expected income is manual.** Fold's audited surface does not provide a reliable upcoming-salary feed. Salary amount/date must remain user-confirmed; transaction-history inference would be too risky without confirmation.
3. **Recurring coverage is not demonstrably complete.** Fold returned valid recurring data, but only one active item. Sochle should keep essential monthly spending as an explicit rule and treat detected recurring items as additions, not a complete budget.
4. **Category-driven analytics remain weak.** With 44% of recent rows untagged, category insights and automatic essential/discretionary splits would be misleading. Merchant rules can improve future classification, but cleanup stays optional.
5. **Some freshness is unobservable.** Transaction, spending-summary, recurring, mutual-fund, and stock endpoints do not all expose authoritative source timestamps. Successful fetch time is not the same as underlying institution freshness.
6. **Historical account inventory can drift.** Spending summaries may include a disconnected historical account. No recent orphaned transaction was found, but sync monitoring should track this invariant.

## Recommended next work

- Add aggregate sync-health telemetry: source age, page count, duplicate count, orphan-account count, untagged ratio, and reconciliation status. Never log narrations, merchant names, balances, or account IDs.
- Add a one-click “Refresh Fold, then sync” recovery path or deep link if Fold exposes one.
- Measure recurring-obligation recall against user-confirmed rules before using recurring detection to reduce manual setup.
- Offer merchant-level bulk classification only as optional personalization; never gate the first purchase check on it.
