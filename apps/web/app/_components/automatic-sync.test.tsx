// @vitest-environment happy-dom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutomaticSync } from "./automatic-sync";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("automatic account refresh", () => {
  it("stays quiet when no update is due", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { container } = render(<AutomaticSync enabled={false} />);
    expect(container.textContent).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("announces an update without exposing sync terminology", async () => {
    let finish!: () => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = () => resolve(new Response());
          })
      )
    );
    render(<AutomaticSync enabled />);
    expect(await screen.findByText("Updating your account picture…")).toBeTruthy();
    await act(async () => finish());
  });
});
