import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type EncryptedAuthorization = {
  authTag: Buffer;
  ciphertext: Buffer;
  iv: Buffer;
};

function assertKeyLength(key: Buffer): void {
  if (key.byteLength !== 32) {
    throw new Error("Authorization encryption key must be 32 bytes");
  }
}

export function encryptAuthorization(plaintext: string, key: Buffer): EncryptedAuthorization {
  assertKeyLength(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    authTag: cipher.getAuthTag(),
    ciphertext,
    iv,
  };
}

export function decryptAuthorization(encrypted: EncryptedAuthorization, key: Buffer): string {
  assertKeyLength(key);
  const decipher = createDecipheriv("aes-256-gcm", key, encrypted.iv);
  decipher.setAuthTag(encrypted.authTag);

  return Buffer.concat([decipher.update(encrypted.ciphertext), decipher.final()]).toString("utf8");
}
