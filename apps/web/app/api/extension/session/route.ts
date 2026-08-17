import {
  handleDeleteExtensionSession,
  handleExtensionPreflight,
  handleExtensionSession,
} from "../../../../lib/server/extension-route-handlers";
import {
  getExtensionRuntime,
  loadExtensionSession,
} from "../../../../lib/server/extension-runtime";

export async function GET(request: Request) {
  const runtime = getExtensionRuntime();
  if (runtime === null) return new Response("Extension session unavailable", { status: 503 });
  return handleExtensionSession(request, runtime.service, (pairing) =>
    loadExtensionSession(pairing.connectionId)
  );
}

export async function DELETE(request: Request) {
  const runtime = getExtensionRuntime();
  if (runtime === null) return new Response("Extension session unavailable", { status: 503 });
  return handleDeleteExtensionSession(request, runtime.service);
}

export function OPTIONS(request: Request) {
  return handleExtensionPreflight(request);
}
