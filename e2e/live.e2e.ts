import { expect, test } from "@playwright/test";

import { resetLiveDatabase, seedLiveDatabase } from "./test-data";

test.beforeEach(async () => {
  await seedLiveDatabase();
});

test.afterEach(async () => {
  await resetLiveDatabase();
});

test("financial pages require the owner session", async ({ context, page }) => {
  const unauthorized = await page.request.post("/api/sync", { maxRedirects: 0 });
  expect(unauthorized.status()).toBe(401);
  const callback = await page.request.get("/api/fold/callback", { maxRedirects: 0 });
  expect(callback.status()).toBeGreaterThanOrEqual(300);
  expect(callback.headers().location).toBe("http://127.0.0.1:3101/login");
  await page.goto("/connections");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("Owner password").fill("wrong-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("That password is not correct")).toBeVisible();

  await page.getByLabel("Owner password").fill("synthetic-owner-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/connections$/);
  const cookie = (await context.cookies()).find((item) => item.name === "sochle_owner");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });

  await expect(page.getByText("Status: disconnected")).toBeVisible();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText("Last action: connect first.")).toBeVisible();
});

test("owner resolves a Money Inbox issue through the browser", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Owner password").fill("synthetic-owner-password");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.goto("/money-inbox");

  await expect(page.getByText("large untagged transaction")).toBeVisible();
  await expect(page.getByText("₹6,500.00")).toBeVisible();
  const issueForm = page.locator('form[action^="/api/issues/"]');
  const issueAction = await issueForm.getAttribute("action");
  if (issueAction === null) throw new Error("Money Inbox issue form is missing its action");
  const invalidResolution = await page.request.post(issueAction, {
    form: { action: "classify", classification: "not-a-classification" },
  });
  expect(invalidResolution.status()).toBe(400);
  const evidenceHref = await page
    .getByRole("link", { name: /Inspect current Fold evidence/ })
    .getAttribute("href");
  if (evidenceHref === null) throw new Error("Money Inbox evidence link is missing its URL");
  expect((await page.request.get(evidenceHref)).status()).toBe(409);

  await page.getByLabel("Classification").selectOption("investment");
  await page.getByRole("button", { name: "Classify" }).click();

  await expect(page.getByRole("heading", { name: "All clear" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "All clear" })).toBeVisible();
});
