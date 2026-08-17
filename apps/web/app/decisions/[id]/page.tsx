import { notFound } from "next/navigation";

import { formatMinorAsRupees } from "../../../lib/money";
import { requireOwnerPage } from "../../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../../lib/server/database";

export const dynamic = "force-dynamic";

export default async function DecisionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireOwnerPage();
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  const connection =
    financialRepository === null ? null : await financialRepository.getConnection("fold");
  const { id } = await params;
  const detail =
    connection === null || decisionRepository === null
      ? null
      : await decisionRepository.getDecision(connection.id, id);
  if (detail === null) notFound();
  const result = detail.decision.auditBundle.result;

  return (
    <main className="narrow">
      <p className="eyebrow">Sochle says</p>
      <h1>{result.explanation.headline}</h1>
      <p>{result.explanation.reason}</p>
      {result.explanation.action !== null && <p className="notice">{result.explanation.action}</p>}
      <section className="card stack">
        <div className="row">
          <h2>{detail.intent.description}</h2>
          <strong>{formatMinorAsRupees(detail.intent.priceMinor)}</strong>
        </div>
        <p className="muted">
          {result.verdict.replaceAll("_", " ")} · {result.confidence.level} confidence
        </p>
      </section>
    </main>
  );
}
