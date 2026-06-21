# `<query>`

Fetch and cache one query, returning a reactive result object (the Marko equivalent of
React's `useQuery`). It is the canonical consumer tag; `<queries>`, `<infinite-query>`, and
`<mutation>` are variations on the same shape described here.

## Usage

```marko
<query/result options=() => ({
  queryKey: ["todos"],
  queryFn: fetchTodos,
})/>

<if=result.isPending>Loading…</if>
<else if=result.isError>Error: ${result.error.message}</else>
<else>
  <for|todo| of=result.data>
    <div>${todo.title}</div>
  </for>
</else>
```

## Input and return

- **Input** `options` is a **thunk** — `() => ({ queryKey, queryFn, … })` — not a plain
  object. It is called synchronously inside the effect so that a dynamic query key (one
  derived from a reactive `let`) is tracked and the observer updates when the key changes.
- **Returns** the reactive result via `<return=…>`: `status`, `data`, `error`, the boolean
  flags (`isPending`/`isSuccess`/`isError`/`isFetching`/…), and `refetch`.

## Why it's needed

It is the primary way to read server data in a Marko app with TanStack Query: it builds a
`QueryObserver`, subscribes to it, and pushes each update into a reactive value so the DOM
re-renders. It also makes SSR work — a server-prefetched query renders its data instead of
a spinner, and resumes with no loading flash.

## How it works

The tag has four parts:

1. **A read-only SSR cache-read** seeds the initial value. The `<let/queryResult = (() =>
   {…})()>` initializer runs once (a Marko `<let>` initializer is resumed, not re-derived,
   on the client). If a client and a settled cache entry exist for this key, it returns a
   plain snapshot of that state; otherwise it returns the shared `pendingResult`. Because
   `QueryObserver` is a `client import` (absent from the server bundle), this reads cache
   state through the client's own methods and **never constructs an observer or starts a
   fetch** on the server.
2. **A bus script** wakes the observer on resume: `subscribeClientPublish(() => {
   _pulse++; })`, torn down via `$signal.onabort = off`.
3. **An observer script** reads the client as `const queryClient = (_pulse, ($global ??
   {}).__tanstack_queryClient)` — the comma operator makes `_pulse` a reactive dependency
   so this re-runs when the provider publishes. When a client is present it builds the
   `QueryObserver` (held in `_ref`), seeds `queryResult` from `getOptimisticResult`, and
   subscribes a listener that assigns each fresh result. On a later run with the same
   client it updates the observer via `setOptions` instead of rebuilding it.
4. **`$signal.onabort`** unsubscribes the observer on teardown.

## Why it's built this way

**The client is read from `$global`, never stored in Marko scope.** Returning a snapshot
(plain, functionless) keeps serialized state serializable; the `QueryClient` itself is not
serializable, so it stays on `$global` and is read as a local. This is what avoids the SSR
serialization crash.

**Fresh result objects each update.** The subscribe listener assigns a new result object;
Marko's change detection is reference-based, so returning the same mutated object would not
re-render.

**State lives in a `_ref` holder, mutated through a local alias** (`const ref = _ref`).
Writing a `<let>` holder's property directly inside a closure compiles to an
optional-chained scope assignment that Babel rejects (`optionalChainingAssign`); the alias
makes it a plain assignment.

**`_pulse` exists to make the effect re-run** when the client arrives on resume (the bus
fires before the client is read on the first pass). See `qc-bus` for the ordering problem
this solves.

## SSR and resume

- Server render: only the cache-read runs; it emits prefetched data (or pending). No
  observer, no fetch, nothing non-serializable.
- Resume: the consumer subscribes before the provider's `onMount`; the provider publishes;
  the observer is built against the now-present client and goes live with no flash.

## Related

- `<query-client-provider>` / `qc-bus` — supply and announce the client.
- `<queries>` (array), `<infinite-query>` (pagination), `<mutation>` (writes) — same shape,
  different observer.
