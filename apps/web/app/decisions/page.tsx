import { DecisionList, type DecisionListItem } from "../_components/decision-list";
import { formatMinorAsRupees } from "../../lib/money";
import { presentDecision } from "../../lib/presentation/decision";
import { purchaseStatusLabel, relativeUpdateLabel } from "../../lib/presentation/status";
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

const visibleFilters = ["considering", "waiting", "planned", "purchased", "skipped"] as const;

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
  const items: DecisionListItem[] = filteredRows.map(({ decision, intent }) => ({
    description: intent.description,
    id: decision.id,
    presentation: presentDecision(decision.auditBundle.result),
    priceLabel: formatMinorAsRupees(decision.priceMinor),
    statusLabel: purchaseStatusLabel(intent.status),
    updatedLabel: relativeUpdateLabel(decision.evaluatedAt),
  }));

  return (
    <main className="page-stack">
      <div>
        <p className="eyebrow">Decision memory</p>
        <h1>Decisions</h1>
        <p>Come back to what you considered, what Sochle said, and what you chose.</p>
      </div>
      <form action="/decisions" className="decision-filters">
        <label>
          Status
          <select
            defaultValue={
              visibleFilters.includes(selectedStatus as (typeof visibleFilters)[number])
                ? selectedStatus
                : ""
            }
            name="status"
          >
            <option value="">All</option>
            {visibleFilters.map((status) => (
              <option key={status} value={status}>
                {purchaseStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Filter</button>
      </form>
      <DecisionList items={items} />
    </main>
  );
}
