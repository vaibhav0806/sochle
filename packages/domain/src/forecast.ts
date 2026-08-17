export type HeadroomInput = {
  additionalObligationsMinor: number;
  confirmedObligationsMinor: number;
  essentialSpendingMinor: number;
  expectedIncomeMinor: number;
  immediateObligationsMinor: number;
  investmentTargetMinor: number;
  liquidCashMinor: number;
  minimumBufferMinor: number;
  plannedPurchasesMinor: number;
  purchasePriceMinor: number;
};

export type Headrooms = {
  comfortableMinor: number;
  goalMinor: number;
  technicalMinor: number;
};

export type DatedAmount = {
  amountMinor: number;
  dueOn: string;
  id: string;
};

export type ForecastObligation = DatedAmount & {
  budgetTreatment: "inside_essential_budget" | "additional";
};

export type ForecastEvent = {
  amountMinor: number;
  budgetTreatment?: ForecastObligation["budgetTreatment"];
  id: string;
  kind: "income" | "obligation" | "planned_purchase";
};

export type ForecastDay = {
  candidateComfortableHeadroomMinor: number;
  date: string;
  endingCashMinor: number;
  events: ForecastEvent[];
  goalAvailableMinor: number;
};

export type DailyForecast = {
  days: ForecastDay[];
  firstComfortablyAffordableDate: string | null;
  minimumCashDate: string;
  minimumCashMinor: number;
};

export type DailyForecastInput = {
  endDate: string;
  essentialReserveMinor: number;
  income: DatedAmount[];
  investmentReserveMinor: number;
  liquidCashMinor: number;
  minimumBufferMinor: number;
  obligations: ForecastObligation[];
  plannedPurchases: DatedAmount[];
  purchasePriceMinor: number;
  startDate: string;
};

function assertMoney(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Money values must be non-negative safe integers");
  }
  return value;
}

function add(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) {
    throw new Error("Money calculation exceeded the safe integer range");
  }
  return result;
}

function subtract(left: number, right: number): number {
  return add(left, -right);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => add(total, assertMoney(value)), 0);
}

export function calculateHeadrooms(input: HeadroomInput): Headrooms {
  Object.values(input).forEach(assertMoney);
  const technicalMinor = subtract(
    subtract(input.liquidCashMinor, input.immediateObligationsMinor),
    input.purchasePriceMinor
  );
  const comfortableMinor = subtract(
    subtract(
      subtract(
        add(input.liquidCashMinor, input.expectedIncomeMinor),
        input.confirmedObligationsMinor
      ),
      input.minimumBufferMinor
    ),
    input.purchasePriceMinor
  );
  const goalMinor = subtract(
    subtract(
      subtract(
        subtract(
          subtract(
            subtract(
              add(input.liquidCashMinor, input.expectedIncomeMinor),
              input.additionalObligationsMinor
            ),
            input.essentialSpendingMinor
          ),
          input.investmentTargetMinor
        ),
        input.plannedPurchasesMinor
      ),
      input.minimumBufferMinor
    ),
    input.purchasePriceMinor
  );

  return { comfortableMinor, goalMinor, technicalMinor };
}

function dateFromIso(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Expected an ISO calendar date");
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (date.toISOString().slice(0, 10) !== value) throw new Error("Expected an ISO calendar date");
  return date;
}

