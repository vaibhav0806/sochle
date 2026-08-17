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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

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
  const [error, setError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    let active = true;
    sendMessage({ operation: "getSession" })
      .then((response) => {
        if (active) setSession(extensionSessionSchema.parse(response));
      })
      .catch((reason: unknown) => {
        if (active) setError(errorMessage(reason));
      });
    return () => {
      active = false;
    };
  }, [sendMessage]);

  async function pair() {
    setBusy(true);
    setError(null);
    try {
      setSession(extensionSessionSchema.parse(await sendMessage({ operation: "pair" })));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function checkCurrentProduct() {
    setError(null);
    const response = await sendMessage({ operation: "openCurrentProductCheck" });
    if (
      typeof response !== "object" ||
      response === null ||
      Reflect.get(response, "opened") !== true
    ) {
      setError("Open a product on Amazon India, Flipkart, or Myntra, then try again.");
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await sendMessage({ operation: "disconnect" });
      setSession({ appUrl: session?.appUrl ?? "http://localhost:3000", kind: "unpaired" });
      setConfirmDisconnect(false);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <p className="eyebrow">Decide before you buy</p>
      <h1>सोचle.</h1>
      {session === null && error === null && <p>Checking your browser…</p>}
      {error !== null && <p role="alert">{error}</p>}
      {session?.kind === "unpaired" && (
        <section>
          <h2>Your money stays in the app</h2>
          <p>Sign in once on Sochle, approve this browser, and come straight back.</p>
          <button disabled={busy} onClick={pair} type="button">
            {error === null ? "Sign in to Sochle" : "Try pairing again"}
          </button>
        </section>
      )}
      {session?.kind === "paired" && (
        <section>
          <div className="status-row">
            <span className="status-dot" />
            <div>
              <h2>Connected to Sochle</h2>
              <p className="muted">{session.appUrl}</p>
            </div>
          </div>
          <p>
            {session.ready
              ? `Auto-prompts start at ${thresholdLabel(session.thresholdMinor)}.`
              : "Set rules and sync a snapshot in Sochle before checking a purchase."}
          </p>
          <p className="muted">
            Works on Amazon India, Flipkart, and Myntra. You can manually check even below your
            threshold.
          </p>
          <div className="actions">
            <button onClick={checkCurrentProduct} type="button">
              Check current product
            </button>
            <button className="secondary" onClick={() => openUrl(session.appUrl)} type="button">
              Open Sochle
            </button>
          </div>
          {confirmDisconnect ? (
            <div className="confirm-row">
              <span>Remove this browser?</span>
              <button disabled={busy} onClick={disconnect} type="button">
                Yes, disconnect
              </button>
              <button
                className="text-button"
                onClick={() => setConfirmDisconnect(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              className="text-button"
              onClick={() => setConfirmDisconnect(true)}
              type="button"
            >
              Disconnect
            </button>
          )}
        </section>
      )}
    </main>
  );
}
