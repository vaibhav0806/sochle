import { expect, test } from "@playwright/test";

test("synthetic demo exposes the data surfaces without credentials", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Let's get Sochle ready." })).toBeVisible();

  await page.getByRole("link", { name: "Set up Sochle" }).click();
  await expect(page).toHaveURL(/\/connections$/);
  await expect(page.getByText("Demo mode is on")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect Fold" })).toHaveCount(0);

  await page.getByRole("link", { name: /Review anything that needs attention/ }).click();
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "All clear" })).toBeVisible();
});

test("mobile users retain navigation to the purchase check", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/");

  await expect(page.getByRole("navigation")).toBeVisible();
  await page.getByRole("link", { name: "Check", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Does this fit?" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
