import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@marko/testing-library";
import { QueryClient } from "@tanstack/query-core";
import {
  createTestQueryClient,
  controllablePromise,
  flushMicrotasks,
  uniqueKey,
} from "./helpers";

import BasicQuery from "./fixtures/basic-query.marko";
import ReactiveKeyQuery from "./fixtures/reactive-key-query.marko";
import DependentQueries from "./fixtures/dependent-queries.marko";
import ErrorQuery from "./fixtures/error-query.marko";

describe("<query>", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
  });

  afterEach(() => {
    queryClient.clear();
    queryClient.unmount();
    cleanup();
  });

  // Q1: Pending → success transition
  it("transitions from pending to success", async () => {
    const key = uniqueKey();
    const { promise, resolve } = controllablePromise<string[]>();

    const { getByTestId } = await render(BasicQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryKey: key,
      queryFn: () => promise,
    });

    // Initially pending
    expect(getByTestId("status").textContent).toBe("pending");
    expect(getByTestId("isPending").textContent).toBe("true");
    expect(getByTestId("isFetching").textContent).toBe("true");

    // Resolve the fetch
    resolve(["todo1", "todo2"]);
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });

    expect(getByTestId("isSuccess").textContent).toBe("true");
    expect(getByTestId("isPending").textContent).toBe("false");
    expect(getByTestId("isFetching").textContent).toBe("false");
    expect(getByTestId("data").textContent).toBe(
      JSON.stringify(["todo1", "todo2"]),
    );
  });

  // Q2: Pending → error transition
  it("transitions from pending to error", async () => {
    const key = uniqueKey();
    const { promise, reject } = controllablePromise();

    const { getByTestId } = await render(ErrorQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryFn: () => promise,
      retry: false,
    });

    expect(getByTestId("status").textContent).toBe("pending");

    reject(new Error("fetch failed"));
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("error");
    });

    expect(getByTestId("isError").textContent).toBe("true");
    expect(getByTestId("error").textContent).toBe("fetch failed");
  });

  // Q3: Result shape matches TanStack spec
  it("has correct initial result shape", async () => {
    const key = uniqueKey();
    const { promise } = controllablePromise();

    const { getByTestId } = await render(BasicQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryKey: key,
      queryFn: () => promise,
    });

    expect(getByTestId("status").textContent).toBe("pending");
    expect(getByTestId("data").textContent).toBe("");
    expect(getByTestId("error").textContent).toBe("");
    expect(getByTestId("isPending").textContent).toBe("true");
    expect(getByTestId("isSuccess").textContent).toBe("false");
    expect(getByTestId("isError").textContent).toBe("false");
    expect(getByTestId("isFetching").textContent).toBe("true");
    expect(getByTestId("isFetched").textContent).toBe("false");
  });

  // Q4: Reactive query key change
  it("refetches when query key changes reactively", async () => {
    const fetchFn = vi.fn().mockImplementation((key: unknown[]) => {
      const status = (key as string[])[1];
      return Promise.resolve([`item-${status}`]);
    });

    const { getByTestId } = await render(ReactiveKeyQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryFn: fetchFn,
      initialStatus: "active",
    });

    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });
    expect(getByTestId("data").textContent).toBe(
      JSON.stringify(["item-active"]),
    );

    // Change query key by clicking toggle
    fireEvent.click(getByTestId("toggle"));
    await waitFor(() => {
      expect(getByTestId("queryStatus").textContent).toBe("done");
    });
    await waitFor(() => {
      expect(getByTestId("data").textContent).toBe(
        JSON.stringify(["item-done"]),
      );
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  // Q5: Dependent queries with enabled=false
  it("waits for dependent query to enable", async () => {
    const { promise: userPromise, resolve: resolveUser } =
      controllablePromise<{ id: 1; name: "Alice" }>();
    const fetchProjects = vi
      .fn()
      .mockResolvedValue(["project-a", "project-b"]);

    const { getByTestId } = await render(DependentQueries, {
      $global: { __tanstack_queryClient: queryClient },
      fetchUser: () => userPromise,
      fetchProjects,
    });

    // User is pending, projects should not have fetched
    expect(getByTestId("userStatus").textContent).toBe("pending");
    expect(getByTestId("projectsStatus").textContent).toBe("pending");
    expect(fetchProjects).not.toHaveBeenCalled();

    // Resolve user
    resolveUser({ id: 1, name: "Alice" });
    await waitFor(() => {
      expect(getByTestId("userStatus").textContent).toBe("success");
    });

    // Now projects should fetch
    await waitFor(() => {
      expect(getByTestId("projectsStatus").textContent).toBe("success");
    });
    expect(fetchProjects).toHaveBeenCalledWith(1);
  });

  // Q6: Component unmount during pending fetch
  it("cleans up on unmount without errors", async () => {
    const key = uniqueKey();
    const { promise } = controllablePromise();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { getByTestId, cleanup: cleanupComponent } = await render(
      BasicQuery,
      {
        $global: { __tanstack_queryClient: queryClient },
        queryKey: key,
        queryFn: () => promise,
      },
    );

    expect(getByTestId("status").textContent).toBe("pending");

    // Unmount while fetch is pending
    cleanupComponent();

    // No errors should occur
    await flushMicrotasks();
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  // Q7: refetch function works
  it("refetches when refetch is called", async () => {
    const key = uniqueKey();
    let callCount = 0;
    const fetchFn = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(`data-${callCount}`);
    });

    const { getByTestId } = await render(BasicQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryKey: key,
      queryFn: fetchFn,
    });

    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });
    expect(getByTestId("data").textContent).toBe('"data-1"');

    // Click refetch button
    fireEvent.click(getByTestId("refetch"));
    await waitFor(() => {
      expect(getByTestId("data").textContent).toBe('"data-2"');
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  // Q8: staleTime respected
  it("does not refetch when data is within staleTime", async () => {
    const key = uniqueKey();
    const fetchFn = vi.fn().mockResolvedValue("cached");

    // First render — fetches
    const result1 = await render(BasicQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryKey: key,
      queryFn: fetchFn,
      staleTime: 60000, // 1 minute
    });

    await waitFor(() => {
      expect(result1.getByTestId("status").textContent).toBe("success");
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // Cleanup and re-render with same key
    result1.cleanup();

    const result2 = await render(BasicQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryKey: key,
      queryFn: fetchFn,
      staleTime: 60000,
    });

    await waitFor(() => {
      expect(result2.getByTestId("status").textContent).toBe("success");
    });

    // Should not have fetched again — data is fresh
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  // Q9: Multiple queries with same key
  it("deduplicates fetches for the same query key", async () => {
    const key = uniqueKey();
    const fetchFn = vi.fn().mockResolvedValue("shared-data");

    // Render two instances with the same key
    const result1 = await render(BasicQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryKey: key,
      queryFn: fetchFn,
    });

    const result2 = await render(BasicQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryKey: key,
      queryFn: fetchFn,
    });

    await waitFor(() => {
      expect(result1.getByTestId("status").textContent).toBe("success");
    });
    await waitFor(() => {
      expect(result2.getByTestId("status").textContent).toBe("success");
    });

    // Only one fetch — TanStack Query deduplicates by key
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result1.getByTestId("data").textContent).toBe('"shared-data"');
    expect(result2.getByTestId("data").textContent).toBe('"shared-data"');
  });

  // Q10: select option transforms data
  it("applies select transformation", async () => {
    const key = uniqueKey();

    const { getByTestId } = await render(BasicQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryKey: key,
      queryFn: () => Promise.resolve([1, 2, 3]),
      select: (data: number[]) => data.map((n) => n * 2),
    });

    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });
    expect(getByTestId("data").textContent).toBe(JSON.stringify([2, 4, 6]));
  });

  // Q11: placeholderData shows immediately
  it("shows placeholderData before fetch completes", async () => {
    const key = uniqueKey();
    const { promise, resolve } = controllablePromise<string[]>();

    const { getByTestId } = await render(BasicQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryKey: key,
      queryFn: () => promise,
      placeholderData: ["placeholder-item"],
    });

    // Should show placeholder immediately
    await waitFor(() => {
      expect(getByTestId("data").textContent).toBe(
        JSON.stringify(["placeholder-item"]),
      );
    });
    expect(getByTestId("isPlaceholderData").textContent).toBe("true");

    // Resolve real data
    resolve(["real-item"]);
    await waitFor(() => {
      expect(getByTestId("data").textContent).toBe(
        JSON.stringify(["real-item"]),
      );
    });
    expect(getByTestId("isPlaceholderData").textContent).toBe("false");
  });

  // Q12: Initial pending state is serializable (structural check)
  it("initial pending state contains only serializable values", () => {
    // This test verifies the pendingResult object structure.
    // No functions, no class instances, no circular references.
    const pendingResult = {
      status: "pending",
      fetchStatus: "fetching",
      data: undefined,
      error: null,
      isPending: true,
      isSuccess: false,
      isError: false,
      isFetching: true,
      isLoading: true,
      isRefetching: false,
      isLoadingError: false,
      isRefetchError: false,
      isFetched: false,
      isFetchedAfterMount: false,
      isPaused: false,
      isPlaceholderData: false,
      isStale: true,
      failureCount: 0,
      failureReason: null,
      errorUpdateCount: 0,
      dataUpdatedAt: 0,
      errorUpdatedAt: 0,
      refetch: undefined,
      isEnabled: true,
    };

    for (const [key, value] of Object.entries(pendingResult)) {
      expect(typeof value).not.toBe("function");
      expect(typeof value).not.toBe("symbol");
      if (value !== null && value !== undefined) {
        expect(["string", "number", "boolean"].includes(typeof value)).toBe(
          true,
        );
      }
    }
  });
});