function addDays(value: string, days: number): string {
  const date = dateFromIso(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function differenceInDays(start: string, end: string): number {
  return (dateFromIso(end).getTime() - dateFromIso(start).getTime()) / 86_400_000;
}

function eventsForDate(input: DailyForecastInput, date: string): ForecastEvent[] {
  return [
    ...input.income
      .filter((event) => event.dueOn === date)
      .map((event) => ({ amountMinor: event.amountMinor, id: event.id, kind: "income" as const })),
    ...input.obligations
      .filter((event) => event.dueOn === date)
      .map((event) => ({
        amountMinor: event.amountMinor,
        budgetTreatment: event.budgetTreatment,
        id: event.id,
        kind: "obligation" as const,
      })),
    ...input.plannedPurchases
      .filter((event) => event.dueOn === date)
      .map((event) => ({
        amountMinor: event.amountMinor,
        id: event.id,
        kind: "planned_purchase" as const,
      })),
  ].sort((left, right) => left.id.localeCompare(right.id));
}

export function buildDailyForecast(input: DailyForecastInput): DailyForecast {
  const dayCount = differenceInDays(input.startDate, input.endDate);
  if (dayCount < 0) throw new Error("Forecast end date cannot be before start date");
  if (dayCount > 30) throw new Error("Forecast cannot exceed 30 days");

  [
    input.essentialReserveMinor,
    input.investmentReserveMinor,
    input.liquidCashMinor,
    input.minimumBufferMinor,
    input.purchasePriceMinor,
    ...input.income.map((event) => event.amountMinor),
    ...input.obligations.map((event) => event.amountMinor),
    ...input.plannedPurchases.map((event) => event.amountMinor),
  ].forEach(assertMoney);

  const withinHorizon = (dueOn: string) => dueOn >= input.startDate && dueOn <= input.endDate;
  let cashMinor = input.liquidCashMinor;
  let remainingEssentialMinor = input.essentialReserveMinor;
  let remainingObligationsMinor = sum(
    input.obligations
      .filter((event) => withinHorizon(event.dueOn))
      .map((event) => event.amountMinor)
  );
  let remainingAdditionalMinor = sum(
    input.obligations
      .filter((event) => withinHorizon(event.dueOn) && event.budgetTreatment === "additional")
      .map((event) => event.amountMinor)
  );
  let remainingPlannedMinor = sum(
    input.plannedPurchases
      .filter((event) => withinHorizon(event.dueOn))
      .map((event) => event.amountMinor)
  );
  const days: ForecastDay[] = [];
  let firstComfortablyAffordableDate: string | null = null;
  let minimumCashMinor = Number.POSITIVE_INFINITY;
  let minimumCashDate = input.startDate;

  for (let offset = 0; offset <= dayCount; offset += 1) {
    const date = addDays(input.startDate, offset);
    const events = eventsForDate(input, date);

    for (const event of events) {
      if (event.kind === "income") {
        cashMinor = add(cashMinor, event.amountMinor);
      } else {
        cashMinor = subtract(cashMinor, event.amountMinor);
        if (event.kind === "planned_purchase") {
          remainingPlannedMinor = subtract(remainingPlannedMinor, event.amountMinor);
        } else {
          remainingObligationsMinor = subtract(remainingObligationsMinor, event.amountMinor);
          if (event.budgetTreatment === "additional") {
            remainingAdditionalMinor = subtract(remainingAdditionalMinor, event.amountMinor);
          } else {
            remainingEssentialMinor = Math.max(
              0,
              subtract(
                remainingEssentialMinor,
                Math.min(remainingEssentialMinor, event.amountMinor)
              )
            );
          }
        }
      }
    }

    const candidateComfortableHeadroomMinor = subtract(
      subtract(subtract(cashMinor, remainingObligationsMinor), input.minimumBufferMinor),
      input.purchasePriceMinor
    );
    const goalAvailableMinor = subtract(
      subtract(
        subtract(subtract(cashMinor, remainingEssentialMinor), input.investmentReserveMinor),
        remainingAdditionalMinor
      ),
      remainingPlannedMinor
    );
    if (firstComfortablyAffordableDate === null && candidateComfortableHeadroomMinor >= 0) {
      firstComfortablyAffordableDate = date;
    }
    if (cashMinor < minimumCashMinor) {
      minimumCashMinor = cashMinor;
      minimumCashDate = date;
    }
    days.push({
      candidateComfortableHeadroomMinor,
      date,
      endingCashMinor: cashMinor,
      events,
      goalAvailableMinor,
    });
  }

  return {
    days,
    firstComfortablyAffordableDate,
    minimumCashDate,
    minimumCashMinor,
  };
}
