// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StatefulAction } from "./stateful-action";

afterEach(cleanup);

describe("stateful action", () => {
  it("announces loading and prevents a duplicate action", () => {
    render(<StatefulAction pending>Does this fit?</StatefulAction>);

    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Checking…" });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
  });

  it("preserves native button attributes while idle", () => {
    render(
      <StatefulAction name="intent" type="submit" value="check">
        Does this fit?
      </StatefulAction>
    );

    const button = screen.getByRole<HTMLButtonElement>("button", { name: "Does this fit?" });
    expect(button.disabled).toBe(false);
    expect(button.name).toBe("intent");
    expect(button.value).toBe("check");
    expect(button.type).toBe("submit");
  });
});
