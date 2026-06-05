# @tanstack/marko-query

TanStack Query adapter for Marko v6. Client-side data fetching, caching, and state management.

## Install

```bash
npm install @tanstack/marko-query @tanstack/query-core
```

## Quick Start

Wrap your app with the provider:

```marko
// app.marko
<query-client-provider>
  <my-page/>
</query-client-provider>
```

Fetch data:

```marko
// my-page.marko
import { fetchTodos } from "./api"

<query/todos options=() => ({
  queryKey: ["todos"],
  queryFn: fetchTodos,
})/>

<if=todos.isPending>Loading...</if>
<else if=todos.isError>Error: ${todos.error.message}</else>
<else>
  <for|todo| of=todos.data>
    <div>${todo.title}</div>
  </for>
</else>
```

## Tags

### `<query-client-provider>`

Wrap your app once at the root. Creates and manages the QueryClient.

```marko
<query-client-provider defaultOptions={ queries: { staleTime: 5000 } }>
  <my-app/>
</query-client-provider>
```

### `<query>`

Fetch and cache server data. Returns a reactive result object.

```marko
<query/result options=() => ({
  queryKey: ["todos"],
  queryFn: fetchTodos,
  staleTime: 5000,
  enabled: true,
})/>
```

**Result properties:** `status`, `data`, `error`, `isPending`, `isSuccess`, `isError`, `isFetching`, `isLoading`, `isRefetching`, `isFetched`, `isStale`, `refetch()`, `dataUpdatedAt`, `failureCount`, `failureReason`

### `<mutation>`

Send data to the server. Returns a reactive result with `mutate()`.

```marko
<mutation/result options=() => ({
  mutationFn: addTodo,
  onSuccess() { queryClient?.invalidateQueries({ queryKey: ["todos"] }) },
})/>

<button onClick() { result.mutate({ title: "New" }) }>Add</button>
```

**Result properties:** `status`, `data`, `error`, `isPending`, `isSuccess`, `isError`, `isIdle`, `mutate()`, `mutateAsync()`, `reset()`, `variables`

### `<infinite-query>`

Paginated / infinite scroll data.

```marko
<infinite-query/result options=() => ({
  queryKey: ["items"],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})/>

<if=result.hasNextPage>
  <button onClick() { result.fetchNextPage() }>Load More</button>
</if>
```

**Additional properties:** `fetchNextPage()`, `fetchPreviousPage()`, `hasNextPage`, `hasPreviousPage`, `isFetchingNextPage`, `isFetchingPreviousPage`

## Constraints

- `queryFn` must be a module-level import, not an inline arrow: `import { fetchTodos } from "./api"`
- Server renders pending state (Phase 1). SSR with real data comes in Phase 2.
- One QueryClient per app (matches all other TanStack Query adapters).

## License

MIT
