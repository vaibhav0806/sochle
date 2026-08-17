import {
  handleCreatePairingRequest,
  handleExtensionPreflight,
} from "../../../../lib/server/extension-route-handlers";
import { getExtensionRuntime } from "../../../../lib/server/extension-runtime";

export async function POST(request: Request) {
  const runtime = getExtensionRuntime();
  if (runtime === null) return new Response("Extension pairing unavailable", { status: 503 });
  return handleCreatePairingRequest(request, runtime.service);
}

export function OPTIONS(request: Request) {
  return handleExtensionPreflight(request);
}
