import {
  extensionSessionSchema,
  type ExtensionBackgroundRequest,
  type ExtensionSession,
} from "@sochle/contracts/browser";
import { useEffect, useState } from "react";

type AppProps = {
  openUrl(url: string): void;
  sendMessage(message: ExtensionBackgroundRequest): Promise<unknown>;
};

function thresholdLabel(minor: number): string {
  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(minor / 100);
}

export function App({ openUrl, sendMessage }: AppProps) {
  const [session, setSession] = useState<ExtensionSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    let active = true;
    sendMessage({ operation: "getSession" })
      .then((response) => {
        if (active) setSession(extensionSessionSchema.parse(response));
      })
      .catch(() => {
        if (active) setNotice("Sochle couldn’t check this browser. Try again in a moment.");
      });
    return () => {
      active = false;
    };
  }, [sendMessage]);

  async function pair() {
    setBusy(true);
    setNotice(null);
    try {
      setSession(extensionSessionSchema.parse(await sendMessage({ operation: "pair" })));
    } catch {
      setNotice("Pairing didn’t finish. Your Sochle app is unchanged—try once more.");
    } finally {
      setBusy(false);
    }
  }

  async function checkCurrentProduct() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await sendMessage({ operation: "openCurrentProductCheck" });
      if (
        typeof response !== "object" ||
        response === null ||
        Reflect.get(response, "opened") !== true
      ) {
        setNotice(
          Reflect.get(response ?? {}, "reason") === "reload_required"
            ? "Reload this product tab once, then check again."
            : "Open a product on Amazon India, Flipkart, or Myntra, then check again."
        );
      }
    } catch {
      setNotice("That check didn’t start. Reload the product tab and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setNotice(null);
    try {
      await sendMessage({ operation: "disconnect" });
      setSession({ appUrl: session?.appUrl ?? "http://localhost:3000", kind: "unpaired" });
      setConfirmDisconnect(false);
    } catch {
      setNotice("This browser is still paired. Try disconnecting again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <header className="brand">
        <span aria-hidden="true" className="brand-mark">
          स
        </span>
        <div>
          <p className="eyebrow">Decide before you buy</p>
          <h1>सोचle.</h1>
        </div>
      </header>

      {session === null && notice === null && (
        <p aria-live="polite" className="loading">
          Checking this browser…
        </p>
      )}
      {notice !== null && <p role="alert">{notice}</p>}

      {session?.kind === "unpaired" && (
        <section>
          <p className="kicker">One quick setup</p>
          <h2>Pair this browser</h2>
          <p>Approve it once in Sochle. You’ll come straight back here when it’s ready.</p>
          <button className="primary full-width" disabled={busy} onClick={pair} type="button">
            {busy ? "Opening Sochle…" : "Pair this browser"}
          </button>
        </section>
      )}

      {session?.kind === "paired" && (
        <section>
          <div className="ready-row">
            <span aria-hidden="true" className="status-dot" />
            <div>
              <p className="kicker">Sochle is on</p>
              <h2>{session.ready ? "Ready to check" : "Finish setup first"}</h2>
            </div>
          </div>
          <p>
            {session.ready
              ? "Open a product and ask the only question that matters: does this fit?"
              : "Complete your setup in Sochle, then this browser can check purchases."}
          </p>
          <p className="merchant-list">Amazon India · Flipkart · Myntra</p>
          <div className="actions">
            {session.ready && (
              <button
                className="primary"
                disabled={busy}
                onClick={checkCurrentProduct}
                type="button"
              >
                {busy ? "Checking…" : "Check current product"}
              </button>
            )}
            <button
              className={session.ready ? "secondary" : "primary full-width"}
              onClick={() => openUrl(session.appUrl)}
              type="button"
            >
              {session.ready ? "Open Sochle" : "Finish setup"}
            </button>
          </div>

          <details className="connection-details">
            <summary>Browser connection</summary>
            <dl>
              <div>
                <dt>Connected to</dt>
                <dd>{session.appUrl}</dd>
              </div>
              <div>
                <dt>Automatic checks</dt>
                <dd>Above {thresholdLabel(session.thresholdMinor)}</dd>
              </div>
            </dl>
            {confirmDisconnect ? (
              <div className="confirm-row">
                <span>Remove this browser?</span>
                <button disabled={busy} onClick={disconnect} type="button">
                  Disconnect
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirmDisconnect(false)}
                  type="button"
                >
                  Keep it paired
                </button>
              </div>
            ) : (
              <button
                className="text-button"
                onClick={() => setConfirmDisconnect(true)}
                type="button"
              >
                Disconnect this browser
              </button>
            )}
          </details>
        </section>
      )}
    </main>
  );
}
