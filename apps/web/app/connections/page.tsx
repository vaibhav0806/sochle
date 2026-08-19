import Link from "next/link";

import { requireOwnerPage } from "../../lib/server/auth";
import { getRepository } from "../../lib/server/database";
import { getServerEnv } from "../../lib/server/env";
import { createPairingCsrfToken } from "../../lib/server/extension-auth";
import { getExtensionRuntime } from "../../lib/server/extension-runtime";
import { AutomaticSync } from "../_components/automatic-sync";

export const dynamic = "force-dynamic";

function displayDate(value: Date | null): string {
  return value === null ? "Not yet" : value.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

function resultMessage(result: string | undefined): string | null {
  if (result === undefined) return null;
  if (result === "connected") return "Your account is connected.";
  if (result === "synced") return "Your account picture is up to date.";
  if (result === "cached_throttled") return "You already have the latest available picture.";
  if (result === "connect_first") return "Reconnect your account before refreshing.";
  if (result === "reconnect_required") {
    return "Your account connection expired. Reconnect it to keep checking purchases.";
  }
  return "That action is complete.";
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
  const [snapshot, issues] =
    connection === null
      ? [null, []]
      : await Promise.all([
          repository!.getLatestSnapshot(connection.id),
          repository!.listOpenIssues(connection.id),
        ]);
  const needsUpdate = issues.some(
    (issue) => issue.severity === "blocking" && issue.relatedEntityType === "source"
  );
  const ready = snapshot !== null && !needsUpdate;
  const automaticSyncDue =
    !serverEnv.SOCHLE_DEMO_MODE &&
    connection?.status === "connected" &&
    (connection.lastSuccessfulSyncAt === null ||
      Date.now() - connection.lastSuccessfulSyncAt.getTime() >=
        serverEnv.SOCHLE_SYNC_MINIMUM_INTERVAL_MINUTES * 60 * 1000);
  const activePairings = pairings.filter((pairing) => pairing.revokedAt === null);

  return (
    <main className="page-stack">
      <div>
        <p className="eyebrow">Private connections</p>
        <h1>Connected account and browser</h1>
        <p>Keep Sochle ready to answer without bringing the machinery into every purchase.</p>
      </div>

      {serverEnv.SOCHLE_DEMO_MODE && <p className="notice">Demo mode is on.</p>}
      {resultMessage(result) !== null && <p className="notice">{resultMessage(result)}</p>}
      <AutomaticSync enabled={automaticSyncDue} />

      <section className="connection-card">
        <div className="connection-heading">
          <div>
            <p className="eyebrow">Account connection</p>
            <h2>{ready ? "Ready" : "Update needed"}</h2>
          </div>
          <span className={`connection-indicator ${ready ? "ready" : "needs-update"}`}>
            {ready ? "Ready" : "Update needed"}
          </span>
        </div>
        <p>
          {ready
            ? "Your latest available account picture is ready for purchase checks."
            : "Connect or refresh your account before relying on the next answer."}
        </p>
        <p className="muted">
          Last updated{" "}
          {displayDate(connection?.lastSuccessfulSyncAt ?? snapshot?.createdAt ?? null)}
        </p>
        {!serverEnv.SOCHLE_DEMO_MODE && (
          <div className="actions">
            <form action="/api/fold/connect" method="post">
              <button type="submit">
                {connection === null ? "Connect Fold" : "Reconnect Fold"}
              </button>
            </form>
            <form action="/api/sync" method="post">
              <button className="secondary" type="submit">
                Refresh with Fold
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="connection-card">
        <div className="connection-heading">
          <div>
            <p className="eyebrow">Browser extension</p>
            <h2>{activePairings.length === 0 ? "No browser paired yet" : "Browser ready"}</h2>
          </div>
          <span className="connection-indicator">
            {activePairings.length} {activePairings.length === 1 ? "browser" : "browsers"}
          </span>
        </div>
        <p>
          {activePairings.length === 0
            ? "Open the Sochle extension to pair this browser."
            : "This browser can ask Sochle about the product you’re viewing."}
        </p>
        <details className="connection-disclosure">
          <summary>Browser connection</summary>
          {pairings.length === 0 ? (
            <p className="muted">No browser connection details yet.</p>
          ) : (
            <ul>
              {pairings.map((pairing) => (
                <li key={pairing.id}>
                  <div>
                    <strong>{pairing.extensionOrigin}</strong>
                    <span>Paired {displayDate(pairing.createdAt)}</span>
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
                        Remove browser
                      </button>
                    </form>
                  ) : (
                    <span>Removed</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </details>
      </section>

      <Link href="/money-inbox">Review anything that needs attention →</Link>
    </main>
  );
}
