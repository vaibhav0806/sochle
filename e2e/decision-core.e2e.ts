import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { resetLiveDatabase, seedDecisionDatabase } from "./test-data";

test.beforeEach(seedDecisionDatabase);
test.afterEach(resetLiveDatabase);

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Owner password").fill("synthetic-owner-password");
  await page.getByRole("button", { name: "Continue" }).click();
}

async function createReferenceDecision(page: Page) {
  await loginOwner(page);
  await page.goto("/rules");
  await page.getByLabel("Minimum buffer").fill("25000");
  await page.getByLabel("Monthly salary").fill("0");
  await page.getByLabel("Salary confirmed").check();
  await page.getByLabel("Salary day").fill("31");
  await page.getByLabel("Essential monthly spending").fill("40000");
  await page.getByLabel("Monthly investment target").fill("25000");
  await page.getByLabel("Large purchase threshold").fill("10000");
  await page.getByLabel("Materiality cap").fill("5000");
  await page.getByLabel("Materiality ratio").fill("10");
  await page.getByLabel("Forecast horizon").selectOption("rolling_days");
  await page.getByLabel("Forecast days").fill("30");
  await page.getByRole("button", { name: "Save rules" }).click();
  await page.goto("/check");
  await page.getByLabel("What are you considering?").fill("Synthetic headphones");
  await page.getByLabel("Price").fill("45000");
  await page.getByRole("button", { name: "Sochle" }).click();
}

test("decision pages and mutations require the owner session", async ({ page }) => {
  await page.goto("/check");
  await expect(page).toHaveURL(/\/login$/);
  expect(
    (
      await page.request.post("/api/rules", {
        form: { minimumBuffer: "25000" },
        maxRedirects: 0,
      })
    ).status()
  ).toBe(401);
  expect(
    (
      await page.request.post("/api/decisions", {
        form: { description: "Synthetic headphones", price: "45000" },
        maxRedirects: 0,
      })
    ).status()
  ).toBe(401);
});

test("owner configures rules and checks a ₹45,000 purchase", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/rules");
  await page.getByLabel("Minimum buffer").fill("25000");
  await page.getByLabel("Monthly salary").fill("100000");
  await page.getByLabel("Salary confirmed").check();
  await page.getByLabel("Salary day").fill("31");
  await page.getByLabel("Essential monthly spending").fill("40000");
  await page.getByLabel("Monthly investment target").fill("20000");
  await page.getByLabel("Large purchase threshold").fill("10000");
  await page.getByLabel("Materiality cap").fill("5000");
  await page.getByLabel("Materiality ratio").fill("10");
  await page.getByLabel("Forecast horizon").selectOption("rolling_days");
  await page.getByLabel("Forecast days").fill("30");
  await page.getByRole("button", { name: "Save rules" }).click();

  await page.goto("/check");
  await page.getByLabel("What are you considering?").fill("Synthetic headphones");
  await page.getByLabel("Price").fill("45000");
  await page.getByRole("button", { name: "Sochle" }).click();
  await expect(page).toHaveURL(/\/decisions\/[0-9a-f-]+$/);
  await expect(page.getByText("Haan, this fits.")).toBeVisible();
  const detailUrl = page.url();
  await page.reload();
  expect(page.url()).toBe(detailUrl);
  await expect(page.getByText("Haan, this fits.")).toBeVisible();
});

test("Today and history expose the stored decision evidence", async ({ page }) => {
  await createReferenceDecision(page);
  await page.goto("/today");
  await expect(page.getByText("Safe to spend")).toBeVisible();
  await expect(page.getByText("₹50,000.00")).toBeVisible();
  await expect(page.getByText("Liquid cash")).toBeVisible();
  await expect(page.getByText("Upcoming obligations")).toBeVisible();

  await page.goto("/decisions");
  await page.getByRole("link", { name: "Synthetic headphones" }).click();
  await expect(page.getByText("Technical headroom")).toBeVisible();
  await expect(page.getByText("Comfortable headroom")).toBeVisible();
  await expect(page.getByText("Goal headroom")).toBeVisible();
  await expect(page.getByText("Formula v1")).toBeVisible();

  const plannedFor = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000).toISOString().slice(0, 10);
  await page.getByLabel("Purchase status").selectOption("planned");
  await page.getByLabel("Planned for").fill(plannedFor);
  await page.getByRole("button", { name: "Update status" }).click();
  await page.reload();
  await expect(page.getByLabel("Purchase status")).toHaveValue("planned");
  await expect(page.getByLabel("Planned for")).toHaveValue(plannedFor);
});
