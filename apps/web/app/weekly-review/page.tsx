import { buildWeeklyReview } from "@sochle/domain";

import { formatMinorAsRupees } from "../../lib/money";
import { requireOwnerPage } from "../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../lib/server/database";

export const dynamic = "force-dynamic";

function dateDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

export default async function WeeklyReviewPage() {
  await requireOwnerPage();
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  const connection =
    financialRepository === null ? null : await financialRepository.getConnection("fold");
  const [rows, issues] =
    connection === null || decisionRepository === null
      ? [[], []]
      : await Promise.all([
          decisionRepository.listDecisions(connection.id),
          financialRepository!.listOpenIssues(connection.id),
        ]);
  const review = buildWeeklyReview({
    decisions: rows.map(({ decision, intent }) => ({
      evaluatedAt: decision.evaluatedAt.toISOString(),
      outcome:
        intent.status === "purchased" ||
        intent.status === "skipped" ||
        intent.status === "waiting" ||
        intent.status === "planned"
          ? intent.status
          : null,
      priceMinor: intent.priceMinor,
    })),
    endDate: dateDaysAgo(0),
    openIssueCount: issues.length,
    safeToSpendChangeMinor: 0,
    startDate: dateDaysAgo(6),
  });

  return (
    <main>
      <p className="eyebrow">Private check-in</p>
      <h1>Weekly review</h1>
      <p>What changed in the last seven days, calculated from your local Sochle history.</p>
      <section className="metric-grid">
        <article className="card metric">
          <span>Decisions</span>
          <strong>{review.decisionCount}</strong>
        </article>
        <article className="card metric">
          <span>Skipped</span>
          <strong>{formatMinorAsRupees(review.confirmedSkippedMinor)}</strong>
        </article>
        <article className="card metric">
          <span>Delayed or planned</span>
          <strong>{review.delayedCount}</strong>
        </article>
        <article className="card metric">
          <span>Open issues</span>
          <strong>{review.openIssueCount}</strong>
        </article>
      </section>
      <section className="card stack">
        <h2>Dogfooding progress</h2>
        <p className="muted">
          Target: 10 genuine checks, 5 recorded outcomes, and 2 delayed, modified, or skipped
          purchases across four weeks.
        </p>
        <p>This review stays in Sochle. No financial values are sent to third-party analytics.</p>
      </section>
    </main>
  );
}
