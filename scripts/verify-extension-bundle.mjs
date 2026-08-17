/* global console, process */

import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const forbidden = [
  "encryptedAuthorization",
  "authorizationTag",
  "refresh_token",
  "SOCHLE_TOKEN_ENCRYPTION_KEY",
  "sourceTransactionId",
  "e2e_extension_credential",
];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const path = resolve(directory, entry.name);
        return entry.isDirectory() ? files(path) : [path];
      })
    )
  ).flat();
}

const directory = process.argv[2];
if (directory === undefined) throw new Error("Usage: verify-extension-bundle.mjs <directory>");
const violations = [];
for (const path of await files(directory)) {
  if (!/\.(?:css|html|js|json|map)$/.test(path)) continue;
  const contents = await readFile(path, "utf8");
  for (const value of forbidden) if (contents.includes(value)) violations.push(`${path}: ${value}`);
}
if (violations.length > 0)
  throw new Error(`Forbidden extension bundle material:\n${violations.join("\n")}`);
console.log(
  "Extension bundle contains no forbidden server credentials or financial payload fields."
);
