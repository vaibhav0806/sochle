export type InrMoney = {
  currency: "INR";
  minor: number;
};

const plainRupees = /^(?:0|[1-9]\d*)$/;
const indianGrouping = /^(?:[1-9]\d{0,2})(?:,\d{2})*,\d{3}$/;
const westernGrouping = /^(?:[1-9]\d{0,2})(?:,\d{3})+$/;

export function parseInrPrice(text: string): InrMoney | null {
  const match = text.trim().match(/^(?:₹|INR)[ \t\u00a0\u202f]*([0-9][0-9,]*)(?:\.([0-9]{2}))?$/);
  if (match === null) return null;
  const groupedRupees = match[1]!;
  if (
    !plainRupees.test(groupedRupees) &&
    !indianGrouping.test(groupedRupees) &&
    !westernGrouping.test(groupedRupees)
  ) {
    return null;
  }
  const rupees = BigInt(groupedRupees.replaceAll(",", ""));
  const paise = BigInt(match[2] ?? "00");
  const minor = rupees * 100n + paise;
  if (minor <= 0n || minor > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { currency: "INR", minor: Number(minor) };
}
