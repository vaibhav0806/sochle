import Link from "next/link";

import { formatMinorAsRupees } from "../../lib/money";
import { requireOwnerPage } from "../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../lib/server/database";

export const dynamic = "force-dynamic";

const statuses = [
  "considering",
  "waiting",
  "planned",
  "purchased",
  "skipped",
  "not_relevant",
] as const;

export default async function DecisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireOwnerPage();
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  const connection =
    financialRepository === null ? null : await financialRepository.getConnection("fold");
  const rows =
    connection === null || decisionRepository === null
      ? []
      : await decisionRepository.listDecisions(connection.id);
  const selectedStatus = (await searchParams).status;
  const filteredRows = statuses.includes(selectedStatus as (typeof statuses)[number])
    ? rows.filter((row) => row.intent.status === selectedStatus)
    : rows;

  return (
    <main>
      <p className="eyebrow">Decision memory</p>
      <h1>Decisions</h1>
      <p>Every answer remains tied to the exact snapshot, rules, and formula that produced it.</p>
      <form action="/decisions" className="actions">
        <label>
          Status
          <select defaultValue={selectedStatus ?? ""} name="status">
            <option value="">All decisions</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      {filteredRows.length === 0 ? (
        <section className="card">
          <h2>No decisions yet</h2>
          <p className="muted">Run your first purchase check to start the history.</p>
        </section>
      ) : (
        <div className="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Purchase</th>
                <th>Status</th>
                <th>Verdict</th>
                <th>Price</th>
                <th>Confidence</th>
                <th>Evaluated</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ decision, intent }) => (
                <tr key={intent.id}>
                  <td>
                    <Link href={`/decisions/${decision.id}`}>{intent.description}</Link>
                  </td>
                  <td>{intent.status}</td>
                  <td>{decision.verdict.replaceAll("_", " ")}</td>
                  <td>{formatMinorAsRupees(decision.priceMinor)}</td>
                  <td>{decision.confidence}</td>
                  <td>{decision.evaluatedAt.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
