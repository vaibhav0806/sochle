import Link from "next/link";

import { requireOwnerPage } from "../../lib/server/auth";
import { getRepository } from "../../lib/server/database";
import { getServerEnv } from "../../lib/server/env";
import { createPairingCsrfToken } from "../../lib/server/extension-auth";
import { getExtensionRuntime } from "../../lib/server/extension-runtime";
import { AutomaticSync } from "./automatic-sync";

export const dynamic = "force-dynamic";

function displayDate(value: Date | null): string {
  return value === null ? "Never" : value.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  await requireOwnerPage();
  const serverEnv = getServerEnv();
  const { result } = await searchParams;
  const repository = getRepository();
  const connection = repository === null ? null : await repository.getConnection("fold");
  const extensionRuntime = getExtensionRuntime();
  const pairings =
    connection === null || extensionRuntime === null
      ? []
      : await extensionRuntime.service.listOwnerPairings(connection.id);
  const snapshot = connection === null ? null : await repository!.getLatestSnapshot(connection.id);
  const automaticSyncDue =
    !serverEnv.SOCHLE_DEMO_MODE &&
    connection?.status === "connected" &&
    (connection.lastSuccessfulSyncAt === null ||
      Date.now() - connection.lastSuccessfulSyncAt.getTime() >=
        serverEnv.SOCHLE_SYNC_MINIMUM_INTERVAL_MINUTES * 60 * 1000);

  return (
    <main>
      <p className="eyebrow">Milestone 1 · data foundation</p>
      <h1>Financial data</h1>
      <p>Connect Fold once, then refresh the normalized snapshot manually when you need it.</p>
      {serverEnv.SOCHLE_DEMO_MODE && (
        <p className="notice">Demo mode is on. Live Fold authorization and sync are disabled.</p>
      )}
      {result && <p className="notice">Last action: {result.replaceAll("_", " ")}.</p>}
      <section className="card stack">
        <AutomaticSync enabled={automaticSyncDue} />
        <div className="row">
          <div>
            <h2>Fold Money</h2>
            <p className="muted">Status: {connection?.status ?? "not connected"}</p>
          </div>
          <span className={`status ${connection?.status ?? "disconnected"}`}>
            {connection?.status ?? "disconnected"}
          </span>
        </div>
        <dl>
          <div>
            <dt>Last successful sync</dt>
            <dd>{displayDate(connection?.lastSuccessfulSyncAt ?? null)}</dd>
          </div>
          <div>
            <dt>Last failure</dt>
            <dd>{connection?.lastFailureMessage ?? "None"}</dd>
          </div>
        </dl>
        {snapshot !== null && (
          <>
            <div>
              <h3>Reconciliation</h3>
              <ul className="freshness">
                {snapshot.state.reconciliation.map((item) => (
                  <li key={item.headline}>
                    <span>{item.headline.replaceAll("_", " ")}</span>
                    <span className={`status ${item.status}`}>
                      {item.status === "matched"
                        ? "matched"
                        : `difference ₹${(item.differenceMinor / 100).toFixed(2)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Source freshness</h3>
              <ul className="freshness">
                {snapshot.state.sourceFreshness.map((source) => (
                  <li key={source.source}>
                    <span>{source.source.replaceAll("_", " ")}</span>
                    <span className={`status ${source.status}`}>{source.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        {!serverEnv.SOCHLE_DEMO_MODE && (
          <div className="actions">
            <form action="/api/fold/connect" method="post">
              <button type="submit">Connect Fold</button>
            </form>
            <form action="/api/sync" method="post">
              <button className="secondary" type="submit">
                Sync now
              </button>
            </form>
          </div>
        )}
      </section>
      <section className="card stack">
        <div className="row">
          <div>
            <h2>Paired browsers</h2>
            <p className="muted">Browsers allowed to request purchase decisions.</p>
          </div>
          <span className="status">
            {pairings.filter((pairing) => pairing.revokedAt === null).length} active
          </span>
        </div>
        {pairings.length === 0 ? (
          <p className="muted">No extension has been paired yet.</p>
        ) : (
          <ul className="freshness">
            {pairings.map((pairing) => (
              <li key={pairing.id}>
                <div>
                  <strong>{pairing.extensionOrigin}</strong>
                  <br />
                  <span className="muted">Paired {displayDate(pairing.createdAt)}</span>
                </div>
                {pairing.revokedAt === null && extensionRuntime !== null ? (
                  <form action={`/api/extension/pairings/${pairing.id}/revoke`} method="post">
                    <input
                      name="csrfToken"
                      type="hidden"
                      value={createPairingCsrfToken(
                        extensionRuntime.sessionSecret,
                        pairing.id,
                        new Date(Date.now() + 60 * 60 * 1000)
                      )}
                    />
                    <button className="secondary" type="submit">
                      Revoke
                    </button>
                  </form>
                ) : (
                  <span className="status disconnected">revoked</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p>
        <Link href="/money-inbox">Open Money Inbox →</Link>
      </p>
    </main>
  );
}
