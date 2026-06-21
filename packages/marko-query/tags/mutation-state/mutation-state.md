# `<mutation-state>`

The mutations in the `MutationCache`, filtered and optionally mapped through `select` — the
Marko equivalent of React's / Vue's `useMutationState`. Use it to surface things like the
variables of in-flight mutations, or a list of recent errors.

## Usage

```marko
<mutation-state/pending options=() => ({
  filters: { status: "pending" },
  select: (m) => m.state.variables,
})/>

<for|vars| of=pending><div>Saving ${vars.title}…</div></for>
```

## Input and return

- **Input** optional `options` — a thunk returning `{ filters?, select? }`.
- **Returns** an array: by default each matching mutation's live `state` object; with
  `select`, the mapped value per mutation.

## Why it's needed

`<is-mutating>` gives only a count; this gives the actual mutation states, so you can render
optimistic UI, per-item progress, or an error feed from the mutation cache.

## How it works

Same bus / `_pulse` wake. Once a client is present it reads the `MutationCache`, and on
every cache event recomputes the array: `cache.findAll(filters).map(m => select ? select(m)
: m.state)`. `$signal.onabort` unsubscribes. The initial value is an empty array on the
server (no mutations during a static render).

## Why it's built this way

**Default returns live `state` by reference** (no clone, no deep-freeze) — exactly as the
other adapters do, since it is the cache's live state; `select` is the intended way to
derive specific values.

**The returned array is shallow-frozen** with `Object.freeze`: the array is the tag's own,
freshly built each event, so freezing it is safe and blocks an accidental `push`/reassign
(mirroring Vue's `shallowReadonly` guard). The inner state objects are *not* frozen.

**`replaceEqualDeep` keeps the array referentially stable** across events (as React does),
so consumers do not re-render when nothing actually changed. `prev` is a plain local — not
the reactive `let` — so the effect never reads the value it writes.

## Related

- `<is-mutating>` — just the count.
- `<mutation>` — drive a single mutation.
- `<query-client-provider>` / `qc-bus`.
