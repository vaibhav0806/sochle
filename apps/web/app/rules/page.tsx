import { DEFAULT_RULES, type RuleSet } from "@sochle/domain";

import { formatMinorAsRupees } from "../../lib/money";
import { requireOwnerPage } from "../../lib/server/auth";
import { getDecisionRepository, getRepository } from "../../lib/server/database";

export const dynamic = "force-dynamic";

function inputMoney(minor: number): string {
  return formatMinorAsRupees(minor).replace("₹", "").replaceAll(",", "");
}

export default async function RulesPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireOwnerPage();
  const { saved } = await searchParams;
  const financialRepository = getRepository();
  const decisionRepository = getDecisionRepository();
  const connection =
    financialRepository === null ? null : await financialRepository.getConnection("fold");
  const active =
    connection === null || decisionRepository === null
      ? null
      : await decisionRepository.getActiveRuleSet(connection.id);
  const rules: RuleSet = active?.rules ?? { ...DEFAULT_RULES, version: 1 };
  const rollingDays =
    rules.forecastHorizon.kind === "rolling_days" ? rules.forecastHorizon.days : 30;
  const customEnd = rules.forecastHorizon.kind === "custom" ? rules.forecastHorizon.endDate : "";

  return (
    <main>
      <p className="eyebrow">Your guardrails</p>
      <h1>My guardrails</h1>
      <p>Choose the cushion, essentials, and goals every purchase answer should protect.</p>
      {saved === "1" && <p className="notice">Your guardrails are saved.</p>}
      {connection === null ? (
        <section className="card">
          <h2>Connect your account first</h2>
          <p className="muted">Then you can choose what every purchase should protect.</p>
        </section>
      ) : (
        <form action="/api/rules" method="post" className="card stack">
          <h2>What every decision protects</h2>
          <div className="form-grid">
            <label>
              Minimum buffer
              <input
                name="minimumBuffer"
                inputMode="decimal"
                defaultValue={inputMoney(rules.minimumBuffer.minor)}
                required
              />
            </label>
            <label>
              Monthly salary
              <input
                name="monthlySalary"
                inputMode="decimal"
                defaultValue={inputMoney(rules.salary.amount.minor)}
                required
              />
            </label>
            <label className="checkbox-label">
              <input
                name="salaryConfirmed"
                type="checkbox"
                defaultChecked={rules.salary.confirmed}
              />
              Salary confirmed
            </label>
            <label>
              Salary day
              <input
                name="salaryDay"
                type="number"
                min="1"
                max="31"
                defaultValue={rules.salary.dayOfMonth}
                required
              />
            </label>
            <label>
              Essential monthly spending
              <input
                name="essentialMonthlySpending"
                inputMode="decimal"
                defaultValue={inputMoney(rules.essentialMonthlySpending.minor)}
                required
              />
            </label>
            <label>
              Monthly investment target
              <input
                name="monthlyInvestmentTarget"
                inputMode="decimal"
                defaultValue={inputMoney(rules.monthlyInvestmentTarget.minor)}
                required
              />
            </label>
            <label>
              Large purchase threshold
              <input
                name="largePurchaseThreshold"
                inputMode="decimal"
                defaultValue={inputMoney(rules.largePurchaseThreshold.minor)}
                required
              />
            </label>
            <label>
              Materiality cap
              <input
                name="materialityCap"
                inputMode="decimal"
                defaultValue={inputMoney(rules.materiality.absoluteCap.minor)}
                required
              />
            </label>
            <label>
              Materiality ratio
              <input
                name="materialityRatio"
                inputMode="decimal"
                defaultValue={(rules.materiality.purchaseRatioBps / 100).toString()}
                required
              />
            </label>
            <label>
              Forecast horizon
              <select name="forecastHorizon" defaultValue={rules.forecastHorizon.kind}>
                <option value="next_salary">Next salary</option>
                <option value="rolling_days">Rolling days</option>
                <option value="custom">Custom date</option>
              </select>
            </label>
            <label>
              Forecast days
              <input
                name="forecastDays"
                type="number"
                min="1"
                max="30"
                defaultValue={rollingDays}
              />
            </label>
            <label>
              Forecast end date
              <input name="forecastEndDate" type="date" defaultValue={customEnd} />
            </label>
          </div>
          <div className="actions">
            <button type="submit">Save guardrails</button>
          </div>
        </form>
      )}
    </main>
  );
}
