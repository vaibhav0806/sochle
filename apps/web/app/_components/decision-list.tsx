import type { DecisionPresentation } from "@sochle/contracts";
import Link from "next/link";

export type DecisionListItem = {
  description: string;
  id: string;
  presentation: DecisionPresentation;
  priceLabel: string;
  statusLabel: string;
  updatedLabel: string;
};

export function DecisionList({ items }: { items: DecisionListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="decision-empty">
        <p className="muted">Your answers will appear here after your first check.</p>
        <Link href="/check">Check a purchase →</Link>
      </div>
    );
  }

  return (
    <div className="decision-list">
      {items.map((item) => (
        <Link className="decision-row" href={`/decisions/${item.id}`} key={item.id}>
          <span>
            <strong>{item.description}</strong>
            <small>
              {item.priceLabel} · {item.presentation.title}
            </small>
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
