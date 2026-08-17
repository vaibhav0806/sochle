import { createApiClient, type CredentialStore } from "../src/background/api-client";
import { createBackgroundMessageHandler } from "../src/background/messages";
import { createPairingCoordinator } from "../src/background/pairing";

const credentialKey = "sochle.extensionCredential";

export default defineBackground(() => {
  void browser.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const credential: CredentialStore = {
    async get() {
      const stored = await browser.storage.local.get(credentialKey);
      const value = stored[credentialKey];
      return typeof value === "string" ? value : null;
    },
    async remove() {
      await browser.storage.local.remove(credentialKey);
    },
    async set(value) {
      await browser.storage.local.set({ [credentialKey]: value });
    },
  };
  const apiOrigin = import.meta.env.WXT_SOCHLE_API_ORIGIN ?? "http://localhost:3000";
  const extensionOrigin = `chrome-extension://${browser.runtime.id}`;
  const api = createApiClient({
    apiOrigin,
    credential,
    extensionOrigin,
    fetch: globalThis.fetch.bind(globalThis),
  });
  const pairing = createPairingCoordinator({
    apiOrigin,
    credential,
    extensionOrigin,
    fetch: globalThis.fetch.bind(globalThis),
    identity: {
      getRedirectURL: (path) => browser.identity.getRedirectURL(path),
      launchWebAuthFlow: (options) => browser.identity.launchWebAuthFlow(options),
    },
    randomFill: (bytes) => crypto.getRandomValues(bytes),
  });
  const handleMessage = createBackgroundMessageHandler({
    api,
    pair: () => pairing.pair(),
    tabs: {
      async queryActive() {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        return tab === undefined ? null : { id: tab.id, url: tab.url };
      },
      sendMessage: (tabId, message) => browser.tabs.sendMessage(tabId, message),
    },
  });
  browser.runtime.onMessage.addListener((message) => handleMessage(message));
});
