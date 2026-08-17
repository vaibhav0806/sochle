import "server-only";

import { DEFAULT_RULES } from "@sochle/domain";

import { getDecisionRepository, getExtensionRepository, getRepository } from "./database";
import { getServerEnv } from "./env";
import { createExtensionPairingService } from "./extension-pairing-service";

export function getExtensionRuntime() {
  const serverEnv = getServerEnv();
  const extensionRepository = getExtensionRepository();
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  if (
    extensionRepository === null ||
    financialRepository === null ||
    decisionRepository === null ||
    serverEnv.SOCHLE_SESSION_SECRET === undefined
  ) {
    return null;
  }
  return {
    decisionRepository,
    financialRepository,
    service: createExtensionPairingService({
      appUrl: serverEnv.SOCHLE_APP_URL,
      extensionRepository,
      financialRepository,
      now: () => new Date(),
      sessionSecret: serverEnv.SOCHLE_SESSION_SECRET,
    }),
    sessionSecret: serverEnv.SOCHLE_SESSION_SECRET,
  };
}

export async function loadExtensionSession(connectionId: string) {
  const runtime = getExtensionRuntime();
  const serverEnv = getServerEnv();
  if (runtime === null) {
    return {
      appUrl: serverEnv.SOCHLE_APP_URL,
      ready: false,
      thresholdMinor: DEFAULT_RULES.largePurchaseThreshold.minor,
    };
  }
  const [rules, snapshot] = await Promise.all([
    runtime.decisionRepository.getActiveRuleSet(connectionId),
    runtime.financialRepository.getLatestSnapshot(connectionId),
  ]);
  return {
    appUrl: serverEnv.SOCHLE_APP_URL,
    ready: rules !== null && snapshot !== null,
    thresholdMinor:
      rules?.rules.largePurchaseThreshold.minor ?? DEFAULT_RULES.largePurchaseThreshold.minor,
  };
}
