import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@marko/testing-library";
import { QueryClient } from "@tanstack/query-core";
import { createTestQueryClient, controllablePromise, flushMicrotasks } from "./helpers";
import BasicMutation from "./fixtures/basic-mutation.marko";

describe("<mutation> isolated", () => {
  let queryClient: QueryClient;
  beforeEach(() => { queryClient = createTestQueryClient(); });
  afterEach(() => { queryClient.clear(); queryClient.unmount(); cleanup(); });

  it("transitions idle → pending → error", async () => {
    const { promise, reject } = controllablePromise();
    const mutationFn = vi.fn().mockReturnValue(promise);

    const { getByTestId } = await render(BasicMutation, {
      $global: { __tanstack_queryClient: queryClient },
      mutationFn,
    });

    expect(getByTestId("status").textContent).toBe("idle");
    await flushMicrotasks();
    fireEvent.click(getByTestId("mutate"));
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("pending");
    });

    reject(new Error("mutation failed"));
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("error");
    });
  });
});