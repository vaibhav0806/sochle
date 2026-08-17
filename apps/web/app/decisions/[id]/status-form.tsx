"use client";

import { useState } from "react";

type PurchaseStatus = "considering" | "planned" | "purchased" | "skipped";

export function StatusForm({
  intentId,
  plannedFor,
  status,
}: {
  intentId: string;
  plannedFor: string | null;
  status: PurchaseStatus;
}) {
  const [selected, setSelected] = useState<PurchaseStatus>(status);
  return (
    <form action={`/api/purchase-intents/${intentId}/status`} method="post" className="card stack">
      <h2>Purchase status</h2>
      <label>
        Purchase status
        <select
          name="status"
          value={selected}
          onChange={(event) => setSelected(event.target.value as PurchaseStatus)}
        >
          <option value="considering">Considering</option>
          <option value="planned">Planned</option>
          <option value="purchased">Purchased</option>
          <option value="skipped">Skipped</option>
        </select>
      </label>
      {selected === "planned" && (
        <label>
          Planned for
          <input name="plannedFor" type="date" defaultValue={plannedFor ?? ""} required />
        </label>
      )}
      <button type="submit">Update status</button>
    </form>
  );
}
