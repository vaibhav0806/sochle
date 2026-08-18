import type { PurchaseStatus } from "../purchase-status";

const labels: Record<PurchaseStatus, string> = {
  considering: "Considering",
  not_relevant: "Not relevant",
  planned: "Planned",
  purchased: "Bought",
  skipped: "Passed",
  waiting: "Waiting",
};

export function purchaseStatusLabel(status: PurchaseStatus): string {
  return labels[status];
}

export function relativeUpdateLabel(value: Date, now = new Date()): string {
  const differenceDays = Math.max(0, Math.floor((now.getTime() - value.getTime()) / 86_400_000));
  if (differenceDays === 0) return "Just now";
  if (differenceDays === 1) return "Yesterday";
  return `${differenceDays} days ago`;
}
