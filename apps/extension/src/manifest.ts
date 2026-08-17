export function buildExtensionManifest(apiOrigin: string) {
  const origin = new URL(apiOrigin).origin;
  return {
    description: "Decide before you buy.",
    host_permissions: [
      `${origin}/*`,
      "https://*.amazon.in/*",
      "https://*.flipkart.com/*",
      "https://*.myntra.com/*",
    ],
    name: "Sochle",
    permissions: ["identity", "storage"],
  };
}
