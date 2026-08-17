import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { ExtensionRepository } from "@sochle/db";

const extensionIdPattern = /^[a-p]{32}$/;

export function hashExtensionCredential(credential: string): string {
  return createHash("sha256").update(credential, "utf8").digest("hex");
}

export function parseExtensionOrigin(value: string | null): {
  extensionId: string;
  origin: string;
} {
  if (value === null) throw new Error("Invalid extension origin");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid extension origin");
  }
  if (
    url.protocol !== "chrome-extension:" ||
    !extensionIdPattern.test(url.hostname) ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("Invalid extension origin");
  }
  const origin = `chrome-extension://${url.hostname}`;
  if (value !== origin) throw new Error("Invalid extension origin");
  return { extensionId: url.hostname, origin };
}

export function validateIdentityCallback(extensionOrigin: string, value: string): string {
  const { extensionId } = parseExtensionOrigin(extensionOrigin);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid extension callback");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname !== `${extensionId}.chromiumapp.org` ||
    url.pathname !== "/pair" ||
    url.port !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("Invalid extension callback");
  }
  return url.toString();
}

export function readBearerCredential(value: string | null): string {
  const match = value?.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  if (match?.[1] === undefined) throw new Error("Invalid extension authorization");
  return match[1];
}

export function extensionCorsHeaders(extensionOrigin: string): Record<string, string> {
  const { origin } = parseExtensionOrigin(extensionOrigin);
  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "DELETE, GET, OPTIONS, PATCH, POST",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function csrfSignature(secret: string, requestId: string, expiresEpochSeconds: number): Buffer {
  return createHmac("sha256", secret)
    .update(`${requestId}.${expiresEpochSeconds}`, "utf8")
    .digest();
}

export function createPairingCsrfToken(secret: string, requestId: string, expiresAt: Date): string {
  const expiresEpochSeconds = Math.floor(expiresAt.getTime() / 1000);
  const signature = csrfSignature(secret, requestId, expiresEpochSeconds).toString("base64url");
  return `${expiresEpochSeconds}.${signature}`;
}

export function verifyPairingCsrfToken(
  token: string,
  secret: string,
  requestId: string,
  now: Date
): boolean {
  const [rawExpiry, rawSignature, extra] = token.split(".");
  if (rawExpiry === undefined || rawSignature === undefined || extra !== undefined) return false;
  const expiresEpochSeconds = Number(rawExpiry);
  if (!Number.isSafeInteger(expiresEpochSeconds) || now.getTime() >= expiresEpochSeconds * 1000) {
    return false;
  }
  let supplied: Buffer;
  try {
    supplied = Buffer.from(rawSignature, "base64url");
  } catch {
    return false;
  }
  const expected = csrfSignature(secret, requestId, expiresEpochSeconds);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export async function authenticateExtensionRequest(
  request: Request,
  repository: ExtensionRepository,
  now: Date
) {
  const { origin } = parseExtensionOrigin(request.headers.get("Origin"));
  const credential = readBearerCredential(request.headers.get("Authorization"));
  return repository.authenticatePairing(hashExtensionCredential(credential), origin, now);
}
