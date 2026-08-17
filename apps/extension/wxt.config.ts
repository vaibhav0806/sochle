import { defineConfig } from "wxt";

const apiOrigin = new URL(process.env.WXT_SOCHLE_API_ORIGIN ?? "http://localhost:3000").origin;

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Sochle",
    description: "Decide before you buy.",
    host_permissions: [
      `${apiOrigin}/*`,
      "https://*.amazon.in/*",
      "https://*.flipkart.com/*",
      "https://*.myntra.com/*",
    ],
    permissions: ["identity", "storage"],
  },
});
