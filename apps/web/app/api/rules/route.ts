import { validateRuleSet, type ForecastHorizon, type RuleSet } from "@sochle/domain";
import { NextResponse } from "next/server";

import { parseNonNegativeRupeesToMinor } from "../../../lib/money";
import { isOwnerAuthenticated } from "../../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../../lib/server/database";
import { getServerEnv } from "../../../lib/server/env";

function requiredString(form: FormData, name: string): string {
  const value = form.get(name);
  if (typeof value !== "string" || value === "") throw new Error(`Missing ${name}`);
  return value;
}

function integer(form: FormData, name: string, minimum: number, maximum: number): number {
  const value = requiredString(form, name);
  if (!/^\d+$/.test(value)) throw new Error(`Invalid ${name}`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Invalid ${name}`);
  }
  return parsed;
}

function percentageToBps(value: string): number {
  if (!/^(?:0|[1-9]\d?)(?:\.\d{1,2})?$|^100(?:\.0{1,2})?$/.test(value)) {
    throw new Error("Invalid materiality ratio");
  }
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

function forecastHorizon(form: FormData): ForecastHorizon {
  const kind = requiredString(form, "forecastHorizon");
  if (kind === "next_salary") return { kind };
  if (kind === "rolling_days") {
    return { days: integer(form, "forecastDays", 1, 30), kind };
  }
  if (kind === "custom") return { endDate: requiredString(form, "forecastEndDate"), kind };
  throw new Error("Invalid forecast horizon");
}

export async function POST(request: Request) {
  if (!(await isOwnerAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  if (financialRepository === null || decisionRepository === null) {
    return new Response("Database unavailable", { status: 503 });
  }
  const connection = await financialRepository.getConnection("fold");
  if (connection === null) return new Response("Fold connection unavailable", { status: 409 });

  try {
    const form = await request.formData();
    const active = await decisionRepository.getActiveRuleSet(connection.id);
    const rules: RuleSet = {
      essentialMonthlySpending: {
        currency: "INR",
        minor: parseNonNegativeRupeesToMinor(requiredString(form, "essentialMonthlySpending")),
      },
      forecastHorizon: forecastHorizon(form),
      largePurchaseThreshold: {
        currency: "INR",
        minor: parseNonNegativeRupeesToMinor(requiredString(form, "largePurchaseThreshold")),
      },
      materiality: {
        absoluteCap: {
          currency: "INR",
          minor: parseNonNegativeRupeesToMinor(requiredString(form, "materialityCap")),
        },
        purchaseRatioBps: percentageToBps(requiredString(form, "materialityRatio")),
      },
      minimumBuffer: {
        currency: "INR",
        minor: parseNonNegativeRupeesToMinor(requiredString(form, "minimumBuffer")),
      },
      monthlyInvestmentTarget: {
        currency: "INR",
        minor: parseNonNegativeRupeesToMinor(requiredString(form, "monthlyInvestmentTarget")),
      },
      salary: {
        amount: {
          currency: "INR",
          minor: parseNonNegativeRupeesToMinor(requiredString(form, "monthlySalary")),
        },
        confirmed: form.get("salaryConfirmed") === "on",
        dayOfMonth: integer(form, "salaryDay", 1, 31),
      },
      version: (active?.version ?? 0) + 1,
    };
    validateRuleSet(rules, new Date().toISOString().slice(0, 10));
    await decisionRepository.createRuleSet(connection.id, rules);
    return NextResponse.redirect(new URL("/rules?saved=1", getServerEnv().SOCHLE_APP_URL), 303);
  } catch {
    return new Response("Invalid rules", { status: 400 });
  }
}
