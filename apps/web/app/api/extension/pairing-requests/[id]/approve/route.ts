import { isOwnerAuthenticated } from "../../../../../../lib/server/auth";
import { handleApprovePairingRequest } from "../../../../../../lib/server/extension-route-handlers";
import { getExtensionRuntime } from "../../../../../../lib/server/extension-runtime";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const runtime = getExtensionRuntime();
  if (runtime === null) return new Response("Extension pairing unavailable", { status: 503 });
  const connection = await runtime.financialRepository.getConnection("fold");
  return handleApprovePairingRequest(request, (await params).id, {
    connectionId: connection?.id ?? null,
    ownerAuthenticated: await isOwnerAuthenticated(),
    service: runtime.service,
  });
}
