import {
  createSochleDatabase,
  DecisionRepository,
  ExtensionRepository,
  FinancialRepository,
  auditEvents,
  extensionPairingRequests,
} from "@sochle/db";
import {
  DEFAULT_RULES,
  REQUIRED_DECISION_SOURCES,
  type NormalizedFinancialState,
  type RuleSet,
} from "@sochle/domain";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashExtensionCredential } from "./extension-auth";
import {
  createExtensionDecisionService,
  handleCreateExtensionDecision,
  handleExtensionOutcome,
} from "./extension-decision-service";
import { createExtensionPairingService } from "./extension-pairing-service";

const database = createSochleDatabase(
  process.env.TEST_DATABASE_URL ?? "postgresql://sochle:sochle@localhost:65432/sochle_verify"
);
const financialRepository = new FinancialRepository(database.db);
const decisionRepository = new DecisionRepository(database.db);
const extensionRepository = new ExtensionRepository(database.db);
const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const extensionOrigin = `chrome-extension://${extensionId}`;
const evaluatedAt = "2026-08-18T08:00:00.000Z";
const rawCredential = "extension-secret-one";

const state: NormalizedFinancialState = {
  accounts: [],
  asOf: evaluatedAt,
  cardObligations: { currency: "INR", minor: 0 },
  exclusions: [],
  expectedIncome: [],
  investmentContext: { mutualFunds: null, netWorth: null, stocks: null },
  liquidCash: { currency: "INR", minor: 150_000_00 },
  observedMonthlySpending: { currency: "INR", minor: 40_000_00 },
  reconciliation: [],
  sourceFreshness: REQUIRED_DECISION_SOURCES.map((source) => ({
    refreshedAt: "2026-08-18T06:00:00.000Z",
    source,
    status: "fresh",
  })),
  transactions: [],
  upcomingObligations: [],
};
const rules: RuleSet = {
  ...DEFAULT_RULES,
  essentialMonthlySpending: { currency: "INR", minor: 40_000_00 },
  minimumBuffer: { currency: "INR", minor: 25_000_00 },
  salary: { amount: { currency: "INR", minor: 0 }, confirmed: true, dayOfMonth: 31 },
  version: 1,
};

const product = {
  correctedPrice: { currency: "INR" as const, minor: 10_000_00 },
  correctedTitle: "Synthetic headphones",
  extracted: {
    canonicalUrl: "https://www.amazon.in/dp/SYNTHETIC",
    confidence: "high" as const,
    merchant: "amazon.in" as const,
    price: { currency: "INR" as const, minor: 12_000_00 },
    title: "Synthetic headphones MRP title",
  },
  idempotencyKey: "10000000-0000-4000-8000-000000000001",
};

beforeEach(async () => {
  const connection = await financialRepository.getConnection("fold");
  if (connection !== null) await decisionRepository.deleteOwnerData(connection.id);
  await database.db.delete(extensionPairingRequests);
});

afterAll(async () => {
  await database.close();
});

async function createPairing(raw = rawCredential) {
  const connection = await financialRepository.ensureConnection("fold");
  const request = await extensionRepository.createPairingRequest({
    callbackUrl: `https://${extensionId}.chromiumapp.org/pair`,
    createdAt: new Date(evaluatedAt),
    credentialHash: hashExtensionCredential(raw),
    expiresAt: new Date("2026-08-18T08:10:00.000Z"),
    extensionOrigin,
  });
  const pairing = await extensionRepository.approvePairingRequest(
    request.id,
    connection.id,
    new Date("2026-08-18T08:05:00.000Z")
  );
  return { connection, pairing };
}

async function seedPrerequisites(connectionId: string, snapshot = true, ruleSet = true) {
  if (snapshot) await financialRepository.saveSnapshot(connectionId, state, "extension-snapshot");
  if (ruleSet) await decisionRepository.createRuleSet(connectionId, rules);
}

function decisionService() {
  return createExtensionDecisionService({
    appOrigin: "http://localhost:3000",
    decisionRepository,
    financialRepository,
    now: () => new Date(evaluatedAt),
  });
}

function pairingService() {
  return createExtensionPairingService({
    appUrl: "http://localhost:3000",
    extensionRepository,
    financialRepository,
    now: () => new Date(evaluatedAt),
    sessionSecret: "synthetic-session-secret-at-least-32-characters",
  });
}

