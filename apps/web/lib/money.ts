const RUPEE_INPUT = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

function parseMinor(value: string, allowZero: boolean): number {
  const match = RUPEE_INPUT.exec(value);
  if (match === null) throw new Error("Enter a rupee amount with at most two decimals");
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  const minor = whole * 100n + fraction;
  if ((!allowZero && minor === 0n) || minor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Rupee amount is outside the supported range");
  }
  return Number(minor);
}

export function parseRupeesToMinor(value: string): number {
  return parseMinor(value, false);
}

export function parseNonNegativeRupeesToMinor(value: string): number {
  return parseMinor(value, true);
}

function groupIndianDigits(value: string): string {
  if (value.length <= 3) return value;
  const lastThree = value.slice(-3);
  const prefix = value.slice(0, -3);
  const groups: string[] = [];
  for (let end = prefix.length; end > 0; end -= 2) {
    groups.unshift(prefix.slice(Math.max(0, end - 2), end));
  }
  return `${groups.join(",")},${lastThree}`;
}

export function formatMinorAsRupees(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error("Money must use integer paise");
  const absolute = Math.abs(minor);
  const whole = Math.floor(absolute / 100).toString();
  const fraction = (absolute % 100).toString().padStart(2, "0");
  return `${minor < 0 ? "-" : ""}₹${groupIndianDigits(whole)}.${fraction}`;
}
