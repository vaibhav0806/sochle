import { pairingRequestInputSchema } from "@sochle/contracts";
import type { ExtensionPairingRow, ExtensionRepository, FinancialRepository } from "@sochle/db";

import {
  authenticateExtensionRequest,
  createPairingCsrfToken,
  validateIdentityCallback,
  verifyPairingCsrfToken,
} from "./extension-auth";

type PairingServiceOptions = {
  appUrl: string;
  extensionRepository: ExtensionRepository;
  financialRepository: FinancialRepository;
  now(): Date;
  sessionSecret: string;
};

function safePairing(pairing: ExtensionPairingRow) {
  const { credentialHash: _credentialHash, ...safe } = pairing;
  return safe;
}

export function createExtensionPairingService(options: PairingServiceOptions) {
  return {
    appUrl: options.appUrl,

    async createRequest(input: {
      callbackUrl: string;
      credentialHash: string;
      extensionOrigin: string;
    }) {
      const parsed = pairingRequestInputSchema.parse({
        callbackUrl: input.callbackUrl,
        credentialHash: input.credentialHash,
      });
      const callbackUrl = validateIdentityCallback(input.extensionOrigin, parsed.callbackUrl);
      const createdAt = options.now();
      const expiresAt = new Date(createdAt.getTime() + 10 * 60 * 1000);
      const request = await options.extensionRepository.createPairingRequest({
        callbackUrl,
        createdAt,
        credentialHash: parsed.credentialHash,
        expiresAt,
        extensionOrigin: input.extensionOrigin,
      });
      const approvalUrl = new URL("/extension/pair", options.appUrl);
      approvalUrl.searchParams.set("request", request.id);
      return {
        approvalUrl: approvalUrl.toString(),
        expiresAt: expiresAt.toISOString(),
        requestId: request.id,
      };
    },

    async getApprovalContext(requestId: string) {
      const request = await options.extensionRepository.getPairingRequest(requestId);
      if (
        request === null ||
        request.consumedAt !== null ||
        options.now().getTime() >= request.expiresAt.getTime()
      ) {
        throw new Error("Pairing request is no longer pending");
      }
      return {
        csrfToken: createPairingCsrfToken(options.sessionSecret, request.id, request.expiresAt),
        expiresAt: request.expiresAt.toISOString(),
        extensionOrigin: request.extensionOrigin,
        requestId: request.id,
      };
    },

    async approveRequest(input: {
      connectionId: string;
      csrfToken: string;
      requestId: string;
    }): Promise<string> {
      const request = await options.extensionRepository.getPairingRequest(input.requestId);
      if (
        request === null ||
        !verifyPairingCsrfToken(
          input.csrfToken,
          options.sessionSecret,
          input.requestId,
          options.now()
        )
      ) {
        throw new Error("Invalid pairing approval");
      }
      await options.extensionRepository.approvePairingRequest(
        input.requestId,
        input.connectionId,
        options.now()
      );
      const callback = new URL(request.callbackUrl);
      callback.searchParams.set("requestId", request.id);
      return callback.toString();
    },

    async authenticateRequest(request: Request) {
      const pairing = await authenticateExtensionRequest(
        request,
        options.extensionRepository,
        options.now()
      );
      return pairing === null ? null : safePairing(pairing);
    },

    async listOwnerPairings(connectionId: string) {
      return (await options.extensionRepository.listPairings(connectionId)).map(safePairing);
    },

    async revokeOwnerPairing(connectionId: string, pairingId: string) {
      await options.extensionRepository.revokePairing(connectionId, pairingId, options.now());
    },

    async revokeCurrentPairing(pairingId: string) {
      await options.extensionRepository.revokeCurrentPairing(pairingId, options.now());
    },
  };
}
