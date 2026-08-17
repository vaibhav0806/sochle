import "server-only";

import { parseServerEnv } from "@sochle/contracts";

let cachedServerEnv: ReturnType<typeof parseServerEnv> | undefined;

export function getServerEnv() {
  cachedServerEnv ??= parseServerEnv(process.env);
  return cachedServerEnv;
}
