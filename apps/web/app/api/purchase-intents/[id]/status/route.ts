import { NextResponse } from "next/server";

import { isOwnerAuthenticated } from "../../../../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../../../../lib/server/database";
import { getServerEnv } from "../../../../../lib/server/env";

const STATUSES = new Set(["considering", "planned", "purchased", "skipped"] as const);

function validPlannedDate(value: string, today: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    return false;
  const difference = (parsed.getTime() - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000;
  return difference >= 0 && difference <= 365;
}

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
  if (typeof status !== "string" || !STATUSES.has(status as never)) {
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
      status as "considering" | "planned" | "purchased" | "skipped",
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
