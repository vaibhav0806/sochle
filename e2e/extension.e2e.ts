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

    await expect(popup.getByRole("heading", { name: "सोचle." })).toBeVisible();
    await expect(popup.getByRole("heading", { name: "Connected to Sochle" })).toBeVisible();

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
    await product.getByRole("button", { name: "Calculate" }).click();
    await expect(product.getByText(/safe to spend|wait/i)).toBeVisible();
    await product.getByRole("button", { name: "Wait" }).click();
    await expect(product.getByText("Saved: waiting")).toBeVisible();
  } finally {
    await context.close();
    await rm(profilePath, { force: true, recursive: true });
  }
});
