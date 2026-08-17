import { requireOwnerPage } from "../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../lib/server/database";

export const dynamic = "force-dynamic";

export default async function CheckPage() {
  await requireOwnerPage();
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  const connection =
    financialRepository === null ? null : await financialRepository.getConnection("fold");
  const [snapshot, rules] =
    connection === null || decisionRepository === null
      ? [null, null]
      : await Promise.all([
          financialRepository!.getLatestSnapshot(connection.id),
          decisionRepository.getActiveRuleSet(connection.id),
        ]);
  const missing =
    snapshot === null ? "a financial snapshot" : rules === null ? "saved rules" : null;

  return (
    <main className="narrow">
      <p className="eyebrow">Think before checkout</p>
      <h1>Check it</h1>
      <p>Tell Sochle what you are considering. The answer uses only your latest cached snapshot.</p>
      {missing !== null ? (
        <section className="card">
          <h2>Missing {missing}</h2>
          <p className="muted">Set up the prerequisite before creating a decision.</p>
        </section>
      ) : (
        <form action="/api/decisions" method="post" className="card stack">
          <div className="row">
            <span className="status">Rules v{rules!.version}</span>
            <span className="muted">
              Snapshot {new Date(snapshot!.state.asOf).toLocaleString("en-IN")}
            </span>
          </div>
          <label>
            What are you considering?
            <input name="description" maxLength={120} autoComplete="off" required />
          </label>
          <label>
            Price
            <input name="price" inputMode="decimal" placeholder="45000" required />
          </label>
          <button type="submit">Sochle</button>
        </form>
      )}
    </main>
  );
}
