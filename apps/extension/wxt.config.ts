import { defineConfig } from "wxt";

import { buildExtensionManifest } from "./src/manifest";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: buildExtensionManifest(process.env.WXT_SOCHLE_API_ORIGIN ?? "http://localhost:3000"),
});
