import AxeBuilder from "@axe-core/playwright";
import { forbiddenPrimaryTerms } from "@sochle/contracts";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { resetLiveDatabase, seedDecisionDatabase, seedDecisionIssue } from "./test-data";

test.beforeEach(async () => seedDecisionDatabase());
test.afterEach(resetLiveDatabase);

async function loginOwner(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Owner password").fill("synthetic-owner-password");
  await page.getByRole("button", { name: "Continue" }).click();
}

async function checkPurchase(page: Page, description = "Synthetic headphones") {
  await page.goto("/check");
  await page.getByLabel("What are you considering?").fill(description);
  await page.getByLabel("Price in rupees").fill("45000");
  await page.getByRole("button", { name: "Does this fit?" }).click();
  await expect(page.getByRole("heading", { name: "Yes, this fits comfortably." })).toBeVisible();
}

async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations.map(({ id, impact, nodes }) => ({
      id,
      impact,
      nodes: nodes.map(({ failureSummary, html, target }) => ({ failureSummary, html, target })),
    }))
  ).toEqual([]);
}

test("primary product surfaces meet the accessibility and language gate", async ({ page }) => {
  await loginOwner(page);
  await checkPurchase(page);
  await page.getByRole("link", { name: "Full decision" }).click();
  const decisionUrl = page.url();

  for (const path of [
    "/",
    "/check",
    "/decisions",
    decisionUrl,
    "/settings",
    "/money-inbox",
    "/rules",
    "/connections",
    "/settings/privacy",
    "/settings/technical",
  ]) {
    await page.goto(path);
    await expectNoAccessibilityViolations(page);
  }

  for (const path of ["/", "/check", "/decisions", decisionUrl, "/settings", "/money-inbox"]) {
    await page.goto(path);
    const copy = (await page.locator("main").innerText()).toLowerCase();
    for (const term of [...forbiddenPrimaryTerms, "uncaught error", "rules v", "snapshot id"]) {
      expect(copy).not.toContain(term.toLowerCase());
    }
    expect(copy).not.toContain("fold");
  }
});

test("keyboard focus, reduced motion, and responsive widths remain usable", async ({ page }) => {
  await loginOwner(page);
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();
  expect(
    await skipLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: style.outlineWidth };
    })
  ).toEqual({ style: "solid", width: "3px" });

  await page.emulateMedia({ reducedMotion: "reduce" });
  const navigationLink = page.getByRole("link", { exact: true, name: "Home" });
  expect(
    await navigationLink.evaluate((element) => getComputedStyle(element).transitionDuration)
  ).toBe("0s");

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ height: 900, width });
    for (const path of ["/", "/check", "/decisions", "/settings", "/money-inbox"]) {
      await page.goto(path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width
      );
    }
  }
});

test("core web surfaces match reviewed visual baselines", async ({ page }) => {
  await loginOwner(page);

  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.goto("/");
  await expect(page).toHaveScreenshot("home-desktop.png", { animations: "disabled" });

  await page.setViewportSize({ height: 844, width: 390 });
  await expect(page).toHaveScreenshot("home-mobile.png", { animations: "disabled" });
  await page.goto("/check");
  await expect(page).toHaveScreenshot("check-idle-mobile.png", { animations: "disabled" });

  await checkPurchase(page);
  await expect(page).toHaveScreenshot("check-result-mobile.png", { animations: "disabled" });
  await page.getByRole("link", { name: "Full decision" }).click();
  const decisionUrl = page.url();

  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.goto("/decisions");
  await expect(page).toHaveScreenshot("decisions-desktop.png", { animations: "disabled" });
  await page.goto(decisionUrl);
  await expect(page).toHaveScreenshot("decision-detail-desktop.png", { animations: "disabled" });

  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/settings");
  await expect(page).toHaveScreenshot("settings-mobile.png", { animations: "disabled" });
  await seedDecisionIssue();
  await page.goto("/money-inbox");
  await expect(page).toHaveScreenshot("needs-attention-mobile.png", { animations: "disabled" });

  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ height: 1000, width: 1440 });
  await page.goto("/");
  await expect(page).toHaveScreenshot("home-dark.png", { animations: "disabled" });
  await page.goto(decisionUrl);
  await expect(page).toHaveScreenshot("decision-detail-dark.png", { animations: "disabled" });
});
