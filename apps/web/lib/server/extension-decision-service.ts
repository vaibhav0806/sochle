import {
  extensionDecisionCardSchema,
  productDecisionRequestSchema,
  purchaseOutcomeSchema,
  type ExtensionDecisionCard,
  type ProductDecisionRequest,
  type PurchaseOutcome,
} from "@sochle/contracts";
import type { DecisionResult } from "@sochle/domain";
import type { DecisionRepository, FinancialRepository } from "@sochle/db";
import { z } from "zod";

import { extensionCorsHeaders, parseExtensionOrigin } from "./extension-auth";
import { createDecisionService, DecisionPrerequisiteError } from "./decision-service";
import type { createExtensionPairingService } from "./extension-pairing-service";
import { presentDecision } from "../presentation/decision";

type SavedExtensionDecision = {
  decision: { id: string };
  intent: { id: string; priceMinor: number };
  result: DecisionResult;
};

type ExtensionPairing = { connectionId: string; id: string };
type ExtensionPairingService = ReturnType<typeof createExtensionPairingService>;
type ExtensionErrorCode =
  | "invalid_product"
  | "missing_rules"
  | "missing_snapshot"
  | "not_found"
  | "unexpected"
  | "unpaired";

const outcomeBodySchema = z.object({ outcome: purchaseOutcomeSchema }).strict();

export class ExtensionDecisionError extends Error {
  constructor(
    readonly code: ExtensionErrorCode,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ExtensionDecisionError";
  }
}

export function projectExtensionDecision(
  saved: SavedExtensionDecision,
  appOrigin: string
): ExtensionDecisionCard {
  return extensionDecisionCardSchema.parse({
    decisionUrl: new URL(`/decisions/${saved.decision.id}`, appOrigin).toString(),
    evaluatedAt: saved.result.evaluatedAt,
    firstComfortablyAffordableDate: saved.result.firstComfortablyAffordableDate,
    intentId: saved.intent.id,
    presentation: presentDecision(saved.result),
    priceMinor: saved.intent.priceMinor,
    verdict: saved.result.verdict,
  });
}

export function createExtensionDecisionService(options: {
  appOrigin: string;
  decisionRepository: DecisionRepository;
  financialRepository: FinancialRepository;
  now(): Date;
}) {
  const core = createDecisionService(options.financialRepository, options.decisionRepository);
  return {
    async evaluate(pairing: ExtensionPairing, rawInput: unknown) {
      const input = productDecisionRequestSchema.parse(rawInput);
      const ruleSet = await options.decisionRepository.getActiveRuleSet(pairing.connectionId);
      if (ruleSet === null) {
        throw new ExtensionDecisionError("missing_rules", "Save decision rules first", 409);
      }
      try {
        const saved = await core.checkPurchase({
          connectionId: pairing.connectionId,
          description: input.correctedTitle,
          evaluatedAt: options.now().toISOString(),
          extensionContext: {
            canonicalUrl: input.extracted.canonicalUrl,
            extractedPriceMinor: input.extracted.price?.minor ?? null,
            extractedTitle: input.extracted.title,
            extractionConfidence: input.extracted.confidence,
            idempotencyKey: input.idempotencyKey,
            merchant: input.extracted.merchant,
            pairingId: pairing.id,
          },
          priceMinor: input.correctedPrice.minor,
        });
        return projectExtensionDecision(saved, options.appOrigin);
      } catch (error) {
        if (error instanceof DecisionPrerequisiteError) {
          throw new ExtensionDecisionError(
            error.prerequisite === "rules" ? "missing_rules" : "missing_snapshot",
            `Missing decision ${error.prerequisite}`,
            409
          );
        }
        throw error;
      }
    },

    async setOutcome(pairing: ExtensionPairing, intentId: string, outcome: PurchaseOutcome) {
      try {
        const updated = await options.decisionRepository.updateExtensionIntentStatus(
          pairing.connectionId,
          pairing.id,
          intentId,
          outcome
        );
        return { status: updated.status };
      } catch {
        throw new ExtensionDecisionError("not_found", "Purchase intent not found", 404);
      }
    },
  };
}

type ExtensionDecisionService = ReturnType<typeof createExtensionDecisionService>;

function errorResponse(error: unknown, headers: HeadersInit): Response {
  if (error instanceof ExtensionDecisionError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { headers, status: error.status }
    );
  }
  if (error instanceof z.ZodError) {
    return Response.json(
      { error: { code: "invalid_product", message: "Invalid product request" } },
      { headers, status: 400 }
    );
  }
  return Response.json(
    { error: { code: "unexpected", message: "Unable to complete the request" } },
    { headers, status: 500 }
  );
}

async function authenticate(request: Request, pairingService: ExtensionPairingService) {
  try {
    const pairing = await pairingService.authenticateRequest(request);
    if (pairing !== null) return pairing;
  } catch {
    // Authentication failures intentionally share one response.
  }
  throw new ExtensionDecisionError("unpaired", "Pair the extension to continue", 401);
}

export async function handleCreateExtensionDecision(
  request: Request,
  pairingService: ExtensionPairingService,
  decisionService: ExtensionDecisionService
): Promise<Response> {
  const { origin } = parseExtensionOrigin(request.headers.get("Origin"));
  const headers = extensionCorsHeaders(origin);
  try {
    const pairing = await authenticate(request, pairingService);
    const input: ProductDecisionRequest = productDecisionRequestSchema.parse(await request.json());
    const card = await decisionService.evaluate(pairing, input);
    return Response.json(card, { headers, status: 201 });
  } catch (error) {
    return errorResponse(error, headers);
  }
}

export async function handleExtensionOutcome(
  request: Request,
  intentId: string,
  pairingService: ExtensionPairingService,
  decisionService: ExtensionDecisionService
): Promise<Response> {
  const { origin } = parseExtensionOrigin(request.headers.get("Origin"));
  const headers = extensionCorsHeaders(origin);
  try {
    const pairing = await authenticate(request, pairingService);
    const { outcome } = outcomeBodySchema.parse(await request.json());
    return Response.json(await decisionService.setOutcome(pairing, intentId, outcome), {
      headers,
      status: 200,
    });
  } catch (error) {
    return errorResponse(error, headers);
  }
}
