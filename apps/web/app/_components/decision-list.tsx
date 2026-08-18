import type { DecisionPresentation } from "@sochle/contracts";
import Link from "next/link";

export type DecisionListItem = {
  description: string;
  id: string;
  presentation: DecisionPresentation;
  statusLabel: string;
  updatedLabel: string;
};

export function DecisionList({ items }: { items: DecisionListItem[] }) {
  if (items.length === 0) {
    return <p className="muted">Your recent answers will appear here after your first check.</p>;
  }

  return (
    <div className="decision-list">
      {items.map((item) => (
        <Link className="decision-row" href={`/decisions/${item.id}`} key={item.id}>
          <span>
            <strong>{item.description}</strong>
            <small>{item.presentation.title}</small>
          </span>
          <span className="decision-row-meta">
            <span>{item.statusLabel}</span>
            <small>{item.updatedLabel}</small>
          </span>
        </Link>
      ))}
    </div>
  );
}
