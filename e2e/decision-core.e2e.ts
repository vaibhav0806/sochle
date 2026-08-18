import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  resetLiveDatabase,
  seedDecisionDatabase,
  seedDecisionIssue,
  seedOptionalDecisionIssue,
  seedStaleSourceIssue,
} from "./test-data";

test.beforeEach(async () => seedDecisionDatabase());
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
  await page.getByLabel("Price in rupees").fill("45000");
  await page.getByRole("button", { name: "Does this fit?" }).click();
  await page.getByRole("link", { name: "Full decision" }).click();
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

test("owner navigation renders every implemented web surface without browser errors", async ({
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await loginOwner(page);

  await page.goto("/");
  const primaryNavigation = page.getByRole("navigation", { name: "Primary navigation" });
  await expect(primaryNavigation.getByRole("link")).toHaveText([
    "Home",
    "Check",
    "Decisions",
    "Settings",
  ]);
  await primaryNavigation.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("link", { name: /My guardrails/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Connected account and browser/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Privacy and data/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Technical details/ })).toBeVisible();

  for (const path of [
    "/",
    "/today",
    "/check",
    "/rules",
    "/decisions",
    "/weekly-review",
    "/connections",
    "/money-inbox",
    "/settings",
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
  }

  expect(browserErrors).toEqual([]);
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
  await page.getByLabel("Price in rupees").fill("45000");
  await page.getByRole("button", { name: "Does this fit?" }).click();
  await expect(page).toHaveURL(/\/check$/);
  await expect(page.getByRole("heading", { name: "Yes, this fits comfortably." })).toBeVisible();
  await expect(page.locator("details").filter({ hasText: "See the maths" })).not.toHaveAttribute(
    "open"
  );
  await page.getByRole("link", { name: "Full decision" }).click();
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

  await page.goto("/decisions");
  await page.getByLabel("Status").selectOption("planned");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/\/decisions\?status=planned$/);
  await expect(page.getByRole("link", { name: "Synthetic headphones" })).toBeVisible();
  await page.getByLabel("Status").selectOption("waiting");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page.getByRole("heading", { name: "No decisions yet" })).toBeVisible();

  await page.goto("/weekly-review");
  await expect(page.getByRole("heading", { name: "Weekly review" })).toBeVisible();
  await expect(
    page
      .locator("article")
      .filter({ hasText: "Delayed or planned" })
      .getByText("1", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Dogfooding progress")).toBeVisible();
});

test("resolving a blocking issue appends a successor and preserves the original decision", async ({
  page,
}) => {
  await seedDecisionIssue();
  await createReferenceDecision(page);
  const originalDecisionUrl = page.url();
  await expect(page.getByText("Pehle data sort karte hain, phir decision.")).toBeVisible();

  await page.goto("/money-inbox");
  await page.getByLabel("Classification").selectOption("investment");
  await page.getByRole("button", { name: "Classify" }).click();
  await expect(page.getByRole("heading", { name: "All clear" })).toBeVisible();

  await page.goto("/decisions");
  await page.getByRole("link", { name: "Synthetic headphones" }).click();
  expect(page.url()).not.toBe(originalDecisionUrl);
  await expect(page.getByText("Haan, this fits.")).toBeVisible();

  await page.goto(originalDecisionUrl);
  await expect(page.getByText("Pehle data sort karte hain, phir decision.")).toBeVisible();
});

test("optional transaction cleanup is labelled and does not block a purchase", async ({ page }) => {
  await seedOptionalDecisionIssue();
  await loginOwner(page);
  await page.goto("/money-inbox");
  await expect(page.getByRole("heading", { name: "Optional cleanup" })).toBeVisible();
  await expect(page.getByText("These items do not block purchase decisions.")).toBeVisible();

  await page.goto("/check");
  await page.getByLabel("What are you considering?").fill("Synthetic headphones");
  await page.getByLabel("Price in rupees").fill("45000");
  await page.getByRole("button", { name: "Does this fit?" }).click();
  await expect(page.getByText("Yes, this fits comfortably.")).toBeVisible();
});

test("a stale Fold source shows refresh guidance instead of transaction controls", async ({
  page,
}) => {
  await seedStaleSourceIssue();
  await loginOwner(page);
  await page.goto("/money-inbox");

  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(
    page.getByText("Refresh this source in Fold, then sync Sochle again.")
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Open data connections" })).toBeVisible();
  await expect(page.getByLabel("Classification")).toHaveCount(0);
});

test("owner exports then deletes every local record", async ({ page }) => {
  await createReferenceDecision(page);
  const exportResponse = await page.request.get("/api/export");
  expect(exportResponse.status()).toBe(200);
  expect(exportResponse.headers()["content-disposition"]).toContain("attachment");
  expect(await exportResponse.json()).toMatchObject({ schemaVersion: 3 });

  const rejected = await page.request.post("/api/delete", {
    form: { confirmation: "delete" },
  });
  expect(rejected.status()).toBe(400);

  await page.goto("/today");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete all my data" }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1$/);
});

test("export and deletion reject an anonymous request", async ({ page }) => {
  expect((await page.request.get("/api/export")).status()).toBe(401);
  expect(
    (
      await page.request.post("/api/delete", {
        form: { confirmation: "DELETE" },
        maxRedirects: 0,
      })
    ).status()
  ).toBe(401);
});
