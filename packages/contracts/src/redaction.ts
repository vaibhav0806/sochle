type LogEvent = Record<string, unknown>;
type LogLevel = "info" | "warn" | "error";

const sensitiveKeySuffixes = [
  "token",
  "accountid",
  "accountnumber",
  "amount",
  "balance",
  "narration",
  "sourceid",
  "transactionid",
];

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
  return sensitiveKeySuffixes.some((suffix) => normalizedKey.endsWith(suffix));
}

export function redactFinancialData(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactFinancialData);
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      isSensitiveKey(key) ? "[REDACTED]" : redactFinancialData(nestedValue),
    ])
  );
}

export function createStructuredLogger(write: (line: string) => void = console.log) {
  const log = (level: LogLevel, event: LogEvent) => {
    const redactedEvent = redactFinancialData(event) as LogEvent;
    write(
      JSON.stringify({
        ...redactedEvent,
        level,
        timestamp: new Date().toISOString(),
      })
    );
  };

  return {
    error: (event: LogEvent) => log("error", event),
    info: (event: LogEvent) => log("info", event),
    warn: (event: LogEvent) => log("warn", event),
  };
}
