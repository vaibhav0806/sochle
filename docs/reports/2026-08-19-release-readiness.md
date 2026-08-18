# Sochle release-readiness audit — 19 August 2026

## Verdict

Milestones 0–3 are automated and ready for continued private use. Milestone 4 is partially implemented and ready to dogfood, but it is not complete: weekly-review metrics, correction audit visibility, selective recalculation, and the four-week validation gate remain.

This audit used only synthetic financial data. The owner-authorized Fold OAuth and Amazon India checks previously completed locally remain manual evidence; this run did not copy or inspect personal financial data.

## Automated evidence

The completion gate passed against the disposable `sochle_verify` PostgreSQL database:

- Migrations: applied successfully.
- Formatting, lint, and TypeScript: passed.
- Unit: 31 files, 252 tests passed.
- Integration: 9 files, 54 tests passed.
- Coverage: 95.18% statements, 85.67% branches, 98.06% functions, 97.75% lines; all configured thresholds passed.
- Production web and Manifest V3 extension builds: passed.
- Extension bundle security scan: passed.
- Chromium E2E after expansion: 13 scenarios passed.
- Browser console/page-error crawl: all implemented owner surfaces passed without browser errors.
- Mobile browser smoke: navigation remains available at 390×844 with no document overflow.

## Browser journeys now covered

- Synthetic demo isolation without credentials or live Fold controls.
- Invalid and valid owner login, session-cookie attributes, and anonymous API rejection.
- Rules configuration, manual purchase check, immutable decision detail, Today, history, planning, and status filters.
- Money Inbox classification and persistence after reload.
- Blocking issue resolution, successor recalculation, latest-decision selection, and preservation of the original decision URL.
- Weekly-review rendering from local decision history.
- Authenticated export and complete local deletion; anonymous export/deletion rejection.
- Production extension loading, paired session, evaluation, outcome persistence, and all three supported merchant adapters.
- Amazon India, Flipkart, and Myntra synthetic product extraction inside real Chromium extension contexts.
- Manual extension checks below the configured purchase threshold.

## Defects fixed during the audit

1. Reusable merchant classification rules were omitted from owner export. Export schema version 3 now includes them.
2. Mobile CSS hid the complete application navigation. The navigation is now horizontally available without overflowing the document.
3. Browser coverage was missing for Flipkart, Myntra, below-threshold manual checks, status filters, correction lineage, and console errors. Deterministic E2E scenarios now protect these flows.
4. GitHub Actions did not run the extension bundle-security scan. The quality job now runs the same command as the local completion gate.

## Remaining before Milestone 4 can be called complete

### P0 — trust-loop correctness

- Complete Weekly Review. It currently hardcodes safe-to-spend change to zero and does not project upcoming obligations, recorded-outcome count, outcome-quality gaps, or inaccurate predictions as required by the approved design.
- Recalculate only decisions affected by a correction. The current service appends successors for every latest decision on the connection.
- Record an explicit correction/issue-resolution audit event and show decision lineage in the owner UI. The database preserves predecessor IDs, but the detail screen does not explain that a decision was recalculated or link between versions.
- Display planned/outcome dates in decision history. Filtering and planned-date persistence work, but the list shows only the current status.

### P1 — release confidence

- Add a fully automated one-time extension pairing browser journey. Current E2E seeds the approved pairing at the database boundary; pairing routes, CSRF, callback binding, replay, and revocation are covered by integration tests, and the real flow has been manually exercised.
- Repeat live smoke checks on one current Flipkart and Myntra product page. Amazon India was exercised during development; synthetic Chromium fixtures cover all three merchants, but live DOMs can change independently.
- Add automated accessibility checks and keyboard/focus coverage for the web forms and extension shadow-root card. Existing semantic labels are good, but WCAG compliance has not been measured.
- Add direct recovery actions to the blocked extension card, such as opening the exact Money Inbox issue and triggering/returning from sync. The current copy explains recovery but makes the user navigate manually.

### External exit gate

- Dogfood for four weeks and write the continue/pivot/stop decision against the PRD thresholds. Automated tests cannot satisfy this gate.
- Test remote Fold authorization revocation with the owner account. Local encryption, OAuth state/PKCE, callback validation, and deletion ordering are automated; the external provider action is not safe for CI.

Milestone 5 remains intentionally out of scope until the Milestone 4 dogfooding decision is “continue.”

## Product-quality scorecard

| Dimension                |      Score | Evidence                                                                                                                                         |
| ------------------------ | ---------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Onboarding               |       6/10 | Clear value proposition and one-time pairing model; setup still spans password, Fold, rules, snapshot, and extension without a guided checklist. |
| Core experience          |       7/10 | Deterministic web and extension decisions work end to end; live merchant variability and partial weekly review remain.                           |
| Error handling           |       7/10 | Missing/stale data and unresolved issues are explicit and popup failures recover; blocked-card recovery still requires manual navigation.        |
| Information architecture |       7/10 | Flat owner navigation and clear pages; decision lineage and issue-to-decision links are absent.                                                  |
| Visual polish            |       7/10 | Distinctive, consistent brand and card UI; mobile navigation is functional but horizontally scrollable rather than purpose-designed.             |
| Performance              |       8/10 | Cached decision path is guarded below five seconds and production pages were responsive in Chromium.                                             |
| Accessibility            |       6/10 | Semantic labels and accessible selectors cover core flows; no automated WCAG, focus-trap, or screen-reader audit exists.                         |
| Feature completeness     |       6/10 | Milestones 0–3 are solid; Milestone 4 metrics and external validation remain incomplete.                                                         |
| **Overall**              | **6.8/10** | **Strong private beta foundation; finish the trust loop before calling the MVP complete.**                                                       |
