import { NextResponse } from "next/server";

import {
  isValidPurchaseStatus,
  validPlannedDate,
  type PurchaseStatus,
} from "../../../../../lib/purchase-status";
import { isOwnerAuthenticated } from "../../../../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../../../../lib/server/database";
import { getServerEnv } from "../../../../../lib/server/env";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  if (financialRepository === null || decisionRepository === null) {
    return new Response("Database unavailable", { status: 503 });
  }
  const connection = await financialRepository.getConnection("fold");
  if (connection === null) return new Response("Fold connection unavailable", { status: 409 });

  const form = await request.formData();
  const status = form.get("status");
  const plannedFor = form.get("plannedFor");
  if (typeof status !== "string" || !isValidPurchaseStatus(status)) {
    return new Response("Invalid status", { status: 400 });
  }
  if (
    status === "planned" &&
    (typeof plannedFor !== "string" ||
      !validPlannedDate(plannedFor, new Date().toISOString().slice(0, 10)))
  ) {
    return new Response("Invalid planned date", { status: 400 });
  }

  try {
    const { id } = await params;
    const updated = await decisionRepository.updateIntentStatus(
      connection.id,
      id,
      status as PurchaseStatus,
      status === "planned" ? (plannedFor as string) : null
    );
    return NextResponse.redirect(
      new URL(`/decisions/${updated.latestDecisionId}`, getServerEnv().SOCHLE_APP_URL),
      303
    );
  } catch {
    return new Response("Purchase intent not found", { status: 404 });
  }
}
