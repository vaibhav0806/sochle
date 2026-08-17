import { z } from "zod";

import type { Money } from "./financial-state";

export type ForecastHorizon =
  | { kind: "next_salary" }
  | { kind: "rolling_days"; days: number }
  | { kind: "custom"; endDate: string };

export type RuleSet = {
  essentialMonthlySpending: Money;
  forecastHorizon: ForecastHorizon;
  largePurchaseThreshold: Money;
  materiality: {
    absoluteCap: Money;
    purchaseRatioBps: number;
  };
  minimumBuffer: Money;
  monthlyInvestmentTarget: Money;
  salary: {
    amount: Money;
    confirmed: boolean;
    dayOfMonth: number;
  };
  version: number;
};

export const DEFAULT_RULES: Omit<RuleSet, "version"> = {
  essentialMonthlySpending: { currency: "INR", minor: 0 },
  forecastHorizon: { kind: "next_salary" },
  largePurchaseThreshold: { currency: "INR", minor: 10_000_00 },
  materiality: {
    absoluteCap: { currency: "INR", minor: 5_000_00 },
    purchaseRatioBps: 1_000,
  },
  minimumBuffer: { currency: "INR", minor: 50_000_00 },
  monthlyInvestmentTarget: { currency: "INR", minor: 0 },
  salary: {
    amount: { currency: "INR", minor: 0 },
    confirmed: false,
    dayOfMonth: 1,
  },
};

const moneySchema = z.object({
  currency: z.literal("INR"),
  minor: z.number().int().safe().nonnegative(),
});

const isoDateSchema = z.string().refine(isIsoDate, "Expected an ISO calendar date");

const ruleSetSchema = z.object({
  essentialMonthlySpending: moneySchema,
  forecastHorizon: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("next_salary") }),
    z.object({
      days: z.number().int().positive().max(30, "Forecast horizon must be at most 30 days"),
      kind: z.literal("rolling_days"),
    }),
    z.object({ endDate: isoDateSchema, kind: z.literal("custom") }),
  ]),
  largePurchaseThreshold: moneySchema,
  materiality: z.object({
    absoluteCap: moneySchema,
    purchaseRatioBps: z.number().int().min(0).max(10_000),
  }),
  minimumBuffer: moneySchema,
  monthlyInvestmentTarget: moneySchema,
  salary: z.object({
    amount: moneySchema,
    confirmed: z.boolean(),
    dayOfMonth: z.number().int().min(1).max(31),
  }),
  version: z.number().int().positive(),
});

function calendarDate(value: string): string {
  const date = value.slice(0, 10);
  if (!isIsoDate(date)) throw new Error("Expected an ISO calendar date");
  return date;
}

function dateFromIso(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day));
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = dateFromIso(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

function daysBetween(start: string, end: string): number {
  return (dateFromIso(end).getTime() - dateFromIso(start).getTime()) / 86_400_000;
}

export function validateRuleSet(input: unknown, referenceDate: string): RuleSet {
  const rules = ruleSetSchema.parse(input) as RuleSet;
  const reference = calendarDate(referenceDate);

  if (rules.forecastHorizon.kind === "custom") {
    const difference = daysBetween(reference, rules.forecastHorizon.endDate);
    if (difference < 0) throw new Error("Custom horizon cannot be before the reference date");
    if (difference > 30) throw new Error("Custom horizon must be within 30 days");
  }

  return rules;
}

export function nextSalaryDate(dayOfMonth: number, afterDate: string): string {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error("Salary day must be between 1 and 31");
  }
  const after = dateFromIso(calendarDate(afterDate));

  const salaryDateInMonth = (monthOffset: number) => {
    const firstOfMonth = new Date(
      Date.UTC(after.getUTCFullYear(), after.getUTCMonth() + monthOffset, 1)
    );
    const lastDay = new Date(
      Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0)
    ).getUTCDate();
    return new Date(
      Date.UTC(
        firstOfMonth.getUTCFullYear(),
        firstOfMonth.getUTCMonth(),
        Math.min(dayOfMonth, lastDay)
      )
    );
  };
  const thisMonth = salaryDateInMonth(0);
  return toIsoDate(thisMonth > after ? thisMonth : salaryDateInMonth(1));
}

export function resolveForecastHorizon(rules: RuleSet, evaluatedAt: string): string {
  const evaluatedOn = calendarDate(evaluatedAt);
  const validated = validateRuleSet(rules, evaluatedOn);

  if (validated.forecastHorizon.kind === "rolling_days") {
    return addDays(evaluatedOn, validated.forecastHorizon.days);
  }
  if (validated.forecastHorizon.kind === "custom") {
    return validated.forecastHorizon.endDate;
  }

  const salaryDate = nextSalaryDate(validated.salary.dayOfMonth, evaluatedOn);
  const cap = addDays(evaluatedOn, 30);
  return salaryDate < cap ? salaryDate : cap;
}
