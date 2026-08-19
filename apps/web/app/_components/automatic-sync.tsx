"use client";

import { useEffect, useState } from "react";

export function AutomaticSync({ enabled }: { enabled: boolean }) {
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "reconnect">("idle");

  useEffect(() => {
    if (!enabled || status !== "idle") return;
    setStatus("syncing");
    void fetch("/api/sync?automatic=1", { method: "POST" })
      .then(async (response) => {
        const body = (await response.json()) as { result?: string };
        setStatus(body.result === "reconnect_required" ? "reconnect" : "done");
      })
      .catch(() => setStatus("done"));
  }, [enabled, status]);

  if (status === "reconnect") {
    return (
      <div aria-live="polite" className="notice">
        <p>Your account connection expired.</p>
        <form action="/api/fold/connect" method="post">
          <button type="submit">Reconnect account</button>
        </form>
      </div>
    );
  }

  return status === "syncing" ? (
    <p aria-live="polite" className="notice">
      Updating your account picture…
    </p>
  ) : null;
}
