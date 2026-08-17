import { describe, expect, it } from "vitest";

import { createStructuredLogger, redactFinancialData } from "./redaction";

describe("redactFinancialData", () => {
  it("redacts sensitive financial fields at any nesting depth", () => {
    expect(
      redactFinancialData({
        accessToken: "secret-token",
        context: {
          account_number: "1234567890",
          balance: 125_000,
          transaction: { narration: "PRIVATE PURCHASE", amount: 4_999 },
        },
        event: "fold_sync_completed",
      })
    ).toEqual({
      accessToken: "[REDACTED]",
      context: {
        account_number: "[REDACTED]",
        balance: "[REDACTED]",
        transaction: { narration: "[REDACTED]", amount: "[REDACTED]" },
      },
      event: "fold_sync_completed",
    });
  });

  it("writes one redacted JSON event without mutating the source", () => {
    const lines: string[] = [];
    const source = { event: "decision_created", totalBalance: 90_000 };
    const logger = createStructuredLogger((line) => lines.push(line));

    logger.info(source);

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      event: "decision_created",
      level: "info",
      totalBalance: "[REDACTED]",
    });
    expect(source.totalBalance).toBe(90_000);
  });

  it("preserves safe primitive and array structure while redacting nested values", () => {
    expect(
      redactFinancialData({
        attempts: 2,
        connected: true,
        event: "sync_attempted",
        items: [{ accountId: "private-id", status: "fresh" }, null],
      })
    ).toEqual({
      attempts: 2,
      connected: true,
      event: "sync_attempted",
      items: [{ accountId: "[REDACTED]", status: "fresh" }, null],
    });
  });
});
