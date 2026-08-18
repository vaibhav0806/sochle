import { foldCoreResponses } from "@sochle/fixtures";
import { describe, expect, it } from "vitest";

import { detectDataIssues } from "./issues";
import { normalizeFoldSnapshot } from "./normalize";

describe("detectDataIssues", () => {
  it("keeps a large included debit as optional cleanup with no liquidity effect", () => {
    const state = normalizeFoldSnapshot(foldCoreResponses, "2026-08-17T06:30:00.000Z");

    expect(detectDataIssues(state, { largeTransactionMinor: 500_000 })).toContainEqual({
      details: {
        liquidityEffectMaxMinor: 0,
        liquidityEffectMinMinor: 0,
        merchant: "Demo Store",
      },
      materialityMinor: 650_000,
      relatedEntityId: "demo_transaction_untagged",
      relatedEntityType: "transaction",
      severity: "warning",
      type: "large_untagged_transaction",
    });
  });

  it("flags stale required sources without queueing optional investment context", () => {
    const state = normalizeFoldSnapshot(foldCoreResponses, "2026-08-18T07:00:00.000Z");

    expect(detectDataIssues(state, { largeTransactionMinor: 500_000 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relatedEntityId: "total_balance", type: "stale_source" }),
      ])
    );
    expect(detectDataIssues(state, { largeTransactionMinor: 500_000 })).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relatedEntityId: "mutual_funds" }),
        expect.objectContaining({ relatedEntityId: "stocks" }),
      ])
    );
  });

  it("trusts source-classified transfers and card repayments without duplicate review", () => {
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

    expect(issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ relatedEntityId: "suspected-transfer" }),
        expect.objectContaining({ relatedEntityId: "suspected-card-payment" }),
      ])
    );
  });
});
