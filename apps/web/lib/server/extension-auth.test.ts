import { describe, expect, it } from "vitest";

import {
  createPairingCsrfToken,
  extensionCorsHeaders,
  hashExtensionCredential,
  parseExtensionOrigin,
  readBearerCredential,
  validateIdentityCallback,
  verifyPairingCsrfToken,
} from "./extension-auth";

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const extensionOrigin = `chrome-extension://${extensionId}`;
const callbackUrl = `https://${extensionId}.chromiumapp.org/pair`;

describe("extension authentication boundaries", () => {
  it("hashes credentials with the standard SHA-256 digest", () => {
    expect(hashExtensionCredential("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });

  it("accepts only normalized Chrome extension origins", () => {
    expect(parseExtensionOrigin(extensionOrigin)).toEqual({
      extensionId,
      origin: extensionOrigin,
    });
    for (const invalid of [
      null,
      "null",
      "https://example.com",
      `${extensionOrigin}/path`,
      "chrome-extension://too-short",
      "chrome-extension://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP",
    ]) {
      expect(() => parseExtensionOrigin(invalid)).toThrow("Invalid extension origin");
    }
  });

  it("binds the Chromium identity callback to the requesting extension", () => {
    expect(validateIdentityCallback(extensionOrigin, callbackUrl)).toBe(callbackUrl);
    for (const invalid of [
      `http://${extensionId}.chromiumapp.org/pair`,
      `https://bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.chromiumapp.org/pair`,
      `https://${extensionId}.chromiumapp.org/other`,
      `https://${extensionId}.chromiumapp.org/pair?token=leak`,
      `https://user@${extensionId}.chromiumapp.org/pair`,
      `https://${extensionId}.example.com/pair`,
    ]) {
      expect(() => validateIdentityCallback(extensionOrigin, invalid)).toThrow(
        "Invalid extension callback"
      );
    }
  });

  it("reads exactly one bearer credential", () => {
    expect(readBearerCredential("Bearer raw-extension-secret")).toBe("raw-extension-secret");
    for (const invalid of [
      null,
      "",
      "Basic abc",
      "bearer abc",
      "Bearer",
      "Bearer one two",
      "Bearer one, Bearer two",
    ]) {
      expect(() => readBearerCredential(invalid)).toThrow("Invalid extension authorization");
    }
  });

  it("returns exact-origin CORS headers", () => {
    expect(extensionCorsHeaders(extensionOrigin)).toEqual({
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "DELETE, GET, OPTIONS, PATCH, POST",
      "Access-Control-Allow-Origin": extensionOrigin,
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    });
  });
});

describe("pairing CSRF", () => {
  const requestId = "10000000-0000-4000-8000-000000000001";
  const secret = "synthetic-session-secret-at-least-32-characters";
  const expiresAt = new Date("2026-08-18T08:10:00.000Z");

  it("accepts the bound request before expiry", () => {
    const token = createPairingCsrfToken(secret, requestId, expiresAt);
    expect(
      verifyPairingCsrfToken(token, secret, requestId, new Date("2026-08-18T08:09:59.999Z"))
    ).toBe(true);
  });

  it("rejects another request, tampering, and the expiry boundary", () => {
    const token = createPairingCsrfToken(secret, requestId, expiresAt);
    expect(
      verifyPairingCsrfToken(
        token,
        secret,
        "20000000-0000-4000-8000-000000000002",
        new Date("2026-08-18T08:00:00.000Z")
      )
    ).toBe(false);
    expect(
      verifyPairingCsrfToken(
        `${token.slice(0, -1)}x`,
        secret,
        requestId,
        new Date("2026-08-18T08:00:00.000Z")
      )
    ).toBe(false);
    expect(verifyPairingCsrfToken(token, secret, requestId, expiresAt)).toBe(false);
  });
});
