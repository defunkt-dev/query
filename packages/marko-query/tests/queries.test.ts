import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@marko/testing-library";
import type { QueryClient } from "@tanstack/query-core";
import { createTestQueryClient } from "./helpers";

import BasicQueries from "./fixtures/basic-queries.marko";
import DynamicQueries from "./fixtures/dynamic-queries.marko";

describe("<queries>", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
    queryClient.unmount();
    cleanup();
  });

  it("runs multiple queries and each resolves independently", async () => {
    const { getByTestId } = await render(BasicQueries, {
      $global: { __tanstack_queryClient: queryClient },
      keys: [["a"], ["b"], ["c"]],
      queryFn: (key: unknown[]) =>
        Promise.resolve(`data-${(key as string[])[0]}`),
    });

    // The set length is known structurally on the first render.
    expect(getByTestId("count").textContent).toBe("3");

    await waitFor(() => {
      expect(getByTestId("statuses").textContent).toBe(
        "success,success,success",
      );
    });

    expect(getByTestId("data").textContent).toBe(
      JSON.stringify(["data-a", "data-b", "data-c"]),
    );
  });

  it("applies combine and keeps the combined value live", async () => {
    const { getByTestId } = await render(BasicQueries, {
      $global: { __tanstack_queryClient: queryClient },
      keys: [["x"], ["y"]],
      queryFn: (key: unknown[]) => Promise.resolve((key as string[])[0]),
      combine: (results: any[]) => ({
        pending: results.some((r) => r.isPending),
        data: results.map((r) => r.data),
      }),
    });

    // combine is re-applied on every update, so pending flips false once both settle.
    await waitFor(() => {
      const combined = JSON.parse(getByTestId("combined").textContent!);
      expect(combined.pending).toBe(false);
    });

    const combined = JSON.parse(getByTestId("combined").textContent!);
    expect(combined.data).toEqual(["x", "y"]);
  });

  it("adds and removes queries dynamically", async () => {
    const { getByTestId } = await render(DynamicQueries, {
      $global: { __tanstack_queryClient: queryClient },
      initialKeys: [
        ["d", 0],
        ["d", 1],
      ],
      queryFn: (key: unknown[]) => Promise.resolve(`v-${(key as any[])[1]}`),
    });

    await waitFor(() => {
      expect(getByTestId("statuses").textContent).toBe("success,success");
    });
    expect(getByTestId("count").textContent).toBe("2");

    await fireEvent.click(getByTestId("add"));
    await waitFor(() => {
      expect(getByTestId("count").textContent).toBe("3");
    });
    await waitFor(() => {
      expect(getByTestId("statuses").textContent).toBe(
        "success,success,success",
      );
    });

    await fireEvent.click(getByTestId("remove"));
    await waitFor(() => {
      expect(getByTestId("count").textContent).toBe("2");
    });
  });
});
