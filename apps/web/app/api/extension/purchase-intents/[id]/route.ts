import { handleExtensionOutcome } from "../../../../../lib/server/extension-decision-service";
import { handleExtensionPreflight } from "../../../../../lib/server/extension-route-handlers";
import { getExtensionRuntime } from "../../../../../lib/server/extension-runtime";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const runtime = getExtensionRuntime();
  if (runtime === null) return new Response("Extension outcomes unavailable", { status: 503 });
  return handleExtensionOutcome(
    request,
    (await params).id,
    runtime.service,
    runtime.decisionService
  );
}

export function OPTIONS(request: Request) {
  return handleExtensionPreflight(request);
}
