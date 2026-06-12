import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, waitFor } from "@marko/testing-library";
import { makeDehydrated } from "./helpers";
import HydrateApp from "./fixtures/hydrate-app.marko";

describe("Step 4 — hydrate flow (client)", () => {
  afterEach(() => cleanup());

  it("provider hydrates the dehydrated cache; query shows data without refetching", async () => {
    const { dehydrated } = await makeDehydrated(["alpha-marker", "beta-marker"]);
    const queryFn = vi.fn(async () => ["fresh-fetch"]);

    const { getByTestId } = await render(HydrateApp, {
      $global: { __tanstack_dehydrated: dehydrated },
      queryFn,
    });

    await waitFor(() => { expect(getByTestId("status").textContent).toBe("success"); });
    expect(getByTestId("data").textContent).toContain("alpha-marker");
    expect(getByTestId("data").textContent).not.toContain("fresh-fetch");
    expect(queryFn).not.toHaveBeenCalled();
  });
});