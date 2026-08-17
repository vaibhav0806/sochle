import { NextResponse } from "next/server";

import { isOwnerAuthenticated } from "../../../../lib/server/auth";
import { getRepository } from "../../../../lib/server/database";
import { createFoldSession } from "../../../../lib/server/fold";

export async function POST(request: Request) {
  if (!(await isOwnerAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const repository = getRepository();
  if (repository === null) return new Response("Live data is disabled", { status: 503 });

  const connection = await repository.ensureConnection("fold");
  await repository.setConnectionStatus(connection.id, "authorizing");
  let authorizationUrl: URL | null = null;
  const { session } = createFoldSession(repository, connection.id, (url) => {
    authorizationUrl = url;
  });
  try {
    await session.connect();
    await repository.setConnectionStatus(connection.id, "connected");
    return NextResponse.redirect(
      new URL("/connections?result=already_connected", request.url),
      303
    );
  } catch (error) {
    if (authorizationUrl !== null) return NextResponse.redirect(authorizationUrl, 303);
    await repository.setConnectionStatus(connection.id, "error");
    throw error;
  } finally {
    await session.close().catch(() => undefined);
  }
}
