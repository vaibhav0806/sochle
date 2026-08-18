import { NextResponse } from "next/server";

import { parsePurchaseInput, PurchaseInputError } from "../../../lib/purchase-input";
import { isOwnerAuthenticated } from "../../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../../lib/server/database";
import {
  createDecisionService,
  DecisionPrerequisiteError,
} from "../../../lib/server/decision-service";
import { getServerEnv } from "../../../lib/server/env";

export async function POST(request: Request) {
  if (!(await isOwnerAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  if (financialRepository === null || decisionRepository === null) {
    return new Response("Database unavailable", { status: 503 });
  }
  const connection = await financialRepository.getConnection("fold");
  if (connection === null) return new Response("Fold connection unavailable", { status: 409 });

  try {
    const form = await request.formData();
    const input = parsePurchaseInput(form);
    const saved = await createDecisionService(
      financialRepository,
      decisionRepository
    ).checkPurchase({
      connectionId: connection.id,
      description: input.description,
      evaluatedAt: new Date().toISOString(),
      priceMinor: input.priceMinor,
    });
    return NextResponse.redirect(
      new URL(`/decisions/${saved.decision.id}`, getServerEnv().SOCHLE_APP_URL),
      303
    );
  } catch (error) {
    if (error instanceof DecisionPrerequisiteError) {
      return new Response(error.message, { status: 409 });
    }
    if (error instanceof PurchaseInputError) {
      return new Response("Invalid purchase", { status: 400 });
    }
    return new Response("Invalid purchase", { status: 400 });
  }
}
