import { FoldFinancialProvider, FoldSyncCoordinator, isInvalidOAuthGrant } from "@sochle/fold";
import { NextResponse } from "next/server";

import { isOwnerAuthenticated } from "../../../lib/server/auth";
import { getRepository } from "../../../lib/server/database";
import { createFoldSession } from "../../../lib/server/fold";
import { getServerEnv } from "../../../lib/server/env";

export async function POST(request: Request) {
  const serverEnv = getServerEnv();
  const automatic = new URL(request.url).searchParams.get("automatic") === "1";
  if (!(await isOwnerAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const repository = getRepository();
  if (repository === null) return new Response("Live data is disabled", { status: 503 });
  const connection = await repository.getConnection("fold");
  if (connection === null || connection.status !== "connected") {
    return NextResponse.redirect(
      new URL("/connections?result=connect_first", serverEnv.SOCHLE_APP_URL),
      303
    );
  }

  const { session } = createFoldSession(repository, connection.id, () => undefined);
  try {
    await session.connect();
    const coordinator = new FoldSyncCoordinator(
      new FoldFinancialProvider(session.gateway),
      repository,
      {
        minimumIntervalMs: serverEnv.SOCHLE_SYNC_MINIMUM_INTERVAL_MINUTES * 60 * 1000,
        now: () => new Date(),
      }
    );
    const result = await coordinator.sync(connection.id, {
      trigger: automatic ? "automatic" : "manual",
    });
    const detail =
      result.status === "fresh" ? "sync_complete" : `${result.status}_${result.reason}`;
    if (automatic) {
      return NextResponse.json({ result: detail });
    }
    return NextResponse.redirect(
      new URL(`/connections?result=${detail}`, serverEnv.SOCHLE_APP_URL),
      303
    );
  } catch (error) {
    if (!isInvalidOAuthGrant(error)) throw error;
    await repository.resetAuthorization(connection.id);
    if (automatic) return NextResponse.json({ result: "reconnect_required" });
    return NextResponse.redirect(
      new URL("/connections?result=reconnect_required", serverEnv.SOCHLE_APP_URL),
      303
    );
  } finally {
    await session.close().catch(() => undefined);
  }
}
