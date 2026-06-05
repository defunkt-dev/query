import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@marko/testing-library";
import { QueryClient } from "@tanstack/query-core";
import {
  createTestQueryClient,
  controllablePromise,
  flushMicrotasks,
} from "./helpers";

import BasicMutation from "./fixtures/basic-mutation.marko";
import DynamicMutation from "./fixtures/dynamic-mutation.marko";

describe("<mutation>", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
    queryClient.unmount();
    cleanup();
  });

  // M1: Idle → pending → success
  it("transitions idle → pending → success", async () => {
    const { promise, resolve } = controllablePromise<{ id: 1 }>();
    const mutationFn = vi.fn().mockReturnValue(promise);

    const { getByTestId } = await render(BasicMutation, {
      $global: { __tanstack_queryClient: queryClient },
      mutationFn,
    });

    expect(getByTestId("status").textContent).toBe("idle");
    expect(getByTestId("isIdle").textContent).toBe("true");
    expect(getByTestId("isPending").textContent).toBe("false");

    await flushMicrotasks();
    fireEvent.click(getByTestId("mutate"));
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("pending");
    });
    expect(getByTestId("isPending").textContent).toBe("true");

    resolve({ id: 1 });
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });
    expect(getByTestId("isSuccess").textContent).toBe("true");
    expect(getByTestId("data").textContent).toBe(JSON.stringify({ id: 1 }));
  });

  // M2: Idle → pending → error
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
    expect(getByTestId("isError").textContent).toBe("true");
    expect(getByTestId("error").textContent).toBe("mutation failed");
  });

  // M3: mutate callable from event handler
  it("calls mutationFn with correct variables", async () => {
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });

    const { getByTestId } = await render(BasicMutation, {
      $global: { __tanstack_queryClient: queryClient },
      mutationFn,
    });

    await flushMicrotasks();
    fireEvent.click(getByTestId("mutate"));
    await waitFor(() => {
      expect(mutationFn).toHaveBeenCalledTimes(1);
    });
    expect(mutationFn.mock.calls[0]![0]).toEqual({ title: "test" });
  });

  // M4: mutateAsync returns promise
  it("exposes mutateAsync function after init", async () => {
    const mutationFn = vi.fn().mockResolvedValue("result");

    const { getByTestId } = await render(BasicMutation, {
      $global: { __tanstack_queryClient: queryClient },
      mutationFn,
    });

    await flushMicrotasks();
    fireEvent.click(getByTestId("mutate"));
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });

    expect(getByTestId("data").textContent).toBe('"result"');
  });

  // M5: onSuccess callback fires
  it("calls onSuccess after successful mutation", async () => {
    const onSuccess = vi.fn();
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });

    const { getByTestId } = await render(BasicMutation, {
      $global: { __tanstack_queryClient: queryClient },
      mutationFn,
      onSuccess,
    });

    await flushMicrotasks();
    fireEvent.click(getByTestId("mutate"));
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onSuccess.mock.calls[0]![0]).toEqual({ ok: true });
    expect(onSuccess.mock.calls[0]![1]).toEqual({ title: "test" });
  });

  // M6: onError callback fires
  it("calls onError after failed mutation", async () => {
    const onError = vi.fn();
    const mutationFn = vi
      .fn()
      .mockRejectedValue(new Error("mutation failed"));

    const { getByTestId } = await render(BasicMutation, {
      $global: { __tanstack_queryClient: queryClient },
      mutationFn,
      onError,
    });

    await flushMicrotasks();
    fireEvent.click(getByTestId("mutate"));
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("error");
    });

    expect(onError).toHaveBeenCalledTimes(1);
  });

  // M7: reset function works
  it("resets to idle state after error", async () => {
    const mutationFn = vi
      .fn()
      .mockRejectedValue(new Error("mutation failed"));

    const { getByTestId } = await render(BasicMutation, {
      $global: { __tanstack_queryClient: queryClient },
      mutationFn,
    });

    await flushMicrotasks();
    fireEvent.click(getByTestId("mutate"));
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("error");
    });

    fireEvent.click(getByTestId("reset"));
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("idle");
    });
    expect(getByTestId("isIdle").textContent).toBe("true");
    expect(getByTestId("error").textContent).toBe("");
  });

  // M8: onSuccess can call queryClient.invalidateQueries without errors
  it("invalidates queries on success", async () => {
    const mutationFn = vi.fn().mockResolvedValue({ ok: true });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    const onSuccess = vi.fn().mockImplementation(() => {
      queryClient.invalidateQueries({ queryKey: ["invalidation-test"] });
    });

    const { getByTestId } = await render(BasicMutation, {
      $global: { __tanstack_queryClient: queryClient },
      mutationFn,
      onSuccess,
    });

    await flushMicrotasks();
    fireEvent.click(getByTestId("mutate"));
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });

    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["invalidation-test"] });
    invalidateQueries.mockRestore();
  });

  // M9: Mutation still works after dynamic options change (exercises else-if re-subscribe)
  it("works after mutationFn changes dynamically", async () => {
    const mutationFnA = vi.fn().mockResolvedValue("result-A");
    const mutationFnB = vi.fn().mockResolvedValue("result-B");

    const { getByTestId } = await render(DynamicMutation, {
      $global: { __tanstack_queryClient: queryClient },
      mutationFnA,
      mutationFnB,
    });

    // Mutate with fnA
    await flushMicrotasks();
    fireEvent.click(getByTestId("mutate"));
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });
    expect(getByTestId("data").textContent).toBe('"result-A"');
    expect(mutationFnA).toHaveBeenCalledTimes(1);
    expect(mutationFnB).not.toHaveBeenCalled();

    // Switch to fnB — triggers script re-execution via input change
    fireEvent.click(getByTestId("switch"));
    await flushMicrotasks();

    // Mutate with fnB — verifies re-subscribe after setOptions
    fireEvent.click(getByTestId("mutate"));
    await waitFor(() => {
      expect(mutationFnB).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(getByTestId("data").textContent).toBe('"result-B"');
    });
  });
});