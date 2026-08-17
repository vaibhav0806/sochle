import { z } from "zod";

import { productDecisionRequestSchema, purchaseOutcomeSchema } from "./purchases";

export const pairingRequestInputSchema = z
  .object({
    callbackUrl: z.string().url(),
    credentialHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type PairingRequestInput = z.infer<typeof pairingRequestInputSchema>;

export const pairingRequestOutputSchema = z
  .object({
    approvalUrl: z.string().url(),
    expiresAt: z.string().datetime({ offset: true }),
    requestId: z.string().uuid(),
  })
  .strict();
export type PairingRequestOutput = z.infer<typeof pairingRequestOutputSchema>;

export const extensionBackgroundRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("getSession") }).strict(),
  z.object({ operation: z.literal("pair") }).strict(),
  z.object({ operation: z.literal("disconnect") }).strict(),
  z.object({ operation: z.literal("openCurrentProductCheck") }).strict(),
  z
    .object({
      operation: z.literal("evaluateProduct"),
      product: productDecisionRequestSchema,
    })
    .strict(),
  z
    .object({
      intentId: z.string().uuid(),
      operation: z.literal("setOutcome"),
      outcome: purchaseOutcomeSchema,
    })
    .strict(),
]);
export type ExtensionBackgroundRequest = z.infer<typeof extensionBackgroundRequestSchema>;

export const extensionContentRequestSchema = z
  .object({ operation: z.literal("showManualCheck") })
  .strict();
export type ExtensionContentRequest = z.infer<typeof extensionContentRequestSchema>;
