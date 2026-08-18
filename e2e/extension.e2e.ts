import { createHash, randomBytes } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { chromium, expect, test } from "@playwright/test";
import { createSochleDatabase, ExtensionRepository, FinancialRepository } from "@sochle/db";

import { e2eDatabaseUrl, resetLiveDatabase, seedDecisionDatabase } from "./test-data";

const credentialKey = "sochle.extensionCredential";
async function seedExtensionPairing(extensionOrigin: string, rawCredential: string): Promise<void> {
  const database = createSochleDatabase(e2eDatabaseUrl);
  try {
    const connection = await new FinancialRepository(database.db).getConnection("fold");
    if (connection === null) throw new Error("E2E financial connection is missing");
    const repository = new ExtensionRepository(database.db);
    const now = new Date();
    const request = await repository.createPairingRequest({
      callbackUrl: `https://${new URL(extensionOrigin).hostname}.chromiumapp.org/pair`,
      createdAt: now,
      credentialHash: createHash("sha256").update(rawCredential, "utf8").digest("hex"),
      expiresAt: new Date(now.getTime() + 60_000),
      extensionOrigin,
    });
    await repository.approvePairingRequest(request.id, connection.id, now);
  } finally {
    await database.close();
  }
}

test.afterEach(async () => {
  await resetLiveDatabase();
});

