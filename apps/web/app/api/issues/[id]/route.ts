import { NextResponse } from "next/server";
import { z } from "zod";

import { isOwnerAuthenticated } from "../../../../lib/server/auth";
import { getRepository } from "../../../../lib/server/database";
import { getServerEnv } from "../../../../lib/server/env";

const resolutionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("classify"),
    classification: z.enum([
      "consumption",
      "investment",
      "transfer",
      "credit_card_payment",
      "refund",
      "lending",
      "income",
    ]),
  }),
  z.object({ action: z.enum(["exclude", "ignore_once"]) }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const repository = getRepository();
  if (repository === null) return new Response("Database unavailable", { status: 503 });
  const form = await request.formData();
  const parsed = resolutionSchema.safeParse({
    action: form.get("action"),
    classification: form.get("classification"),
  });
  if (!parsed.success) return new Response("Invalid resolution", { status: 400 });
  const { id } = await params;
  await repository.resolveIssue(id, parsed.data);
  return NextResponse.redirect(new URL("/money-inbox", getServerEnv().SOCHLE_APP_URL), 303);
}
