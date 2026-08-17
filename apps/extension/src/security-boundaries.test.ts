import { describe, expect, it } from "vitest";

import { buildExtensionManifest } from "./manifest";

describe("extension security boundaries", () => {
  it("requests only pairing storage and the supported merchant/API hosts", () => {
    const manifest = buildExtensionManifest("http://localhost:3000/path");

    expect(new Set(manifest.permissions)).toEqual(new Set(["identity", "storage"]));
    expect(new Set(manifest.host_permissions)).toEqual(
      new Set([
        "http://localhost:3000/*",
        "https://*.amazon.in/*",
        "https://*.flipkart.com/*",
        "https://*.myntra.com/*",
      ])
    );
  });
});
