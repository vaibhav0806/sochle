import {
  extensionSessionSchema,
  pairingRequestInputSchema,
  pairingRequestOutputSchema,
} from "@sochle/contracts";

import {
  extensionCorsHeaders,
  parseExtensionOrigin,
  verifyPairingCsrfToken,
} from "./extension-auth";
import type { createExtensionPairingService } from "./extension-pairing-service";

type ExtensionPairingService = ReturnType<typeof createExtensionPairingService>;

type SessionConfig = {
  appUrl: string;
  ready: boolean;
  thresholdMinor: number;
};

type AuthenticatedPairing = NonNullable<
  Awaited<ReturnType<ExtensionPairingService["authenticateRequest"]>>
>;

function json(body: unknown, status: number, headers: HeadersInit = {}) {
  return Response.json(body, { headers, status });
}

function badRequest(message: string, headers: HeadersInit = {}) {
  return json({ error: { code: "unexpected", message } }, 400, headers);
}

export async function handleCreatePairingRequest(
  request: Request,
  service: ExtensionPairingService
): Promise<Response> {
  const { origin } = parseExtensionOrigin(request.headers.get("Origin"));
  const headers = extensionCorsHeaders(origin);
  try {
    const input = pairingRequestInputSchema.parse(await request.json());
    const output = pairingRequestOutputSchema.parse(
      await service.createRequest({ ...input, extensionOrigin: origin })
    );
    return json(output, 201, headers);
  } catch {
    return badRequest("Invalid pairing request", headers);
  }
}

export function handleExtensionPreflight(request: Request): Response {
  const { origin } = parseExtensionOrigin(request.headers.get("Origin"));
  return new Response(null, { headers: extensionCorsHeaders(origin), status: 204 });
}

export async function handleApprovePairingRequest(
  request: Request,
  requestId: string,
  options: {
    connectionId: string | null;
    ownerAuthenticated: boolean;
    service: ExtensionPairingService;
  }
): Promise<Response> {
  if (!options.ownerAuthenticated || options.connectionId === null) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const form = await request.formData();
    const csrfToken = form.get("csrfToken");
    if (typeof csrfToken !== "string") throw new Error("Invalid pairing approval");
    const callbackUrl = await options.service.approveRequest({
      connectionId: options.connectionId,
      csrfToken,
      requestId,
    });
    return Response.redirect(callbackUrl, 303);
  } catch {
    return badRequest("Invalid pairing approval");
  }
}

export async function handleExtensionSession(
  request: Request,
  service: ExtensionPairingService,
  loadSession: (pairing: AuthenticatedPairing) => Promise<SessionConfig>
): Promise<Response> {
  const { origin } = parseExtensionOrigin(request.headers.get("Origin"));
  const headers = extensionCorsHeaders(origin);
  const pairing = await service.authenticateRequest(request);
  if (pairing === null) {
    return json(
      extensionSessionSchema.parse({ appUrl: service.appUrl, kind: "unpaired" }),
      401,
      headers
    );
  }
  const config = await loadSession(pairing);
  const session = extensionSessionSchema.parse({
    ...config,
    kind: "paired",
    pairingId: pairing.id,
  });
  return json(session, 200, headers);
}

export async function handleDeleteExtensionSession(
  request: Request,
  service: ExtensionPairingService
): Promise<Response> {
  const { origin } = parseExtensionOrigin(request.headers.get("Origin"));
  const headers = extensionCorsHeaders(origin);
  const pairing = await service.authenticateRequest(request);
  if (pairing === null) return new Response(null, { headers, status: 401 });
  await service.revokeCurrentPairing(pairing.id);
  return new Response(null, { headers, status: 204 });
}

export async function handleRevokeOwnerPairing(
  request: Request,
  pairingId: string,
  options: {
    connectionId: string | null;
    csrfSecret: string;
    now: Date;
    ownerAuthenticated: boolean;
    service: ExtensionPairingService;
  }
): Promise<Response> {
  if (!options.ownerAuthenticated || options.connectionId === null) {
    return new Response("Unauthorized", { status: 401 });
  }
  try {
    const form = await request.formData();
    const csrfToken = form.get("csrfToken");
    if (
      typeof csrfToken !== "string" ||
      !verifyPairingCsrfToken(csrfToken, options.csrfSecret, pairingId, options.now)
    ) {
      throw new Error("Invalid pairing revocation");
    }
    await options.service.revokeOwnerPairing(options.connectionId, pairingId);
    return Response.redirect(new URL("/connections?result=extension_revoked", request.url), 303);
  } catch {
    return badRequest("Invalid pairing revocation");
  }
}