test("a paired extension evaluates a product and records an outcome", async () => {
  await seedDecisionDatabase({ realisticAgingSources: true });
  const rawCredential = randomBytes(24).toString("hex");
  const extensionPath = resolve("apps/extension/.output/chrome-mv3");
  const profilePath = await mkdtemp(`${tmpdir()}/sochle-extension-`);
  const context = await chromium.launchPersistentContext(profilePath, {
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    channel: "chromium",
    headless: true,
  });

  try {
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(serviceWorker.url()).host;
    const extensionOrigin = `chrome-extension://${extensionId}`;
    await seedExtensionPairing(extensionOrigin, rawCredential);

    const popup = await context.newPage();
    await popup.goto(`${extensionOrigin}/popup.html`);
    await popup.evaluate(
      async ({ credential, key }) => {
        const extension = globalThis as unknown as {
          browser: { storage: { local: { set(values: Record<string, string>): Promise<void> } } };
        };
        await extension.browser.storage.local.set({ [key]: credential });
      },
      { credential: rawCredential, key: credentialKey }
    );
    await popup.reload();

    await expect(popup.getByRole("heading", { name: "सोचle." })).toBeVisible();
    await expect(popup.getByRole("heading", { name: "Ready to check" })).toBeVisible();

    const fixture = await readFile("apps/extension/test/fixtures/amazon-in/primary.html", "utf8");
    const product = await context.newPage();
    await product.route("https://www.amazon.in/dp/AMZ001", (route) =>
      route.fulfill({
        body: fixture,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );
    await product.goto("https://www.amazon.in/dp/AMZ001");

    await expect(product.getByRole("button", { name: "सोचle" })).toBeVisible();
    await product.getByRole("button", { name: "सोचle" }).click();
    const card = product.getByLabel("Sochle purchase check");
    await expect(card.getByText("Noise Cancelling Headphones")).toBeVisible();
    await expect(card.getByText("₹45,000.00")).toBeVisible();
    await card.getByRole("button", { name: "Check this purchase" }).click();
    await expect(card.getByText("Yes, this fits comfortably.")).toBeVisible();
    await expect(card.getByText("Based on your latest available picture")).toBeVisible();
    await expect(card.getByText("See the maths").locator("..")).not.toHaveAttribute("open", "");
    await expect(card).not.toContainText(
      /confidence|freshness|projected liquidity|headroom|fold|uncaught error/i
    );
    await card.getByRole("button", { name: "Wait" }).click();
    await expect(card.getByText("Saved")).toBeVisible();
  } finally {
    await context.close();
    await rm(profilePath, { force: true, recursive: true });
  }
});

test("the extension extracts every merchant and opens a below-threshold check manually", async () => {
  await seedDecisionDatabase();
  const rawCredential = randomBytes(24).toString("hex");
  const extensionPath = resolve("apps/extension/.output/chrome-mv3");
  const profilePath = await mkdtemp(`${tmpdir()}/sochle-extension-`);
  const context = await chromium.launchPersistentContext(profilePath, {
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    channel: "chromium",
    headless: true,
  });

  try {
    const serviceWorker =
      context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(serviceWorker.url()).host;
    const extensionOrigin = `chrome-extension://${extensionId}`;
    await seedExtensionPairing(extensionOrigin, rawCredential);

    const popup = await context.newPage();
    await popup.goto(`${extensionOrigin}/popup.html`);
    await popup.evaluate(
      async ({ credential, key }) => {
        const extension = globalThis as unknown as {
          browser: { storage: { local: { set(values: Record<string, string>): Promise<void> } } };
        };
        await extension.browser.storage.local.set({ [key]: credential });
      },
      { credential: rawCredential, key: credentialKey }
    );
    await popup.reload();
    await expect(popup.getByRole("heading", { name: "Ready to check" })).toBeVisible();

    const merchants = [
      {
        directory: "amazon-in",
        price: "45,000",
        title: "Noise Cancelling Headphones",
        url: "https://www.amazon.in/dp/AMZ001",
      },
      {
        directory: "flipkart",
        price: "89,999",
        title: "Gaming Laptop",
        url: "https://www.flipkart.com/item/p/FLP001",
      },
      {
        directory: "myntra",
        price: "12,499",
        title: "RunFast Carbon Running Shoes",
        url: "https://www.myntra.com/shoes/MYN001",
      },
    ] as const;

    for (const merchant of merchants) {
      const fixture = await readFile(
        `apps/extension/test/fixtures/${merchant.directory}/primary.html`,
        "utf8"
      );
      const product = await context.newPage();
      await product.route(merchant.url, (route) =>
        route.fulfill({
          body: fixture,
          headers: { "content-type": "text/html; charset=utf-8" },
        })
      );
      await product.goto(merchant.url);
      await product.getByRole("button", { name: "सोचle" }).click();
      const card = product.getByLabel("Sochle purchase check");
      await expect(card.getByText(merchant.title)).toBeVisible();
      await expect(card.getByText(`₹${merchant.price}.00`)).toBeVisible();
      await card.getByRole("button", { name: "Check this purchase" }).click();
      await expect(card.getByLabel("What did you decide?")).toBeVisible();
      await product.close();
    }

    const uncertainUrl = "https://www.amazon.in/dp/AMZ003";
    const uncertainFixture = await readFile(
      "apps/extension/test/fixtures/amazon-in/conflict.html",
      "utf8"
    );
    const uncertainProduct = await context.newPage();
    await uncertainProduct.route(uncertainUrl, (route) =>
      route.fulfill({
        body: uncertainFixture,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );
    await uncertainProduct.goto(uncertainUrl);
    await uncertainProduct.getByRole("button", { name: "सोचle" }).click();
    const uncertainCard = uncertainProduct.getByLabel("Sochle purchase check");
    await expect(uncertainCard.getByLabel("Product")).toHaveValue("Portable Projector");
    await expect(uncertainCard.getByLabel("Price in rupees")).toHaveValue("29,999");
    await uncertainProduct.close();

    const belowThresholdUrl = "https://www.myntra.com/jackets/MYN002";
    const belowThresholdFixture = await readFile(
      "apps/extension/test/fixtures/myntra/sale.html",
      "utf8"
    );
    const belowThresholdProduct = await context.newPage();
    await belowThresholdProduct.route(belowThresholdUrl, (route) =>
      route.fulfill({
        body: belowThresholdFixture,
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    );
    await belowThresholdProduct.goto(belowThresholdUrl);
    await expect(belowThresholdProduct.getByRole("button", { name: "सोचle" })).toHaveCount(0);
    await belowThresholdProduct.bringToFront();
    await popup
      .getByRole("button", { name: "Check current product" })
      .evaluate((button: HTMLButtonElement) => button.click());
    await belowThresholdProduct.getByRole("button", { name: "सोचle" }).click();
    const belowThresholdCard = belowThresholdProduct.getByLabel("Sochle purchase check");
    await expect(belowThresholdCard.getByText("North Trail Insulated Jacket")).toBeVisible();
    await expect(belowThresholdCard.getByText("₹8,999.00")).toBeVisible();
  } finally {
    await context.close();
    await rm(profilePath, { force: true, recursive: true });
  }
});
