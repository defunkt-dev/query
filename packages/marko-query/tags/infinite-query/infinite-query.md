# `<infinite-query>`

Fetch a paginated ("infinite") query — pages plus `fetchNextPage`/`fetchPreviousPage` and
`hasNextPage`/`hasPreviousPage` (the Marko equivalent of React's `useInfiniteQuery`). It is
`<query>` with an `InfiniteQueryObserver`; read the `<query>` doc for the shared bus /
`_pulse` / SSR-cache-read pattern, which this tag follows exactly.

## Usage

```marko
<infinite-query/feed options=() => ({
  queryKey: ["feed"],
  queryFn: ({ pageParam }) => fetchPage(pageParam),
  initialPageParam: 0,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})/>

<for|page| of=feed.data.pages>
  <for|item| of=page.items><div>${item.title}</div></for>
</for>

<button disabled=!feed.hasNextPage onClick() { feed.fetchNextPage(); }>
  Load more
</button>
```

## Input and return

- **Input** `options` is a thunk returning the infinite-query options (`queryKey`,
  `queryFn`, `initialPageParam`, `getNextPageParam`, optionally `getPreviousPageParam`).
- **Returns** the reactive result: `data.pages` / `data.pageParams`, the standard query
  flags, plus `fetchNextPage`, `fetchPreviousPage`, `hasNextPage`, `hasPreviousPage`,
  `isFetchingNextPage`, `isFetchingPreviousPage`.

## Why it's needed

Pagination state (which pages are loaded, whether more exist) belongs in the query cache so
it survives navigation and resumes correctly. This tag exposes that state reactively and
makes the prefetched first page render on SSR with no flash.

## How it works

Identical structure to `<query>` (read-only SSR cache-read → bus script → observer script
building an `InfiniteQueryObserver`, updated via `setOptions` → `onabort` teardown). The
one infinite-specific detail is in the **SSR cache-read**: from the cached `data.pages` and
`data.pageParams` it derives `hasNextPage`/`hasPreviousPage` by calling the user's
`getNextPageParam`/`getPreviousPageParam` against the cached pages (a non-null result means
another page exists). The live observer recomputes these precisely on the client; the
cache-read just gives SSR a correct first paint. `InfiniteQueryObserver` is a `client
import`, so the server still never builds an observer or fetches.

## Why it's built this way

For the SSR-safety, serialization, `_ref`-via-alias, fresh-result, and `_pulse`-wake
reasons, see the `<query>` doc — they are the same here. The only addition is deriving
`hasNextPage`/`hasPreviousPage` in the cache-read so a server-rendered, prefetched infinite
query shows the correct "load more" affordance before the client takes over.

## Related

- `<query>` — the canonical shape and rationale.
- `<query-client-provider>` / `qc-bus`.
