"use client";

import { useState } from "react";

type PurchaseStatus =
  "considering" | "waiting" | "planned" | "purchased" | "skipped" | "not_relevant";

export function StatusForm({
  firstComfortablyAffordableDate,
  intentId,
  plannedFor,
  status,
}: {
  firstComfortablyAffordableDate: string | null;
  intentId: string;
  plannedFor: string | null;
  status: PurchaseStatus;
}) {
  const [selected, setSelected] = useState<"considering" | "planned" | "not_relevant">(
    status === "planned" || status === "not_relevant" ? status : "considering"
  );

  return (
    <section className="decision-outcome stack">
      <div>
        <p className="eyebrow">Your call</p>
        <h2>What did you decide?</h2>
      </div>
      <form
        action={`/api/purchase-intents/${intentId}/status`}
        className="outcome-actions"
        method="post"
      >
        <button name="status" type="submit" value="purchased">
          Buy
        </button>
        <button name="status" type="submit" value="waiting">
          Wait
        </button>
        <button name="status" type="submit" value="skipped">
          Pass
        </button>
      </form>
      <details className="outcome-editor">
        <summary>Plan it or choose another outcome</summary>
        <form action={`/api/purchase-intents/${intentId}/status`} className="stack" method="post">
          <label>
            Purchase status
            <select
              name="status"
              value={selected}
              onChange={(event) =>
                setSelected(event.target.value as "considering" | "planned" | "not_relevant")
              }
            >
              <option value="considering">Considering</option>
              <option value="planned">Planned</option>
              <option value="not_relevant">Not relevant</option>
            </select>
          </label>
          {selected === "planned" && (
            <label>
              Planned for
              <input
                defaultValue={plannedFor ?? firstComfortablyAffordableDate ?? ""}
                name="plannedFor"
                required
                type="date"
              />
            </label>
          )}
          <button type="submit">Update status</button>
        </form>
      </details>
    </section>
  );
}
