import { NextResponse } from "next/server";

import { isOwnerAuthenticated } from "../../../../lib/server/auth";
import { getRepository } from "../../../../lib/server/database";
import { createFoldSession } from "../../../../lib/server/fold";

export async function GET(request: Request) {
  if (!(await isOwnerAuthenticated())) return NextResponse.redirect(new URL("/login", request.url));
  const repository = getRepository();
  if (repository === null) return new Response("Live data is disabled", { status: 503 });
  const connection = await repository.ensureConnection("fold");
  const params = new URL(request.url).searchParams;
  const { oauth, session } = createFoldSession(repository, connection.id, () => undefined);

  try {
    await oauth.consumeState(params.get("state"));
    await session.finishAuth(params);
    await session.connect();
    await repository.setConnectionStatus(connection.id, "connected");
    return NextResponse.redirect(new URL("/connections?result=connected", request.url));
  } catch (error) {
    await repository.setConnectionStatus(connection.id, "error");
    throw error;
  } finally {
    await session.close().catch(() => undefined);
  }
}
