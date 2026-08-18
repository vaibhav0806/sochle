import { requireOwnerPage } from "../../lib/server/auth";
import { getRepository } from "../../lib/server/database";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("en-IN", { currency: "INR", style: "currency" });

export default async function MoneyInboxPage() {
  await requireOwnerPage();
  const repository = getRepository();
  const connection = repository === null ? null : await repository.getConnection("fold");
  const issues = connection === null ? [] : await repository!.listOpenIssues(connection.id);
  const isDecisionBlocker = (issue: (typeof issues)[number]) =>
    issue.severity === "blocking" && issue.type !== "large_untagged_transaction";
  const blockingIssues = issues.filter(isDecisionBlocker);
  const optionalIssues = issues.filter((issue) => !isDecisionBlocker(issue));
  const renderIssues = (items: typeof issues) =>
    items.map((issue) => (
      <article className="card stack" key={issue.id}>
        <div className="row">
          <div>
            <h3>{issue.type.replaceAll("_", " ")}</h3>
            <p className="muted">{issue.relatedEntityId}</p>
          </div>
          <strong>{money.format(issue.materialityMinor / 100)}</strong>
        </div>
        <details>
          <summary>Recorded evidence</summary>
          <pre>{JSON.stringify(issue.details, null, 2)}</pre>
        </details>
        {issue.relatedEntityType === "transaction" ? (
          <>
            <p className="muted">
              <a href={`/api/issues/${issue.id}/evidence`} target="_blank">
                Inspect current Fold evidence ↗
              </a>
            </p>
            <form action={`/api/issues/${issue.id}`} method="post" className="actions">
              <select name="classification" defaultValue="consumption" aria-label="Classification">
                <option value="consumption">Consumption</option>
                <option value="investment">Investment</option>
                <option value="transfer">Transfer</option>
                <option value="credit_card_payment">Card payment</option>
                <option value="refund">Refund</option>
                <option value="lending">Lending</option>
                <option value="income">Income</option>
              </select>
              <label className="muted">
                <input name="applyToFuture" type="checkbox" /> Apply to future matching merchants
              </label>
              <button name="action" value="classify" type="submit">
                Classify
              </button>
              <button className="secondary" name="action" value="exclude" type="submit">
                Exclude
              </button>
              <button className="quiet" name="action" value="ignore_once" type="submit">
                Dismiss
              </button>
            </form>
          </>
        ) : (
          <div className="stack">
            <p>Refresh this source in Fold, then sync Sochle again.</p>
            <p>
              <a href="/connections">Open data connections</a>
            </p>
          </div>
        )}
      </article>
    ));

  return (
    <main>
      <p className="eyebrow">Review queue</p>
      <h1>Money Inbox</h1>
      <p>Fix decision blockers first. Optional cleanup can wait.</p>
      {issues.length === 0 ? (
        <section className="card">
          <h2>All clear</h2>
          <p className="muted">No open data issues.</p>
        </section>
      ) : (
        <div className="stack">
          {blockingIssues.length > 0 && (
            <section className="stack">
              <h2>Needs attention</h2>
              <p>These items can change a purchase decision.</p>
              {renderIssues(blockingIssues)}
            </section>
          )}
          {optionalIssues.length > 0 && (
            <section className="stack">
              <h2>Optional cleanup</h2>
              <p>These items do not block purchase decisions.</p>
              {renderIssues(optionalIssues)}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
