import { NextResponse } from "next/server";

import { parseRupeesToMinor } from "../../../lib/money";
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
    const rawDescription = form.get("description");
    const rawPrice = form.get("price");
    if (typeof rawDescription !== "string" || typeof rawPrice !== "string") {
      return new Response("Invalid purchase", { status: 400 });
    }
    const description = rawDescription.trim();
    if (description.length === 0 || description.length > 120) {
      return new Response("Invalid purchase", { status: 400 });
    }
    const saved = await createDecisionService(
      financialRepository,
      decisionRepository
    ).checkPurchase({
      connectionId: connection.id,
      description,
      evaluatedAt: new Date().toISOString(),
      priceMinor: parseRupeesToMinor(rawPrice),
    });
    return NextResponse.redirect(
      new URL(`/decisions/${saved.decision.id}`, getServerEnv().SOCHLE_APP_URL),
      303
    );
  } catch (error) {
    if (error instanceof DecisionPrerequisiteError) {
      return new Response(error.message, { status: 409 });
    }
    return new Response("Invalid purchase", { status: 400 });
  }
}
