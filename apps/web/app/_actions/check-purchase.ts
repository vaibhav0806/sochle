"use server";

import type { DecisionPresentation } from "@sochle/contracts";

import { parsePurchaseInput, PurchaseInputError } from "../../lib/purchase-input";
import { presentDecision } from "../../lib/presentation/decision";
import { isOwnerAuthenticated } from "../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../lib/server/database";
import {
  createDecisionService,
  DecisionPrerequisiteError,
} from "../../lib/server/decision-service";

export type PurchaseCheckState =
  | { status: "idle" }
  | { message: string; recoveryHref: string | null; status: "error" }
  | { decisionId: string; presentation: DecisionPresentation; status: "success" };

export async function checkPurchaseAction(
  _previous: PurchaseCheckState,
  formData: FormData
): Promise<PurchaseCheckState> {
  if (!(await isOwnerAuthenticated())) {
    return {
      message: "Sign in to check this purchase.",
      recoveryHref: "/login",
      status: "error",
    };
  }

  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  if (financialRepository === null || decisionRepository === null) {
    return {
      message: "Connect your account before checking a purchase.",
      recoveryHref: "/connections",
      status: "error",
    };
  }

  const connection = await financialRepository.getConnection("fold");
  if (connection === null) {
    return {
      message: "Connect your account before checking a purchase.",
      recoveryHref: "/connections",
      status: "error",
    };
  }

  try {
    const input = parsePurchaseInput(formData);
    const saved = await createDecisionService(
      financialRepository,
      decisionRepository
    ).checkPurchase({
      connectionId: connection.id,
      description: input.description,
      evaluatedAt: new Date().toISOString(),
      priceMinor: input.priceMinor,
    });
    return {
      decisionId: saved.decision.id,
      presentation: presentDecision(saved.result),
      status: "success",
    };
  } catch (error) {
    if (error instanceof PurchaseInputError) {
      return {
        message: "Check the product name and price, then try again.",
        recoveryHref: null,
        status: "error",
      };
    }
    if (error instanceof DecisionPrerequisiteError) {
      return error.prerequisite === "rules"
        ? {
            message: "Finish your guardrails before checking a purchase.",
            recoveryHref: "/rules",
            status: "error",
          }
        : {
            message: "Connect your account before checking a purchase.",
            recoveryHref: "/connections",
            status: "error",
          };
    }
    return {
      message: "We couldn't check that purchase. Try again.",
      recoveryHref: null,
      status: "error",
    };
  }
}
