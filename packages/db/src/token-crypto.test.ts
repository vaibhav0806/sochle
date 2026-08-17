import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decryptAuthorization, encryptAuthorization } from "./token-crypto";

describe("authorization encryption", () => {
  it("round-trips authorization material without storing plaintext", () => {
    const key = randomBytes(32);
    const plaintext = JSON.stringify({ accessToken: "fold-secret", refreshToken: "fold-refresh" });

    const encrypted = encryptAuthorization(plaintext, key);

    expect(encrypted.ciphertext.toString("utf8")).not.toContain("fold-secret");
    expect(decryptAuthorization(encrypted, key)).toBe(plaintext);
  });

  it("rejects ciphertext modified after encryption", () => {
    const key = randomBytes(32);
    const encrypted = encryptAuthorization("fold-secret", key);
    encrypted.ciphertext[0] = (encrypted.ciphertext[0] ?? 0) ^ 1;

    expect(() => decryptAuthorization(encrypted, key)).toThrow();
  });

  it("requires a 32-byte encryption key", () => {
    expect(() => encryptAuthorization("fold-secret", randomBytes(16))).toThrow(
      "Authorization encryption key must be 32 bytes"
    );
  });

  it("rejects decryption with the wrong key", () => {
    const encrypted = encryptAuthorization("fold-secret", randomBytes(32));

    expect(() => decryptAuthorization(encrypted, randomBytes(32))).toThrow();
  });
});
