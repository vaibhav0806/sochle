import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { chromium, expect, test } from "@playwright/test";

test("the built Manifest V3 extension loads its popup", async () => {
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
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await expect(page.getByRole("heading", { name: "सोचle." })).toBeVisible();
    await expect(page.getByText("Planning mode")).toBeVisible();
  } finally {
    await context.close();
    await rm(profilePath, { force: true, recursive: true });
  }
});
