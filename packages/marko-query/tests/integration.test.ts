import { afterEach, describe, expect, it, vi } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@marko/testing-library";
import { createTestQueryClient, controllablePromise } from "./helpers";

import Integration from "./fixtures/integration.marko";
import QueryWithProvider from "./fixtures/query-with-provider.marko";
import BasicQuery from "./fixtures/basic-query.marko";

describe("Integration", () => {
  afterEach(() => {
    cleanup();
  });

  // INT1: Full stack — provider + query + mutation
  it("provider wraps query and mutation that work together", async () => {
    let todoData = ["todo-1"];
    const fetchTodos = vi.fn().mockImplementation(() => {
      return Promise.resolve([...todoData]);
    });
    const addTodo = vi.fn().mockImplementation(({ title }) => {
      todoData.push(title);
      return Promise.resolve({ title });
    });

    const { getByTestId } = await render(Integration, {
      fetchTodos,
      addTodo,
    });

    // Wait for initial query
    await waitFor(() => {
      expect(getByTestId("queryStatus").textContent).toBe("success");
    });
    expect(getByTestId("queryData").textContent).toBe(
      JSON.stringify(["todo-1"]),
    );
    expect(getByTestId("mutationStatus").textContent).toBe("idle");

    // Trigger mutation
    fireEvent.click(getByTestId("addBtn"));
    await waitFor(() => {
      expect(getByTestId("mutationStatus").textContent).toBe("success");
    });

    // Mutation's onSuccess calls invalidateQueries → refetch
    await waitFor(() => {
      expect(fetchTodos).toHaveBeenCalledTimes(2);
    });

    // Query should show updated data after refetch
    await waitFor(() => {
      expect(getByTestId("queryData").textContent).toBe(
        JSON.stringify(["todo-1", "new"]),
      );
    });
  });

  // INT2: Provider → multiple queries
  it("provider serves multiple independent queries", async () => {
    const queryClient = createTestQueryClient();

    const result1 = await render(BasicQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryKey: ["multi-1"],
      queryFn: () => Promise.resolve("data-1"),
    });

    const result2 = await render(BasicQuery, {
      $global: { __tanstack_queryClient: queryClient },
      queryKey: ["multi-2"],
      queryFn: () => Promise.resolve("data-2"),
    });

    await waitFor(() => {
      expect(result1.getByTestId("status").textContent).toBe("success");
    });
    await waitFor(() => {
      expect(result2.getByTestId("status").textContent).toBe("success");
    });

    expect(result1.getByTestId("data").textContent).toBe('"data-1"');
    expect(result2.getByTestId("data").textContent).toBe('"data-2"');

    queryClient.clear();
    queryClient.unmount();
  });

  // INT3: Bottom-up mount order works
  // This is the critical test: child <query> mounts before parent provider.
  // The query's onMount finds no queryClient → skips.
  // Provider's onMount creates client → publishes via let-global.
  // Query's onUpdate fires reactively → _init().
  it("handles bottom-up mount order correctly", async () => {
    const { getByTestId } = await render(QueryWithProvider, {
      queryFn: () => Promise.resolve("bottom-up-works"),
    });

    // If bottom-up ordering was broken, the query would never init.
    // The provider creates the client last, child reacts via onUpdate.
    await waitFor(() => {
      expect(getByTestId("status").textContent).toBe("success");
    });
    expect(getByTestId("data").textContent).toBe('"bottom-up-works"');
  });
});