function extensionRequest(body: unknown, credential = rawCredential) {
  return new Request("http://localhost:3000/api/extension/decisions", {
    body: JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${credential}`,
      "Content-Type": "application/json",
      Origin: extensionOrigin,
    },
    method: "POST",
  });
}

describe("extension decision service", () => {
  it("accepts threshold equality, persists provenance, and retries idempotently", async () => {
    const { connection, pairing } = await createPairing();
    await seedPrerequisites(connection.id);

    const first = await decisionService().evaluate(pairing, product);
    const retry = await decisionService().evaluate(pairing, product);

    expect(retry).toEqual(first);
    const stored = await decisionRepository.getDecisionByExtensionRequest(
      pairing.id,
      product.idempotencyKey
    );
    expect(stored).toMatchObject({
      intent: {
        canonicalUrl: product.extracted.canonicalUrl,
        description: product.correctedTitle,
        extractedPriceMinor: product.extracted.price.minor,
        extractedTitle: product.extracted.title,
        extractionConfidence: "high",
        merchant: "amazon.in",
        priceMinor: product.correctedPrice.minor,
      },
    });
    await expect(decisionRepository.listDecisions(connection.id)).resolves.toHaveLength(1);
    const events = await database.db.select().from(auditEvents);
    expect(events.filter((event) => event.type === "decision_created")).toHaveLength(1);
  });

  it("returns stable prerequisite and threshold error codes", async () => {
    const { connection, pairing } = await createPairing();
    await expect(decisionService().evaluate(pairing, product)).rejects.toMatchObject({
      code: "missing_rules",
    });
    await seedPrerequisites(connection.id, false, true);
    await expect(decisionService().evaluate(pairing, product)).rejects.toMatchObject({
      code: "missing_snapshot",
    });
    await financialRepository.saveSnapshot(connection.id, state, "extension-snapshot");
    await expect(
      decisionService().evaluate(pairing, {
        ...product,
        correctedPrice: { currency: "INR", minor: 9_999_99 },
      })
    ).rejects.toMatchObject({ code: "below_threshold" });
  });

  it("updates outcomes idempotently and rejects cross-pairing access", async () => {
    const { connection, pairing } = await createPairing();
    await seedPrerequisites(connection.id);
    const card = await decisionService().evaluate(pairing, product);

    await expect(decisionService().setOutcome(pairing, card.intentId, "waiting")).resolves.toEqual({
      status: "waiting",
    });
    await expect(decisionService().setOutcome(pairing, card.intentId, "waiting")).resolves.toEqual({
      status: "waiting",
    });
    const otherPairing = (await createPairing("extension-secret-two")).pairing;
    await expect(
      decisionService().setOutcome(otherPairing, card.intentId, "purchased")
    ).rejects.toMatchObject({ code: "not_found" });
    const events = await database.db.select().from(auditEvents);
    expect(events.filter((event) => event.type === "intent_status_changed")).toHaveLength(1);
  });

  it("authenticates strict route bodies and returns exact-origin CORS", async () => {
    const { connection } = await createPairing();
    await seedPrerequisites(connection.id);
    const response = await handleCreateExtensionDecision(
      extensionRequest(product),
      pairingService(),
      decisionService()
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(extensionOrigin);
    const card = await response.json();
    expect(card).toMatchObject({ intentId: expect.any(String), priceMinor: 10_000_00 });

    const invalid = await handleCreateExtensionDecision(
      extensionRequest({ ...product, unexpected: true }),
      pairingService(),
      decisionService()
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ error: { code: "invalid_product" } });

    const unpaired = await handleCreateExtensionDecision(
      extensionRequest(product, "wrong-extension-secret"),
      pairingService(),
      decisionService()
    );
    expect(unpaired.status).toBe(401);
    await expect(unpaired.json()).resolves.toMatchObject({ error: { code: "unpaired" } });

    const outcome = await handleExtensionOutcome(
      extensionRequest({ outcome: "purchased" }),
      card.intentId,
      pairingService(),
      decisionService()
    );
    expect(outcome.status).toBe(200);
    await expect(outcome.json()).resolves.toEqual({ status: "purchased" });
  });
});
