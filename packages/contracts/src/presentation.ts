import { z } from "zod";

export const forbiddenPrimaryTerms = [
  "bufferHeadroom",
  "buffer headroom",
  "confidence",
  "financialVerdict",
  "financial verdict",
  "formulaVersion",
  "formula version",
  "projectedLiquidity",
  "projected liquidity",
  "reconciliation",
  "snapshotId",
  "snapshot id",
  "sourceFreshness",
  "source freshness",
  "total_balance",
] as const;

const primaryCopySchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .superRefine((value, context) => {
    const normalized = value.toLowerCase();
    for (const term of forbiddenPrimaryTerms) {
      if (normalized.includes(term.toLowerCase())) {
        context.addIssue({ code: "custom", message: `Primary copy exposes ${term}` });
      }
    }
  });

export const decisionToneSchema = z.enum([
  "comfortable",
  "tradeoff",
  "wait",
  "tight",
  "no",
  "needs-input",
]);
export type DecisionTone = z.infer<typeof decisionToneSchema>;

export const decisionMathsRowSchema = z
  .object({
    label: primaryCopySchema,
    value: z.string().trim().min(1).max(100),
  })
  .strict();
export type DecisionMathsRow = z.infer<typeof decisionMathsRowSchema>;

export const decisionPresentationSchema = z
  .object({
    consequence: primaryCopySchema,
    mathsRows: z.array(decisionMathsRowSchema).max(4),
    recencyLabel: primaryCopySchema,
    suggestedAction: primaryCopySchema.nullable(),
    title: primaryCopySchema,
    tone: decisionToneSchema,
  })
  .strict();
export type DecisionPresentation = z.infer<typeof decisionPresentationSchema>;
