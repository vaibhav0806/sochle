import { NextResponse } from "next/server";

import { isOwnerAuthenticated } from "../../../../../lib/server/auth";
import { getRepository } from "../../../../../lib/server/database";
import { createFoldSession } from "../../../../../lib/server/fold";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwnerAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const repository = getRepository();
  if (repository === null) return new Response("Database unavailable", { status: 503 });
  const issue = await repository.getIssue((await params).id);
  if (issue === null || issue.relatedEntityType !== "transaction") {
    return new Response("Transaction issue not found", { status: 404 });
  }

  const connection = await repository.getConnection("fold");
  if (connection === null || connection.status !== "connected") {
    return new Response("Fold is not connected", { status: 409 });
  }
  const { session } = createFoldSession(repository, connection.id, () => undefined);
  try {
    await session.connect();
    const result = await session.gateway.getTransaction(issue.relatedEntityId);
    const transaction = result.transaction;
    return NextResponse.json(
      transaction === null
        ? { found: false }
        : {
            found: result.found,
            transaction: {
              amount: transaction.amount,
              category: transaction.category?.name ?? null,
              currency: transaction.currency,
              date: transaction.date,
              excludedFromCashFlow: transaction.excluded_from_cash_flow,
              id: transaction.id,
              merchant: transaction.merchant_name,
              narration: transaction.narration,
              type: transaction.type,
            },
          }
    );
  } finally {
    await session.close().catch(() => undefined);
  }
}
