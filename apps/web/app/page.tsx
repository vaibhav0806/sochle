import Link from "next/link";

import { presentDecision } from "../lib/presentation/decision";
import { purchaseStatusLabel, relativeUpdateLabel } from "../lib/presentation/status";
import { presentToday, type TodayPresentation } from "../lib/presentation/today";
import { requireOwnerPage } from "../lib/server/auth";
import { getDecisionRepository, getRepository } from "../lib/server/database";
import { createDecisionService, DecisionPrerequisiteError } from "../lib/server/decision-service";
import { DailyPosition } from "./_components/daily-position";
import { DecisionList, type DecisionListItem } from "./_components/decision-list";
import { PurchaseComposer } from "./_components/purchase-composer";

export const dynamic = "force-dynamic";

const setupPresentation: TodayPresentation = {
  consequence: "Connect your account and choose what every purchase should protect.",
  facts: [],
  title: "Let's get Sochle ready.",
  tone: "needs-input",
};

export default async function HomePage() {
  await requireOwnerPage();
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  const connection =
    financialRepository === null ? null : await financialRepository.getConnection("fold");

  let today: TodayPresentation = setupPresentation;
  let recentDecisions: DecisionListItem[] = [];
  let materialIssueCount = 0;
  if (connection !== null && financialRepository !== null && decisionRepository !== null) {
    const summaryPromise = createDecisionService(financialRepository, decisionRepository)
      .getTodaySummary(connection.id, new Date().toISOString())
      .catch((error: unknown) => {
        if (error instanceof DecisionPrerequisiteError) return null;
        throw error;
      });
    const [summary, rows, issues] = await Promise.all([
      summaryPromise,
      decisionRepository.listDecisions(connection.id),
      financialRepository.listOpenIssues(connection.id),
    ]);
    materialIssueCount = issues.filter(
      (issue) => issue.severity === "blocking" && issue.type !== "large_untagged_transaction"
    ).length;
    if (summary !== null) {
      today = presentToday({
        committedMinor: summary.immediateObligationsMinor + summary.upcomingObligationsMinor,
        goalHeadroomMinor: summary.headrooms.goalMinor,
        hasBlockingIssue: materialIssueCount > 0,
        minimumBufferMinor: summary.minimumBufferMinor,
        safeToSpendMinor: summary.safeToSpendMinor,
      });
    }
    recentDecisions = rows.slice(0, 5).map(({ decision, intent }) => ({
      description: intent.description,
      id: decision.id,
      presentation: presentDecision(decision.auditBundle.result),
      statusLabel: purchaseStatusLabel(intent.status),
      updatedLabel: relativeUpdateLabel(decision.evaluatedAt),
    }));
  }

  return (
    <main className="home-stack">
      <DailyPosition presentation={today} />

      {today === setupPresentation && (
        <Link className="button-link home-setup" href="/connections">
          Set up Sochle
        </Link>
      )}

      <section className="home-section">
        <h2>Does this fit?</h2>
        <p>Check a purchase while it’s still only an idea.</p>
        <PurchaseComposer />
      </section>

      {today.facts.length > 0 && (
        <details className="today-picture">
          <summary>Today's picture</summary>
          <dl>
            {today.facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      <section className="home-section">
        <div className="row">
          <h2>Recent decisions</h2>
          <Link href="/decisions">See all</Link>
        </div>
        <DecisionList items={recentDecisions} />
        {recentDecisions.length > 0 && <Link href="/weekly-review">Reflect on your week →</Link>}
      </section>

      {materialIssueCount > 0 && (
        <aside className="worth-knowing">
          <div>
            <h2>Worth knowing</h2>
            <p>One detail needs attention before your next reliable answer.</p>
          </div>
          <Link href="/money-inbox">Review it →</Link>
        </aside>
      )}
    </main>
  );
}
