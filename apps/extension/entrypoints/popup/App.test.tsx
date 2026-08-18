// @vitest-environment happy-dom

import type { ExtensionBackgroundRequest, ExtensionSession } from "@sochle/contracts/browser";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const appUrl = "http://localhost:3000";
const paired: ExtensionSession = {
  appUrl,
  kind: "paired",
  pairingId: "00000000-0000-4000-8000-000000000001",
  ready: true,
  thresholdMinor: 10_000_00,
};
const unpaired: ExtensionSession = { appUrl, kind: "unpaired" };

afterEach(cleanup);

describe("extension popup", () => {
  it("pairs through the app-owned sign-in flow", async () => {
    const sendMessage = vi.fn(async (message: ExtensionBackgroundRequest) =>
      message.operation === "getSession" ? unpaired : paired
    );
    render(<App openUrl={vi.fn()} sendMessage={sendMessage} />);

    expect(await screen.findByRole("button", { name: "Sign in to Sochle" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sign in to Sochle" }));
    expect(await screen.findByText("Connected to Sochle")).not.toBeNull();
    expect(sendMessage).toHaveBeenCalledWith({ operation: "pair" });
  });

  it("shows a useful pairing error and allows retry", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(unpaired)
      .mockRejectedValueOnce(new Error("Pairing window closed"));
    render(<App openUrl={vi.fn()} sendMessage={sendMessage} />);

    fireEvent.click(await screen.findByRole("button", { name: "Sign in to Sochle" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Pairing window closed");
    expect(screen.getByRole("button", { name: "Try pairing again" })).not.toBeNull();
  });

  it("shows paired readiness, supported merchants, and manual product check", async () => {
    const sendMessage = vi.fn(async (message: ExtensionBackgroundRequest) => {
      if (message.operation === "getSession") return paired;
      if (message.operation === "openCurrentProductCheck") return { opened: true };
      return paired;
    });
    render(<App openUrl={vi.fn()} sendMessage={sendMessage} />);

    expect(await screen.findByText("Connected to Sochle")).not.toBeNull();
    expect(screen.getByText(appUrl)).not.toBeNull();
    expect(screen.getByText(/Amazon India, Flipkart, and Myntra/)).not.toBeNull();
    expect(screen.getByText(/₹10,000/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check current product" }));
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ operation: "openCurrentProductCheck" })
    );
  });

  it("explains when the active tab is unsupported", async () => {
    const sendMessage = vi.fn(async (message: ExtensionBackgroundRequest) =>
      message.operation === "getSession" ? paired : { opened: false, reason: "unsupported" }
    );
    render(<App openUrl={vi.fn()} sendMessage={sendMessage} />);

    fireEvent.click(await screen.findByRole("button", { name: "Check current product" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Open a product on Amazon India, Flipkart, or Myntra"
    );
  });

  it("asks for a tab reload when the extension listener is stale", async () => {
    const sendMessage = vi.fn(async (message: ExtensionBackgroundRequest) =>
      message.operation === "getSession" ? paired : { opened: false, reason: "reload_required" }
    );
    render(<App openUrl={vi.fn()} sendMessage={sendMessage} />);

    fireEvent.click(await screen.findByRole("button", { name: "Check current product" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Reload this product tab after updating the extension"
    );
  });

  it("opens the app and requires confirmation before disconnecting", async () => {
    const openUrl = vi.fn();
    const sendMessage = vi.fn(async (message: ExtensionBackgroundRequest) =>
      message.operation === "disconnect" ? { disconnected: true } : paired
    );
    render(<App openUrl={openUrl} sendMessage={sendMessage} />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Sochle" }));
    expect(openUrl).toHaveBeenCalledWith(appUrl);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(sendMessage).not.toHaveBeenCalledWith({ operation: "disconnect" });
    fireEvent.click(screen.getByRole("button", { name: "Yes, disconnect" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ operation: "disconnect" }));
    expect(await screen.findByRole("button", { name: "Sign in to Sochle" })).not.toBeNull();
  });
});
