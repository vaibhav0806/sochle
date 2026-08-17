"use client";

import { useEffect, useState } from "react";

export function AutomaticSync({ enabled }: { enabled: boolean }) {
  const [status, setStatus] = useState<"idle" | "syncing" | "done">("idle");

  useEffect(() => {
    if (!enabled || status !== "idle") return;
    setStatus("syncing");
    void fetch("/api/sync?automatic=1", { method: "POST" }).finally(() => setStatus("done"));
  }, [enabled, status]);

  return status === "syncing" ? <p className="muted">Refreshing in the background…</p> : null;
}
