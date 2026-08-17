import { describe, expect, it } from "vitest";

import { createOwnerSession, verifyOwnerPassword, verifyOwnerSession } from "./owner-session";

describe("owner session", () => {
  it("accepts an untampered token before expiry", () => {
    const token = createOwnerSession("demo-session-secret", new Date("2026-08-17T06:00:00Z"), 3600);

    expect(verifyOwnerSession(token, "demo-session-secret", new Date("2026-08-17T06:30:00Z"))).toBe(
      true
    );
  });

  it("rejects expired and tampered tokens", () => {
    const token = createOwnerSession("demo-session-secret", new Date("2026-08-17T06:00:00Z"), 60);

    expect(verifyOwnerSession(token, "demo-session-secret", new Date("2026-08-17T06:02:00Z"))).toBe(
      false
    );
    expect(
      verifyOwnerSession(
        `${token}tampered`,
        "demo-session-secret",
        new Date("2026-08-17T06:00:30Z")
      )
    ).toBe(false);
  });

  it("compares the configured owner password without early string comparison", () => {
    expect(verifyOwnerPassword("correct horse", "correct horse")).toBe(true);
    expect(verifyOwnerPassword("wrong horse", "correct horse")).toBe(false);
  });
});
