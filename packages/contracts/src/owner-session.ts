import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createOwnerSession(secret: string, now: Date, ttlSeconds: number): string {
  const payload = `v1.${Math.floor(now.getTime() / 1000) + ttlSeconds}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyOwnerSession(token: string, secret: string, now: Date): boolean {
  const parts = token.split(".");
  const version = parts[0];
  const expiresAt = parts[1];
  const suppliedSignature = parts[2];
  if (
    parts.length !== 3 ||
    version !== "v1" ||
    expiresAt === undefined ||
    suppliedSignature === undefined
  ) {
    return false;
  }

  const payload = `${version}.${expiresAt}`;
  const expectedSignature = signature(payload, secret);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.byteLength !== expected.byteLength || !timingSafeEqual(supplied, expected))
    return false;

  const expirySeconds = Number(expiresAt);
  return Number.isSafeInteger(expirySeconds) && expirySeconds > Math.floor(now.getTime() / 1000);
}

export function verifyOwnerPassword(input: string, expectedPassword: string): boolean {
  const inputHash = createHash("sha256").update(input).digest();
  const expectedHash = createHash("sha256").update(expectedPassword).digest();
  return timingSafeEqual(inputHash, expectedHash);
}
