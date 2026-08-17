import { isOwnerAuthenticated } from "../../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../../lib/server/database";

export async function GET() {
  if (!(await isOwnerAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  if (financialRepository === null || decisionRepository === null) {
    return new Response("Database unavailable", { status: 503 });
  }
  const connection = await financialRepository.getConnection("fold");
  if (connection === null) return new Response("Fold connection unavailable", { status: 409 });

  await decisionRepository.createAuditEvent({
    connectionId: connection.id,
    details: {},
    type: "export_created",
  });
  const exported = await decisionRepository.exportOwnerData(connection.id);
  return Response.json(exported, {
    headers: {
      "Content-Disposition": 'attachment; filename="sochle-export.json"',
      "Content-Type": "application/json",
    },
  });
}
