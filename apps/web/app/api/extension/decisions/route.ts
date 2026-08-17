import { handleCreateExtensionDecision } from "../../../../lib/server/extension-decision-service";
import { handleExtensionPreflight } from "../../../../lib/server/extension-route-handlers";
import { getExtensionRuntime } from "../../../../lib/server/extension-runtime";

export async function POST(request: Request) {
  const runtime = getExtensionRuntime();
  if (runtime === null) return new Response("Extension decisions unavailable", { status: 503 });
  return handleCreateExtensionDecision(request, runtime.service, runtime.decisionService);
}

export function OPTIONS(request: Request) {
  return handleExtensionPreflight(request);
}
