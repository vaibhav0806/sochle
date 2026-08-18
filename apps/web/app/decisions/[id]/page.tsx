import { notFound } from "next/navigation";

import { formatMinorAsRupees } from "../../../lib/money";
import { presentDecision } from "../../../lib/presentation/decision";
import { purchaseStatusLabel } from "../../../lib/presentation/status";
import { requireOwnerPage } from "../../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../../lib/server/database";
import { StatusForm } from "./status-form";

export const dynamic = "force-dynamic";

function safeCanonicalUrl(value: string | null, merchant: string | null): string | null {
  if (value === null || merchant === null) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      (url.hostname !== merchant && !url.hostname.endsWith(`.${merchant}`))
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

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
  const storedInputs = detail.decision.auditBundle.input;
  const presentation = presentDecision(result);
  const canonicalUrl = safeCanonicalUrl(detail.intent.canonicalUrl, detail.intent.merchant);

  return (
    <main className="decision-detail">
      <section className={`decision-answer tone-${presentation.tone}`}>
        <p className="eyebrow">{presentation.recencyLabel}</p>
        <h1>{presentation.title}</h1>
        <p>{presentation.consequence}</p>
      </section>

      <section className="decision-purchase">
        <div>
          <p className="eyebrow">The purchase</p>
          <h2>{detail.intent.description}</h2>
          <p className="muted">{purchaseStatusLabel(detail.intent.status)}</p>
        </div>
        <strong>{formatMinorAsRupees(detail.intent.priceMinor)}</strong>
      </section>

      {presentation.suggestedAction !== null && (
        <p className="decision-suggestion">{presentation.suggestedAction}</p>
      )}

      <StatusForm
        firstComfortablyAffordableDate={result.firstComfortablyAffordableDate}
        intentId={detail.intent.id}
        plannedFor={detail.intent.plannedFor}
        status={detail.intent.status}
      />

      <details className="decision-disclosure">
        <summary>See the maths</summary>
        <dl>
          {presentation.mathsRows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      </details>

      <details className="decision-disclosure technical-disclosure">
        <summary>Technical details</summary>
        <div className="technical-stack">
          {detail.intent.source === "extension" && (
            <section>
              <h2>Product extraction</h2>
              <dl>
                <div>
                  <dt>Store</dt>
                  <dd>{detail.intent.merchant}</dd>
                </div>
                <div>
                  <dt>Extracted product</dt>
                  <dd>{detail.intent.extractedTitle}</dd>
                </div>
                <div>
                  <dt>Extracted price</dt>
                  <dd>
                    {detail.intent.extractedPriceMinor === null
                      ? "Not found"
                      : formatMinorAsRupees(detail.intent.extractedPriceMinor)}
                  </dd>
                </div>
                <div>
                  <dt>Extraction confidence</dt>
                  <dd>{detail.intent.extractionConfidence}</dd>
                </div>
              </dl>
              {canonicalUrl !== null && (
                <a href={canonicalUrl} rel="noreferrer" target="_blank">
                  View the original product →
                </a>
              )}
            </section>
          )}

          <section>
            <h2>Decision evidence</h2>
            <dl>
              <div>
                <dt>Confidence</dt>
                <dd>{result.confidence.level}</dd>
              </div>
              <div>
                <dt>Formula version</dt>
                <dd>{result.formulaVersion}</dd>
              </div>
              <div>
                <dt>Rules version</dt>
                <dd>{storedInputs.rules.version}</dd>
              </div>
              <div>
                <dt>Snapshot ID</dt>
                <dd>{storedInputs.snapshotId}</dd>
              </div>
              <div>
                <dt>Technical headroom</dt>
                <dd>{formatMinorAsRupees(result.headrooms.technicalMinor)}</dd>
              </div>
              <div>
                <dt>Comfortable headroom</dt>
                <dd>{formatMinorAsRupees(result.headrooms.comfortableMinor)}</dd>
              </div>
              <div>
                <dt>Goal headroom</dt>
                <dd>{formatMinorAsRupees(result.headrooms.goalMinor)}</dd>
              </div>
            </dl>
            {result.confidence.reasons.length > 0 && (
              <ul>
                {result.confidence.reasons.map((reason, index) => (
                  <li key={`${reason.code}-${index}`}>{reason.detail}</li>
                ))}
              </ul>
            )}
            {storedInputs.financialState.exclusions.length > 0 && (
              <pre>{JSON.stringify(storedInputs.financialState.exclusions, null, 2)}</pre>
            )}
            <details>
              <summary>Exact audit input</summary>
              <pre>{JSON.stringify(storedInputs, null, 2)}</pre>
            </details>
          </section>

          <section>
            <h2>Daily forecast</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Ending cash</th>
                    <th>Candidate room</th>
                    <th>Events</th>
                  </tr>
                </thead>
                <tbody>
                  {result.forecast.days.map((day) => (
                    <tr key={day.date}>
                      <td>{day.date}</td>
                      <td>{formatMinorAsRupees(day.endingCashMinor)}</td>
                      <td>{formatMinorAsRupees(day.candidateComfortableHeadroomMinor)}</td>
                      <td>
                        {day.events.length === 0
                          ? "—"
                          : day.events.map((event) => event.id).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </details>
    </main>
  );
}
