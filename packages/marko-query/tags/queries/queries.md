# `<queries>`

Run a dynamic set of queries at once and get back an array of results (the Marko
equivalent of React's `useQueries`), with an optional `combine` to fold them into one
value. It is the array generalization of `<query>` — read that doc first for the shared
bus / `_pulse` / SSR-cache-read pattern; this doc covers what is specific to the set.

## Usage

```marko
<queries/results options=() => ({
  queries: ids.map((id) => ({
    queryKey: ["todo", id],
    queryFn: () => fetchTodo(id),
  })),
})/>

<div>${results.filter((r) => r.isSuccess).length} of ${results.length} loaded</div>
```

With `combine`:

```marko
<queries/data options=() => ({
  queries: [...],
  combine: (results) => results.flatMap((r) => r.data ?? []),
})/>
```

## Input and return

- **Input** `options` is a thunk returning `{ queries, combine? }` — matching TanStack's
  `useQueries` shape. The thunk is called synchronously so the set can grow, shrink, or
  change keys reactively.
- **Returns** an **array** of result objects (one per query), or — when `combine` is
  supplied — whatever `combine` folds that array into.

## Why it's needed

When the number of queries is dynamic (one per item in a list, say), you cannot use a
fixed set of `<query>` tags. `<queries>` drives a single `QueriesObserver` over the whole
set and tracks additions and removals.

## How it works

Same four parts as `<query>`. The differences:

- **The SSR cache-read is looped:** it maps each query option to a per-item snapshot of
  cached state (or `pendingResult`), returning a plain array (or `combine(array)`). Still
  no observer and no fetch on the server.
- **The observer is a `QueriesObserver`.** On the first run it is built from the
  default-resolved options; on a later run with the same client it is updated via
  `setQueries(...)` rather than rebuilt.
- **`getOptimisticResult` returns a tuple** `[rawResult, combineFn, trackFn]`; the tag
  takes `[0]`, the raw array.

## Why it's built this way

**`combine` is applied in the tag's own layer, not handed to the observer.** This keeps the
types simple; the only thing skipped is the observer's combine-aware notify batching.
Crucially, the subscribe listener receives the **raw** array, so `combine` is re-applied on
**every** update — applying it only at init would freeze the combined value after the first
paint.

Everything else — the `_ref` holder via a local alias, the `_pulse` bus wake, reading the
client from `$global` and returning only plain (serializable) snapshots — is identical to
`<query>`, for the same reasons.

## Related

- `<query>` — the single-query version and the canonical explanation of the shared shape.
- `<query-client-provider>` / `qc-bus`.
