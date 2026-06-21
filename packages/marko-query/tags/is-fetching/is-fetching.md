# `<is-fetching>`

The number of queries currently fetching (initial load or background refetch) — the Marko
equivalent of React's `useIsFetching`. Note the value is a **count**, not a boolean,
despite the name; a global spinner shows when it is greater than zero.

## Usage

```marko
<is-fetching/fetching/>
<if=fetching > 0><div class="global-spinner"/></if>
```

Scoped with filters:

```marko
<is-fetching/todosFetching filters=() => ({ queryKey: ["todos"] })/>
```

## Input and return

- **Input** optional `filters` — a thunk returning `QueryFilters` to scope the count.
- **Returns** a number: how many matching queries are fetching right now.

## Why it's needed

For app-wide loading affordances ("something is loading") without wiring every individual
query's state together.

## How it works

Same bus / `_pulse` wake as the data tags. Once a client is present, it computes
`queryClient.isFetching(filters)` and subscribes to the `QueryCache`, recomputing the count
on every cache event. `$signal.onabort` unsubscribes. The initial value is `0` on the
server and on the first client pass — a static server render has no in-flight fetches, so
there is nothing to hydrate, and the effect brings it live. `count` is only ever written
(never read in the effect), so there is no self-referential reactive dependency.

## Related

- `<is-mutating>` — the same idea for mutations.
- `<query-client-provider>` / `qc-bus`.
