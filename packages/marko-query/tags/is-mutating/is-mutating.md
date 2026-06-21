# `<is-mutating>`

The number of mutations currently pending — the Marko equivalent of React's
`useIsMutating`. Like `<is-fetching>`, the value is a **count**.

## Usage

```marko
<is-mutating/saving/>
<if=saving > 0><div>Saving…</div></if>
```

Scoped with filters:

```marko
<is-mutating/n filters=() => ({ mutationKey: ["todos"] })/>
```

## Input and return

- **Input** optional `filters` — a thunk returning `MutationFilters`.
- **Returns** a number: how many matching mutations are pending.

## Why it's needed

For "saving…" / busy affordances driven by in-flight writes, without tracking each
`<mutation>` separately.

## How it works

Identical shape to `<is-fetching>`, against the mutation side: bus / `_pulse` wake, then
once a client is present it computes `queryClient.isMutating(filters)` and subscribes to the
`MutationCache`, recomputing on each event; `$signal.onabort` unsubscribes. `0` on the
server (no mutations run during a static render).

`client.isMutating` already restricts to status `"pending"` (it is
`mutationCache.findAll({ ...filters, status: "pending" }).length`), so this is exact parity
with React with no extra filtering needed.

## Related

- `<is-fetching>` — the query-side counterpart.
- `<mutation-state>` — the actual mutation states, not just a count.
- `<query-client-provider>` / `qc-bus`.
