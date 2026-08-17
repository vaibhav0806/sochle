import { formatMinorAsRupees } from "../../lib/money";
import { requireOwnerPage } from "../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../lib/server/database";
import {
  createDecisionService,
  DecisionPrerequisiteError,
} from "../../lib/server/decision-service";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  await requireOwnerPage();
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  const connection =
    financialRepository === null ? null : await financialRepository.getConnection("fold");
  let summary = null;
  if (connection !== null && decisionRepository !== null) {
    try {
      summary = await createDecisionService(
        financialRepository!,
        decisionRepository
      ).getTodaySummary(connection.id, new Date().toISOString());
    } catch (error) {
      if (!(error instanceof DecisionPrerequisiteError)) throw error;
    }
  }

  return (
    <main>
      <p className="eyebrow">Right now</p>
      <h1>Today</h1>
      <p>Your current room after protecting upcoming bills, essentials, goals, and buffer.</p>
      {summary === null ? (
        <section className="card">
          <h2>Today needs a snapshot and rules</h2>
          <p className="muted">Connect your data and save your decision rules first.</p>
        </section>
      ) : (
        <div className="stack">
          <section className="metric-grid">
            <article className="card metric">
              <span>Safe to spend</span>
              <strong>{formatMinorAsRupees(summary.safeToSpendMinor)}</strong>
            </article>
            <article className="card metric">
              <span>Liquid cash</span>
              <strong>{formatMinorAsRupees(summary.liquidCashMinor)}</strong>
            </article>
            <article className="card metric">
              <span>Immediate obligations</span>
              <strong>{formatMinorAsRupees(summary.immediateObligationsMinor)}</strong>
            </article>
            <article className="card metric">
              <span>Upcoming obligations</span>
              <strong>{formatMinorAsRupees(summary.upcomingObligationsMinor)}</strong>
            </article>
          </section>
          <section className="card stack">
            <div className="row">
              <h2>Data confidence</h2>
              <span className={`status ${summary.issues.length === 0 ? "fresh" : "aging"}`}>
                {summary.issues.length === 0 ? "No open issues" : `${summary.issues.length} open`}
              </span>
            </div>
            <p className="muted">
              Snapshot {new Date(summary.snapshotAsOf).toLocaleString("en-IN")} · Rules v
              {summary.ruleSetVersion}
            </p>
            {summary.issues.length > 0 && (
              <ul>
                {summary.issues.map((issue) => (
                  <li key={issue.id}>{issue.label.replaceAll("_", " ")}</li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
