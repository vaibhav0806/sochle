import { notFound } from "next/navigation";

import { formatMinorAsRupees } from "../../../lib/money";
import { requireOwnerPage } from "../../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../../lib/server/database";
import { StatusForm } from "./status-form";

export const dynamic = "force-dynamic";

function MoneyValue({ value }: { value: number }) {
  return (
    <strong className={value < 0 ? "negative-value" : undefined}>
      {formatMinorAsRupees(value)}
    </strong>
  );
}

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
  const canonicalUrl = safeCanonicalUrl(detail.intent.canonicalUrl, detail.intent.merchant);

  return (
    <main>
      <p className="eyebrow">Sochle says</p>
      <h1>{result.explanation.headline}</h1>
      <p>{result.explanation.reason}</p>
      {result.explanation.action !== null && <p className="notice">{result.explanation.action}</p>}
      <div className="stack">
        <section className="card stack">
          <div className="row">
            <div>
              <h2>{detail.intent.description}</h2>
              <p className="muted">{result.verdict.replaceAll("_", " ")}</p>
            </div>
            <MoneyValue value={detail.intent.priceMinor} />
          </div>
          <div className="actions">
            <span className={`status ${result.confidence.level}`}>
              {result.confidence.level} confidence
            </span>
            <span className="status">Formula v{result.formulaVersion}</span>
            <span className="status">Rules v{storedInputs.rules.version}</span>
          </div>
        </section>

        {detail.intent.source === "extension" && (
          <section className="card stack">
            <h2>Checked from {detail.intent.merchant}</h2>
            <dl>
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
              <p>
                <a href={canonicalUrl} rel="noreferrer" target="_blank">
                  View the original product →
                </a>
              </p>
            )}
          </section>
        )}

        <section className="metric-grid">
          <article className="card metric">
            <span>Technical headroom</span>
            <MoneyValue value={result.headrooms.technicalMinor} />
          </article>
          <article className="card metric">
            <span>Comfortable headroom</span>
            <MoneyValue value={result.headrooms.comfortableMinor} />
          </article>
          <article className="card metric">
            <span>Goal headroom</span>
            <MoneyValue value={result.headrooms.goalMinor} />
          </article>
          <article className="card metric">
            <span>First comfortable date</span>
            <strong>{result.firstComfortablyAffordableDate ?? "Not in this horizon"}</strong>
          </article>
        </section>

        <StatusForm
          firstComfortablyAffordableDate={result.firstComfortablyAffordableDate}
          intentId={detail.intent.id}
          plannedFor={detail.intent.plannedFor}
          status={detail.intent.status}
        />

        <section className="card stack">
          <h2>Confidence evidence</h2>
          {result.confidence.reasons.length === 0 ? (
            <p className="muted">No confidence warnings.</p>
          ) : (
            <ul>
              {result.confidence.reasons.map((reason, index) => (
                <li key={`${reason.code}-${index}`}>{reason.detail}</li>
              ))}
            </ul>
          )}
          <h3>Exclusions</h3>
          {storedInputs.financialState.exclusions.length === 0 ? (
            <p className="muted">No excluded accounts or transactions.</p>
          ) : (
            <pre>{JSON.stringify(storedInputs.financialState.exclusions, null, 2)}</pre>
          )}
        </section>

        <section className="card stack">
          <h2>Stored inputs</h2>
          <dl className="metric-grid">
            <div>
              <dt>Snapshot ID</dt>
              <dd>{storedInputs.snapshotId}</dd>
            </div>
            <div>
              <dt>Evaluated</dt>
              <dd>{storedInputs.evaluatedAt}</dd>
            </div>
            <div>
              <dt>Horizon end</dt>
              <dd>{storedInputs.horizonEnd}</dd>
            </div>
            <div>
              <dt>Template</dt>
              <dd>{result.explanation.templateId}</dd>
            </div>
          </dl>
          <details>
            <summary>Exact audit input</summary>
            <pre>{JSON.stringify(storedInputs, null, 2)}</pre>
          </details>
        </section>

        <section className="card stack">
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
                    <td className={day.endingCashMinor < 0 ? "negative-value" : undefined}>
                      {formatMinorAsRupees(day.endingCashMinor)}
                    </td>
                    <td
                      className={
                        day.candidateComfortableHeadroomMinor < 0 ? "negative-value" : undefined
                      }
                    >
                      {formatMinorAsRupees(day.candidateComfortableHeadroomMinor)}
                    </td>
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
    </main>
  );
}
