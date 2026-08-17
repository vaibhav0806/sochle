import { foldCoreResponses } from "@sochle/fixtures";
import { describe, expect, it } from "vitest";

import { detectDataIssues } from "./issues";
import { normalizeFoldSnapshot } from "./normalize";

describe("detectDataIssues", () => {
  it("flags a large included debit without a Sochle classification", () => {
    const state = normalizeFoldSnapshot(foldCoreResponses, "2026-08-17T06:30:00.000Z");

    expect(detectDataIssues(state, { largeTransactionMinor: 500_000 })).toContainEqual({
      details: { merchant: "Demo Store" },
      materialityMinor: 650_000,
      relatedEntityId: "demo_transaction_untagged",
      relatedEntityType: "transaction",
      severity: "blocking",
      type: "large_untagged_transaction",
    });
  });

  it("flags each required source whose normalized freshness is stale or missing", () => {
    const state = normalizeFoldSnapshot(foldCoreResponses, "2026-08-18T07:00:00.000Z");

    expect(detectDataIssues(state, { largeTransactionMinor: 500_000 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relatedEntityId: "total_balance", type: "stale_source" }),
        expect.objectContaining({ relatedEntityId: "mutual_funds", type: "missing_source" }),
      ])
    );
  });

  it("queues suspected transfers and card repayments for confirmation", () => {
    const state = normalizeFoldSnapshot(foldCoreResponses, "2026-08-17T06:30:00.000Z");
    state.transactions.push(
      {
        ...state.transactions[0]!,
        sochleClassification: "transfer",
        sourceTransactionId: "suspected-transfer",
      },
      {
        ...state.transactions[0]!,
        sochleClassification: "credit_card_payment",
        sourceTransactionId: "suspected-card-payment",
      }
    );

    const issues = detectDataIssues(state, { largeTransactionMinor: 500_000 });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relatedEntityId: "suspected-transfer",
          type: "suspected_transfer",
        }),
        expect.objectContaining({
          relatedEntityId: "suspected-card-payment",
          type: "suspected_card_repayment",
        }),
      ])
    );
  });
});
