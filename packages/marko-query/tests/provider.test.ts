import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, waitFor } from "@marko/testing-library";
import { controllablePromise } from "./helpers";

import QueryWithProvider from "./fixtures/query-with-provider.marko";

describe("<query-client-provider>", () => {
  afterEach(() => {
    cleanup();
  });

  // P1: Provider renders children
  it("renders children content", async () => {
    const { promise, resolve } = controllablePromise();

    const { getByTestId } = await render(QueryWithProvider, {
      queryFn: () => promise,
    });

    // Children should be rendered (pending state)
    expect(getByTestId("status").textContent).toBe("pending");
    expect(getByTestId("isPending").textContent).toBe("true");

    resolve("data");
  });

  // P2: Provider creates QueryClient (verified by query working)
  it("creates QueryClient that child query tags can use", async () => {
    const { getByTestId } = await render(QueryWithProvider, {
      queryFn: () => Promise.resolve("provider-data"),
    });

    // If provider didn't create a QueryClient, the query would never init
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });
    expect(getByTestId("data").textContent).toBe('"provider-data"');
  });

  // P3 + P4: Provider mount/unmount (verified indirectly)
  // QueryClient.mount() subscribes to focus/online managers.
  // QueryClient.unmount() unsubscribes.
  // We verify this by confirming the query works (mount happened)
  // and cleanup doesn't throw (unmount happened).
  it("mounts and unmounts QueryClient without errors", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getByTestId, cleanup: cleanupComponent } = await render(
      QueryWithProvider,
      {
        queryFn: () => Promise.resolve("data"),
      },
    );

    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });

    // Cleanup should not throw
    cleanupComponent();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  // P5: Nested query tags receive client
  it("provides QueryClient to deeply nested query tags", async () => {
    const { getByTestId } = await render(QueryWithProvider, {
      queryFn: () => Promise.resolve("nested-data"),
    });

    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });
    expect(getByTestId("data").textContent).toBe('"nested-data"');
  });
});
