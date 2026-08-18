import { formatMinorAsRupees } from "../../../lib/money";
import { requireOwnerPage } from "../../../lib/server/auth";
import { getRepository } from "../../../lib/server/database";

export const dynamic = "force-dynamic";

export default async function TechnicalPage() {
  await requireOwnerPage();
  const repository = getRepository();
  const connection = repository === null ? null : await repository.getConnection("fold");
  const [snapshot, issues] =
    connection === null
      ? [null, []]
      : await Promise.all([
          repository!.getLatestSnapshot(connection.id),
          repository!.listOpenIssues(connection.id),
        ]);
  const optionalIssues = issues.filter(
    (issue) => issue.type === "large_untagged_transaction" || issue.severity !== "blocking"
  );

  return (
    <main className="page-stack">
      <div>
        <p className="eyebrow">Behind the scenes</p>
        <h1>Technical details</h1>
        <p>Diagnostics live here when you need to inspect how Sochle built its account picture.</p>
      </div>

      <section className="technical-panel">
        <h2>Fold source freshness</h2>
        {snapshot === null || snapshot.state.sourceFreshness.length === 0 ? (
          <p className="muted">No source freshness records.</p>
        ) : (
          <ul className="freshness">
            {snapshot.state.sourceFreshness.map((source) => (
              <li key={source.source}>
                <span>{source.source.replaceAll("_", " ")}</span>
                <span className={`status ${source.status}`}>{source.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="technical-panel">
        <h2>Reconciliation</h2>
        {snapshot === null || snapshot.state.reconciliation.length === 0 ? (
          <p className="muted">No reconciliation records.</p>
        ) : (
          <ul className="freshness">
            {snapshot.state.reconciliation.map((item) => (
              <li key={item.headline}>
                <span>{item.headline.replaceAll("_", " ")}</span>
                <span className={`status ${item.status}`}>{item.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="technical-panel stack">
        <div>
          <h2>Optional cleanup</h2>
          <p>These items do not block purchase decisions.</p>
        </div>
        {optionalIssues.length === 0 ? (
          <p className="muted">Nothing waiting for optional cleanup.</p>
        ) : (
          optionalIssues.map((issue) => (
            <article className="technical-issue" key={issue.id}>
              <h3>{issue.type.replaceAll("_", " ")}</h3>
              <strong>{formatMinorAsRupees(issue.materialityMinor)}</strong>
              <details>
                <summary>Recorded evidence</summary>
                <pre>{JSON.stringify(issue.details, null, 2)}</pre>
                <a href={`/api/issues/${issue.id}/evidence`} target="_blank">
                  Inspect current Fold evidence ↗
                </a>
              </details>
              {issue.relatedEntityType === "transaction" && (
                <form action={`/api/issues/${issue.id}`} className="actions" method="post">
                  <select
                    aria-label="Classification"
                    defaultValue="consumption"
                    name="classification"
                  >
                    <option value="consumption">Everyday spending</option>
                    <option value="investment">Investment</option>
                    <option value="transfer">Transfer</option>
                    <option value="credit_card_payment">Card payment</option>
                    <option value="refund">Refund</option>
                    <option value="lending">Lending</option>
                    <option value="income">Income</option>
                  </select>
                  <button name="action" type="submit" value="classify">
                    Save classification
                  </button>
                  <button className="quiet" name="action" type="submit" value="ignore_once">
                    Dismiss
                  </button>
                </form>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
