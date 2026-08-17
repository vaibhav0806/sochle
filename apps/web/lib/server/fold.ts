import "server-only";

import type { FinancialRepository } from "@sochle/db";
import {
  FoldMcpSession,
  FoldOAuthProvider,
  type FoldOAuthState,
  type FoldOAuthStateStore,
} from "@sochle/fold";

import { getServerEnv } from "./env";

export function createFoldSession(
  repository: FinancialRepository,
  connectionId: string,
  onRedirect: (url: URL) => void
) {
  const serverEnv = getServerEnv();
  if (serverEnv.SOCHLE_TOKEN_ENCRYPTION_KEY === undefined) {
    throw new Error("Fold authorization is unavailable in demo mode");
  }
  const key = Buffer.from(serverEnv.SOCHLE_TOKEN_ENCRYPTION_KEY, "base64");
  const store: FoldOAuthStateStore = {
    load: () => repository.loadAuthorizationState<FoldOAuthState>(connectionId, key),
    save: (state) => repository.saveAuthorizationState(connectionId, state, key),
  };
  const oauth = new FoldOAuthProvider({
    onRedirect,
    redirectUrl: serverEnv.SOCHLE_FOLD_REDIRECT_URL,
    store,
  });
  return { oauth, session: new FoldMcpSession(serverEnv.FOLD_MCP_URL, oauth) };
}
