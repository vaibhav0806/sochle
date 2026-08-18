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
  it("shows a calm loading state", () => {
    render(<App openUrl={vi.fn()} sendMessage={() => new Promise(() => undefined)} />);
    expect(screen.getByText("Checking this browser…").getAttribute("aria-live")).toBe("polite");
  });

  it("pairs through the app-owned flow", async () => {
    const sendMessage = vi.fn(async (message: ExtensionBackgroundRequest) =>
      message.operation === "getSession" ? unpaired : paired
    );
    render(<App openUrl={vi.fn()} sendMessage={sendMessage} />);

    fireEvent.click(await screen.findByRole("button", { name: "Pair this browser" }));
    expect(await screen.findByRole("heading", { name: "Ready to check" })).toBeTruthy();
    expect(sendMessage).toHaveBeenCalledWith({ operation: "pair" });
  });

  it("translates pairing failures without exposing raw errors", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce(unpaired)
      .mockRejectedValueOnce(new Error("secret pairing failure"));
    render(<App openUrl={vi.fn()} sendMessage={sendMessage} />);

    fireEvent.click(await screen.findByRole("button", { name: "Pair this browser" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Pairing didn’t finish");
    expect(alert.textContent).not.toContain("secret pairing failure");
  });

  it("keeps technical connection details out of the default view", async () => {
    const sendMessage = vi.fn(async () => paired);
    render(<App openUrl={vi.fn()} sendMessage={sendMessage} />);

    expect(await screen.findByRole("heading", { name: "Ready to check" })).toBeTruthy();
    expect(screen.getByText("Amazon India · Flipkart · Myntra")).toBeTruthy();
    const details = screen.getByText("Browser connection").closest("details");
    expect(details?.open).toBe(false);

    fireEvent.click(screen.getByText("Browser connection"));
    expect(details?.open).toBe(true);
    expect(screen.getByText(appUrl)).toBeTruthy();
    expect(screen.getByText(/₹10,000/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Disconnect this browser" })).toBeTruthy();
  });

  it("checks the active product", async () => {
    const sendMessage = vi.fn(async (message: ExtensionBackgroundRequest) =>
      message.operation === "getSession" ? paired : { opened: true }
    );
    render(<App openUrl={vi.fn()} sendMessage={sendMessage} />);

    fireEvent.click(await screen.findByRole("button", { name: "Check current product" }));
    await waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({ operation: "openCurrentProductCheck" })
    );
  });

  it.each([
    ["unsupported", "Open a product on Amazon India, Flipkart, or Myntra"],
    ["reload_required", "Reload this product tab once"],
  ])("explains an unavailable product check (%s)", async (reason, message) => {
    const sendMessage = vi.fn(async (request: ExtensionBackgroundRequest) =>
      request.operation === "getSession" ? paired : { opened: false, reason }
    );
    render(<App openUrl={vi.fn()} sendMessage={sendMessage} />);

    fireEvent.click(await screen.findByRole("button", { name: "Check current product" }));
    expect((await screen.findByRole("alert")).textContent).toContain(message);
  });

  it("offers one setup action when paired but not ready", async () => {
    const openUrl = vi.fn();
    render(
      <App openUrl={openUrl} sendMessage={vi.fn(async () => ({ ...paired, ready: false }))} />
    );

    expect(await screen.findByRole("heading", { name: "Finish setup first" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Check current product" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(openUrl).toHaveBeenCalledWith(appUrl);
  });

  it("opens the app and requires confirmation before disconnecting", async () => {
    const openUrl = vi.fn();
    const sendMessage = vi.fn(async (message: ExtensionBackgroundRequest) =>
      message.operation === "disconnect" ? { disconnected: true } : paired
    );
    render(<App openUrl={openUrl} sendMessage={sendMessage} />);

    fireEvent.click(await screen.findByRole("button", { name: "Open Sochle" }));
    expect(openUrl).toHaveBeenCalledWith(appUrl);
    fireEvent.click(screen.getByText("Browser connection"));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect this browser" }));
    expect(sendMessage).not.toHaveBeenCalledWith({ operation: "disconnect" });
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ operation: "disconnect" }));
    expect(await screen.findByRole("button", { name: "Pair this browser" })).toBeTruthy();
  });
});
