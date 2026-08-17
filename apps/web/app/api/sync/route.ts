import { FoldFinancialProvider, FoldSyncCoordinator } from "@sochle/fold";
import { NextResponse } from "next/server";

import { isOwnerAuthenticated } from "../../../lib/server/auth";
import { getRepository } from "../../../lib/server/database";
import { createFoldSession } from "../../../lib/server/fold";
import { getServerEnv } from "../../../lib/server/env";

export async function POST(request: Request) {
  const serverEnv = getServerEnv();
  if (!(await isOwnerAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const repository = getRepository();
  if (repository === null) return new Response("Live data is disabled", { status: 503 });
  const connection = await repository.getConnection("fold");
  if (connection === null || connection.status !== "connected") {
    return NextResponse.redirect(new URL("/connections?result=connect_first", request.url), 303);
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
    const result = await coordinator.sync(connection.id);
    const detail =
      result.status === "fresh" ? "sync_complete" : `${result.status}_${result.reason}`;
    if (new URL(request.url).searchParams.get("automatic") === "1") {
      return NextResponse.json({ result: detail });
    }
    return NextResponse.redirect(new URL(`/connections?result=${detail}`, request.url), 303);
  } finally {
    await session.close().catch(() => undefined);
  }
}
