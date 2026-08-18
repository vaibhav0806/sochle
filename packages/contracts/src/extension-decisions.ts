import { z } from "zod";

import { decisionPresentationSchema } from "./presentation";

const signedMinorSchema = z.number().int().safe();
const nonNegativeMinorSchema = signedMinorSchema.nonnegative();

export const extensionDecisionCardSchema = z
  .object({
    decisionUrl: z.string().url(),
    evaluatedAt: z.string().datetime({ offset: true }),
    firstComfortablyAffordableDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    intentId: z.string().uuid(),
    presentation: decisionPresentationSchema,
    priceMinor: nonNegativeMinorSchema,
    verdict: z.enum([
      "comfortably_affordable",
      "affordable_with_tradeoffs",
      "wait_until_payday",
      "requires_reducing_investments",
      "technically_possible_financially_tight",
      "not_affordable",
      "insufficient_confidence",
    ]),
  })
  .strict();
export type ExtensionDecisionCard = z.infer<typeof extensionDecisionCardSchema>;

const appUrlSchema = z.string().url();
export const extensionSessionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      appUrl: appUrlSchema,
      kind: z.literal("unpaired"),
    })
    .strict(),
  z
    .object({
      appUrl: appUrlSchema,
      kind: z.literal("paired"),
      pairingId: z.string().uuid(),
      ready: z.boolean(),
      thresholdMinor: nonNegativeMinorSchema,
    })
    .strict(),
]);
export type ExtensionSession = z.infer<typeof extensionSessionSchema>;

export const extensionErrorSchema = z
  .object({
    error: z
      .object({
        code: z.enum([
          "unpaired",
          "revoked",
          "invalid_product",
          "below_threshold",
          "missing_rules",
          "missing_snapshot",
          "stale_data",
          "unavailable",
          "not_found",
          "unexpected",
        ]),
        correlationId: z.string().uuid().optional(),
        message: z.string().trim().min(1).max(200),
      })
      .strict(),
  })
  .strict();
export type ExtensionError = z.infer<typeof extensionErrorSchema>;
