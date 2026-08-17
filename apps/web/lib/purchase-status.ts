export const purchaseStatuses = [
  "considering",
  "waiting",
  "planned",
  "purchased",
  "skipped",
  "not_relevant",
] as const;

export type PurchaseStatus = (typeof purchaseStatuses)[number];

export function isValidPurchaseStatus(value: string): value is PurchaseStatus {
  return (purchaseStatuses as readonly string[]).includes(value);
}

export function validPlannedDate(value: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return false;
  const difference = (parsed.getTime() - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000;
  return difference >= 0 && difference <= 365;
}
