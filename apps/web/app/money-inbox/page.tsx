import Link from "next/link";

import { formatMinorAsRupees } from "../../lib/money";
import { requireOwnerPage } from "../../lib/server/auth";
import { getRepository } from "../../lib/server/database";

export const dynamic = "force-dynamic";

export default async function MoneyInboxPage() {
  await requireOwnerPage();
  const repository = getRepository();
  const connection = repository === null ? null : await repository.getConnection("fold");
  const issues = connection === null ? [] : await repository!.listOpenIssues(connection.id);
  const blockers = issues.filter(
    (issue) => issue.severity === "blocking" && issue.type !== "large_untagged_transaction"
  );

  return (
    <main className="page-stack">
      <div>
        <p className="eyebrow">Before your next check</p>
        <h1>Needs attention</h1>
        <p>Only things that can materially change a purchase answer appear here.</p>
      </div>

      {blockers.length === 0 ? (
        <section className="attention-empty">
          <h2>All clear</h2>
          <p>Nothing needs your attention before the next purchase check.</p>
          <Link href="/check">Check a purchase →</Link>
        </section>
      ) : (
        <section className="attention-list">
          {blockers.map((issue) =>
            issue.relatedEntityType === "transaction" ? (
              <article className="attention-item" key={issue.id}>
                <div>
                  <p className="eyebrow">One quick classification</p>
                  <h2>Tell Sochle what this purchase was</h2>
                  <p>This could change how another purchase fits.</p>
                  <strong>{formatMinorAsRupees(issue.materialityMinor)}</strong>
                </div>
                <form action={`/api/issues/${issue.id}`} className="stack" method="post">
                  <label>
                    Classification
                    <select
                      aria-label="Classification"
                      defaultValue="consumption"
                      name="classification"
                    >
                      <option value="consumption">Everyday spending</option>
                      <option value="investment">Investment</option>
                      <option value="transfer">Transfer between my accounts</option>
                      <option value="credit_card_payment">Card payment</option>
                      <option value="refund">Refund</option>
                      <option value="lending">Money lent</option>
                      <option value="income">Income</option>
                    </select>
                  </label>
                  <label className="checkbox-label">
                    <input name="applyToFuture" type="checkbox" /> Remember for similar merchants
                  </label>
                  <button name="action" type="submit" value="classify">
                    Save classification
                  </button>
                </form>
              </article>
            ) : (
              <article className="attention-item" key={issue.id}>
                <div>
                  <p className="eyebrow">A newer picture will help</p>
                  <h2>Your account picture needs an update</h2>
                  <p>Sochle needs a newer account picture before giving a reliable answer.</p>
                </div>
                <Link className="button-link" href="/connections">
                  Refresh connected account
                </Link>
              </article>
            )
          )}
        </section>
      )}
    </main>
  );
}
