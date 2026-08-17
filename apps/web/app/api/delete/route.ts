import { NextResponse } from "next/server";

import { isOwnerAuthenticated, ownerSessionCookie } from "../../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../../lib/server/database";
import { deleteOwnerData } from "../../../lib/server/data-deletion";
import { getServerEnv } from "../../../lib/server/env";

export async function POST(request: Request) {
  if (!(await isOwnerAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const form = await request.formData();
  if (form.get("confirmation") !== "DELETE") {
    return new Response("Type DELETE to confirm", { status: 400 });
  }
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  if (financialRepository === null || decisionRepository === null) {
    return new Response("Database unavailable", { status: 503 });
  }
  const connection = await financialRepository.getConnection("fold");
  if (connection === null) return new Response("Fold connection unavailable", { status: 409 });

  await deleteOwnerData({
    connectionId: connection.id,
    decisionRepository,
    revoker: null,
  });
  const response = NextResponse.redirect(
    new URL("/login?deleted=1", getServerEnv().SOCHLE_APP_URL),
    303
  );
  response.cookies.delete(ownerSessionCookie);
  return response;
}
